import type {
    ExtensionCommandContext,
    SessionMessageEntry
} from '@earendil-works/pi-coding-agent';
import { t } from '../i18n.js';
import {
    DEDUPE_LIMIT,
    READ_ONLY_KINDS,
    type CommandKind,
    type CommandResult,
    type ParsedCommand,
    type PendingCommand,
    type SessionSummary
} from '../models/session-commands.types.js';
import { HELP_ENTRIES, SessionCommandParser } from './session-command.parser.js';
import { SessionQueryService } from './session-query.service.js';
import { SessionStateStore } from './session-state.store.js';

type SessionManagerView = ExtensionCommandContext['sessionManager'];

export interface SessionCommandLogger {
    log(message: string): void;
}

export interface SessionCommandRouterDeps {
    parser: SessionCommandParser;
    query: SessionQueryService;
    store: SessionStateStore;
    /** Send a reply back to a WhatsApp chat. */
    sendMessage: (chatJid: string, text: string) => Promise<void>;
    /** Trigger the internal `/wa-session` extension command so it runs with a command context. */
    dispatchCommand: (commandText: string) => void;
    /** Rename the active session (Pi extension API). */
    setSessionName: (name: string) => void;
    /** Current active session file, for the `/sessions` marker. */
    getActiveSessionFile: () => string | undefined;
    logger: SessionCommandLogger;
    /** How long to wait for a dispatched command to settle (default 15s). */
    dispatchTimeoutMs?: number;
}

const DISPATCH_TIMEOUT_MS = 15000;

function messageText(message: SessionMessageEntry['message']): string {
    const content = (message as { content?: unknown }).content;
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .filter((part): part is { type: 'text'; text: string } =>
                typeof part === 'object' && part !== null && (part as { type?: string }).type === 'text')
            .map((part) => part.text)
            .join(' ');
    }
    return '';
}

function truncate(value: string, max: number): string {
    const singleLine = value.replace(/\s+/g, ' ').trim();
    return singleLine.length > max ? `${singleLine.slice(0, max - 1)}…` : singleLine;
}

function lastIndexWhere<T>(items: readonly T[], predicate: (item: T) => boolean): number {
    for (let i = items.length - 1; i >= 0; i -= 1) {
        if (predicate(items[i])) {
            return i;
        }
    }
    return -1;
}

/**
 * Translates WhatsApp slash-commands into Pi session operations.
 *
 * Inbound commands are parsed here; mutating commands are executed through the
 * internal `/wa-session` extension command so they run with an
 * `ExtensionCommandContext` (the only place session replacement is legal).
 */
export class SessionCommandRouter {
    private readonly pending: PendingCommand[] = [];
    private readonly seenOrder: string[] = [];
    private readonly seenSet = new Set<string>();
    private readonly dispatchResolvers: Array<() => void> = [];
    private busy = false;
    private draining = false;
    private lastOrdered: SessionSummary[] = [];

    constructor(private readonly deps: SessionCommandRouterDeps) {}

    isCommand(text: string): boolean {
        return this.deps.parser.isCommand(text);
    }

    setBusy(busy: boolean): void {
        this.busy = busy;
    }

    /** Handle a WhatsApp message that may be a command. Returns true if it was consumed. */
    async handleInbound(input: { text: string; chatJid: string; messageId: string }): Promise<boolean> {
        const command = this.deps.parser.parse(input.text);
        if (!command) {
            return false;
        }

        if (this.isDuplicate(input.messageId)) {
            this.deps.logger.log(`[WhatsApp-Pi] Duplicate command message ${input.messageId} ignored.`);
            return true;
        }

        if (command.kind === 'unknown') {
            await this.deps.sendMessage(input.chatJid, t('session.unknownCommand', { command: command.raw }));
            return true;
        }

        if (READ_ONLY_KINDS.has(command.kind)) {
            const result = await this.runReadOnly(command);
            await this.deps.sendMessage(input.chatJid, result.message);
            return true;
        }

        if (command.kind === 'abort') {
            this.clearPending();
            this.dispatch(command, input.chatJid);
            return true;
        }

        if (this.busy) {
            this.pending.push({
                command,
                chatJid: input.chatJid,
                messageId: input.messageId,
                enqueuedAt: Date.now()
            });
            this.deps.logger.log(`[WhatsApp-Pi] Deferred ${command.raw} until the current turn settles.`);
            await this.deps.sendMessage(input.chatJid, t('session.queued', { command: command.raw }));
            return true;
        }

        this.dispatch(command, input.chatJid);
        return true;
    }

    /** Apply any deferred commands once the agent is idle. */
    async drain(): Promise<void> {
        if (this.draining) {
            return;
        }
        this.draining = true;
        try {
            while (!this.busy && this.pending.length > 0) {
                const next = this.pending.shift();
                if (!next) {
                    break;
                }
                await this.dispatchAndWait(next.command, next.chatJid);
            }
        } finally {
            this.draining = false;
        }
    }

    /** Entry point for the internal `/wa-session` command handler. */
    async executeInternal(args: string, ctx: ExtensionCommandContext): Promise<void> {
        const tokens = args.trim().split(/\s+/).filter((token) => token.length > 0);
        const kind = tokens.shift() as CommandKind | undefined;
        const chatJid = tokens.shift() ?? '';
        const rest = tokens;
        const command: ParsedCommand = { kind: kind ?? 'unknown', raw: `/${kind ?? 'unknown'}`, args: rest };

        try {
            const result = await this.runWithContext(command, rest, ctx);
            if (chatJid) {
                await this.deps.sendMessage(chatJid, result.message);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.deps.logger.log(`[WhatsApp-Pi] Session command ${command.kind} failed: ${message}`);
            if (chatJid) {
                await this.deps.sendMessage(chatJid, t('session.error', { error: message }));
            }
        } finally {
            this.resolveNextDispatch();
        }
    }

    private async runReadOnly(command: ParsedCommand): Promise<CommandResult> {
        if (command.kind === 'help') {
            return { ok: true, message: this.helpText(), changedActiveSession: false };
        }

        const { listing, ordered } = await this.deps.query.list(this.deps.getActiveSessionFile());
        this.lastOrdered = ordered;
        return { ok: true, message: this.deps.query.formatListing(listing), changedActiveSession: false };
    }

    private async runWithContext(
        command: ParsedCommand,
        rest: string[],
        ctx: ExtensionCommandContext
    ): Promise<CommandResult> {
        switch (command.kind) {
            case 'resume':
                return this.resume(rest[0], ctx);
            case 'new':
                return this.newSession(rest.join(' ').trim(), ctx);
            case 'title':
                return this.rename(rest.join(' ').trim());
            case 'branch':
                return this.branch(rest[0], ctx);
            case 'undo':
                return this.undo(ctx);
            case 'compact':
                return this.compact(rest.join(' ').trim(), ctx);
            case 'abort':
                ctx.abort();
                return { ok: true, message: t('session.abort.done'), changedActiveSession: false };
            default:
                return { ok: false, message: t('session.unknownCommand', { command: command.raw }), changedActiveSession: false };
        }
    }

    private async resume(target: string | undefined, ctx: ExtensionCommandContext): Promise<CommandResult> {
        const summary = await this.resolveTarget(target);
        if (!summary) {
            return { ok: false, message: t('session.resume.unknown', { target: target ?? '' }), changedActiveSession: false };
        }

        let recap = '';
        await ctx.switchSession(summary.filePath, {
            withSession: async (replacementCtx) => {
                await this.persistPointer(replacementCtx.sessionManager);
                recap = this.buildRecap(replacementCtx.sessionManager, summary);
            }
        });

        return {
            ok: true,
            message: recap || t('session.resume.switched', { title: summary.name ?? summary.sessionId }),
            changedActiveSession: true
        };
    }

    private async newSession(title: string, ctx: ExtensionCommandContext): Promise<CommandResult> {
        await ctx.newSession({
            withSession: async (replacementCtx) => {
                await this.persistPointer(replacementCtx.sessionManager);
            }
        });

        if (title) {
            this.deps.setSessionName(title);
        }

        return {
            ok: true,
            message: title
                ? t('session.new.createdTitle', { title })
                : t('session.new.created'),
            changedActiveSession: true
        };
    }

    private async rename(name: string): Promise<CommandResult> {
        if (!name) {
            return { ok: false, message: t('session.title.missing'), changedActiveSession: false };
        }
        this.deps.setSessionName(name);
        return { ok: true, message: t('session.title.renamed', { name }), changedActiveSession: false };
    }

    private async branch(target: string | undefined, ctx: ExtensionCommandContext): Promise<CommandResult> {
        const branch = ctx.sessionManager.getBranch();
        const userEntries = branch.filter(
            (entry): entry is SessionMessageEntry => entry.type === 'message' && entry.message.role === 'user'
        );
        if (userEntries.length === 0) {
            return { ok: false, message: t('session.branch.nothing'), changedActiveSession: false };
        }

        const index = target && /^\d+$/.test(target)
            ? Math.min(Math.max(Number(target), 1), userEntries.length) - 1
            : userEntries.length - 1;
        const entry = userEntries[index];

        await ctx.fork(entry.id, {
            withSession: async (replacementCtx) => {
                await this.persistPointer(replacementCtx.sessionManager);
            }
        });

        return { ok: true, message: t('session.branch.created'), changedActiveSession: true };
    }

    private async undo(ctx: ExtensionCommandContext): Promise<CommandResult> {
        const branch = ctx.sessionManager.getBranch();
        const lastUserIndex = lastIndexWhere(
            branch,
            (entry) => entry.type === 'message' && entry.message.role === 'user'
        );
        if (lastUserIndex <= 0) {
            return { ok: false, message: t('session.undo.nothing'), changedActiveSession: false };
        }

        const target = branch[lastUserIndex - 1];
        await ctx.navigateTree(target.id);
        return { ok: true, message: t('session.undo.done'), changedActiveSession: false };
    }

    private async compact(instructions: string, ctx: ExtensionCommandContext): Promise<CommandResult> {
        ctx.compact(instructions ? { customInstructions: instructions } : undefined);
        return { ok: true, message: t('session.compact.done'), changedActiveSession: false };
    }

    private async resolveTarget(target: string | undefined): Promise<SessionSummary | undefined> {
        if (!target) {
            return undefined;
        }
        if (/^\d+$/.test(target)) {
            return this.lastOrdered[Number(target) - 1];
        }
        const cached = this.lastOrdered.find(
            (session) => session.sessionId === target || session.filePath === target
        );
        return cached ?? this.deps.query.findById(target);
    }

    private buildRecap(sm: SessionManagerView, summary: SessionSummary): string {
        const project = sm.getCwd() || summary.projectCwd;
        const title = sm.getSessionName() ?? summary.name;
        const messages = sm.getBranch()
            .filter((entry): entry is SessionMessageEntry => entry.type === 'message')
            .map((entry) => entry.message);

        const lastUser = [...messages].reverse().find((message) => message.role === 'user');
        const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');

        const lines = [t('session.resume.recap', { title: title ?? t('session.list.untitled'), project })];
        if (lastUser) {
            lines.push(t('session.resume.lastUser', { text: truncate(messageText(lastUser), 200) }));
        }
        if (lastAssistant) {
            lines.push(t('session.resume.lastAssistant', { text: truncate(messageText(lastAssistant), 200) }));
        }
        return lines.join('\n');
    }

    private async persistPointer(sm: SessionManagerView): Promise<void> {
        const sessionFile = sm.getSessionFile();
        if (!sessionFile) {
            return;
        }
        await this.deps.store.write({
            sessionFile,
            sessionId: sm.getSessionId(),
            projectCwd: sm.getCwd(),
            updatedAt: new Date().toISOString()
        });
    }

    private dispatch(command: ParsedCommand, chatJid: string): void {
        const parts = ['/wa-session', command.kind, chatJid, ...command.args];
        this.deps.dispatchCommand(parts.join(' '));
    }

    private async dispatchAndWait(command: ParsedCommand, chatJid: string): Promise<void> {
        const settled = new Promise<void>((resolve) => {
            this.dispatchResolvers.push(resolve);
        });
        this.dispatch(command, chatJid);
        await Promise.race([
            settled,
            new Promise<void>((resolve) => {
                setTimeout(resolve, this.deps.dispatchTimeoutMs ?? DISPATCH_TIMEOUT_MS);
            })
        ]);
    }

    private resolveNextDispatch(): void {
        const resolve = this.dispatchResolvers.shift();
        resolve?.();
    }

    private clearPending(): void {
        if (this.pending.length > 0) {
            this.deps.logger.log(`[WhatsApp-Pi] Cleared ${this.pending.length} deferred session command(s).`);
        }
        this.pending.length = 0;
    }

    private isDuplicate(messageId: string): boolean {
        if (!messageId) {
            return false;
        }
        if (this.seenSet.has(messageId)) {
            return true;
        }
        this.seenSet.add(messageId);
        this.seenOrder.push(messageId);
        while (this.seenOrder.length > DEDUPE_LIMIT) {
            const oldest = this.seenOrder.shift();
            if (oldest) {
                this.seenSet.delete(oldest);
            }
        }
        return false;
    }

    private helpText(): string {
        const lines = [t('session.help.title')];
        for (const entry of HELP_ENTRIES) {
            lines.push(t('session.help.item', { command: entry.command, description: entry.description }));
        }
        return lines.join('\n');
    }
}

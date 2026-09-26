import type { CommandKind, ParsedCommand } from '../models/session-commands.types.js';

/**
 * Canonical command name → semantic kind. Non-canonical names in this table are
 * aliases (e.g. `compress` for `compact`, `stop` for `abort`).
 */
export const COMMAND_ALIASES: Readonly<Record<string, CommandKind>> = {
    sessions: 'list',
    list: 'list',
    resume: 'resume',
    new: 'new',
    title: 'title',
    branch: 'branch',
    undo: 'undo',
    compact: 'compact',
    compress: 'compact',
    abort: 'abort',
    stop: 'abort',
    help: 'help'
};

/** Commands shown by `/help`, in a stable order. */
export const HELP_ENTRIES: ReadonlyArray<{ command: string; description: string }> = [
    { command: '/sessions', description: 'List sessions across all projects (grouped by project)' },
    { command: '/resume <n|id>', description: 'Switch to a session (moves the working directory to its project)' },
    { command: '/new <path> [title]', description: 'Start a new session in a project directory (use . for the current project), optionally named' },
    { command: '/title [name]', description: 'Show or set the active session title' },
    { command: '/branch [n]', description: 'Fork the active session from an earlier point' },
    { command: '/undo', description: 'Rewind past the last exchange' },
    { command: '/compact [instructions]', description: 'Compact the active context (alias: /compress)' },
    { command: '/abort', description: 'Interrupt the running turn (alias: /stop)' },
    { command: '/help', description: 'Show this command list' }
];

/**
 * Parses a WhatsApp message into a session command. Returns `undefined` when the
 * text is not a command (so the caller forwards it to the model unchanged).
 */
export class SessionCommandParser {
    isCommand(text: string): boolean {
        return text.trimStart().startsWith('/');
    }

    parse(text: string): ParsedCommand | undefined {
        const trimmed = text.trim();
        if (!trimmed.startsWith('/')) {
            return undefined;
        }

        const tokens = trimmed.slice(1).split(/\s+/);
        const name = (tokens.shift() ?? '').toLowerCase();
        const kind = COMMAND_ALIASES[name] ?? 'unknown';
        return { kind, raw: trimmed, args: tokens };
    }
}

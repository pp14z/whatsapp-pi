import { describe, expect, it, vi } from 'vitest';
import type { SessionInfo } from '@earendil-works/pi-coding-agent';
import { SessionCommandParser } from '../../src/services/session-command.parser.ts';
import { SessionCommandRouter } from '../../src/services/session-command.router.ts';
import { SessionQueryService } from '../../src/services/session-query.service.ts';

function info(overrides: Partial<SessionInfo>): SessionInfo {
    return {
        path: '/projects/alpha/s.jsonl',
        id: 's',
        cwd: '/projects/alpha',
        created: new Date('2026-09-20T00:00:00.000Z'),
        modified: new Date('2026-09-25T00:00:00.000Z'),
        messageCount: 1,
        firstMessage: 'hello',
        allMessagesText: '',
        ...overrides
    } as SessionInfo;
}

function makeRouter(options: { sessions?: SessionInfo[] } = {}) {
    const sent: Array<{ jid: string; text: string }> = [];
    const dispatched: string[] = [];
    const writes: unknown[] = [];
    const setSessionName = vi.fn();

    const deps = {
        parser: new SessionCommandParser(),
        query: new SessionQueryService(async () => options.sessions ?? []),
        store: {
            write: async (pointer: unknown) => {
                writes.push(pointer);
            },
            read: async () => undefined,
            clear: async () => {},
            getPointerPath: () => ''
        },
        sendMessage: async (jid: string, text: string) => {
            sent.push({ jid, text });
        },
        dispatchCommand: (text: string) => {
            dispatched.push(text);
        },
        setSessionName,
        getActiveSessionFile: () => undefined,
        getActiveSessionName: () => undefined,
        getActiveSessionId: () => 's',
        createSessionFile: (cwd: string) => `${cwd}/new-session.jsonl`,
        resolveProjectPath: (input: string, baseCwd: string) => {
            if (input === '.') return baseCwd;
            if (input.startsWith('/') || input.startsWith('~')) return input;
            return undefined;
        },
        logger: { log: () => {} },
        dispatchTimeoutMs: 10
    };

    const router = new SessionCommandRouter(deps as never);
    return { router, sent, dispatched, writes, setSessionName };
}

function fakeContext(options: { sessionName?: string; cwd?: string } = {}) {
    const switches: string[] = [];
    const sessionManager = {
        getSessionFile: () => '/projects/alpha/s.jsonl',
        getSessionId: () => 's',
        getCwd: () => options.cwd ?? '/projects/alpha',
        getSessionName: () => options.sessionName,
        getBranch: () => []
    };
    const replacement = { sessionManager };
    return {
        sessionManager,
        switches,
        newSession: async (opts?: { withSession?: (ctx: unknown) => Promise<void> }) => {
            if (opts?.withSession) await opts.withSession(replacement);
            return { cancelled: false };
        },
        switchSession: async (path: string, opts?: { withSession?: (ctx: unknown) => Promise<void> }) => {
            switches.push(path);
            if (opts?.withSession) await opts.withSession(replacement);
            return { cancelled: false };
        },
        fork: async (_id: string, opts?: { withSession?: (ctx: unknown) => Promise<void> }) => {
            if (opts?.withSession) await opts.withSession(replacement);
            return { cancelled: false };
        },
        navigateTree: async () => ({ cancelled: false }),
        compact: () => {},
        abort: () => {}
    };
}

describe('SessionCommandRouter', () => {
    it('ignores non-command text', async () => {
        const { router, sent, dispatched } = makeRouter();
        expect(await router.handleInbound({ text: 'hello', chatJid: 'jid', messageId: 'm1' })).toBe(false);
        expect(sent).toHaveLength(0);
        expect(dispatched).toHaveLength(0);
    });

    it('replies to unknown commands without dispatching', async () => {
        const { router, sent, dispatched } = makeRouter();
        await router.handleInbound({ text: '/nope', chatJid: 'jid', messageId: 'm1' });
        expect(dispatched).toHaveLength(0);
        expect(sent[0].text).toContain('Unknown command');
    });

    it('answers /help immediately', async () => {
        const { router, sent, dispatched } = makeRouter();
        await router.handleInbound({ text: '/help', chatJid: 'jid', messageId: 'm1' });
        expect(dispatched).toHaveLength(0);
        expect(sent[0].text).toContain('/sessions');
        expect(sent[0].text).toContain('/resume');
    });

    it('answers an argument-less /title immediately without dispatching', async () => {
        const { router, sent, dispatched } = makeRouter();
        await router.handleInbound({ text: '/title', chatJid: 'jid', messageId: 'm1' });
        expect(dispatched).toHaveLength(0);
        expect(sent[0].text).toContain('no title');
    });

    it('answers /sessions with the grouped listing', async () => {
        const { router, sent } = makeRouter({ sessions: [info({ id: 'a', name: 'alpha-work' })] });
        await router.handleInbound({ text: '/sessions', chatJid: 'jid', messageId: 'm1' });
        expect(sent[0].text).toContain('alpha-work');
    });

    it('dispatches a mutating command through the internal command when idle', async () => {
        const { router, dispatched } = makeRouter();
        await router.handleInbound({ text: '/new my-task', chatJid: 'jid', messageId: 'm1' });
        expect(dispatched).toEqual(['/wa-session new jid my-task']);
    });

    it('defers a mutating command while busy and drains it when idle', async () => {
        const { router, sent, dispatched } = makeRouter();
        router.setBusy(true);
        await router.handleInbound({ text: '/new queued', chatJid: 'jid', messageId: 'm1' });
        expect(dispatched).toHaveLength(0);
        expect(sent[0].text).toContain('Queued');

        router.setBusy(false);
        await router.drain();
        expect(dispatched).toEqual(['/wa-session new jid queued']);
    });

    it('clears deferred commands when /abort is sent', async () => {
        const { router, dispatched } = makeRouter();
        router.setBusy(true);
        await router.handleInbound({ text: '/new queued', chatJid: 'jid', messageId: 'm1' });
        await router.handleInbound({ text: '/abort', chatJid: 'jid', messageId: 'm2' });

        router.setBusy(false);
        await router.drain();

        expect(dispatched).toEqual(['/wa-session abort jid']);
    });

    it('ignores duplicate deliveries of the same message id', async () => {
        const { router, dispatched } = makeRouter();
        await router.handleInbound({ text: '/new one', chatJid: 'jid', messageId: 'dup' });
        await router.handleInbound({ text: '/new one', chatJid: 'jid', messageId: 'dup' });
        expect(dispatched).toHaveLength(1);
    });

    it('renames the session via /title without a command context', async () => {
        const { router, sent, setSessionName } = makeRouter();
        await router.executeInternal('title jid my long name', fakeContext() as never);
        expect(setSessionName).toHaveBeenCalledWith('my long name');
        expect(sent[0].text).toContain('my long name');
    });

    it('reports the current title for /title with no name', async () => {
        const { router, sent, setSessionName } = makeRouter();
        await router.executeInternal('title jid', fakeContext({ sessionName: 'my-session' }) as never);
        expect(setSessionName).not.toHaveBeenCalled();
        expect(sent[0].text).toContain('my-session');
    });

    it('reports the session id for /title when no title is set', async () => {
        const { router, sent } = makeRouter();
        await router.executeInternal('title jid', fakeContext() as never);
        expect(sent[0].text).toContain('no title');
        expect(sent[0].text).toContain('s');
    });

    it('starts a new session in the given project and persists the pointer', async () => {
        const { router, sent, writes } = makeRouter();
        const ctx = fakeContext();
        await router.executeInternal('new jid .', ctx as never);        expect(writes).toHaveLength(1);
        expect(ctx.switches).toEqual(['/projects/alpha/new-session.jsonl']);
        expect(sent[0].text).toContain('New session started in /projects/alpha');
    });

    it('creates a titled session in the given project', async () => {
        const { router, sent, setSessionName } = makeRouter();
        const ctx = fakeContext();
        await router.executeInternal('new jid . my task', ctx as never);
        expect(setSessionName).toHaveBeenCalledWith('my task');
        expect(sent[0].text).toContain("as 'my task'");
    });

    it('requires a project path for /new', async () => {
        const { router, sent, writes } = makeRouter();
        await router.executeInternal('new jid', fakeContext() as never);
        expect(writes).toHaveLength(0);
        expect(sent[0].text).toContain('project path is required');
    });

    it('rejects a /new path that is not an existing directory', async () => {
        const { router, sent, writes } = makeRouter();
        await router.executeInternal('new jid bogus title', fakeContext() as never);
        expect(writes).toHaveLength(0);
        expect(sent[0].text).toContain('not found');
    });

    it('resumes a session by id and persists the pointer', async () => {
        const { router, sent, writes } = makeRouter({ sessions: [info({ id: 'target', name: 'target-session' })] });
        await router.executeInternal('resume jid target', fakeContext() as never);
        expect(writes).toHaveLength(1);
        expect(sent[0].text).toContain('target-session');
    });
});

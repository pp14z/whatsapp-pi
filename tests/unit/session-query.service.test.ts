import { describe, expect, it } from 'vitest';
import type { SessionInfo } from '@earendil-works/pi-coding-agent';
import { SessionQueryService } from '../../src/services/session-query.service.ts';

function info(overrides: Partial<SessionInfo>): SessionInfo {
    return {
        path: '/default/session.jsonl',
        id: 'default',
        cwd: '/default',
        created: new Date('2026-09-20T00:00:00.000Z'),
        modified: new Date('2026-09-20T00:00:00.000Z'),
        messageCount: 1,
        firstMessage: 'hello',
        allMessagesText: '',
        ...overrides
    } as SessionInfo;
}

const sessions: SessionInfo[] = [
    info({ id: 'a1', path: '/projects/alpha/a1.jsonl', cwd: '/projects/alpha', name: 'alpha-work', modified: new Date('2026-09-25T09:00:00.000Z'), messageCount: 4 }),
    info({ id: 'b1', path: '/projects/beta/b1.jsonl', cwd: '/projects/beta', modified: new Date('2026-09-25T11:00:00.000Z'), messageCount: 2, firstMessage: 'beta task' }),
    info({ id: 'a2', path: '/projects/alpha/a2.jsonl', cwd: '/projects/alpha', modified: new Date('2026-09-24T09:00:00.000Z'), messageCount: 1 })
];

describe('SessionQueryService', () => {
    const query = new SessionQueryService(async () => sessions);

    it('orders sessions by most recent and groups by project', async () => {
        const { listing, ordered } = await query.list('/projects/beta/b1.jsonl');

        expect(ordered.map((session) => session.sessionId)).toEqual(['b1', 'a1', 'a2']);
        expect(listing.groups.map((group) => group.label)).toEqual(['beta', 'alpha']);
        expect(listing.groups[0].sessions).toHaveLength(1);
        expect(listing.groups[1].sessions).toHaveLength(2);
        expect(listing.activeFilePath).toBe('/projects/beta/b1.jsonl');
        expect(listing.truncated).toBe(false);
    });

    it('formats a grouped, numbered listing with an active marker', async () => {
        const { listing } = await query.list('/projects/beta/b1.jsonl');
        const text = query.formatListing(listing);

        expect(text).toContain('beta');
        expect(text).toContain('alpha');
        expect(text).toContain('1.');
        expect(text).toContain('[active]');
        expect(text).toContain('beta task');
    });

    it('reports an empty listing', async () => {
        const empty = new SessionQueryService(async () => []);
        const { listing } = await empty.list();
        expect(empty.formatListing(listing)).toBe('No sessions found.');
    });

    it('bounds the listing and flags truncation', async () => {
        const many = new SessionQueryService(async () =>
            Array.from({ length: 25 }, (_, index) =>
                info({ id: `s${index}`, path: `/p/s${index}.jsonl`, cwd: '/p', modified: new Date(2026, 8, 1, 0, index) })
            )
        );
        const { listing, ordered } = await many.list();
        expect(ordered).toHaveLength(20);
        expect(listing.truncated).toBe(true);
        expect(many.formatListing(listing)).toContain('showing 20 of 25');
    });

    it('finds a session by id', async () => {
        expect((await query.findById('a2'))?.filePath).toBe('/projects/alpha/a2.jsonl');
        expect(await query.findById('missing')).toBeUndefined();
    });
});

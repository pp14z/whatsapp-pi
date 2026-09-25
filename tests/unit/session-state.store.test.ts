import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { SessionStateStore } from '../../src/services/session-state.store.ts';
import type { ActiveSessionPointer } from '../../src/models/session-commands.types.ts';

const pointer: ActiveSessionPointer = {
    sessionFile: '/projects/foo/session.jsonl',
    sessionId: 'session-1',
    projectCwd: '/projects/foo',
    updatedAt: '2026-09-25T12:00:00.000Z'
};

describe('SessionStateStore', () => {
    let dir: string;
    let store: SessionStateStore;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'whatsapp-pi-state-'));
        store = new SessionStateStore(dir);
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it('returns undefined when no pointer exists', async () => {
        expect(await store.read()).toBeUndefined();
    });

    it('round-trips a pointer', async () => {
        await store.write(pointer);
        expect(await store.read()).toEqual(pointer);
    });

    it('treats malformed JSON as absent', async () => {
        await writeFile(store.getPointerPath(), '{ not json');
        expect(await store.read()).toBeUndefined();
    });

    it('treats a partial pointer as absent', async () => {
        await writeFile(store.getPointerPath(), JSON.stringify({ sessionId: 'only-id' }));
        expect(await store.read()).toBeUndefined();
    });

    it('clears the pointer', async () => {
        await store.write(pointer);
        await store.clear();
        expect(await store.read()).toBeUndefined();
    });
});

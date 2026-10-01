import { readFile, rm, rename, writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import {
    ACTIVE_SESSION_FILE,
    PENDING_REPLY_FILE,
    type ActiveSessionPointer,
    type PendingSessionReply
} from '../models/session-commands.types.js';
import { getDefaultStorageRoot } from './storage-path.js';

/**
 * Persists which Pi session is currently active so the launcher can restore it
 * after a process restart (FR-013). The pointer lives outside the session, so
 * it is also valid when the active session belongs to another project.
 */
export class SessionStateStore {
    private readonly pointerPath: string;
    private readonly pendingReplyPath: string;

    constructor(root: string = getDefaultStorageRoot()) {
        // A dedicated process (e.g. the headless service) can keep its own resume
        // pointer so it never shares a session file with interactive sessions.
        const override = process.env.WHATSAPP_PI_STATE_FILE?.trim();
        this.pointerPath = override ? override : join(root, ACTIVE_SESSION_FILE);
        this.pendingReplyPath = join(root, PENDING_REPLY_FILE);
    }

    getPointerPath(): string {
        return this.pointerPath;
    }

    getPendingReplyPath(): string {
        return this.pendingReplyPath;
    }

    async read(): Promise<ActiveSessionPointer | undefined> {
        let raw: string;
        try {
            raw = await readFile(this.pointerPath, 'utf-8');
        } catch {
            return undefined;
        }

        try {
            const parsed = JSON.parse(raw) as Partial<ActiveSessionPointer>;
            if (
                typeof parsed.sessionFile === 'string' &&
                parsed.sessionFile.length > 0 &&
                typeof parsed.sessionId === 'string' &&
                typeof parsed.projectCwd === 'string'
            ) {
                return {
                    sessionFile: parsed.sessionFile,
                    sessionId: parsed.sessionId,
                    projectCwd: parsed.projectCwd,
                    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString()
                };
            }
        } catch {
            // Malformed pointer is treated as absent; the launcher falls back to a fresh start.
        }

        return undefined;
    }

    async write(pointer: ActiveSessionPointer): Promise<void> {
        await mkdir(dirname(this.pointerPath), { recursive: true });
        const tempPath = `${this.pointerPath}.${process.pid}.${Date.now()}.tmp`;
        const serialized = JSON.stringify(pointer, null, 2);
        try {
            await writeFile(tempPath, serialized);
            await rename(tempPath, this.pointerPath);
        } catch (error) {
            await rm(tempPath, { force: true });
            throw error;
        }
    }

    async clear(): Promise<void> {
        await rm(this.pointerPath, { force: true });
    }

    /**
     * Records a reply whose socket is about to be replaced by a session switch.
     * The replacement runtime flushes it once it has reconnected.
     */
    async writePendingReply(reply: PendingSessionReply): Promise<void> {
        await mkdir(dirname(this.pendingReplyPath), { recursive: true });
        const tempPath = `${this.pendingReplyPath}.${process.pid}.${Date.now()}.tmp`;
        const serialized = JSON.stringify(reply, null, 2);
        try {
            await writeFile(tempPath, serialized);
            await rename(tempPath, this.pendingReplyPath);
        } catch (error) {
            await rm(tempPath, { force: true });
            throw error;
        }
    }

    async readPendingReply(): Promise<PendingSessionReply | undefined> {
        let raw: string;
        try {
            raw = await readFile(this.pendingReplyPath, 'utf-8');
        } catch {
            return undefined;
        }

        try {
            const parsed = JSON.parse(raw) as Partial<PendingSessionReply>;
            if (typeof parsed.chatJid === 'string' && parsed.chatJid.length > 0 && typeof parsed.text === 'string') {
                return {
                    chatJid: parsed.chatJid,
                    text: parsed.text,
                    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date(0).toISOString()
                };
            }
        } catch {
            // Malformed pending reply is treated as absent.
        }

        return undefined;
    }

    async clearPendingReply(): Promise<void> {
        await rm(this.pendingReplyPath, { force: true });
    }
}

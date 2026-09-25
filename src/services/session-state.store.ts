import { readFile, rm, rename, writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { ACTIVE_SESSION_FILE, type ActiveSessionPointer } from '../models/session-commands.types.js';
import { getDefaultStorageRoot } from './storage-path.js';

/**
 * Persists which Pi session is currently active so the launcher can restore it
 * after a process restart (FR-013). The pointer lives outside the session, so
 * it is also valid when the active session belongs to another project.
 */
export class SessionStateStore {
    private readonly pointerPath: string;

    constructor(root: string = getDefaultStorageRoot()) {
        this.pointerPath = join(root, ACTIVE_SESSION_FILE);
    }

    getPointerPath(): string {
        return this.pointerPath;
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
}

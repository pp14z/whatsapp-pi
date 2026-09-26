import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectSessionFile, resolveProjectPath } from '../../src/services/project-session.ts';

const created: string[] = [];

function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'wa-pi-project-'));
    created.push(dir);
    return dir;
}

afterEach(() => {
    while (created.length > 0) {
        const dir = created.pop();
        if (dir) {
            rmSync(dir, { recursive: true, force: true });
        }
    }
});

describe('resolveProjectPath', () => {
    it('resolves relative paths against the base cwd', () => {
        const base = tempDir();
        const target = join(base, 'project');
        mkdirSync(target);
        expect(resolveProjectPath('project', base)).toBe(target);
    });

    it('resolves . to the base cwd', () => {
        const base = tempDir();
        expect(resolveProjectPath('.', base)).toBe(base);
    });

    it('expands a leading ~ to the home directory', () => {
        expect(resolveProjectPath('~', '/')).toBe(homedir());
    });

    it('returns undefined for a missing path', () => {
        const base = tempDir();
        expect(resolveProjectPath('nope', base)).toBeUndefined();
    });

    it('returns undefined when the path is a file', () => {
        const base = tempDir();
        writeFileSync(join(base, 'file.txt'), 'x');
        expect(resolveProjectPath('file.txt', base)).toBeUndefined();
    });
});

describe('createProjectSessionFile', () => {
    it('writes a session header that points at the target cwd', () => {
        const cwd = tempDir();
        const sessionDir = tempDir();

        const file = createProjectSessionFile(cwd, sessionDir);

        expect(existsSync(file)).toBe(true);
        expect(file.startsWith(sessionDir)).toBe(true);
        const header = JSON.parse(readFileSync(file, 'utf-8').trim());
        expect(header.type).toBe('session');
        expect(header.cwd).toBe(cwd);
        expect(typeof header.id).toBe('string');
    });
});

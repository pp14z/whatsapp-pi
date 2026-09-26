import { statSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { isAbsolute, join, resolve } from 'path';
import { SessionManager } from '@earendil-works/pi-coding-agent';

/**
 * Expands `~`, resolves relative paths against `baseCwd`, and returns the
 * absolute path only when it points at an existing directory.
 */
export function resolveProjectPath(input: string, baseCwd: string): string | undefined {
    const expanded = input === '~'
        ? homedir()
        : input.startsWith('~/')
            ? join(homedir(), input.slice(2))
            : input;
    const absolute = isAbsolute(expanded) ? expanded : resolve(baseCwd, expanded);

    try {
        return statSync(absolute).isDirectory() ? absolute : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Creates a persisted session file whose header records `cwd` as the project.
 *
 * The header is written immediately (Pi otherwise defers the first flush until
 * the first assistant reply) so a subsequent `ctx.switchSession(file)` opens the
 * session in the target project using the header's cwd, without an explicit
 * cwd override.
 */
export function createProjectSessionFile(cwd: string, sessionDir?: string): string {
    const manager = SessionManager.create(cwd, sessionDir);
    const file = manager.getSessionFile();
    const header = manager.getHeader();
    if (!file || !header) {
        throw new Error(`Unable to create a session for ${cwd}`);
    }
    writeFileSync(file, `${JSON.stringify(header)}\n`, { flag: 'wx' });
    return file;
}

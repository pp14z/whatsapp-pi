/**
 * Domain types for WhatsApp session control (feature 036).
 *
 * These shapes are internal to the extension: the session content itself is
 * owned by Pi (`SessionManager`), and only a small pointer is persisted.
 */

export type CommandKind =
    | 'list'
    | 'resume'
    | 'new'
    | 'title'
    | 'branch'
    | 'undo'
    | 'compact'
    | 'abort'
    | 'help'
    | 'unknown';

/** A single session, reduced to what the chat needs to display. */
export interface SessionSummary {
    sessionId: string;
    filePath: string;
    projectCwd: string;
    name?: string;
    modified: Date;
    messageCount: number;
    firstMessage: string;
}

export interface ProjectGroup {
    projectCwd: string;
    label: string;
    sessions: SessionSummary[];
}

export interface SessionListing {
    groups: ProjectGroup[];
    totalCount: number;
    truncated: boolean;
    activeFilePath?: string;
}

/** Persisted pointer so a restart resumes the same session (FR-013). */
export interface ActiveSessionPointer {
    sessionFile: string;
    sessionId: string;
    projectCwd: string;
    updatedAt: string;
}

export interface ParsedCommand {
    kind: CommandKind;
    raw: string;
    args: string[];
}

export interface PendingCommand {
    command: ParsedCommand;
    chatJid: string;
    messageId: string;
    enqueuedAt: number;
}

export interface CommandResult {
    ok: boolean;
    message: string;
    /** True when the active Pi session changed and the pointer must be refreshed. */
    changedActiveSession: boolean;
}

/** Commands that answer immediately even while the agent is busy. */
export const READ_ONLY_KINDS: ReadonlySet<CommandKind> = new Set<CommandKind>(['list', 'help']);

/** Commands that change session state and are deferred while the agent is busy. */
export const MUTATING_KINDS: ReadonlySet<CommandKind> = new Set<CommandKind>([
    'resume',
    'new',
    'title',
    'branch',
    'undo',
    'compact'
]);

/** Display bound for `/sessions` (older entries are omitted and flagged). */
export const SESSION_LIST_LIMIT = 20;

/** File name of the persisted active-session pointer inside the extension data dir. */
export const ACTIVE_SESSION_FILE = 'active-session.json';

/** Dedupe window for inbound WhatsApp message ids. */
export const DEDUPE_LIMIT = 500;

# Phase 1 Data Model: WhatsApp Session Control

The feature introduces no database. All shapes below are in-memory TypeScript types plus one small JSON file on disk. Session content itself remains entirely owned by Pi (`~/.pi/agent/sessions/<encoded-cwd>/*.jsonl`).

## SessionSummary

A read-only view of one Pi session, derived from `SessionInfo` (`SessionManager.listAll()`).

| Field | Type | Notes |
|-------|------|-------|
| `sessionId` | `string` | Pi session id |
| `filePath` | `string` | Absolute path to the session `.jsonl` |
| `projectCwd` | `string` | Working directory the session belongs to (from the header) |
| `name` | `string \| undefined` | User title, when set |
| `modified` | `Date` | Last activity |
| `messageCount` | `number` | Number of messages |
| `firstMessage` | `string` | Preview used as a fallback label |

**Validation / rules**
- `filePath` and `projectCwd` MUST be present; sessions whose `projectCwd` is empty (legacy) are grouped under an "unknown project" bucket.
- A summary is display-only; it never mutates session state.

## SessionListing

The result of `/sessions`.

| Field | Type | Notes |
|-------|------|-------|
| `groups` | `ProjectGroup[]` | Ordered by most recent activity |
| `totalCount` | `number` | Total sessions found before the display bound |
| `truncated` | `boolean` | True when older sessions were omitted |
| `activeFilePath` | `string \| undefined` | The currently active session, if known |

`ProjectGroup`: `{ projectCwd: string; label: string; sessions: SessionSummary[] }`

**Navigation rule**: the flat ordinal shown to the user (1..N) maps to a stable `SessionSummary` captured at list time and cached per chat, so `/resume <n>` resolves deterministically.

## ActiveSessionPointer

Persisted as `~/.pi/agent/extension/whatsapp-pi/active-session.json`.

```json
{
  "sessionFile": "/home/user/.pi/agent/sessions/--home-user-dev-foo--/2026-....jsonl",
  "sessionId": "01J...",
  "projectCwd": "/home/user/dev/foo",
  "updatedAt": "2026-09-25T14:00:00.000Z"
}
```

**Validation / rules**
- Written atomically (temp file + rename), consistent with the existing `config.json` write path.
- On read at launch: if the file is missing, malformed, or `projectCwd` no longer exists, the launcher starts Pi normally and the extension notifies the user (FR-013 edge case).
- `projectCwd` is required so the launcher can `cd` before `pi --session <file>`.

## ParsedCommand

A discriminated union produced by `SessionCommandParser`.

| `kind` | Arguments | Maps to |
|--------|-----------|---------|
| `list` | — | `SessionManager.listAll()` |
| `resume` | `<n \| sessionId>` | `ctx.switchSession(path)` |
| `new` | `[title]` | `ctx.newSession(...)` + `setSessionName` |
| `title` | `<name>` | `pi.setSessionName(name)` |
| `branch` | `[entryIndex]` | `ctx.fork(entryId)` |
| `undo` | — | `ctx.navigateTree(<entry before last user msg>)` |
| `compact` | `[instructions]` | `ctx.compact(instructions?)` |
| `abort` | — | `ctx.abort()` + clear queue |
| `help` | — | static command list |
| `unknown` | raw | reply with help hint |

Aliases resolved at parse time: `compress → compact`, `stop → abort`.

**Validation / rules**
- Commands are single-line; the first whitespace-delimited token is the name, the remainder is arguments.
- Only a leading `/` marks a command; non-command text is forwarded to the active session unchanged.
- Unknown command names parse to `unknown`, never to the model.

## PendingCommand

A queued mutating command awaiting an idle agent.

| Field | Type | Notes |
|-------|------|-------|
| `command` | `ParsedCommand` | The deferred command |
| `chatJid` | `string` | Originating WhatsApp chat |
| `messageId` | `string` | Inbound id (for correlation/dedupe) |
| `enqueuedAt` | `number` | Epoch ms |

**Lifecycle**: `enqueued` → `applied` (on `agent_settled`, in FIFO order) or `discarded` (on `/abort`).
**Rules**: only mutating kinds are queued; read-only kinds never enqueue; the queue is bounded (defensive) and drained in insertion order.

## CommandResult

Returned by every command operation and rendered into a WhatsApp reply.

| Field | Type | Notes |
|-------|------|-------|
| `ok` | `boolean` | Success flag |
| `message` | `string` | User-facing text (recap, confirmation, or error) |
| `changedActiveSession` | `boolean` | Lets the router refresh the persisted pointer |

**Rules**: exactly one user-visible outcome message per accepted command (SC-006); long messages are split at the transport boundary (FR-016).

# Command Contract: WhatsApp Session Control

This is the observable contract between the operator (over WhatsApp) and the extension. It is the single source of truth for command names, arguments, effects, and replies. The WhatsApp router owns these user-facing names and translates them to Pi's session APIs via the internal `/wa-session` command (see research R1/R8).

## Preconditions

- The sender MUST be in the allow-list; commands from any other sender are ignored (FR-011).
- Commands are single-line messages whose first token begins with `/`. Any other message is forwarded to the active session unchanged (FR-010).
- Each inbound message is processed at most once, deduplicated by WhatsApp message id (FR-014).

## Commands

| Command | Alias | Arguments | Effect | Success reply (shape) | On failure |
|---------|-------|-----------|--------|------------------------|------------|
| `/sessions` | — | none | List sessions across all projects, grouped by project | Grouped numbered list + active marker; note when truncated | "No sessions found" |
| `/resume` | — | `<n>` or `<sessionId>` | Switch active session (moves cwd to its project) | Confirmation + factual recap (project, title, age/messages, last exchange) | "Unknown session <x>"; active session unchanged |
| `/new` | — | `[title]` | Start a new empty session; optional title | "New session started" + title | "Could not start a session" |
| `/title` | — | `<name>` | Rename the active session | "Renamed to <name>" | "Could not rename" |
| `/branch` | — | `[entryIndex]` | Fork the active session from an earlier point (default: last user message) | "Branched from <point> → new session" | "Nothing to branch from" |
| `/undo` | — | none | Rewind the active session to before the last exchange | "Undid last exchange" | "Nothing to undo" |
| `/compact` | `/compress` | `[instructions]` | Compact the active context | "Context compacted" (+ before/after if available) | "Compaction not needed" / error |
| `/abort` | `/stop` | none | Interrupt the running turn; discard deferred commands | "Aborted" | "Nothing to abort" |
| `/help` | — | none | List supported commands | Command reference | — |

`/resume` with no argument MUST behave as `/sessions` (returns the list). Unknown commands (`/foo`) receive a help hint and are **not** forwarded to the model.

## Busy behaviour

| Command class | While the agent is busy |
|---------------|--------------------------|
| Read-only: `/sessions`, `/help` | Execute immediately |
| Mutating: `/resume`, `/new`, `/title`, `/branch`, `/undo`, `/compact` | Acknowledge ("queued"), enqueue, apply in order on idle (FR-012) |
| Interrupt: `/abort` | Execute immediately; clears the deferred queue (FR-017) |

## Reply rules

- Exactly one outcome message per accepted command (SC-006).
- Replies longer than the transport limit are split across messages, never silently truncated (FR-016).
- Error replies never change the active session.

## Restart contract

- After a process restart, the active session recorded in `active-session.json` is restored before the first inbound message is handled (FR-013).
- A WhatsApp socket reconnect inside a running agent MUST NOT change the active session.

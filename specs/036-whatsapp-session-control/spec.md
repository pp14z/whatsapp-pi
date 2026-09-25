# Feature Specification: WhatsApp Session Control

**Feature Branch**: `036-whatsapp-session-control`

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description: "Control Pi terminal sessions from WhatsApp — list, switch, create, title, branch, undo, save, and compact sessions via slash commands, so I can keep working while away from my computer."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - List and switch sessions (Priority: P1)

While away from my computer, I open my WhatsApp chat with the agent and send `/sessions` to see the recent coding sessions for my project, then `/resume <n>` to make one active. From then on, my WhatsApp messages continue that session and its replies come back to WhatsApp.

**Why this priority**: This is the core reason the feature exists — resuming the right thread of work without a terminal. Without it, WhatsApp is only useful for a single, ever-growing session.

**Independent Test**: With at least two saved sessions, send `/sessions`, then `/resume 2`, then a normal message; verify the reply reflects the second session's context and `/status` reports it as active.

**Acceptance Scenarios**:

1. **Given** two or more saved sessions, **When** the user sends `/sessions`, **Then** the agent replies with a numbered list showing each session's title (or fallback label), age, and message count, marking the active one.
2. **Given** the list from `/sessions`, **When** the user sends `/resume 2`, **Then** the agent confirms the switch and subsequent messages are handled by session 2.
3. **Given** `/resume` names an unknown index or id, **When** sent, **Then** the agent replies with an error and the active session is unchanged.

---

### User Story 2 - Start and name a session (Priority: P2)

The user sends `/new` to start a focused session for a new task, optionally `/new fix-login-bug` to name it immediately, or `/title better-name` afterwards. The new session becomes active and appears in `/sessions`.

**Why this priority**: New work should not inherit a bloated context. Starting clean and naming it makes `/sessions` useful later.

**Independent Test**: Send `/new my-task`, send a message, run `/sessions`, and verify a session named "my-task" exists and is active; run `/title renamed` and verify the name updates.

**Acceptance Scenarios**:

1. **Given** an active session, **When** `/new` is sent, **Then** a fresh empty session becomes active and the agent confirms it.
2. **Given** `/new <title>`, **When** sent, **Then** the new session is created and titled `<title>`.
3. **Given** an active session, **When** `/title <name>` is sent, **Then** the current session's title is updated and the change is visible in a later `/sessions`.

---

### User Story 3 - Branch and undo (Priority: P3)

The user sends `/branch` to fork the current session at an earlier point (defaulting to the last user message), or `/undo` to step the active session back to before the last exchange, so an unwanted direction can be abandoned without losing earlier work.

**Why this priority**: Recovers from bad turns without discarding the whole session — the situation WhatsApp makes easier to notice (terse instructions, delayed replies).

**Independent Test**: In a session with several turns, send `/undo`; verify the active conversation no longer includes the last exchange but earlier turns remain. Send `/branch`; verify a new session is created and the original is untouched.

**Acceptance Scenarios**:

1. **Given** a session with at least one completed exchange, **When** `/undo` is sent, **Then** the active session's conversation is rewound to before the last user message and the agent confirms.
2. **Given** a session with history, **When** `/branch` is sent, **Then** a new session is created from an earlier point, becomes active, and the original session remains recoverable via `/sessions`.

---

### User Story 4 - Compact and save the active session (Priority: P4)

The user sends `/compact` (alias `/compress`) to reduce the active context when it grows long, or `/save` to persist an export of the session transcript for later reference.

**Why this priority**: Useful maintenance, but not required for the core list/switch/start flow.

**Independent Test**: Grow a session, send `/compact`, and verify the agent confirms the outcome; send `/save` and verify a transcript file is produced and its location reported.

**Acceptance Scenarios**:

1. **Given** a long active session, **When** `/compact` is sent, **Then** the context is reduced and the agent confirms the outcome.
2. **Given** an active session, **When** `/save` is sent, **Then** a session transcript file is written and the agent reports where it was saved.

---

### Edge Cases

- Command sent while the agent is still working: the agent must not corrupt state; it either defers the operation until idle or replies that it is busy.
- `/resume` with no argument: return the `/sessions` list rather than an error.
- `/undo` when no completed exchange exists: reply that there is nothing to undo; no state change.
- `/branch` when there is no prior user message: reply that there is nothing to branch from.
- `/compact` on a short session: reply that compaction is unnecessary or a no-op; no data loss.
- Agent restarted (server reboot or crash): the active session is restored so follow-up messages continue the same session.
- Unknown or unauthorized sender: commands are ignored (or answered with a generic refusal) and never alter session state.
- Very large session list: `/sessions` is bounded to the most recent entries with a clear indication that older ones are omitted.
- Duplicate delivery of the same WhatsApp message must not execute a command twice.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let an authorized user list the available coding sessions for the current project from WhatsApp.
- **FR-002**: The system MUST let the user switch the active session, identified by the number shown in the list or by session id.
- **FR-003**: The system MUST let the user start a new empty session, optionally providing its title in the same message.
- **FR-004**: The system MUST let the user rename (title) the active session.
- **FR-005**: The system MUST let the user branch the active session into a new session from an earlier point.
- **FR-006**: The system MUST let the user undo the last exchange in the active session.
- **FR-007**: The system MUST let the user compact (compress) the active session's context.
- **FR-008**: The system MUST let the user save/export the active session transcript and report the resulting location.
- **FR-009**: The system MUST recognize session-control commands and handle them itself; command text MUST NOT be forwarded to the language model as a prompt.
- **FR-010**: After every command, the system MUST send a short outcome message to the originating WhatsApp chat (success, what changed, or why it failed).
- **FR-011**: Incoming messages that are not commands MUST continue to be delivered to the active session, and that session's replies MUST return to the originating WhatsApp chat.
- **FR-012**: The system MUST reject or ignore session-control commands from senders who are not authorized.
- **FR-013**: The system MUST NOT change the active session while the session's agent is mid-turn in a way that loses work; it MUST wait for the turn to finish or report that it is busy.
- **FR-014**: The system MUST persist the identity of the active session so it survives an agent restart and reconnection.
- **FR-015**: The system MUST safely ignore duplicate deliveries of the same inbound message.
- **FR-016**: The system MUST provide a discoverable help listing of supported commands.
- **FR-017**: The system MUST bound the size of any single reply it sends to WhatsApp, splitting long output across multiple messages rather than silently truncating.

### Key Entities *(include if feature involves data)*

- **User**: the authorized WhatsApp identity permitted to control sessions.
- **Session**: a saved coding conversation with an identifier, optional title, creation/last-active time, message count, and a file location; exactly one is active at a time.
- **Session Control Command**: a normalized instruction (name plus arguments) recognized by the agent and mapped to a session operation.
- **Bridge State**: the persisted record of the active session and command-processing bookkeeping (for example, the last processed message id).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a cold WhatsApp chat, the user can identify and switch to the intended session in at most 3 messages (`/sessions`, `/resume <n>`, confirmation).
- **SC-002**: 95% of valid session-control commands return a confirmation to WhatsApp within 5 seconds.
- **SC-003**: After an agent restart, the user can continue in the previously active session without re-selecting it, in 100% of trials.
- **SC-004**: Zero commands are executed from unauthorized senders, and zero duplicate deliveries execute a command twice, in adversarial and double-delivery tests.
- **SC-005**: The pre-operation session remains recoverable after `/undo`, `/branch`, or `/compact` — no session content is destroyed.
- **SC-006**: Every recognized command produces exactly one user-visible outcome message per invocation.

## Assumptions

- **Single user**: the agent serves one authorized person (the owner's WhatsApp identity); multi-user concurrent session control is out of scope for v1.
- **One active session at a time**: session control changes a single shared active session rather than running multiple sessions concurrently.
- **Existing messaging layer**: this builds on the existing WhatsApp↔Pi messaging support (pairing, allow-list, message send/receive); it adds session control and does not replace the messaging layer.
- **Persistent host**: the agent runs continuously on a supervised server rather than on the user's laptop.
- **Terminology mapping**: the requested `/compress` is treated as an alias for the platform's compaction operation; `/topic` and `/retry` are out of scope for v1 (not currently used) and may be added later.
- **Session identity**: sessions are the platform's native saved coding sessions; the feature does not introduce a separate conversation store.
- **Command prefix**: commands are single-line messages beginning with `/`; a leading slash is reserved for control and is not sent to the model.
- **Language**: replies use the same language as the command where practical (English default).

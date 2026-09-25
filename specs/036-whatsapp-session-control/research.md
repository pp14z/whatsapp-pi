# Phase 0 Research: WhatsApp Session Control

All `NEEDS CLARIFICATION` items from the plan's Technical Context are resolved below. Each entry states the decision, the rationale, and the alternatives that were considered and rejected.

## R1. How a WhatsApp command obtains a command-capable context

**Decision**: Register one internal extension command (e.g. `/wa-session <op> [args]`) and invoke it from the WhatsApp message callback with `pi.sendUserMessage("/wa-session <op> ...", { expandPromptTemplates: true })`. Pi resolves the registered command and runs its handler with a fresh `ExtensionCommandContext`.

**Rationale**: Session-replacement operations (`newSession`, `switchSession`, `fork`, `navigateTree`) exist only on `ExtensionCommandContext` and are documented as command-only because calling them from lifecycle handlers can deadlock the runtime. Pi's `AgentSession` implements `_tryExecuteExtensionCommand`, which looks the command up in the extension runner, calls `createCommandContext()`, and invokes the handler — so a programmatically sent command text yields a real command context without a TUI interaction. There is no public API to mint a command context directly.

**Alternatives considered**:
- *Capture the `ExtensionCommandContext` from a command handler and reuse it later* — fragile: it only exists after the user runs a command in the TUI, and the captured context goes stale after any session replacement.
- *Use the `ExtensionContext` from `session_start`* — rejected: it lacks the session-replacement methods.
- *Spawn a child `pi --mode rpc` process* — rejected: reintroduces a daemon/broker and duplicates Pi state (violates Simplicity).

## R2. Discovering sessions across all projects

**Decision**: Use `SessionManager.listAll()` to enumerate sessions and group them by `SessionInfo.cwd` (the project directory recorded in each session header). Render a bounded, grouped list.

**Rationale**: `SessionInfo` already exposes `cwd`, `name`, `modified`, `messageCount`, and `firstMessage`, so no new index is required. `listAll()` covers every project on the host, matching the clarified all-projects scope.

**Alternatives considered**:
- *Scanning `~/.pi/agent/sessions/*` manually* — rejected: reimplements what `SessionManager.listAll()` provides and risks diverging from Pi's storage format.
- *Maintaining our own session index* — rejected: duplicates Pi state and can drift.

## R3. Switching to a session from another project

**Decision**: Call `ctx.switchSession(sessionPath)`. Let Pi derive the working directory from the session header.

**Rationale**: `AgentSessionRuntime.switchSession` opens the session with `SessionManager.open(path, undefined, cwdOverride)`, asserts the directory exists, and recreates the runtime with `cwd: sessionManager.getCwd()`. So switching to another project's session moves the agent's working directory automatically — the "all projects" requirement is satisfied in-process.

**Alternatives considered**:
- *Passing an explicit `cwdOverride`* — unnecessary: the session header already carries the cwd; the extension command context does not expose the override anyway.
- *Running one agent per project* — rejected: does not match the clarified requirement and multiplies WhatsApp links.

## R4. Deferring mutating commands while the agent is busy

**Decision**: Track busy state via lifecycle events (`agent_start` → busy, `agent_settled` → idle). When a mutating command arrives while busy, acknowledge it and enqueue it; drain the queue in order on `agent_settled`. Read-only commands (list/status/help) execute immediately. `/abort` clears the queue.

**Rationale**: Satisfies FR-012/FR-017 without losing work or surprising ordering. `ExtensionCommandContext.waitForIdle()` is available inside the handler as a backstop, but a router-owned queue keeps the acknowledgement immediate and preserves command order relative to following messages.

**Alternatives considered**:
- *Reject with "busy"* — rejected by the clarification decision (worse for a remote user).
- *Abort the running turn automatically* — rejected: destroys in-flight work without explicit consent.
- *`await ctx.waitForIdle()` before acknowledging* — rejected: delays the acknowledgement and hides the queue state.

## R5. Persisting and restoring the active session

**Decision**: On every session change (`/new`, `/resume`, `/branch`, and `session_start`), write an `active-session.json` pointer containing the session file path, session id, and project cwd, to the extension data directory. On launch, `scripts/whatsapp-pi-tmux.sh` reads the pointer and starts Pi in the session's project with `--session <path>`; when absent or invalid it starts normally and the extension notifies the user.

**Rationale**: Pi persists session *files* automatically but starts a *new* session on a plain restart (`--continue` only resumes the most recent session for the current cwd, which is wrong for a cross-project active session). The extension cannot reselect a session from `session_start` (command-only, see R1). The existing systemd unit already launches via `scripts/whatsapp-pi-tmux.sh`, so the restore is a small change to an existing component, not a new supervisor.

**Alternatives considered**:
- *Always launch with `--continue`* — rejected: resumes the wrong session when the active one belongs to another project.
- *Restore from a lifecycle handler with `ctx.switchSession`* — rejected: lifecycle handlers must not perform session replacement.
- *A new standalone supervisor daemon* — rejected: the launcher already exists (Simplicity).

## R6. Keeping the WhatsApp socket alive across session replacement

**Decision**: Only stop the WhatsApp service in the `session_shutdown` handler when `reason === "quit"` (and treat `reload` as a full teardown only if required). Session replacement reasons (`new`, `resume`, `fork`) MUST leave the socket connected.

**Rationale**: `SessionShutdownEvent.reason` distinguishes `"quit" | "reload" | "new" | "resume" | "fork"`. `whatsapp-pi` currently stops the service on every `session_shutdown`, which would drop and reconnect the socket on every `/resume`. The Baileys service is created once in the extension factory and therefore survives runtime replacement as long as the handler does not tear it down.

**Alternatives considered**:
- *Accept a reconnect per switch* — rejected: disrupts messaging and risks transient `Bad MAC`/pairing states.
- *Move the socket outside the extension* — rejected: reintroduces a daemon (violates Simplicity).

## R7. Authorization and duplicate suppression

**Decision**: Reuse the existing allow-list (`SessionManager`/`isConversationAllowed`) as the authorization gate: only allowed senders may issue commands. Deduplicate inbound messages by WhatsApp message id using a bounded in-memory set (consistent with the existing `recentlySentIds` pattern).

**Rationale**: Meets FR-011/FR-014 with existing primitives; no new auth subsystem. A bounded set prevents unbounded growth.

**Alternatives considered**:
- *Persist a processed-message log* — rejected: overkill for a single-user local bridge; the socket reconnect path already tolerates redelivery.

## R8. Command naming and collisions

**Decision**: Expose the user-facing commands as `/sessions`, `/resume`, `/new`, `/title`, `/branch`, `/undo`, `/compact` (alias `/compress`), `/abort` (alias `/stop`), `/help`. Implement them through a single internal command with a namespaced name (`/wa-session`) that the router dispatches to.

**Rationale**: Namespacing the internal command avoids colliding with Pi's built-in TUI commands (`/new`, `/resume`, `/compact`, `/abort`), which are handled by the interactive layer and are not dispatchable as extension commands. The WhatsApp router owns the user-facing names and translates them.

**Alternatives considered**:
- *Register `/resume`, `/new`, ... directly as extension commands* — rejected: risks ambiguity with built-ins and exposes WhatsApp-specific behavior as TUI commands.
- *Handle everything in the message callback without commands* — rejected: no command-capable context, so session replacement would be impossible (R1).

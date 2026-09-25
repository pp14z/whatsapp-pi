---
description: "Task list for WhatsApp Session Control implementation"
---

# Tasks: WhatsApp Session Control

**Input**: Design documents from `/specs/036-whatsapp-session-control/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/session-commands.md, quickstart.md

**Tests**: Included. The plan lists Vitest suites under `tests/unit/` and this repository maintains unit tests for every service; test tasks are therefore part of each user story.

**Organization**: Tasks are grouped by user story so each can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story (US1, US2, US3, US4)
- Exact file paths are included in every task

## Path Conventions

Single project (Pi extension) at the repository root: `whatsapp-pi.ts`, `src/`, `tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Define the shared types and i18n keys the rest of the feature builds on.

- [X] T001 Create the domain types in `src/models/session-commands.types.ts` (`ParsedCommand` discriminated union, `SessionSummary`, `SessionListing`, `ProjectGroup`, `ActiveSessionPointer`, `PendingCommand`, `CommandResult`).
- [X] T002 [P] Add session-command message keys (list, switch, new, title, branch, undo, compact, abort, help, errors, queued) to `src/i18n.ts` for all existing locales.
- [X] T003 [P] Add shared test doubles for `SessionManager` and `ExtensionCommandContext` in `tests/unit/session-command.test-helpers.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The command pipeline and lifecycle fixes every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 [P] Implement `SessionStateStore` (atomic read/write of `active-session.json` under `~/.pi/agent/extension/whatsapp-pi/`) in `src/services/session-state.store.ts` (depends on T001).
- [X] T005 [P] Implement `SessionCommandParser` (name, aliases `compress`→compact and `stop`→abort, arguments, `unknown` fallback) in `src/services/session-command.parser.ts` (depends on T001).
- [X] T006 Register the internal `/wa-session` extension command and add the dispatch helper that calls `pi.sendUserMessage("/wa-session <op> …", { expandPromptTemplates: true })` in `whatsapp-pi.ts` (research R1).
- [X] T007 Implement the `SessionCommandRouter` skeleton — authorization via the existing allow-list, message-id dedupe, and a command/help registry — in `src/services/session-command.router.ts` (depends on T001, T005).
- [X] T008 Keep the WhatsApp socket alive across session replacement: gate the `session_shutdown` teardown on `reason === "quit"` in `whatsapp-pi.ts` (research R6).
- [X] T009 Track busy state from `agent_start`/`agent_settled` and implement the FIFO deferred-command queue drain in `src/services/session-command.router.ts` (depends on T007).
- [X] T010 Wire the router into the WhatsApp inbound-message callback so `/`-commands are intercepted before reaching the model, in `whatsapp-pi.ts` (depends on T006, T007).

**Checkpoint**: Command pipeline, authorization, deferral, and socket survival are ready.

---

## Phase 3: User Story 1 - List and switch sessions (Priority: P1) 🎯 MVP

**Goal**: `/sessions` lists sessions across all projects (grouped) and `/resume` switches to any of them, restoring the project context.

**Independent Test**: With sessions in two projects, `/sessions` then `/resume <n>` for the other project, then a normal message — verify the reply reflects that session and the agent works in that project's directory.

### Tests for User Story 1

- [X] T011 [P] [US1] Parser tests (names, aliases, unknown) in `tests/unit/session-command.parser.test.ts`.
- [X] T012 [P] [US1] Listing tests (grouping by project, ordering, bound/truncation) in `tests/unit/session-query.service.test.ts`.
- [X] T013 [P] [US1] Router tests (authorize, dedupe, `/sessions`, `/resume` dispatch, ordinal resolution) in `tests/unit/session-command.router.test.ts`.

### Implementation for User Story 1

- [X] T014 [US1] Implement `SessionQueryService` (`SessionManager.listAll()`, group by `cwd`, bounded formatting) in `src/services/session-query.service.ts` (depends on T001).
- [X] T015 [US1] Implement the `/sessions` handler (grouped numbered output, active marker, per-chat ordinal cache) in `src/services/session-command.router.ts` (depends on T009, T014).
- [X] T016 [US1] Implement the `/resume` handler (resolve ordinal/id, `ctx.switchSession`, guard missing project dir) in `src/services/session-command.router.ts` (depends on T015).
- [X] T017 [US1] Persist the `ActiveSessionPointer` on every session change and include the factual recap in the `/resume` reply in `src/services/session-command.router.ts` (depends on T004, T016).
- [X] T018 [US1] Restore the active session at launch: read the pointer and start `pi --session <path>` from `projectCwd` in `scripts/whatsapp-pi-tmux.sh`.
- [X] T019 [US1] Notify the user when the restored/invalid session cannot be resumed instead of silently starting new, in `src/services/session-command.router.ts` (depends on T018).

**Checkpoint**: `/sessions` and `/resume` work end-to-end, including restart restore — MVP.

---

## Phase 4: User Story 2 - Start and name a session (Priority: P2)

**Goal**: `/new` starts a fresh session (optionally titled) and `/title` renames the active one.

**Independent Test**: `/new my-task`, send a message, `/sessions` shows an active `my-task`; `/title renamed` is reflected in the next `/sessions`.

### Tests for User Story 2

- [X] T020 [P] [US2] Tests for `/new` and `/title` (including title on creation and pointer update) in `tests/unit/session-command.router.test.ts`.

### Implementation for User Story 2

- [X] T021 [US2] Implement the `/new [title]` handler (`ctx.newSession` + `setSessionName` + pointer) in `src/services/session-command.router.ts` (depends on T017).
- [X] T022 [US2] Implement the `/title <name>` handler (`pi.setSessionName` + pointer refresh) in `src/services/session-command.router.ts` (depends on T017).
- [X] T023 [US2] Register `/new` and `/title` in the router's command/help registry in `src/services/session-command.router.ts` (depends on T007).

**Checkpoint**: US1 and US2 are independently functional.

---

## Phase 5: User Story 3 - Branch and undo (Priority: P3)

**Goal**: `/branch` forks at an earlier point; `/undo` rewinds before the last exchange.

**Independent Test**: In a multi-turn session, `/undo` removes the last exchange but keeps earlier turns; `/branch` creates a new active session while the original stays listed.

### Tests for User Story 3

- [X] T024 [P] [US3] Tests for `/branch` and `/undo` (entry resolution, nothing-to-do cases) in `tests/unit/session-command.router.test.ts`.

### Implementation for User Story 3

- [X] T025 [US3] Implement the `/branch [entryIndex]` handler (resolve entry, `ctx.fork`) in `src/services/session-command.router.ts` (depends on T009).
- [X] T026 [US3] Implement the `/undo` handler (resolve entry before last user message, `ctx.navigateTree`) in `src/services/session-command.router.ts` (depends on T009).
- [X] T027 [US3] Handle the "nothing to undo"/"nothing to branch from" replies without mutating state in `src/services/session-command.router.ts` (depends on T025, T026).

**Checkpoint**: US1–US3 independently functional.

---

## Phase 6: User Story 4 - Compact and interrupt (Priority: P4)

**Goal**: `/compact` reduces context; `/abort` (alias `/stop`) interrupts a running turn and clears deferred commands; `/help` lists commands.

**Independent Test**: `/compact` confirms reduction; starting a long turn then `/abort` stops it and confirms.

### Tests for User Story 4

- [X] T028 [P] [US4] Tests for `/compact`, `/abort`/`/stop`, queue clearing, and `/help` in `tests/unit/session-command.router.test.ts`.

### Implementation for User Story 4

- [X] T029 [US4] Implement the `/compact [instructions]` handler (`ctx.compact`, unnecessary/no-op messaging) in `src/services/session-command.router.ts` (depends on T009).
- [X] T030 [US4] Implement the `/abort` and `/stop` handlers (`ctx.abort` + clear the deferred queue) in `src/services/session-command.router.ts` (depends on T009).
- [X] T031 [US4] Implement the `/help` handler that renders the command/help registry in `src/services/session-command.router.ts` (depends on T007).

**Checkpoint**: All four user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Hardening and documentation that span the stories.

- [X] T032 [P] Split oversized replies across messages instead of truncating (FR-016) in `src/services/session-command.router.ts`.
- [X] T033 [P] Enforce the session-list bound and truncation indicator (FR-015/SC) in `src/services/session-query.service.ts`.
- [X] T034 [P] Log at decision points — which command ran, which was deferred, and why it was skipped — in `src/services/session-command.router.ts`.
- [X] T035 [P] Document the commands and the systemd/restart behaviour in `README.md`.
- [X] T036 Run `npm run lint`, `npm run typecheck`, and `npm test`; resolve all failures.
- [ ] T037 Execute every scenario in `specs/036-whatsapp-session-control/quickstart.md` and record results.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Stories (Phases 3–6)**: Depend on Foundational. US2–US4 reuse the router from US1 but each adds independent handlers.
- **Polish (Phase 7)**: Depends on the targeted user stories; T036/T037 after all.

### User Story Dependencies

- **US1 (P1)**: No dependencies beyond Foundational — the MVP.
- **US2 (P2)**: Depends on the pointer handling from T017; otherwise independent.
- **US3 (P3)**: Depends only on Foundational (T009).
- **US4 (P4)**: Depends only on Foundational (T009).

### Within Each User Story

- Tests first (written to fail), then models/services, then handlers, then integration.
- `whatsapp-pi.ts` changes (T006, T008, T010) are serialized — same file.

### Parallel Opportunities

- Setup: T002, T003 in parallel after T001.
- Foundational: T004 and T005 in parallel; T006/T008/T010 serialize on `whatsapp-pi.ts`.
- US1 tests T011–T013 in parallel (different files).
- US2–US4 test tasks [P] can run alongside other stories' implementation once Foundational is done.

---

## Parallel Example: User Story 1

```bash
# Tests (different files):
Task: "Parser tests in tests/unit/session-command.parser.test.ts"
Task: "Listing tests in tests/unit/session-query.service.test.ts"
Task: "Router tests in tests/unit/session-command.router.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational).
2. Complete Phase 3 (US1) — list + switch + restart restore.
3. **Stop and validate**: `/sessions` and `/resume` across projects, plus restart restore. This is a shippable increment (the core reason the feature exists).

### Incremental Delivery

1. Foundation → command pipeline + socket survival.
2. US1 → `/sessions`, `/resume`, restart restore (MVP).
3. US2 → `/new`, `/title`.
4. US3 → `/branch`, `/undo`.
5. US4 → `/compact`, `/abort`/`/stop`, `/help`.
6. Polish → reply splitting, bounds, logging, docs, quickstart validation.

---

## Notes

- `[P]` tasks touch different files and have no incomplete dependencies.
- Tests are expected to fail before their implementation task.
- The internal `/wa-session` command is the only path that yields a command-capable context (research R1); never call session replacement directly from the message callback.
- Verify the WhatsApp socket is not torn down on `new`/`resume`/`fork` (research R6) — a regression here drops the connection on every `/resume`.

# Implementation Plan: WhatsApp Session Control

**Branch**: `036-whatsapp-session-control` | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/036-whatsapp-session-control/spec.md`

## Summary

Add slash-command session control to the `whatsapp-pi` extension so an authorized user can list, switch, create, title, branch, undo, compact, and abort Pi sessions from WhatsApp — **across all projects**. Every command is handled in-process by the extension using Pi's extension API (`SessionManager` + `ExtensionCommandContext`); no daemon and no parallel session store are introduced. Read-only commands answer immediately; mutating commands are deferred (and applied in order) while the agent is busy. The active session (file path + project) is persisted outside the session, and the existing launcher restores it on the next start so a restart never silently begins a new session.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+  
**Primary Dependencies**: `@whiskeysockets/baileys`, `@mariozechner/pi-coding-agent` (extension API + `SessionManager`), `pino`, `qrcode-terminal`  
**Storage**: Local filesystem — the existing extension data directory `~/.pi/agent/extension/whatsapp-pi/` gains an `active-session.json` pointer; Pi session files remain under `~/.pi/agent/sessions/<encoded-cwd>/`  
**Testing**: Vitest (`tests/unit/`), with the Pi extension API and `SessionManager` mocked  
**Target Platform**: Node.js 20+ Pi extension runtime on a Linux server supervised by systemd + tmux  
**Project Type**: Pi Code Agent extension  
**Performance Goals**: Command acknowledgement delivered to WhatsApp within 5s (SC-002); `/sessions` listing is bounded and non-blocking  
**Constraints**: In-process only (no daemon, no IPC); strict typing (no `any`); the WhatsApp socket MUST survive session replacement; command text MUST NOT reach the model  
**Scale/Scope**: Single authorized user; dozens of projects and hundreds of sessions; `/sessions` bounded to the most recent N

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. OOP**: A `SessionCommandParser`, a `SessionCommandRouter`, a `SessionQueryService`, and a `SessionStateStore`, each behind a small interface; command handlers model each operation.
- [x] **II. Clean Code**: One parser and one dispatcher; small methods with intent-revealing names; no duplicated command branches.
- [x] **III. SOLID**: Command handling is decoupled from WhatsApp transport; adding a command does not modify the transport; transport is mockable for tests.
- [x] **IV. TypeScript**: Discriminated-union command model, typed results and errors, no `any`.
- [x] **V. Simplicity**: Reuse Pi's native session APIs (`newSession`, `switchSession`, `fork`, `navigateTree`, `compact`, `SessionManager.listAll`); no custom persistence of conversation data.

## Project Structure

### Documentation (this feature)

```text
specs/036-whatsapp-session-control/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── session-commands.md
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created here)
```

### Source Code (repository root)

```text
whatsapp-pi.ts                          # wire router into the message callback; keep socket alive on session replacement
src/
├── models/
│   └── session-commands.types.ts       # ParsedCommand union, SessionSummary, ActiveSessionPointer, results
├── services/
│   ├── session-command.parser.ts       # parse "/cmd args" → typed ParsedCommand
│   ├── session-command.router.ts       # authorize, dedupe, dispatch, defer, reply
│   ├── session-query.service.ts        # listAll + group by project + format recap
│   ├── session-state.store.ts          # read/write the active-session pointer
│   └── whatsapp.service.ts             # (modify) socket lifecycle across session replacement
├── ui/                                  # (unchanged)
tests/unit/
├── session-command.parser.test.ts
├── session-command.router.test.ts
├── session-query.service.test.ts
└── session-state.store.test.ts

scripts/
└── whatsapp-pi-tmux.sh                  # (modify) restore the active session at launch
systemd/
└── whatsapp-pi.service.in               # (minor) pass the state path if needed
```

**Structure Decision**: Extend the existing single-extension layout. New logic lives in `src/services` + `src/models` beside the current services; the only change outside the extension is launch-time session restore in the existing `scripts/whatsapp-pi-tmux.sh`. No new service, daemon, or database is added.

## Complexity Tracking

> No constitution violations. The only addition beyond in-process code is launch-time session restore, which is required by FR-013 and reuses the existing launcher rather than introducing a new component.

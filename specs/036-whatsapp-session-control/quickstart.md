# Quickstart: WhatsApp Session Control

Manual validation steps for feature `036-whatsapp-session-control`. Automated coverage lives in `tests/unit/` (Vitest).

## Prerequisites

- Pi installed and authenticated; the `whatsapp-pi` extension loaded (repo entrypoint or installed package).
- WhatsApp paired (QR) once, and your number present in the allow-list.
- At least two Pi sessions across two different project directories.
- The agent running with auto-connect, e.g. `pi -e ./whatsapp-pi.ts --whatsapp-pi-online`, ideally under the systemd/tmux supervisor.

## 1. List sessions across projects

1. From your WhatsApp chat with the agent, send `/sessions`.
2. **Expect**: a numbered list grouped by project, each entry showing title (or first-message fallback), age, and message count, with the active session marked.

## 2. Resume a session (same project)

1. Note the ordinal of a session in the current project from `/sessions`.
2. Send `/resume <n>`.
3. **Expect**: a confirmation with a short factual recap (project, title, age/messages, last exchange), followed by normal operation in that session.

## 3. Resume a session from another project

1. From `/sessions`, pick an ordinal under a different project.
2. Send `/resume <n>`, then send an ordinary message such as "what is the git status here?".
3. **Expect**: the agent operates in the other project's directory (its tools report that project's files).

## 4. Start, title, and rename

1. Send `/new my-task`.
2. **Expect**: a fresh active session named `my-task`.
3. Send `/title renamed`; then `/sessions`.
4. **Expect**: the entry now reads `renamed`.

## 5. Undo and branch

1. In a session with a few turns, send `/undo`.
2. **Expect**: the last exchange is rewound; earlier turns remain.
3. Send `/branch`.
4. **Expect**: a new session is created from an earlier point and becomes active; the original is still listed by `/sessions`.

## 6. Compaction and interrupt

1. In a long session, send `/compact` (or `/compress`).
2. **Expect**: a confirmation that the context was reduced.
3. Start a long-running request, then send `/abort` (or `/stop`).
4. **Expect**: the running turn stops and the agent confirms.

## 7. Deferral while busy

1. Start a long-running request.
2. While it runs, send `/new queued-task`.
3. **Expect**: an immediate "queued" acknowledgement; the new session becomes active only after the current turn finishes.

## 8. Restart restores the active session

1. Resume a session (optionally from another project) and note its title.
2. Restart the agent (e.g. `systemctl --user restart whatsapp-pi.service`, or kill the tmux session).
3. Send an ordinary message.
4. **Expect**: the reply continues the previously active session (same project), with no new session created.

## 9. Authorization and duplicates

1. From a number **not** in the allow-list, send `/sessions`.
2. **Expect**: no command is executed and the active session is unchanged.
3. Send the same command twice in quick succession (or simulate redelivery).
4. **Expect**: the command executes once.

## Troubleshooting

- No reply: confirm the socket shows connected and the sender is allow-listed.
- `/resume` fails with "unknown session": re-run `/sessions` (the ordinal cache is per chat and refreshes on each list).
- Restart starts a new session: verify `active-session.json` exists under `~/.pi/agent/extension/whatsapp-pi/` and that its `projectCwd` still exists.

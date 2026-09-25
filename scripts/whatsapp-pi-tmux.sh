#!/usr/bin/env bash
set -Eeuo pipefail

SESSION_NAME="${WHATSAPP_PI_TMUX_SESSION:-whatsapp-pi}"
PI_COMMAND="${PI_COMMAND:-pi}"
PI_ENTRYPOINT="${PI_ENTRYPOINT:-}"
WORKING_DIRECTORY="${WHATSAPP_PI_WORKING_DIRECTORY:-$(pwd)}"

# Active-session pointer written by the extension (feature 036, FR-013). When it
# points at an existing session in an existing project directory, resume it so a
# restart continues the same conversation instead of starting a new session.
STATE_FILE="${WHATSAPP_PI_STATE_FILE:-$HOME/.pi/agent/extensions/whatsapp-pi/active-session.json}"
SESSION_FILE=""

if [[ -f "$STATE_FILE" ]] && command -v node >/dev/null 2>&1; then
    resolved="$(node -e '
        const fs = require("fs");
        try {
            const pointer = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
            if (
                pointer &&
                typeof pointer.sessionFile === "string" &&
                typeof pointer.projectCwd === "string" &&
                fs.existsSync(pointer.sessionFile) &&
                fs.existsSync(pointer.projectCwd)
            ) {
                process.stdout.write(pointer.projectCwd + "\t" + pointer.sessionFile);
            }
        } catch {
            // Missing or malformed pointer: fall back to a normal start.
        }
    ' "$STATE_FILE" 2>/dev/null || true)"

    if [[ -n "$resolved" ]]; then
        IFS=$'\t' read -r WORKING_DIRECTORY SESSION_FILE <<< "$resolved"
    fi
fi

# systemd restarts this supervisor if Pi exits. The Pi process itself lives in tmux.
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    while tmux has-session -t "$SESSION_NAME" 2>/dev/null; do
        sleep 2
    done
    exit 1
fi

cleanup() {
    tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
}
trap cleanup TERM INT

PI_FLAGS=(--whatsapp-pi-online)
if [[ -n "$SESSION_FILE" ]]; then
    PI_FLAGS+=(--session "$SESSION_FILE")
fi

if [[ -n "$PI_ENTRYPOINT" ]]; then
    tmux new-session -d -s "$SESSION_NAME" -c "$WORKING_DIRECTORY" -- \
        bash -lc 'exec "$@"' bash "$PI_COMMAND" -e "$PI_ENTRYPOINT" "${PI_FLAGS[@]}"
else
    tmux new-session -d -s "$SESSION_NAME" -c "$WORKING_DIRECTORY" -- \
        bash -lc 'exec "$@"' bash "$PI_COMMAND" "${PI_FLAGS[@]}"
fi

# Keep the systemd service alive while the tmux session is alive.
while tmux has-session -t "$SESSION_NAME" 2>/dev/null; do
    sleep 2
done

exit 1

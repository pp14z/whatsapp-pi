const DEFAULT_MAX_LENGTH = 48;

/**
 * Derives a short, single-line session title from the first inbound message.
 * Returns `undefined` when the message has no usable text so callers can leave
 * an explicitly chosen title untouched.
 */
export function deriveSessionTitle(text: string, maxLength = DEFAULT_MAX_LENGTH): string | undefined {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return undefined;
    }
    if (normalized.length <= maxLength) {
        return normalized;
    }

    const clipped = normalized.slice(0, maxLength);
    const lastSpace = clipped.lastIndexOf(' ');
    const base = lastSpace >= Math.floor(maxLength / 2) ? clipped.slice(0, lastSpace) : clipped;
    return `${base.trimEnd()}…`;
}

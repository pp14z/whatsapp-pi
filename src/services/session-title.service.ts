import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { deriveSessionTitle } from './session-title.js';

const TITLE_SYSTEM_PROMPT = [
    'You name coding sessions.',
    "Given the user's first message, reply with a concise title of 3 to 6 words.",
    'Use the same language as the message.',
    'Reply with the title only: no quotes, no trailing punctuation, no explanation.'
].join(' ');

const MAX_TITLE_LENGTH = 60;

/** Normalizes a model-produced title into a single clean, bounded line. */
export function sanitizeGeneratedTitle(raw: string): string | undefined {
    const cleaned = raw
        .replace(/\s+/g, ' ')
        .replace(/^["'“”‘’\s]+/, '')
        .replace(/["'“”‘’\s]+$/, '')
        .replace(/[.!?]+$/, '')
        .trim();
    if (!cleaned) {
        return undefined;
    }
    return cleaned.length > MAX_TITLE_LENGTH
        ? `${cleaned.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
        : cleaned;
}

type TitleContext = Pick<ExtensionContext, 'model' | 'modelRegistry'>;

/**
 * Generates a short session title from the first inbound message using the
 * active model. Falls back to a deterministic derivation when no model is
 * available or the call fails, so titling never blocks or throws.
 */
export class SessionTitleService {
    async generate(ctx: TitleContext, text: string): Promise<string | undefined> {
        const model = ctx.model;
        if (!model) {
            return deriveSessionTitle(text);
        }

        try {
            const response = await ctx.modelRegistry.complete(model, {
                systemPrompt: TITLE_SYSTEM_PROMPT,
                messages: [{
                    role: 'user',
                    content: [{ type: 'text', text }],
                    timestamp: Date.now()
                }]
            });
            if (response.stopReason === 'aborted') {
                return undefined;
            }
            const generated = response.content
                .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
                .map((part) => part.text)
                .join(' ');
            return sanitizeGeneratedTitle(generated) ?? deriveSessionTitle(text);
        } catch {
            return deriveSessionTitle(text);
        }
    }
}

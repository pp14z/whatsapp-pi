import { describe, expect, it, vi } from 'vitest';
import { SessionTitleService, sanitizeGeneratedTitle } from '../../src/services/session-title.service.ts';

function contextWithComplete(complete: unknown, model: unknown = { id: 'test-model' }) {
    return { model, modelRegistry: { complete } } as never;
}

describe('sanitizeGeneratedTitle', () => {
    it('strips quotes, trailing punctuation and surplus whitespace', () => {
        expect(sanitizeGeneratedTitle('  "Fix login bug." ')).toBe('Fix login bug');
    });

    it('collapses newlines into a single line', () => {
        expect(sanitizeGeneratedTitle('Fix\nlogin   bug')).toBe('Fix login bug');
    });

    it('truncates overly long titles', () => {
        const title = sanitizeGeneratedTitle('a'.repeat(80));
        expect(title?.length).toBeLessThanOrEqual(60);
        expect(title?.endsWith('…')).toBe(true);
    });

    it('returns undefined for blank output', () => {
        expect(sanitizeGeneratedTitle('   \n ')).toBeUndefined();
    });
});

describe('SessionTitleService', () => {
    it('uses the model output as the title', async () => {
        const complete = vi.fn().mockResolvedValue({
            stopReason: 'stop',
            content: [{ type: 'text', text: '"Fix login bug"' }]
        });

        const title = await new SessionTitleService().generate(
            contextWithComplete(complete),
            'please fix the login bug'
        );

        expect(title).toBe('Fix login bug');
    });

    it('falls back to the message text when no model is available', async () => {
        const title = await new SessionTitleService().generate(
            { model: undefined, modelRegistry: { complete: vi.fn() } } as never,
            'fix the login bug'
        );

        expect(title).toBe('fix the login bug');
    });

    it('falls back to the message text when the model call fails', async () => {
        const complete = vi.fn().mockRejectedValue(new Error('boom'));

        const title = await new SessionTitleService().generate(
            contextWithComplete(complete),
            'fix the login bug'
        );

        expect(title).toBe('fix the login bug');
    });

    it('returns undefined when the model call is aborted', async () => {
        const complete = vi.fn().mockResolvedValue({ stopReason: 'aborted', content: [] });

        const title = await new SessionTitleService().generate(
            contextWithComplete(complete),
            'fix the login bug'
        );

        expect(title).toBeUndefined();
    });
});

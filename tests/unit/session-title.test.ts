import { describe, expect, it } from 'vitest';
import { deriveSessionTitle } from '../../src/services/session-title.ts';

describe('deriveSessionTitle', () => {
    it('returns undefined for empty or whitespace-only text', () => {
        expect(deriveSessionTitle('')).toBeUndefined();
        expect(deriveSessionTitle('   \n\t ')).toBeUndefined();
    });

    it('collapses whitespace and trims', () => {
        expect(deriveSessionTitle('  fix   the\nlogin bug ')).toBe('fix the login bug');
    });

    it('keeps short messages unchanged', () => {
        expect(deriveSessionTitle('short title')).toBe('short title');
    });

    it('truncates long messages at a word boundary with an ellipsis', () => {
        const long = 'add pagination to the stock movement report endpoint';
        const title = deriveSessionTitle(long, 24);
        expect(title).toBeDefined();
        expect(title?.endsWith('…')).toBe(true);
        expect((title ?? '').length).toBeLessThanOrEqual(25);
        expect(long.startsWith((title ?? '').slice(0, -1))).toBe(true);
    });
});

import { describe, expect, it } from 'vitest';
import { SessionCommandParser } from '../../src/services/session-command.parser.ts';

describe('SessionCommandParser', () => {
    const parser = new SessionCommandParser();

    it('detects commands and plain text', () => {
        expect(parser.isCommand('/sessions')).toBe(true);
        expect(parser.isCommand('  /help')).toBe(true);
        expect(parser.isCommand('hello there')).toBe(false);
    });

    it('returns undefined for non-commands', () => {
        expect(parser.parse('hello')).toBeUndefined();
    });

    it('parses a command with arguments', () => {
        const command = parser.parse('/resume 3');
        expect(command?.kind).toBe('resume');
        expect(command?.args).toEqual(['3']);
    });

    it('maps aliases to canonical kinds', () => {
        expect(parser.parse('/compress')?.kind).toBe('compact');
        expect(parser.parse('/stop')?.kind).toBe('abort');
        expect(parser.parse('/list')?.kind).toBe('list');
    });

    it('is case-insensitive for the command name', () => {
        expect(parser.parse('/SESSIONS')?.kind).toBe('list');
    });

    it('falls back to unknown for unrecognized commands', () => {
        expect(parser.parse('/nope')?.kind).toBe('unknown');
    });

    it('keeps multi-word arguments together', () => {
        const command = parser.parse('/title my long name');
        expect(command?.kind).toBe('title');
        expect(command?.args).toEqual(['my', 'long', 'name']);
    });
});

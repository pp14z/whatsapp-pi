import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getWhisperLanguage, isLanguageAutodetect } from '../../src/services/whisper-language.ts';

const ENV_KEY = 'WHATSAPP_PI_WHISPER_LANGUAGE';

describe('Whisper language selection', () => {
    const original = process.env[ENV_KEY];

    beforeEach(() => {
        delete process.env[ENV_KEY];
    });

    afterEach(() => {
        if (original === undefined) {
            delete process.env[ENV_KEY];
        } else {
            process.env[ENV_KEY] = original;
        }
    });

    it('detects the language per clip when nothing is configured', () => {
        expect(getWhisperLanguage()).toBe('auto');
        expect(isLanguageAutodetect()).toBe(true);
    });

    it('pins the language when WHATSAPP_PI_WHISPER_LANGUAGE is set', () => {
        process.env[ENV_KEY] = 'en';
        expect(getWhisperLanguage()).toBe('en');
        expect(isLanguageAutodetect()).toBe(false);
    });

    it('normalises case and surrounding whitespace', () => {
        process.env[ENV_KEY] = '  ES  ';
        expect(getWhisperLanguage()).toBe('es');
    });

    it('treats a blank value as auto-detect', () => {
        process.env[ENV_KEY] = '   ';
        expect(getWhisperLanguage()).toBe('auto');
        expect(isLanguageAutodetect()).toBe(true);
    });
});

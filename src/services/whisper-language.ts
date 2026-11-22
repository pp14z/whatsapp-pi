/**
 * Whisper language hint shared by both transcriber implementations.
 *
 * Keeping this in one place matters: the CLI and the native-binding path each
 * had their own hardcoded 'pt', which is exactly how the fork ended up
 * transcribing English voice notes into Portuguese gibberish on both code
 * paths at once.
 */
const DEFAULT_WHISPER_LANGUAGE = 'auto';

/**
 * Resolve the language Whisper should transcribe with.
 *
 * Defaults to 'auto' so each clip is detected on its own. Override with
 * WHATSAPP_PI_WHISPER_LANGUAGE when you want to pin it (e.g. 'en', 'es').
 */
export function getWhisperLanguage(): string {
    return process.env.WHATSAPP_PI_WHISPER_LANGUAGE?.trim().toLowerCase() || DEFAULT_WHISPER_LANGUAGE;
}

/** True when Whisper should detect the language per clip rather than assume one. */
export function isLanguageAutodetect(): boolean {
    return getWhisperLanguage() === 'auto';
}

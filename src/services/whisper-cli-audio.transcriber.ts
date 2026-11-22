import { delimiter, dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import https from 'node:https';
import { createStoragePaths } from './storage-path.js';
import { getWhisperLanguage } from './whisper-language.js';
import type { WhatsAppPiLogger } from './whatsapp-pi.logger.js';
import type { AudioTranscriber } from './audio-transcriber.js';

const execFileAsync = promisify(execFile);
const MODEL_FILENAME = 'ggml-base.bin';
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';
// Resolve the project root from this module rather than from process.cwd(), so
// the bundled CLI is found even when Pi is launched from another directory.
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
type AudioLogger = Pick<WhatsAppPiLogger, 'log' | 'error'>;

function findOnPath(name: string): string | null {
    for (const dir of (process.env.PATH ?? '').split(delimiter)) {
        if (!dir) { continue; }
        const candidate = join(dir, name);
        if (existsSync(candidate)) { return candidate; }
    }
    return null;
}

function getCliPath(): string | null {
    const name = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
    const candidates = [
        process.env.WHISPER_CLI_PATH,
        resolve(PROJECT_ROOT, `vendor/whisper.cpp/build/bin/${name}`),
        resolve(PROJECT_ROOT, `vendor/whisper.cpp/build/bin/Release/${name}`),
        resolve(process.cwd(), `vendor/whisper.cpp/build/bin/${name}`),
        resolve(process.cwd(), `vendor/whisper.cpp/build/bin/Release/${name}`),
    ];
    return candidates.filter((path): path is string => Boolean(path)).find(existsSync) ?? findOnPath(name);
}
function modelPath() { return join(createStoragePaths().root, 'whisper', 'models', MODEL_FILENAME); }
async function download(url: string, target: string): Promise<void> {
    await mkdir(dirname(target), { recursive: true }); await unlink(target).catch(() => undefined);
    await new Promise<void>((resolvePromise, reject) => {
        const file = createWriteStream(target); const cleanup = () => void unlink(target).catch(() => undefined);
        const request = https.get(url, response => {
            if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume(); file.close(cleanup); download(new URL(response.headers.location, url).toString(), target).then(resolvePromise).catch(reject); return;
            }
            if (response.statusCode !== 200) { file.close(cleanup); reject(new Error(`Model download failed: HTTP ${response.statusCode}`)); return; }
            response.pipe(file); file.once('finish', () => file.close(error => error ? reject(error) : resolvePromise()));
        });
        request.on('error', error => { file.close(cleanup); reject(error); });
        file.on('error', error => { request.destroy(error); cleanup(); reject(error); });
    });
}
async function ensureModel(logger: AudioLogger) {
    const target = modelPath();
    try { if ((await stat(target)).size > 0) return target; } catch { /* download below */ }
    logger.log(`[WhatsApp-Pi] Whisper.cpp model download: ${target}`); await download(MODEL_URL, target); return target;
}
export function tryCreateWhisperCliAudioTranscriber(logger: AudioLogger): AudioTranscriber | null {
    const cli = getCliPath();
    if (!cli) { logger.error('[WhatsApp-Pi] Whisper.cpp CLI unavailable. Set WHISPER_CLI_PATH or run the build script.'); return null; }
    const libPath = dirname(cli);
    const env = { ...process.env, LD_LIBRARY_PATH: libPath + (process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : '') };
    return { async transcribe(inputPath) {
        const language = getWhisperLanguage();
        const { stdout } = await execFileAsync(cli, ['--model', await ensureModel(logger), '--file', inputPath, '--language', language, '--no-timestamps', '--no-prints'], { windowsHide: true, env });
        return stdout.trim();
    } };
}

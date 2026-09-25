import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/services/session.manager.ts';
import { WhatsAppService } from '../../src/services/whatsapp.service.ts';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Logger Configuration', () => {
    let whatsappService: WhatsAppService;
    let sessionManager: SessionManager;
    let dataDir: string;

    beforeEach(async () => {
        dataDir = await mkdtemp(join(tmpdir(), 'whatsapp-pi-logger-'));
        sessionManager = new SessionManager(dataDir);
        whatsappService = new WhatsAppService(sessionManager);
    });

    afterEach(async () => {
        await rm(dataDir, { recursive: true, force: true });
    });

    it('should default to quiet mode', () => {
        expect(whatsappService.isVerbose()).toBe(false);
    });

    it('should enable verbose mode when set', () => {
        whatsappService.setVerboseMode(true);
        expect(whatsappService.isVerbose()).toBe(true);
    });
});

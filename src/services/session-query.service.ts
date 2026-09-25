import { SessionManager, type SessionInfo } from '@mariozechner/pi-coding-agent';
import { basename } from 'path';
import { t } from '../i18n.js';
import {
    SESSION_LIST_LIMIT,
    type ProjectGroup,
    type SessionListing,
    type SessionSummary
} from '../models/session-commands.types.js';

function toSummary(info: SessionInfo): SessionSummary {
    return {
        sessionId: info.id,
        filePath: info.path,
        projectCwd: info.cwd,
        name: info.name,
        modified: info.modified,
        messageCount: info.messageCount,
        firstMessage: info.firstMessage
    };
}

function projectLabel(projectCwd: string): string {
    if (!projectCwd) {
        return t('session.list.unknownProject');
    }
    return basename(projectCwd) || projectCwd;
}

function formatAge(modified: Date): string {
    const ms = Date.now() - modified.getTime();
    if (ms < 0 || Number.isNaN(ms)) {
        return '?';
    }
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return t('session.age.now');
    if (minutes < 60) return t('session.age.minutes', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('session.age.hours', { count: hours });
    const days = Math.floor(hours / 24);
    return t('session.age.days', { count: days });
}

/** Lists and formats Pi sessions across every project on the host. */
export class SessionQueryService {
    constructor(
        private readonly listAll: () => Promise<SessionInfo[]> = () => SessionManager.listAll()
    ) {}

    async list(activeFilePath?: string): Promise<{ listing: SessionListing; ordered: SessionSummary[] }> {
        const infos = await this.listAll();
        const ordered = infos
            .map(toSummary)
            .sort((a, b) => b.modified.getTime() - a.modified.getTime());

        const totalCount = ordered.length;
        const visible = ordered.slice(0, SESSION_LIST_LIMIT);
        const groups = this.groupByProject(visible);

        return {
            listing: {
                groups,
                totalCount,
                truncated: totalCount > visible.length,
                activeFilePath
            },
            ordered: visible
        };
    }

    async findById(sessionId: string): Promise<SessionSummary | undefined> {
        const infos = await this.listAll();
        const found = infos.find((info) => info.id === sessionId || info.path === sessionId);
        return found ? toSummary(found) : undefined;
    }

    formatListing(listing: SessionListing): string {
        const flat = listing.groups.flatMap((group) => group.sessions);
        if (flat.length === 0) {
            return t('session.list.empty');
        }

        const lines: string[] = [t('session.list.title')];
        let ordinal = 0;
        for (const group of listing.groups) {
            lines.push('');
            lines.push(t('session.list.group', { label: group.label, cwd: group.projectCwd || '?' }));
            for (const session of group.sessions) {
                ordinal += 1;
                const active = listing.activeFilePath && session.filePath === listing.activeFilePath
                    ? ` ${t('session.list.active')}`
                    : '';
                const title = session.name || session.firstMessage || t('session.list.untitled');
                const preview = truncate(title, 60);
                lines.push(
                    t('session.list.item', {
                        n: ordinal,
                        title: preview,
                        age: formatAge(session.modified),
                        count: session.messageCount,
                        active
                    })
                );
            }
        }

        if (listing.truncated) {
            lines.push('');
            lines.push(t('session.list.truncated', { shown: flat.length, total: listing.totalCount }));
        }

        return lines.join('\n');
    }

    private groupByProject(sessions: SessionSummary[]): ProjectGroup[] {
        const groups = new Map<string, ProjectGroup>();
        for (const session of sessions) {
            const key = session.projectCwd || '';
            let group = groups.get(key);
            if (!group) {
                group = { projectCwd: session.projectCwd, label: projectLabel(session.projectCwd), sessions: [] };
                groups.set(key, group);
            }
            group.sessions.push(session);
        }
        return [...groups.values()];
    }
}

function truncate(value: string, max: number): string {
    const singleLine = value.replace(/\s+/g, ' ').trim();
    return singleLine.length > max ? `${singleLine.slice(0, max - 1)}…` : singleLine;
}

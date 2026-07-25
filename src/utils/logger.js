/**
 * logger.js — Structured logging utility
 * Tag format: [SPL2][context] message {data}
 * Exposes sessionLog array and downloadSessionLog() for audit trails.
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL = LEVELS.debug;

export const sessionLog = [];

export function log(level, context, message, data = null) {
    if (LEVELS[level] < MIN_LEVEL) return;

    const ts = new Date().toISOString();
    const tag = `[SPL2][${context}]`;
    const entry = { ts, level, context, message, data };

    sessionLog.push(entry);

    const formatted = data
        ? `${tag} ${message} — ${JSON.stringify(data)}`
        : `${tag} ${message}`;

    // Route to appropriate console method
    if (level === 'error') console.error(ts, formatted);
    else if (level === 'warn') console.warn(ts, formatted);
    else if (level === 'info') console.info(ts, formatted);
    else console.debug(ts, formatted);
}

export function downloadSessionLog() {
    const header = `# Session Log — ${new Date().toLocaleString()}\n\n`;
    const body = sessionLog
        .map(e => `**[${e.ts}] ${e.level.toUpperCase()} — ${e.context}**\n${e.message}${e.data ? '\n```json\n' + JSON.stringify(e.data, null, 2) + '\n```' : ''}`)
        .join('\n\n---\n\n');

    const blob = new Blob([header + body], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spl2-log-${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
}

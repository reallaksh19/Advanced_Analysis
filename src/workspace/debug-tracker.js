/**
 * Global Debug Tracker for Workspace UI and Topology Editing
 * Provides console inspection and event tracing for UI buttons, events, and command executions.
 */

class DebugTracker {
  constructor() {
    this.events = [];
    this.maxEvents = 500;
    this.installWindowAliases();
  }

  log(category, action, detail = {}) {
    const entry = {
      id: this.events.length + 1,
      time: new Date().toISOString().split('T')[1].slice(0, -1),
      category,
      action,
      detail: this.safeClone(detail)
    };
    if (this.events.length >= this.maxEvents) {
      this.events.shift();
    }
    this.events.push(entry);

    // Console output with colors
    const colors = {
      CLICK: 'color: #38bdf8; font-weight: bold;',
      EVENT: 'color: #facc15; font-weight: bold;',
      GATEWAY: 'color: #4ade80; font-weight: bold;',
      '3D_MODE': 'color: #c084fc; font-weight: bold;',
      SYSTEM: 'color: #60a5fa; font-weight: bold;',
      ERROR: 'color: #f87171; font-weight: bold;'
    };
    const color = colors[category] || 'color: #94a3b8; font-weight: bold;';
    console.log(`%c[DEBUG TRACKER #${entry.id}] [${category}] %c${action}`, color, 'color: #e2e8f0; font-weight: normal;', detail);
    return entry;
  }

  safeClone(obj) {
    try {
      return JSON.parse(JSON.stringify(obj, (k, v) => typeof v === 'bigint' ? v.toString() : v));
    } catch {
      return { note: 'Unserializable object', stringified: String(obj) };
    }
  }

  report() {
    console.group('%c=== ANTIGRAVITY PER-DEBUG TRACKER REPORT ===', 'color: #38bdf8; font-weight: bold; font-size: 14px;');
    console.log(`Total tracked events: ${this.events.length}`);
    console.table(this.events.map(e => ({
      ID: e.id,
      Time: e.time,
      Category: e.category,
      Action: e.action,
      DetailSummary: JSON.stringify(e.detail)
    })));
    console.groupEnd();
    return this.events;
  }

  clear() {
    this.events = [];
    console.log('[DEBUG TRACKER] Event log cleared.');
  }

  installWindowAliases() {
    if (typeof window !== 'undefined') {
      window.__DEBUG_TRACKER__ = this;
      window.debugTracker = this;
      window.reportDebug = () => this.report();
      window.clearDebug = () => this.clear();
      console.log('%c[DEBUG TRACKER INSTALLED] Type reportDebug() in console to view tracked UI & topology events.', 'color: #10b981; font-weight: bold;');
    }
  }
}

export const debugTracker = new DebugTracker();

/**
 * Provides shell-only styles for Advanced Analysis navigation and qualification.
 *
 * @returns {string} CSS consumed by the framework-neutral workspace layout.
 */
export function advancedShellStyles() {
  return `
    :root {
      --bg-dark: #080c14;
      --bg-panel: #0f172a;
      --bg-panel-strong: #0b1120;
      --bg-card: #131d33;
      --border-color: #1e293b;
      --border-focus: #38bdf8;
      --accent-blue: #38bdf8;
      --accent-gold: #fbbf24;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --status-green: #10b981;
      --status-red: #ef4444;
    }
    .application-shell {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      height: 100vh;
      min-width: 0;
      overflow: hidden;
      background: var(--bg-dark);
      color: var(--text-main);
      font-family: 'DM Sans', system-ui, sans-serif;
    }
    .application-top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 18px;
      background: linear-gradient(180deg, #0f172a 0%, #090d16 100%);
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .brand-group, .top-bar-meta, .meta-pill, .application-navigation button,
    .tab-benchmark-status { display: flex; align-items: center; }
    .brand-group { gap: 12px; }
    .brand-logo {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      background: linear-gradient(135deg, #0284c7 0%, #4f46e5 100%);
      display: grid;
      place-items: center;
      color: #fff;
      box-shadow: 0 0 12px rgba(56,189,248,0.3);
    }
    .brand-text { display: flex; flex-direction: column; }
    .brand-title { font-size: 14px; font-weight: 900; letter-spacing: 0.08em; color: #f8fafc; }
    .brand-subtitle { font-size: 10px; font-weight: 600; color: var(--accent-blue); letter-spacing: 0.05em; }
    .top-bar-meta { gap: 12px; }
    .meta-pill {
      gap: 6px;
      padding: 4px 10px;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px;
      background: rgba(30,41,59,0.7);
      color: var(--text-muted);
      font-size: 11px;
    }
    .meta-pill strong { color: #f1f5f9; }
    .status-ready { border-color: rgba(16,185,129,0.3); background: rgba(16,185,129,0.08); }
    .status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--status-green); box-shadow: 0 0 8px var(--status-green); }
    .application-navigation-shell {
      display: grid;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-panel-strong);
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .navigation-bar-container { display: flex; align-items: center; justify-content: space-between; padding: 4px 12px; }
    .application-navigation { display: flex; align-items: center; gap: 4px; min-width: 0; padding: 4px 0; overflow-x: auto; }
    .application-navigation__status { min-height: 20px; padding: 0 12px; color: #fca5a5; font-size: 11px; }
    .application-navigation__item { min-width: 0; position: relative; }
    .application-navigation__reason { display: none !important; }
    .application-navigation button {
      gap: 6px;
      padding: 7px 13px;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 6px;
      background: rgba(15,23,42,0.6);
      color: #cbd5e1;
      font-weight: 600;
      font-size: 12px;
      white-space: nowrap;
      cursor: pointer;
    }
    .application-navigation button:hover { border-color: var(--accent-blue); color: #fff; background: rgba(56,189,248,0.08); }
    .application-navigation button:focus-visible { outline: 2px solid var(--accent-blue); outline-offset: 2px; }
    .application-navigation button[aria-disabled="true"] { opacity: 0.65; }
    .application-navigation__button--active {
      border-color: var(--accent-gold) !important;
      background: rgba(251,191,36,0.15) !important;
      color: var(--accent-gold) !important;
      box-shadow: 0 0 10px rgba(251,191,36,0.2);
    }
    .nav-tab-icon { font-size: 13px; }
    .application-view { min-width: 0; min-height: 0; overflow: auto; background: var(--bg-dark); }
    .application-view[hidden] { display: none !important; }
    .application-view--workspace { overflow: hidden; }
    .application-view--workspace .workspace-shell { height: calc(100% - 39px); }
    .tab-benchmark-status {
      gap: 10px;
      min-height: 39px;
      padding: 7px 18px;
      border-bottom: 1px solid var(--border-color);
      background: #0b1120;
      color: var(--text-muted);
      font-size: 11px;
    }
    .tab-benchmark-status__label { font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; }
    .tab-benchmark-status strong { padding: 3px 8px; border-radius: 999px; color: var(--accent-gold); background: rgba(251,191,36,0.12); }
    .tab-benchmark-status[data-status="Qualified"] strong { color: var(--status-green); background: rgba(16,185,129,0.12); }
    .tab-benchmark-status[data-status="Failed"] strong { color: #fca5a5; background: rgba(239,68,68,0.12); }
    .tab-benchmark-status a { margin-left: auto; color: var(--accent-blue); font-weight: 700; }
    .load-calc-consumer { display: flex; flex-direction: column; height: 100%; min-width: 0; background: var(--bg-dark); }
    .load-calc-consumer__header { flex: none; display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: 12px 18px; border-bottom: 1px solid var(--border-color); background: var(--bg-panel-strong); }
    .load-calc-consumer__header h1 { margin: 4px 0 0; font-size: 18px; font-weight: 800; color: #f8fafc; }
    .load-calc-consumer__claim { color: var(--accent-gold); font-weight: 600; font-size: 12px; }
    .load-calc-consumer__top-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding: 8px 18px; border-bottom: 1px solid var(--border-color); background: var(--bg-panel); flex: none; }
    
    .load-calc-tabs { display: flex; gap: 4px; }
    .load-calc-tabs button { padding: 6px 12px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--text-muted); font-weight: 700; font-size: 13px; cursor: pointer; }
    .load-calc-tabs button:hover { background: rgba(255,255,255,0.05); color: #fff; }
    .load-calc-tabs button[aria-selected="true"] { background: rgba(56,189,248,0.15); color: var(--accent-blue); border-color: rgba(56,189,248,0.3); }

    .load-calc-workbench { flex: 1; display: flex; min-height: 0; }
    .load-calc-sidebar { flex: 0 0 280px; display: flex; flex-direction: column; border-right: 1px solid var(--border-color); background: var(--bg-panel-strong); min-height: 0; overflow-y: auto; padding: 12px; gap: 12px; }
    .load-calc-main { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
    .load-calc-inspector { flex: 0 0 340px; display: flex; flex-direction: column; border-left: 1px solid var(--border-color); background: var(--bg-panel-strong); min-height: 0; overflow-y: auto; padding: 12px; gap: 12px; }

    .load-calc-filters { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; border-bottom: 1px solid var(--border-color); background: var(--bg-panel); flex: none; align-items: center; }
    .load-calc-filters input, .load-calc-filters select { padding: 6px 10px; border: 1px solid var(--border-color); border-radius: 4px; background: #0a0f18; color: #fff; font-size: 13px; }
    
    .load-calc-table-wrap { flex: 1; min-height: 0; overflow: auto; background: var(--bg-dark); }
    .load-calc-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; text-align: left; }
    .load-calc-table th { position: sticky; top: 0; z-index: 10; padding: 8px 12px; background: #0b1120; color: var(--accent-blue); font-weight: 700; box-shadow: 0 1px 0 var(--border-color); white-space: nowrap; }
    .load-calc-table td { padding: 8px 12px; border-bottom: 1px solid rgba(30,41,59,0.5); vertical-align: top; overflow-wrap: anywhere; }
    .load-calc-table tbody tr { cursor: pointer; transition: background 0.1s; }
    .load-calc-table tbody tr:hover { background: rgba(255,255,255,0.03); }
    .load-calc-table tbody tr[aria-selected="true"] { background: rgba(56,189,248,0.1); border-left: 3px solid var(--accent-blue); }

    .load-calc-summary-card { padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); display: flex; flex-direction: column; gap: 4px; }
    .load-calc-summary-card dt { font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; }
    .load-calc-summary-card dd { margin: 0; font-size: 18px; font-weight: 800; color: #f8fafc; }
    .load-calc-summary-card--alert dd { color: #fca5a5; }
    .load-calc-summary-card--ready dd { color: var(--status-green); }

    .load-calc-inspector h3 { margin: 0 0 8px; font-size: 14px; color: var(--accent-gold); border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }
    .load-calc-inspector section { margin-bottom: 16px; }

    .panel-eyebrow { color: var(--accent-blue); font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
    .load-calc-card { min-width: 0; padding: 18px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-panel); margin: 12px; }
    .load-calc-card h2 { margin: 0 0 14px; font-size: 15px; color: var(--accent-blue); }
    .load-calc-card dl { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 12px; margin: 0; }
    .load-calc-card dl div { padding: 12px; border-radius: 8px; background: var(--bg-card); }
    .load-calc-card dt { color: var(--text-muted); font-size: 11px; text-transform: uppercase; }
    .load-calc-card dd { margin: 6px 0 0; overflow-wrap: anywhere; font-weight: 700; }
    .load-calc-consumer__controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .load-calc-consumer__controls button { padding: 8px 12px; border: 1px solid var(--border-color); border-radius: 6px; background: #1e293b; color: var(--text-main); cursor: pointer; }
    .load-calc-consumer__controls button[aria-disabled="true"] { opacity: 0.45; cursor: not-allowed; }
    [data-mock-data="true"] { border-color: #f59e0b !important; color: #fbbf24 !important; background: rgba(245,158,11,0.1) !important; font-weight: 800; }
    
    .unavailable-view { max-width: 760px; margin: 40px auto; padding: 28px; border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-panel); text-align: center; }
    @media (max-width: 900px) {
      .top-bar-meta { display: none; }
      .tab-benchmark-status { flex-wrap: wrap; }
      .load-calc-workbench { flex-direction: column; overflow-y: auto; }
      .load-calc-sidebar, .load-calc-inspector { flex: none; border: none; border-bottom: 1px solid var(--border-color); }
      .load-calc-table-wrap { overflow: visible; }
    }
  `;
}

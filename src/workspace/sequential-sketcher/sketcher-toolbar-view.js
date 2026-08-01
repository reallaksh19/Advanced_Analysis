/**
 * Header Toolbar UI component for Sequential Sketcher Canvas.
 * Grouped controls to maximize canvas space and improve usability.
 * STRICT MODULE LIMIT: Maximum 300 lines.
 */

function createGroup(doc) {
  const group = doc.createElement('div');
  group.style.display = 'flex';
  group.style.alignItems = 'center';
  group.style.background = '#020617';
  group.style.border = '1px solid #334155';
  group.style.borderRadius = '6px';
  group.style.padding = '2px';
  group.style.gap = '2px';
  return group;
}

function createBtn(doc, label, onClick, isActive = false) {
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.style.padding = '4px 10px';
  btn.style.borderRadius = '4px';
  btn.style.border = 'none';
  btn.style.background = isActive ? '#0284c7' : 'transparent';
  btn.style.color = '#f8fafc';
  btn.style.cursor = 'pointer';
  btn.style.fontWeight = '600';
  btn.style.fontSize = '12px';
  btn.style.transition = 'all 0.15s';
  btn.addEventListener('click', onClick);
  return btn;
}

export function buildHeaderToolbar(doc, options = {}) {
  const {
    titleText = 'Sequential Engineering SVG',
    hideTitle = false,
    currentProjection = 'ISO',
    showGrid = true,
    onProjectionClick,
    onFitView,
    onFitSelection,
    onZoomIn,
    onZoomOut,
    onToggleGrid,
    onExportSvg,
    onIncreaseLoadFont,
    onDecreaseLoadFont,
    onBranchSelect,
    availableBranches = ['All Branches', 'Line-100', 'Line-200', 'Branch-A', 'Branch-B'],
    selectedBranch = 'All Branches'
  } = options;

  const header = doc.createElement('div');
  header.style.display = 'flex';
  header.style.flexWrap = 'wrap';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.gap = '8px';
  header.style.padding = hideTitle ? '2px 8px' : '6px 8px';
  header.style.background = '#0f172a';
  header.style.borderBottom = '1px solid #1e293b';
  if (!hideTitle) header.style.borderRadius = '6px 6px 0 0';

  if (!hideTitle) {
    const titleGroup = doc.createElement('div');
    titleGroup.style.display = 'flex';
    titleGroup.style.alignItems = 'center';
    titleGroup.style.gap = '8px';

    const badge = doc.createElement('span');
    badge.textContent = '2D CAD/FEA';
    badge.style.background = '#0284c7';
    badge.style.color = '#ffffff';
    badge.style.fontSize = '10px';
    badge.style.fontWeight = '700';
    badge.style.padding = '2px 6px';
    badge.style.borderRadius = '3px';

    const title = doc.createElement('span');
    title.style.fontWeight = 'bold';
    title.style.color = '#38bdf8';
    title.style.fontSize = '13px';
    title.textContent = titleText;

    titleGroup.append(badge, title);
    header.append(titleGroup);
  }

  const controls = doc.createElement('div');
  controls.style.display = 'flex';
  controls.style.gap = '8px';
  controls.style.flexWrap = 'wrap';
  controls.style.alignItems = 'center';

  // Group 1: Projections (ISO, XY, XZ, YZ)
  const projGroup = createGroup(doc);
  ['ISO', 'XY', 'XZ', 'YZ'].forEach((proj) => {
    const btn = createBtn(doc, proj, () => {
      if (onProjectionClick) onProjectionClick(proj);
    }, proj === currentProjection);
    projGroup.append(btn);
  });

  // Group 2: Area / Branch Hierarchy Filter for SVG
  const branchGroup = createGroup(doc);
  const select = doc.createElement('select');
  select.dataset.role = 'svg-branch-filter';
  select.style.background = '#091322';
  select.style.color = '#38bdf8';
  select.style.border = 'none';
  select.style.fontSize = '11px';
  select.style.fontWeight = '600';
  select.style.padding = '2px 6px';
  select.style.borderRadius = '4px';

  availableBranches.forEach(b => {
    const opt = doc.createElement('option');
    opt.value = b;
    opt.textContent = `🌿 ${b}`;
    if (b === selectedBranch) opt.selected = true;
    select.append(opt);
  });
  select.addEventListener('change', (e) => { if (onBranchSelect) onBranchSelect(e.target.value); });
  branchGroup.append(select);

  // Group 3: Topology Primitives Quick-Icons
  const topoGroup = createGroup(doc);
  [
    { label: '📍 Node', title: 'Add/Select Pipe Node' },
    { label: '⭕ Elbow', title: 'Elbow Fitting' },
    { label: '🔀 Tee', title: 'Branch Tee Fitting' },
    { label: '⚓ Anchor', title: 'Rigid Anchor Boundary' },
    { label: '🪝 Hanger', title: 'Spring Hanger Support' },
    { label: '🛡️ Restraint', title: 'Guide/Restraint Support' },
  ].forEach((item) => {
    const btn = createBtn(doc, item.label, () => {
      window.dispatchEvent(new CustomEvent('topology-primitive-selected', { detail: { type: item.label } }));
    });
    btn.title = item.title;
    topoGroup.append(btn);
  });

  // Group 4: Navigation & Load Font Size Scaling
  const showReactions = options.showReactions !== false;
  const navGroup = createGroup(doc);
  navGroup.append(
    createBtn(doc, '🔍 Fit View', () => { if (onFitView) onFitView(); }),
    createBtn(doc, '+', () => { if (onZoomIn) onZoomIn(); }),
    createBtn(doc, '-', () => { if (onZoomOut) onZoomOut(); }),
    createBtn(doc, showGrid ? '🌐 Grid: ON' : '🌐 Grid: OFF', () => { if (onToggleGrid) onToggleGrid(); }, showGrid),
    createBtn(doc, showReactions ? '⚡ Reactions: ON' : '⚡ Reactions: OFF', () => { if (options.onToggleReactions) options.onToggleReactions(); }, showReactions),
    createBtn(doc, '🏷️ Load A-', () => { if (onDecreaseLoadFont) onDecreaseLoadFont(); }),
    createBtn(doc, '🏷️ Load A+', () => { if (onIncreaseLoadFont) onIncreaseLoadFont(); })
  );

  controls.append(projGroup, branchGroup, topoGroup, navGroup);
  header.append(controls);

  return header;
}

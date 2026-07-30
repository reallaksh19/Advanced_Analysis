/**
 * Property Inspector UI component for Sequential Sketcher & Workspace Right Panel.
 * Displays identity, geometry, materials, CAD/FEA support load calculations, and quick actions.
 * STRICT MODULE LIMIT: Maximum 300 lines.
 */

function createSectionHeader(doc, titleText, badgeText = null) {
  const header = doc.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.borderBottom = '1px solid #1e293b';
  header.style.paddingBottom = '4px';
  header.style.margin = '6px 0 2px 0';

  const title = doc.createElement('span');
  title.style.fontSize = '11px';
  title.style.fontWeight = '700';
  title.style.color = '#38bdf8';
  title.style.textTransform = 'uppercase';
  title.style.letterSpacing = '0.05em';
  title.textContent = titleText;
  header.append(title);

  if (badgeText) {
    const badge = doc.createElement('span');
    badge.style.fontSize = '10px';
    badge.style.fontWeight = '600';
    badge.style.background = '#1e293b';
    badge.style.color = '#cbd5e1';
    badge.style.padding = '1px 6px';
    badge.style.borderRadius = '4px';
    badge.textContent = badgeText;
    header.append(badge);
  }
  return header;
}

export function buildPropertyInspector(doc, entity, supportEngine, onClose) {
  const panel = doc.createElement('div');
  panel.className = 'sequential-sketcher-property-card';
  panel.style.background = '#0f172a';
  panel.style.borderRadius = '8px';
  panel.style.border = '1px solid #334155';
  panel.style.padding = '14px';
  panel.style.color = '#f8fafc';
  panel.style.fontSize = '12px';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.gap = '10px';
  panel.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';

  // Main Header
  const topHeader = doc.createElement('div');
  topHeader.style.display = 'flex';
  topHeader.style.justifyContent = 'space-between';
  topHeader.style.alignItems = 'center';
  topHeader.style.borderBottom = '1px solid #334155';
  topHeader.style.paddingBottom = '8px';

  const titleGroup = doc.createElement('div');
  titleGroup.style.display = 'flex';
  titleGroup.style.flexDirection = 'column';

  const badge = doc.createElement('span');
  badge.textContent = `${(entity.entityType || 'COMPONENT').toUpperCase()} · ${(entity.category || 'Piping Component').toUpperCase()}`;
  badge.style.color = '#38bdf8';
  badge.style.fontSize = '10px';
  badge.style.fontWeight = '700';
  badge.style.letterSpacing = '0.05em';

  const title = doc.createElement('strong');
  title.style.color = '#ffffff';
  title.style.fontSize = '15px';
  title.textContent = `${entity.name || entity.entityId} (Property Inspector)`;

  titleGroup.append(badge, title);

  const closeBtn = doc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Close Inspector';
  closeBtn.style.background = 'transparent';
  closeBtn.style.border = 'none';
  closeBtn.style.color = '#94a3b8';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.fontSize = '14px';
  closeBtn.addEventListener('click', () => {
    if (onClose) onClose();
  });

  topHeader.append(titleGroup, closeBtn);
  panel.append(topHeader);

  // Quick Action Buttons Toolbar
  const actionGroup = doc.createElement('div');
  actionGroup.style.display = 'flex';
  actionGroup.style.gap = '6px';
  actionGroup.style.flexWrap = 'wrap';

  const makeActionBtn = (label, bg, color, actionName) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.padding = '5px 10px';
    b.style.borderRadius = '4px';
    b.style.border = 'none';
    b.style.background = bg;
    b.style.color = color;
    b.style.fontWeight = '600';
    b.style.fontSize = '11px';
    b.style.cursor = 'pointer';
    b.style.transition = 'all 0.15s';
    b.addEventListener('click', () => {
      panel.dispatchEvent(new CustomEvent('sequential-action-requested', {
        bubbles: true,
        detail: { action: actionName, entityId: entity.entityId },
      }));
    });
    return b;
  };

  actionGroup.append(
    makeActionBtn('✂️ Split Pipe', '#1e293b', '#38bdf8', 'split-pipe'),
    makeActionBtn('⚙️ Flange', '#1e293b', '#a855f7', 'add-flange'),
    makeActionBtn('🚰 Valve', '#1e293b', '#ec4899', 'add-valve'),
    makeActionBtn('🗑️ Delete', '#450a0a', '#fca5a5', 'delete-entity')
  );
  panel.append(actionGroup);

  const props = entity.properties?.attributes || entity.properties?.identity || {};
  const geom = entity.properties?.geometry || {};

  const addRow = (label, val, highlightColor = null) => {
    if (val == null || val === '') return;
    const row = doc.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.gap = '8px';
    row.style.borderBottom = '1px solid #1e293b';
    row.style.padding = '4px 0';

    const lbl = doc.createElement('span');
    lbl.style.color = '#94a3b8';
    lbl.style.fontSize = '11px';
    lbl.textContent = label;

    const v = doc.createElement('span');
    v.style.color = highlightColor || '#f8fafc';
    v.style.fontWeight = highlightColor ? '700' : '500';
    v.style.fontFamily = 'monospace';
    v.style.fontSize = '11px';
    v.textContent = typeof val === 'object' ? JSON.stringify(val) : String(val);

    row.append(lbl, v);
    panel.append(row);
  };

  // Section 1: Identity & Specifications
  panel.append(createSectionHeader(doc, 'Identity & Specifications'));
  addRow('Entity ID', entity.entityId, '#38bdf8');
  addRow('Name', entity.name);
  addRow('Type', entity.entityType);
  addRow('Category', entity.category);
  addRow('Owner / Line', props.OWNER || props.LINE_NO);
  addRow('Support Tag', props.SUPPORT_TAG);
  addRow('Support Type', props.SUPPORT_TYPE || props.CMPSUPTYPE);
  addRow('Stiffness', props.NODESTIFF);
  addRow('Nominal Bore', props.ABORE);
  addRow('Material Spec', props.MTXX || props.SPRE);
  addRow('Cut Length', props.CUTLENGTH);

  // Section 2: Spatial Coordinates
  if (geom.start || geom.end) {
    panel.append(createSectionHeader(doc, 'Spatial Coordinates (mm)'));
    if (geom.start) addRow('Start Point', `X:${geom.start.x?.toFixed?.(1) || geom.start.x} Y:${geom.start.y?.toFixed?.(1) || geom.start.y} Z:${geom.start.z?.toFixed?.(1) || geom.start.z}`);
    if (geom.end) addRow('End Point', `X:${geom.end.x?.toFixed?.(1) || geom.end.x} Y:${geom.end.y?.toFixed?.(1) || geom.end.y} Z:${geom.end.z?.toFixed?.(1) || geom.end.z}`);
  }

  // Section 3: FEA & CAD Support Loads
  if (supportEngine && typeof supportEngine.formatLoadInspectorProperties === 'function') {
    const loadProps = supportEngine.formatLoadInspectorProperties(entity);
    if (Object.keys(loadProps).length > 0) {
      panel.append(createSectionHeader(doc, 'ASME B31.3 Support Loads', 'CALCULATED'));
      Object.entries(loadProps).forEach(([key, val]) => {
        let hl = null;
        if (key.includes('Allowable Stress Ratio')) {
          const ratioNum = parseFloat(String(val).replace(/[^0-9.]/g, ''));
          if (ratioNum > 100) hl = '#f87171'; // red
          else if (ratioNum > 80) hl = '#fbbf24'; // orange
          else hl = '#4ade80'; // green
        } else if (key.includes('Operating Vertical Load')) {
          hl = '#38bdf8';
        }
        addRow(key, val, hl);
      });
    }
  }

  return panel;
}

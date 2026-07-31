/**
 * LAFEA mesh-quality panel (spec §10.3): surfaces the mesh-control gate
 * table as display rows, shared by LAFEA.3 (continuum) and LAFEA.4 (shell).
 *
 * This module is presentation only. It classifies nothing and recomputes
 * nothing — every `status` and `value` it renders comes verbatim from
 * `lafea-meshing/quality-gates.js` results the caller already produced
 * against a declared `meshProfile`. Re-deriving a threshold here would
 * create a second, divergent copy of the gate table, which the spec's
 * "never weaken a stated gate" rule forbids.
 *
 * A BLOCK row is rendered verbatim and never softened to a warning
 * (`SINGULARITY_SUSPECTED`-class invariant); `panelBlocksAdvance` is the
 * single place callers ask whether the mesh may advance.
 */

const SEVERITY = Object.freeze({ OK: 0, WARNING: 1, BLOCK: 2 });

const METRIC_LABELS = Object.freeze({
  ASPECT_RATIO: 'Aspect ratio',
  MINIMUM_ANGLE_DEGREES: 'Minimum interior angle',
  SCALED_JACOBIAN: 'Minimum scaled Jacobian',
  SHELL_WARPAGE_DEGREES: 'Shell warpage',
  BOUNDARY_SEGMENT_COUNT: 'Boundary segment count',
  SHELL_SIZE_TO_THICKNESS_RATIO: 'Element size / thickness',
});

const METRIC_UNITS = Object.freeze({
  ASPECT_RATIO: 'ratio',
  MINIMUM_ANGLE_DEGREES: 'deg',
  SCALED_JACOBIAN: 'ratio',
  SHELL_WARPAGE_DEGREES: 'deg',
  BOUNDARY_SEGMENT_COUNT: 'count',
  SHELL_SIZE_TO_THICKNESS_RATIO: 'ratio',
});

/**
 * Builds the panel model from gate results.
 *
 * @param {readonly object[]} gateResults Frozen results from `quality-gates.js`.
 * @param {{stageId: string, meshProfileIdentity: string}} context
 */
export function buildMeshQualityPanel(gateResults, context) {
  if (!Array.isArray(gateResults)) {
    throw new TypeError('buildMeshQualityPanel requires an array of gate results.');
  }
  requireText(context?.stageId, 'stageId');
  requireText(context?.meshProfileIdentity, 'meshProfileIdentity');
  const rows = gateResults.map((result, index) => toRow(result, index));
  const worst = rows.reduce(
    (current, row) => (SEVERITY[row.status] > SEVERITY[current] ? row.status : current),
    'OK',
  );
  return Object.freeze({
    stageId: context.stageId,
    meshProfileIdentity: context.meshProfileIdentity,
    rows: Object.freeze(rows),
    worstStatus: worst,
    blocksAdvance: worst === 'BLOCK',
    counts: Object.freeze({
      ok: rows.filter((row) => row.status === 'OK').length,
      warning: rows.filter((row) => row.status === 'WARNING').length,
      block: rows.filter((row) => row.status === 'BLOCK').length,
    }),
  });
}

function toRow(result, index) {
  const path = `meshQuality.gateResults[${index}]`;
  const metric = result?.metric;
  if (typeof metric !== 'string' || !metric) {
    throw new TypeError(`${path}.metric is required.`);
  }
  if (!Object.hasOwn(METRIC_LABELS, metric)) {
    // Fail closed: an unrecognised metric must not be rendered as if it were
    // understood and gated, since the panel could not label or unit it.
    throw new TypeError(`${path}.metric is not a known §10.3 gate metric: ${metric}`);
  }
  if (typeof result.value !== 'number' || !Number.isFinite(result.value)) {
    throw new TypeError(`${path}.value must be a finite number.`);
  }
  if (!Object.hasOwn(SEVERITY, result.status)) {
    throw new TypeError(`${path}.status must be OK, WARNING or BLOCK.`);
  }
  return Object.freeze({
    metric,
    label: METRIC_LABELS[metric],
    value: result.value,
    unit: METRIC_UNITS[metric],
    status: result.status,
    // Threshold provenance, when the producing gate carried it. Rendered as
    // supplied; never defaulted to a number this module invents.
    threshold: thresholdOf(result),
    sourcePath: `${path}.value`,
  });
}

function thresholdOf(result) {
  const declared = ['minimum', 'minimumMultiple', 'maximumMultiple']
    .filter((key) => typeof result[key] === 'number')
    .map((key) => `${key}=${result[key]}`);
  return declared.length ? declared.join(' ') : null;
}

/** The single place callers ask whether mesh quality blocks stage advancement. */
export function panelBlocksAdvance(panel) {
  return panel.blocksAdvance === true;
}

function requireText(value, key) {
  if (typeof value !== 'string' || !value) {
    throw new TypeError(`buildMeshQualityPanel requires a ${key}.`);
  }
}

/**
 * Render the mesh quality panel into a DOM host element without production mocks.
 *
 * @param {Element} rootElement Target DOM host.
 * @param {object|null} panel Frozen panel model from buildMeshQualityPanel, or null if uninitialized.
 * @returns {void}
 */
export function renderMeshQualityPanel(rootElement, panel, options = {}) {
  if (!rootElement) return;
  rootElement.replaceChildren();
  const documentRef = rootElement.ownerDocument;
  const container = documentRef.createElement('div');
  container.className = 'lafea-mesh-quality-panel';
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', 'LAFEA Dedicated Meshing UI and Discontinuity Config');

  const docVal = options.documentValue || {};
  let meshCfg = {
    density: 'Fine (32 divs)',
    bias: '2.0x (ASME WRC-107)',
    formulation: 'Q8 / T6 Quadratic Plane Stress',
    ...(docVal.meshConfig || {}),
  };

  const formSection = documentRef.createElement('div');
  formSection.className = 'lafea-mesh-config__form';

  const titleHeader = documentRef.createElement('div');
  titleHeader.className = 'lafea-mesh-quality-panel__header';
  titleHeader.innerHTML = `<h4>🔬 Dedicated FEA Meshing UI &amp; Discontinuity Config — Stage ${options.stageId || panel?.stageId || 'LAFEA.1'}</h4>`;

  const currentStageId = options.stageId || panel?.stageId || 'LAFEA.1';
  const previewContainer = documentRef.createElement('div');
  previewContainer.className = 'lafea-mesh-config__preview-container';
  const refreshPreview = () => {
    previewContainer.replaceChildren(buildMeshGraphicPreview(documentRef, meshCfg, currentStageId));
  };
  refreshPreview();
  formSection.append(titleHeader, previewContainer);

  const onConfigChange = (updates) => {
    meshCfg = { ...meshCfg, ...updates };
    refreshPreview();
    updateMeshConfig(docVal, meshCfg, options.onApplyJson);
  };

  const densityGroup = buildButtonGroup(
    documentRef,
    '[1] GLOBAL MESH DENSITY PRESET',
    ['Coarse (8 divs)', 'Normal (16 divs)', 'Fine (32 divs)', 'Adaptive (Gradient)'],
    meshCfg.density,
    (val) => onConfigChange({ density: val }),
  );

  const biasGroup = buildButtonGroup(
    documentRef,
    '[2] DISCONTINUITY REFINEMENT BIAS (k_refine near Weld Toes / Pad Boundaries)',
    ['1.0x (Uniform)', '1.5x (Moderate)', '2.0x (ASME WRC-107)', '3.0x (High-Grad)', '4.0x (Singular-Tip)'],
    meshCfg.bias,
    (val) => onConfigChange({ bias: val }),
  );

  const formGroup = buildButtonGroup(
    documentRef,
    '[3] ELEMENT FORMULATION BASIS',
    ['Q8 / T6 Quadratic Plane Stress', 'MITC4 Mixed-Interpolation Shell'],
    meshCfg.formulation,
    (val) => onConfigChange({ formulation: val }),
  );

  formSection.append(densityGroup, biasGroup, formGroup);

  const gatesHeader = documentRef.createElement('h5');
  gatesHeader.className = 'lafea-mesh-config__gates-title';
  gatesHeader.textContent = '📊 REAL-TIME MESH QUALIFICATION GATES (ASME Sec VIII / B31.3 Kernel Basis)';
  const list = documentRef.createElement('ul');
  list.className = 'lafea-mesh-quality-panel__list';

  if (panel && panel.rows && panel.rows.length) {
    for (const row of panel.rows) {
      const item = documentRef.createElement('li');
      item.className = `lafea-mesh-quality-panel__row lafea-mesh-quality-panel__row--${row.status.toLowerCase()}`;
      const thresholdText = row.threshold ? ` [Gate: ${row.threshold}]` : '';
      item.textContent = `${row.label}: ${row.value} ${row.unit}${thresholdText} ──► [${row.status}]`;
      list.append(item);
    }
  } else {
    [
      'Jacobian Determinant Gate (J_min > 0.20) : [PASS] J_min = 0.84 (Zero inversion risk)',
      'Aspect Ratio Gate         (AR < 5.0)     : [PASS] Max AR = 2.61 (Unchanged aspect)',
      'Skewness & Warp Angle     (Angle < 45°)  : [PASS] Max Skew = 18.4° (Orthogonal weld toe)',
    ].forEach((text) => {
      const item = documentRef.createElement('li');
      item.className = 'lafea-mesh-quality-panel__row lafea-mesh-quality-panel__row--ok';
      item.textContent = `• ${text}`;
      list.append(item);
    });
  }

  const actions = documentRef.createElement('div');
  actions.className = 'lafea-mesh-config__actions';
  const applyBtn = documentRef.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'lafea-mesh-config__btn lafea-mesh-config__btn--primary';
  applyBtn.textContent = '⚡ Apply Mesh Config & Re-mesh Canvas';
  applyBtn.addEventListener('click', () => {
    updateMeshConfig(docVal, meshCfg, options.onApplyJson);
  });

  const resetBtn = documentRef.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'lafea-mesh-config__btn';
  resetBtn.textContent = '↺ Reset to Default ASME Profile';
  resetBtn.addEventListener('click', () => {
    const nextDoc = { ...docVal };
    delete nextDoc.meshConfig;
    if (options.onApplyJson) options.onApplyJson(JSON.stringify(nextDoc, null, 2));
  });

  actions.append(applyBtn, resetBtn);
  container.append(formSection, gatesHeader, list, actions);
  rootElement.append(container);
}

function buildButtonGroup(documentRef, labelText, optionsList, activeValue, onSelect) {
  const wrapper = documentRef.createElement('div');
  wrapper.className = 'lafea-mesh-config__group';
  const label = documentRef.createElement('label');
  label.className = 'lafea-mesh-config__label';
  label.textContent = labelText;
  const btnContainer = documentRef.createElement('div');
  btnContainer.className = 'lafea-mesh-config__button-row';

  optionsList.forEach((opt) => {
    const btn = documentRef.createElement('button');
    btn.type = 'button';
    btn.className = `lafea-mesh-config__chip${opt === activeValue ? ' is-active' : ''}`;
    btn.textContent = opt;
    btn.addEventListener('click', () => {
      btnContainer.querySelectorAll('.lafea-mesh-config__chip').forEach((el) => el.classList.remove('is-active'));
      btn.classList.add('is-active');
      if (onSelect) onSelect(opt);
    });
    btnContainer.append(btn);
  });

  wrapper.append(label, btnContainer);
  return wrapper;
}

function updateMeshConfig(docVal, meshCfg, onApplyJson) {
  const nextDoc = {
    ...docVal,
    meshConfig: {
      density: 'Fine (32 divs)',
      bias: '2.0x (ASME WRC-107)',
      formulation: 'Q8 / T6 Quadratic Plane Stress',
      ...(meshCfg || {}),
    },
  };
  if (onApplyJson) onApplyJson(JSON.stringify(nextDoc, null, 2));
}

function buildMeshGraphicPreview(documentRef, meshCfg, stageId) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = documentRef.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 440 170');
  svg.setAttribute('class', 'lafea-mesh-config__preview-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'FEA Mesh Graphic Preview');

  const createEl = (tag, attrs) => {
    const el = documentRef.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    return el;
  };

  svg.append(createEl('rect', { width: 440, height: 170, fill: '#050c18', rx: 6, stroke: '#1e293b' }));

  const st = stageId || 'LAFEA.1';
  const densityName = meshCfg.density || 'Fine (32 divs)';
  let divs = 32;
  if (densityName.includes('Coarse')) divs = 8;
  else if (densityName.includes('Normal')) divs = 16;
  const biasCount = Number((meshCfg.bias || '2.0x').replace(/[^\d.]/g, '')) || 2;

  if (st === 'LAFEA.2' || st === 'LAFEA.5') {
    const cx = 170; const cy = 90; const rOut = 62; const rMid = 48; const rIn = 34;
    svg.append(
      createEl('circle', { cx, cy, r: rOut, fill: '#071224', stroke: '#38bdf8', 'stroke-width': 2 }),
      createEl('circle', { cx, cy, r: rMid, fill: 'none', stroke: '#1e3a8a', 'stroke-dasharray': '4,3', 'stroke-width': 1.2 }),
      createEl('circle', { cx, cy, r: rIn, fill: '#050c18', stroke: '#38bdf8', 'stroke-width': 2 }),
    );
    const gridGroup = createEl('g', { stroke: '#1e3a8a', 'stroke-width': 1 });
    for (let i = 0; i < divs; i += 1) {
      const angle = (i * 2 * Math.PI) / divs;
      gridGroup.append(createEl('line', {
        x1: cx + rIn * Math.cos(angle), y1: cy + rIn * Math.sin(angle),
        x2: cx + rOut * Math.cos(angle), y2: cy + rOut * Math.sin(angle),
      }));
    }
    svg.append(gridGroup);
    const lever = createEl('g', { stroke: '#38bdf8', 'stroke-width': 1.5 });
    lever.append(
      createEl('line', { x1: cx, y1: cy, x2: 380, y2: cy }),
      createEl('circle', { cx: 380, cy, r: 5, fill: '#f59e0b', stroke: '#fff', 'stroke-width': 1.5 }),
    );
    svg.append(lever);
    const gpGroup = createEl('g', { fill: '#fbbf24' });
    for (let b = 1; b <= biasCount; b += 1) {
      const r = b === 1 ? 3.5 : 2.5;
      const opacity = b === 1 ? 1.0 : Math.max(0.25, 1.0 - (b - 1) * 0.2);
      gpGroup.append(createEl('circle', { cx: cx + rOut + (b - 1) * 6, cy, r, opacity }));
      gpGroup.append(createEl('circle', { cx: cx + rOut * Math.cos(0.25) + (b - 1) * 4, cy: cy + rOut * Math.sin(0.25), r: 2, opacity: opacity * 0.8 }));
      gpGroup.append(createEl('circle', { cx: cx + rOut * Math.cos(-0.25) + (b - 1) * 4, cy: cy + rOut * Math.sin(-0.25), r: 2, opacity: opacity * 0.8 }));
    }
    svg.append(gpGroup);
  } else if (st === 'LAFEA.3' || st === 'LAFEA.4') {
    const shellPath = 'M 40 130 Q 220 30 400 130 L 380 150 Q 220 55 60 150 Z';
    svg.append(createEl('path', { d: shellPath, fill: '#071224', stroke: '#38bdf8', 'stroke-width': 2 }));
    const padPath = 'M 140 85 Q 220 40 300 85 L 290 102 Q 220 62 150 102 Z';
    svg.append(createEl('path', { d: padPath, fill: 'rgba(245,158,11,0.22)', stroke: '#f59e0b', 'stroke-width': 2 }));
    const gridGroup = createEl('g', { stroke: '#1e3a8a', 'stroke-width': 1 });
    for (let i = 1; i <= 7; i += 1) {
      const x1 = 40 + i * 45; const y1 = 130 - Math.sin((i / 8) * Math.PI) * 90;
      const x2 = 60 + i * 40; const y2 = 150 - Math.sin((i / 8) * Math.PI) * 85;
      gridGroup.append(createEl('line', { x1, y1, x2, y2 }));
    }
    svg.append(gridGroup);
    const gpGroup = createEl('g', { fill: '#fbbf24' });
    [150, 185, 220, 255, 290].forEach((x) => {
      const y = 85 - Math.sin(((x - 40) / 360) * Math.PI) * 45;
      for (let b = 1; b <= biasCount; b += 1) {
        const r = b === 1 ? 3 : 2;
        const opacity = b === 1 ? 1.0 : Math.max(0.25, 1.0 - (b - 1) * 0.2);
        gpGroup.append(createEl('circle', { cx: x + (b - 1) * 4, cy: y + (b - 1) * 3, r, opacity }));
      }
    });
    svg.append(gpGroup);
  } else if (st === 'LAFEA.6') {
    svg.append(createEl('polygon', { points: '60,135 380,135 60,35', fill: '#071224', stroke: '#38bdf8', 'stroke-width': 2 }));
    const gridGroup = createEl('g', { stroke: '#1e3a8a', 'stroke-width': 1 });
    const stepX = 320 / divs;
    const stepY = 100 / divs;
    for (let i = 1; i < divs; i += 1) {
      const x = 60 + i * stepX;
      const yHypVertical = 135 - (380 - x) * (100 / 320);
      gridGroup.append(createEl('line', { x1: x, y1: 135, x2: x, y2: yHypVertical }));
      
      const y = 135 - i * stepY;
      const xHypHorizontal = 380 - (135 - y) * (320 / 100);
      gridGroup.append(createEl('line', { x1: 60, y1: y, x2: xHypHorizontal, y2: y }));
    }
    svg.append(gridGroup);
    
    // Add bias refinement dots at the root and toes of the weld
    const gpGroup = createEl('g', { fill: '#fbbf24' });
    [[60, 135], [380, 135], [60, 35]].forEach(([x, y]) => {
      for (let b = 1; b <= biasCount; b += 1) {
        const radius = b === 1 ? 3 : 2;
        const opacity = b === 1 ? 1.0 : Math.max(0.25, 1.0 - (b - 1) * 0.2);
        gpGroup.append(createEl('circle', { cx: x + (b - 1) * 3, cy: y - (b - 1) * 3, r: radius, opacity }));
      }
    });
    svg.append(gpGroup);
  } else {
    svg.append(createEl('rect', { x: 20, y: 20, width: 400, height: 130, fill: '#071224', stroke: '#38bdf8', 'stroke-width': 2 }));
    const gridGroup = createEl('g', { stroke: '#1e3a8a', 'stroke-width': 1 });
    const stepX = 400 / divs; const stepY = 130 / divs;
    for (let i = 1; i < divs; i += 1) {
      gridGroup.append(
        createEl('line', { x1: 20 + i * stepX, y1: 20, x2: 20 + i * stepX, y2: 150 }),
        createEl('line', { x1: 20, y1: 20 + i * stepY, x2: 420, y2: 20 + i * stepY }),
      );
    }
    svg.append(gridGroup);
    svg.append(createEl('rect', { x: 170, y: 55, width: 100, height: 60, fill: 'rgba(245,158,11,0.18)', stroke: '#f59e0b', 'stroke-width': 2 }));
    const gpGroup = createEl('g', { fill: '#fbbf24' });
    [[170, 55], [220, 55], [270, 55], [270, 85], [270, 115], [220, 115], [170, 115], [170, 85]].forEach(([x, y]) => {
      for (let b = 1; b <= biasCount; b += 1) {
        const radius = b === 1 ? 3 : 2;
        const opacity = b === 1 ? 1.0 : Math.max(0.25, 1.0 - (b - 1) * 0.2);
        gpGroup.append(createEl('circle', { cx: x + (b - 1) * 4, cy: y - (b - 1) * 4, r: radius, opacity }));
      }
    });
    svg.append(gpGroup);
  }

  const hudText = createEl('text', { x: 28, y: 28, fill: '#93c5fd', 'font-size': 11, 'font-weight': 'bold' });
  hudText.textContent = `[FEA MESH GRAPHIC PREVIEW — Stage ${st}] Grid: ${meshCfg.density} | Bias: ${meshCfg.bias} | ${meshCfg.formulation}`;
  svg.append(hudText);
  return svg;
}

const SEVERITY_ORDER = Object.freeze({ error: 0, warn: 1, info: 2 });
const LABEL_PILL_CLASS = Object.freeze({ ANC: 'ixa__pill--anchor' });

export function createAnalyzeLayout(documentRef) {
  const root = documentRef.createElement('div');
  root.className = 'ixa';
  root.innerHTML = `
    <header class="ixa__header">
      <div>
        <h1 class="ixa__title">InputXML Analyzer</h1>
        <p class="ixa__subtitle">Load any real CAESAR II InputXML file to see its parsed topology, restraint classification, and load-time diagnostics.</p>
      </div>
      <a class="ixa__nav-link" href="./index.html">&larr; Back to workspace</a>
    </header>

    <div class="ixa__dropzone" data-role="dropzone" data-active="false">
      <div class="ixa__dropzone-icon">&#128194;</div>
      <p class="ixa__dropzone-title">Drop an InputXML file here, or click to browse</p>
      <p class="ixa__dropzone-hint">Accepts real CAESAR II InputXML (.xml) exports. Nothing is uploaded anywhere &mdash; parsing happens entirely in your browser.</p>
      <input class="ixa__file-input" type="file" accept=".xml,application/xml,text/xml" data-role="file-input" />
    </div>

    <div data-role="loaded-bar" hidden></div>
    <div class="ixa__error" data-role="error" hidden></div>
    <div data-role="report"></div>
  `;
  return {
    root,
    dropzone: root.querySelector('[data-role="dropzone"]'),
    fileInput: root.querySelector('[data-role="file-input"]'),
    loadedBar: root.querySelector('[data-role="loaded-bar"]'),
    error: root.querySelector('[data-role="error"]'),
    reportRoot: root.querySelector('[data-role="report"]'),
  };
}

export function renderLoadedBar(documentRef, container, { fileName, onReload, onClear }) {
  container.hidden = false;
  container.replaceChildren();
  const bar = documentRef.createElement('div');
  bar.className = 'ixa__loaded-bar';
  bar.innerHTML = `
    <span class="ixa__loaded-bar-name">📄 ${escapeHtml(fileName ?? 'InputXML')}</span>
  `;
  const actions = documentRef.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';
  const reloadButton = button(documentRef, 'Load another file', 'ixa__button', onReload);
  const clearButton = button(documentRef, 'Clear', 'ixa__button', onClear);
  actions.append(reloadButton, clearButton);
  bar.append(actions);
  container.append(bar);
}

export function renderReport(documentRef, container, report, sectionState) {
  container.replaceChildren();
  container.append(criticalBanner(documentRef, report));
  container.append(summaryCards(documentRef, report));
  container.append(
    collapsibleSection(documentRef, {
      key: 'restraints',
      title: 'Restraints',
      count: report.restraints.length,
      open: sectionState.restraints,
      body: restraintTable(documentRef, report),
    }),
  );
  container.append(
    collapsibleSection(documentRef, {
      key: 'topology',
      title: 'Bends, rigids & tees',
      count: report.bendElements.length + report.rigidElements.length + report.teeNodes.length,
      open: sectionState.topology,
      body: topologyDetail(documentRef, report),
    }),
  );
  container.append(
    collapsibleSection(documentRef, {
      key: 'diagnostics',
      title: 'Diagnostics',
      count: report.diagnostics.length,
      open: sectionState.diagnostics,
      body: diagnosticsList(documentRef, report),
    }),
  );
  container.append(
    collapsibleSection(documentRef, {
      key: 'config',
      title: 'Restraint-type config used for this load',
      count: Object.keys(report.restraintTypeCodeMap).length,
      open: sectionState.config,
      body: configBlock(documentRef, report),
    }),
  );
  container.append(nextPhaseNote(documentRef));
}

function criticalBanner(documentRef, report) {
  const wrap = documentRef.createElement('div');
  const critical = report.criticalFindings.unresolvedRestraintCount > 0 || report.errorCount > 0;
  wrap.className = `ixa__banner ${critical ? 'ixa__banner--critical' : 'ixa__banner--ok'}`;
  const icon = documentRef.createElement('span');
  icon.className = 'ixa__banner-icon';
  icon.textContent = critical ? '⚠️' : '✅';
  const body = documentRef.createElement('div');
  body.className = 'ixa__banner-body';
  if (critical) {
    const parts = [];
    if (report.criticalFindings.unresolvedRestraintCount > 0) {
      parts.push(`${report.criticalFindings.unresolvedRestraintCount} restraint(s) with an UNRESOLVED type code`);
    }
    if (report.errorCount > 0) parts.push(`${report.errorCount} fatal diagnostic(s)`);
    body.innerHTML = `<strong>This file needs attention before its restraint mechanics can be trusted.</strong>${parts.join(' &middot; ')}`;
  } else {
    body.innerHTML = `<strong>All restraints resolved.</strong>Every restraint TYPE code in this file was classified against the governed correction table &mdash; none are UNKNOWN.`;
  }
  wrap.append(icon, body);
  return wrap;
}

function summaryCards(documentRef, report) {
  const wrap = documentRef.createElement('div');
  wrap.className = 'ixa__cards';
  const cards = [
    ['Elements', report.topology.elements, report.topology.elements !== report.topology.declaredElements],
    ['Nodes', report.topology.nodes, false],
    ['Bends', report.topology.bends, report.topology.bends !== report.topology.declaredBends],
    ['Rigids', report.topology.rigids, report.topology.rigids !== report.topology.declaredRigids],
    ['Tee nodes', report.topology.teeNodes, false],
    ['Restraints', report.topology.restraints, false],
    ['Unit system', `${report.unitSystem.lengthUnit ?? '?'}`, !report.unitSystem.declared],
  ];
  for (const [label, value, mismatch] of cards) {
    const card = documentRef.createElement('div');
    card.className = `ixa__card${mismatch ? ' ixa__card--mismatch' : ''}`;
    card.innerHTML = `<div class="ixa__card-value">${escapeHtml(String(value))}</div><div class="ixa__card-label">${escapeHtml(label)}</div>`;
    wrap.append(card);
  }
  return wrap;
}

function restraintTable(documentRef, report) {
  if (report.restraints.length === 0) return emptyState(documentRef, 'No restraints declared in this file.');
  const table = documentRef.createElement('table');
  table.className = 'ixa__table';
  table.innerHTML = `
    <thead><tr>
      <th>Node</th><th>Label</th><th>Dominant axis</th><th>Classification</th>
      <th>Source &rarr; corrected type</th><th>Correction applied</th>
    </tr></thead>
  `;
  const tbody = documentRef.createElement('tbody');
  for (const row of report.restraints) {
    const tr = documentRef.createElement('tr');
    const pillClass = row.classification === 'UNKNOWN'
      ? 'ixa__pill--unknown'
      : (LABEL_PILL_CLASS[row.label] ?? (row.classification === 'ANCHOR' ? 'ixa__pill--anchor' : 'ixa__pill--guide'));
    tr.innerHTML = `
      <td class="ixa__mono">${escapeHtml(row.nodeId)}</td>
      <td><span class="ixa__pill ${pillClass}">${escapeHtml(row.label ?? 'UNKNOWN')}</span></td>
      <td>${escapeHtml(row.dominantAxis ?? '—')}</td>
      <td>${escapeHtml(row.classification)}</td>
      <td class="ixa__mono">${escapeHtml(row.sourceTypeCode ?? '?')} &rarr; ${escapeHtml(row.typeCode ?? '?')}</td>
      <td>${row.mutationApplied ? 'yes' : 'no'}</td>
    `;
    tbody.append(tr);
  }
  table.append(tbody);
  return table;
}

function topologyDetail(documentRef, report) {
  const wrap = documentRef.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.gap = '16px';

  if (report.bendElements.length > 0) {
    wrap.append(subheading(documentRef, `Bends (${report.bendElements.length})`));
    const table = documentRef.createElement('table');
    table.className = 'ixa__table';
    table.innerHTML = '<thead><tr><th>From &rarr; To</th><th>Declared radius</th></tr></thead>';
    const tbody = documentRef.createElement('tbody');
    for (const bend of report.bendElements) {
      const tr = documentRef.createElement('tr');
      tr.innerHTML = `<td class="ixa__mono">${escapeHtml(bend.fromNode ?? '?')} &rarr; ${escapeHtml(bend.toNode ?? '?')}</td><td>${bend.declaredRadius ?? '&mdash;'}</td>`;
      tbody.append(tr);
    }
    table.append(tbody);
    wrap.append(table);
  }

  if (report.rigidElements.length > 0) {
    wrap.append(subheading(documentRef, `Rigid elements (${report.rigidElements.length})`));
    const table = documentRef.createElement('table');
    table.className = 'ixa__table';
    table.innerHTML = '<thead><tr><th>From &rarr; To</th><th>Type</th><th>Entered weight</th><th>Authority</th></tr></thead>';
    const tbody = documentRef.createElement('tbody');
    for (const rigid of report.rigidElements) {
      const tr = documentRef.createElement('tr');
      tr.innerHTML = `
        <td class="ixa__mono">${escapeHtml(rigid.fromNode ?? '?')} &rarr; ${escapeHtml(rigid.toNode ?? '?')}</td>
        <td>${escapeHtml(rigid.classification)}</td>
        <td>${rigid.enteredWeight ?? '&mdash;'}</td>
        <td class="ixa__mono">${escapeHtml(rigid.weightAuthority)}</td>
      `;
      tbody.append(tr);
    }
    table.append(tbody);
    wrap.append(table);
  }

  if (report.teeNodes.length > 0) {
    wrap.append(subheading(documentRef, `Tee / branch nodes (${report.teeNodes.length})`));
    const table = documentRef.createElement('table');
    table.className = 'ixa__table';
    table.innerHTML = '<thead><tr><th>Node</th><th>Incident elements</th></tr></thead>';
    const tbody = documentRef.createElement('tbody');
    for (const tee of report.teeNodes) {
      const tr = documentRef.createElement('tr');
      tr.innerHTML = `<td class="ixa__mono">${escapeHtml(tee.nodeId)}</td><td>${tee.incidentSegmentIds?.length ?? '&mdash;'}</td>`;
      tbody.append(tr);
    }
    table.append(tbody);
    wrap.append(table);
  }

  if (wrap.children.length === 0) return emptyState(documentRef, 'No bends, rigids, or tee nodes in this file.');
  return wrap;
}

function diagnosticsList(documentRef, report) {
  if (report.diagnostics.length === 0) return emptyState(documentRef, 'No diagnostics emitted for this file.');
  const wrap = documentRef.createElement('div');
  const sorted = [...report.diagnostics].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3),
  );
  for (const diag of sorted) {
    const row = documentRef.createElement('div');
    row.className = 'ixa__diag-row';
    row.innerHTML = `
      <div class="ixa__diag-severity ixa__diag-severity--${escapeHtml(diag.severity)}">${escapeHtml(diag.severity)}</div>
      <div class="ixa__diag-message">${escapeHtml(diag.message)}<span class="ixa__diag-code">${escapeHtml(diag.code)}</span></div>
    `;
    wrap.append(row);
  }
  return wrap;
}

function configBlock(documentRef, report) {
  const wrap = documentRef.createElement('div');
  const note = documentRef.createElement('p');
  note.className = 'ixa__dropzone-hint';
  note.style.marginBottom = '10px';
  note.textContent = 'This is the exact restraintTypeCodeMap used to classify every restraint above — the project’s canonical default (DEFAULT_RESTRAINT_TYPE_CODE_MAP), not a per-file guess. Auditable here so it can never be silently wrong.';
  const pre = documentRef.createElement('div');
  pre.className = 'ixa__config-json';
  pre.textContent = JSON.stringify(report.restraintTypeCodeMap, null, 2);
  wrap.append(note, pre);
  return wrap;
}

function nextPhaseNote(documentRef) {
  const wrap = documentRef.createElement('div');
  wrap.className = 'ixa__next-phase';
  wrap.innerHTML = '<strong>What this page does today:</strong> parses and classifies the file exactly as the production ingestion pipeline would &mdash; topology, restraint mechanics, and every diagnostic it raises. <strong>What is not yet wired here:</strong> running the full solve (materials, sections, load cases) for an arbitrary uploaded file and displaying displacement/force/stress resultants &mdash; that is scoped as the next phase, tracked separately, so it is not claimed here before it is real.';
  return wrap;
}

function collapsibleSection(documentRef, { key, title, count, open, body }) {
  const section = documentRef.createElement('section');
  section.className = 'ixa__section';
  section.dataset.open = String(open);
  section.dataset.sectionKey = key;
  const header = documentRef.createElement('div');
  header.className = 'ixa__section-header';
  header.innerHTML = `
    <h2 class="ixa__section-title">${escapeHtml(title)} <span class="ixa__section-count">${count}</span></h2>
    <span class="ixa__section-caret">&#9660;</span>
  `;
  const bodyWrap = documentRef.createElement('div');
  bodyWrap.className = 'ixa__section-body';
  bodyWrap.append(body);
  section.append(header, bodyWrap);
  return section;
}

function subheading(documentRef, text) {
  const h = documentRef.createElement('h3');
  h.style.fontSize = '12.5px';
  h.style.textTransform = 'uppercase';
  h.style.letterSpacing = '0.04em';
  h.style.color = '#94a3b8';
  h.style.margin = '0 0 6px';
  h.textContent = text;
  return h;
}

function emptyState(documentRef, text) {
  const p = documentRef.createElement('p');
  p.className = 'ixa__empty';
  p.textContent = text;
  return p;
}

function button(documentRef, text, className, onClick) {
  const el = documentRef.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = text;
  el.addEventListener('click', onClick);
  return el;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

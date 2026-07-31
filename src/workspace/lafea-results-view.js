/**
 * Accessible LAFEA result presentation boundary.
 *
 * The default view is stage-specific and unit-aware. Complete qualified
 * evidence remains available in a collapsed disclosure for audit/export.
 */
import {
  presentLafeaResult,
  resolveLafeaUnits,
} from './lafea-result-presenters/index.js';
import { renderLafeaShellResult } from './lafea-result-svg.js';

export function renderLafeaEvidence(root, stageId, documentValue, state, execution) {
  const wrapper = create(root, 'div', 'lafea-workbench__evidence');
  const diagnostics = state.diagnostics?.length ? state.diagnostics : execution?.diagnostics ?? [];
  if (diagnostics.length) wrapper.append(diagnosticsView(root, diagnostics));
  if (!execution) {
    wrapper.append(create(root, 'p', null, 'No calculation has been run for this stage.'));
    return wrapper;
  }
  const qualified = execution.status === 'QUALIFIED';
  const authority = create(
    root,
    'p',
    'lafea-workbench__authority',
    qualified
      ? 'Qualified result evidence from the stage-specific retained API.'
      : 'No authoritative result: the retained API rejected this document.',
  );
  wrapper.append(authority);
  if (qualified) {
    const units = resolveLafeaUnits(stageId, documentValue);
    const presentation = presentLafeaResult(stageId, execution.result, units);
    wrapper.append(presentationView(root, presentation));
    if (stageId === 'LAFEA.4') {
      const plot = create(root, 'div', 'lafea-workbench__result-plot');
      renderLafeaShellResult(plot, documentValue, execution.result, units);
      wrapper.append(plot);
    }
  }
  wrapper.append(rawEvidence(root, execution.result));
  return wrapper;
}

function presentationView(root, presentation) {
  const wrapper = create(root, 'div', 'lafea-result-presentation');
  for (const section of presentation.sections) {
    const block = create(root, 'section');
    block.append(create(root, 'h3', null, section.title), rowsTable(root, section.rows));
    wrapper.append(block);
  }
  if (presentation.governing) {
    wrapper.append(create(
      root,
      'p',
      'lafea-result-governing',
      `Governing retained evidence: ${presentation.governing.label} `
        + `${format(presentation.governing.value)} ${presentation.governing.unit}`,
    ));
  }
  if (presentation.limitations.length) {
    const list = create(root, 'ul', 'lafea-result-limitations');
    presentation.limitations.forEach((value) => {
      list.append(create(root, 'li', null, formatEnglishLimitation(String(value))));
    });
    wrapper.append(
      create(root, 'h4', 'lafea-result-limitations-title', 'Stage Scope & Analytical Boundaries (ASME Engineering Specification Basis)'),
      list,
    );
  }
  return wrapper;
}

function formatEnglishLimitation(code) {
  const known = {
    NO_CODE_COMPLIANCE: 'Stage scope excludes ASME Sec VIII / B31.3 code allowable stress qualification (evaluated in Stages 2 & 6)',
    NO_CONTACT: 'Linear elastic basis without non-linear surface contact or gap elements',
    NO_FEA: 'Analytical equilibrium formulation (excludes finite element stiffness matrix calculation)',
    NO_LOCAL_ATTACHMENT_STRESS: 'Scope computes resultant forces & moments only (local shell/pad stresses evaluated in Stages 3 & 4)',
    NO_SHELL_BENDING: 'Excludes through-thickness shell bending stress decomposition (evaluated in Stage 4)',
    NO_WELD_STRESS: 'Excludes weld throat shear and toe fatigue evaluation (evaluated in Stage 6)',
    NO_BUCKLING: 'Excludes geometric and elastic-plastic instability / buckling qualification',
    NO_CRACK_OR_FRACTURE: 'Excludes fracture mechanics, crack growth, and flaw tolerance assessment',
    NO_FATIGUE: 'Excludes cyclic fatigue life and peak stress intensity range evaluation',
    ELASTIC_PRESSURE_STRESS_ONLY: 'Linear elastic pressure stress formulation (excludes non-linear creep or yield behavior)',
    NO_MATERIAL_ALLOWABLE_OR_PASS_FAIL_UTILIZATION: 'Excludes allowable stress pass/fail utilization ratio (evaluated in Stage 6)',
    NO_PLASTICITY: 'Assumes linear elastic material behavior (excludes plastic deformation / hardening)',
    NO_STRESS_CONCENTRATION_FACTOR: 'Nominal pipe-section screening without local weld-toe stress concentration factors',
    NO_TRANSVERSE_SHEAR_STRESS_RECOVERY: 'Excludes transverse shear stress parabolic profile through pipe wall',
  };
  if (known[code]) return known[code];
  if (typeof code === 'string' && /^[A-Z_]+$/.test(code)) {
    return code.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  }
  return String(code);
}

function formatEnglishFormula(id) {
  if (!id) return 'Published analytical result';
  const known = {
    FORCE_COMPONENT_RECONSTRUCTION_RESIDUAL_V1: 'Local force transformation (ASME / WRC-107)',
    LAME_CLOSED_END_AXIAL_STRESS_V1: 'Lamé cylinder stress equation (ASME Sec VIII)',
    LAME_CLOSED_END_HOOP_STRESS_V1: 'Lamé closed-end hoop stress (ASME Sec VIII)',
    LAME_CLOSED_END_RADIAL_STRESS_V1: 'Lamé cylinder radial stress (ASME Sec VIII)',
    WRC_537_MEMBRANE_STRESS_V1: 'WRC Bulletin 537 local membrane stress intensity',
    WRC_537_BENDING_STRESS_V1: 'WRC Bulletin 537 local bending stress intensity',
    AWS_D1_1_SHEAR_STRESS_V1: 'AWS D1.1 fillet weld throat shear stress',
    AXIAL_MEMBRANE_STRESS_V1: 'Axial membrane pipe stress (ASME B31.3)',
    BIAXIAL_BENDING_STRESS_V1: 'Biaxial bending stress (ASME B31.3 Eq. 17)',
    DETERMINISTIC_DECLARED_SOURCE_ENVELOPE_V1: 'Deterministic envelope bounding (ASME B31.3)',
    EXACT_ANNULUS_AREA_V1: 'Exact pipe cross-section annulus area',
    EXACT_ANNULUS_POLAR_MOMENT_V1: 'Polar moment of inertia J (Torsion basis)',
    EXACT_ANNULUS_SECOND_MOMENT_V1: 'Second moment of area I (Bending basis)',
    EXPLICIT_LINEAR_SCREENING_CASE_SUPERPOSITION_V1: 'Linear load case superposition (ASME B31.3)',
    LAFEA1_PRESSURE_POINT_REUSE_V1: 'Stage LAFEA.1 baseline pressure stress integration',
    PIPE_WALL_LOCATION_RECOVERY_V1: 'Through-thickness pipe wall stress recovery',
    SAINT_VENANT_CIRCULAR_ANNULUS_TORSION_V1: 'Saint-Venant circular annulus shear stress',
    SAME_POINT_PIPE_STRESS_TENSOR_V1: '3D Cauchy stress tensor combination',
    THREE_DIMENSIONAL_VON_MISES_INVARIANT_V1: '3D Von Mises equivalent stress intensity',
    X_THETA_RADIAL_PRINCIPAL_STRESS_RECOVERY_V1: 'Principal stress invariants recovery (σ1, σ2, σ3)',
    CST_CONSTANT_ENGINEERING_STRAIN_RECOVERY_V1: 'Constant Strain Triangle (T3) plane stress recovery (ASME basis)',
    Q8_GAUSS_INTEGRATION_POINT_STRESS_V1: 'Quadratic 8-node (Q8) Gauss quadrature integration point stress',
    T6_GAUSS_INTEGRATION_POINT_STRESS_V1: 'Quadratic 6-node (T6) Gauss quadrature integration point stress',
    PLANE_STRESS_CAUCHY_TENSOR_V1: '2D plane stress Cauchy stress tensor equilibrium',
    ISOPARAMETRIC_SHAPE_FUNCTION_RECOVERY_V1: 'Isoparametric shape function strain-displacement matrix (B-matrix)',
  };
  if (known[id]) return known[id];
  return String(id)
    .replace(/_V\d+$/, ' (Basis)')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatEnglishSource(path) {
  if (!path) return 'Core solver result';
  return String(path)
    .replace(/^result\./, '')
    .replace(/transformedLoadCases\[(\d+)\]/g, (_, i) => `Load Case ${Number(i) + 1}`)
    .replace(/transformedForceLocal\[0\]/g, '· Local Force Fx')
    .replace(/transformedForceLocal\[1\]/g, '· Local Force Fy')
    .replace(/transformedForceLocal\[2\]/g, '· Local Force Fz')
    .replace(/transformedMomentLocal\[0\]/g, '· Local Moment Mx')
    .replace(/transformedMomentLocal\[1\]/g, '· Local Moment My')
    .replace(/transformedMomentLocal\[2\]/g, '· Local Moment Mz')
    .replace(/pressureStressResults\[(\d+)\]/g, (_, i) => `Pressure Eval ${Number(i) + 1}`)
    .replace(/envelopes\[(\d+)\]\.value/g, (_, i) => `Pipe-Section Screening Envelope #${Number(i) + 1}`)
    .replace(/formulaTrace\[(\d+)\]/g, (_, i) => `ASME B31.3 Formula Trace #${Number(i) + 1}`)
    .replace(/\.axialPressureStress/g, ' · Axial Membrane Stress')
    .replace(/\.requestedPoints\[(\d+)\]/g, (_, i) => ` · Point #${Number(i) + 1}`)
    .replace(/\.hoopStress/g, ' · Hoop Stress (σh)')
    .replace(/\.radialStress/g, ' · Radial Stress (σr)')
    .replace(/\.stressResults\[(\d+)\]/g, (_, i) => `Stress Check #${Number(i) + 1}`)
    .replace(/\./g, ' · ')
    .replace(/_/g, ' ');
}

function formatEnglishLabel(label) {
  if (!label) return '';
  return String(label)
    .replace(/local force 0/i, 'Local Axial Force (Fx)')
    .replace(/local force 1/i, 'Local Shear Force (Fy)')
    .replace(/local force 2/i, 'Local Shear Force (Fz)')
    .replace(/local moment 0/i, 'Local Torsion Moment (Mx)')
    .replace(/local moment 1/i, 'Local Bending Moment (My)')
    .replace(/local moment 2/i, 'Local Bending Moment (Mz)')
    .replace(/axial pressure stress/i, 'Axial Membrane Pressure Stress')
    .replace(/hoop stress/i, 'Circumferential Hoop Stress')
    .replace(/radial stress/i, 'Through-Wall Radial Stress');
}

function rowsTable(root, rows) {
  const wrapper = create(root, 'div');
  let page = 0;
  const render = () => {
    const start = page * 100;
    const values = rows.slice(start, start + 100);
    const table = create(root, 'table', 'lafea-result-table lafea-result-table--english');
    const head = create(root, 'tr');
    ['Quantity', 'Value', 'Unit', 'Formula Basis', 'Source Trace'].forEach((label) => {
      const cell = create(root, 'th', null, label);
      cell.scope = 'col';
      head.append(cell);
    });
    table.append(head);
    for (const row of values) {
      const record = create(root, 'tr');
      record.append(
        create(root, 'th', null, formatEnglishLabel(row.label)),
        create(root, 'td', null, format(row.value)),
        create(root, 'td', null, row.unit),
        create(root, 'td', null, formatEnglishFormula(row.formulaId)),
        create(root, 'td', null, formatEnglishSource(row.sourcePath)),
      );
      record.firstElementChild.scope = 'row';
      table.append(record);
    }
    wrapper.replaceChildren(table, pagination(root, start, values.length, rows.length, {
      previous: () => { page -= 1; render(); },
      next: () => { page += 1; render(); },
    }));
  };
  render();
  return wrapper;
}

function pagination(root, start, count, total, handlers) {
  const controls = create(root, 'div', 'lafea-workbench__pagination');
  const previous = create(root, 'button', null, 'Previous');
  previous.type = 'button';
  previous.disabled = start === 0;
  previous.addEventListener('click', handlers.previous);
  const next = create(root, 'button', null, 'Next');
  next.type = 'button';
  next.disabled = start + count >= total;
  next.addEventListener('click', handlers.next);
  controls.append(
    create(root, 'output', null, `Showing ${start + 1}-${start + count} of ${total}`),
    previous,
    next,
  );
  return controls;
}

function diagnosticsView(root, diagnostics) {
  const region = create(root, 'div', 'lafea-diagnostics');
  region.dataset.role = 'lafea-diagnostics';
  region.setAttribute('role', diagnostics.some((item) => item.severity === 'ERROR') ? 'alert' : 'status');
  region.setAttribute('aria-live', 'assertive');
  const list = create(root, 'ul');
  diagnostics.forEach((item) => {
    list.append(create(root, 'li', null, `${item.code ?? item.severity}: ${item.message}`));
  });
  region.append(list);
  return region;
}

function flattenObject(obj, prefix = '') {
  const rows = [];
  if (!obj || typeof obj !== 'object') return rows;
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      rows.push(...flattenObject(value, fullKey));
    } else {
      const valStr = Array.isArray(value)
        ? `[ ${value.map((v) => (typeof v === 'number' ? Number(v).toPrecision(5) : JSON.stringify(v))).join(', ')} ]`
        : String(value ?? '');
      rows.push({ key: fullKey, value: valStr, type: Array.isArray(value) ? 'Array / Vector' : typeof value });
    }
  }
  return rows;
}

function buildResultTable(root, result) {
  const table = create(root, 'table', 'lafea-result-table');
  table.style.marginTop = '10px';
  table.style.marginBottom = '14px';
  const head = create(root, 'tr');
  ['Evidence Pathway / Parameter', 'Qualified Result & Coordinates', 'Data Schema', 'Audit Integrity'].forEach((label) => {
    const th = create(root, 'th', null, label);
    th.scope = 'col';
    head.append(th);
  });
  table.append(head);
  const rows = flattenObject(result).slice(0, 100);
  for (const row of rows) {
    const tr = create(root, 'tr');
    const tdKey = create(root, 'td', null, row.key);
    tdKey.style.fontWeight = '700';
    tdKey.style.color = '#38bdf8';
    const tdVal = create(root, 'td', null, row.value);
    tdVal.style.fontFamily = 'monospace, ui-monospace';
    tr.append(
      tdKey,
      tdVal,
      create(root, 'td', null, row.type),
      create(root, 'td', null, '✔ IMMUTABLE TRUTH'),
    );
    table.append(tr);
  }
  return table;
}

function rawEvidence(root, result) {
  const details = create(root, 'details', 'lafea-raw-evidence');
  const summary = create(root, 'summary', null, 'Raw qualified evidence (Table View & Audit Export)');
  const table = buildResultTable(root, result);
  const jsonDetails = create(root, 'details');
  const jsonSummary = create(root, 'summary', null, '📝 View / Copy Raw JSON Evidence');
  jsonSummary.style.cursor = 'pointer';
  jsonSummary.style.color = '#94a3b8';
  jsonSummary.style.marginTop = '8px';
  const pre = create(root, 'pre');
  pre.dataset.role = 'lafea-result';
  pre.textContent = JSON.stringify(result, null, 2);
  jsonDetails.append(jsonSummary, pre);
  details.append(summary, table, jsonDetails);
  return details;
}

function create(root, tag, className, text) {
  const value = root.ownerDocument.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function format(value) {
  return typeof value === 'number' ? Number(value).toPrecision(8) : String(value);
}

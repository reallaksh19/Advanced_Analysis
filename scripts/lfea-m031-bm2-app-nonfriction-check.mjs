#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BM2_OUTPUT_PATH } from './lfea-b3.26-bm2-solve-fixtures.mjs';
import { parseBm2CiiOutput } from './lfea-b3.26-bm2-output-comparison.mjs';
import { BM2_APP_NONFRICTION_CASES, solveBm2AppNonfrictionCases } from './lfea-m031-bm2-app-nonfriction-runtime.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPORT_PATH = resolve(ROOT, 'reports/bm2-app-nonfriction-node-reverse-engineering.json');
const CSV_PATH = resolve(ROOT, 'reports/bm2-app-nonfriction-node-reverse-engineering.csv');
const LIMIT = 0.05;
const CASES = Object.freeze(['OPE', 'SUS', 'EXP']);
const TRANSLATIONS = Object.freeze(['UX', 'UY', 'UZ']);
const ROTATIONS = Object.freeze(['RX', 'RY', 'RZ']);
const DOFS = Object.freeze([...TRANSLATIONS, ...ROTATIONS]);
const REPORT_DOF = Object.freeze({ FX: 'UX', FY: 'UY', FZ: 'UZ', MX: 'RX', MY: 'RY', MZ: 'RZ' });
const ACTIVE_STATE = Object.freeze({
  OPE: '+Z active; +Y inactive',
  SUS: '+Y active; +Z inactive',
  EXP: 'Derived OPE-SUS; no contact re-iteration',
});

function compareIds(left, right) {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && a !== b
    ? a - b
    : String(left).localeCompare(String(right));
}

function strictPass(reference, solver) {
  return reference === 0 ? solver === 0 : Math.abs((solver - reference) / reference) < LIMIT;
}

function comparisonRow({ caseLabel, family, identifier, nodeId, component, reference, solver, scope }) {
  const difference = solver - reference;
  const signedRelativeError = reference === 0 ? null : difference / reference;
  const absoluteRelativeError = signedRelativeError === null ? null : Math.abs(signedRelativeError);
  const passed = strictPass(reference, solver);
  return Object.freeze({
    caseNumber: BM2_APP_NONFRICTION_CASES[caseLabel].caseNumber,
    caseLabel,
    caseFormula: BM2_APP_NONFRICTION_CASES[caseLabel].formula,
    activeContactState: ACTIVE_STATE[caseLabel],
    family,
    identifier,
    nodeId: String(nodeId),
    component,
    reference,
    solver,
    difference,
    signedRelativeError,
    absoluteRelativeError,
    signedPercentError: signedRelativeError === null ? null : signedRelativeError * 100,
    absolutePercentError: absoluteRelativeError === null ? null : absoluteRelativeError * 100,
    strictLimit: LIMIT,
    passed,
    failureReason: passed ? null : reference === 0
      ? 'EXACT_ZERO_REFERENCE_MISMATCH'
      : 'RELATIVE_ERROR_NOT_BELOW_5_PERCENT',
    scope,
    solverPath: 'PRODUCTION_RUN_LINEAR_PIPING_ANALYSIS',
  });
}

function dominantGuideDof(restraints) {
  const guide = restraints.find((row) => String(row.typeCode) === '8');
  if (!guide) throw new Error('BM2 guide occurrence lacks source type 8 evidence.');
  const values = [Math.abs(guide.xCosine ?? 0), Math.abs(guide.yCosine ?? 0), Math.abs(guide.zCosine ?? 0)];
  return ['UX', 'UY', 'UZ'][values.indexOf(Math.max(...values))];
}

function ownedRestraintDofs(referenceRow, appNode) {
  if (referenceRow.type.includes('ANC')) return DOFS;
  if (referenceRow.type.includes('+Y')) return Object.freeze(['UY']);
  if (referenceRow.type.includes('+Z')) return Object.freeze(['UZ']);
  if (referenceRow.type.includes('GUI')) return Object.freeze([dominantGuideDof(appNode.sourceRestraints)]);
  throw new Error(`Unassigned BM2 restraint ownership: ${referenceRow.type}`);
}

function percentile(sorted, probability) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper
    ? sorted[lower]
    : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function summarize(rows) {
  const nonzero = rows.filter((row) => row.absoluteRelativeError !== null)
    .map((row) => row.absoluteRelativeError)
    .sort((left, right) => left - right);
  const passed = rows.filter((row) => row.passed).length;
  return Object.freeze({
    compared: rows.length,
    passed,
    failed: rows.length - passed,
    passRate: rows.length === 0 ? null : passed / rows.length,
    exactZeroMismatchCount: rows.filter((row) => row.failureReason === 'EXACT_ZERO_REFERENCE_MISMATCH').length,
    medianAbsoluteRelativeErrorNonzero: percentile(nonzero, 0.5),
    p90AbsoluteRelativeErrorNonzero: percentile(nonzero, 0.9),
    maximumAbsoluteRelativeErrorNonzero: nonzero.at(-1) ?? null,
  });
}

function group(rows, keyOf, describe) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Object.freeze([...groups.entries()].map(([key, values]) => Object.freeze({
    key,
    ...describe(values[0]),
    ...summarize(values),
  })).sort((left, right) => String(left.key).localeCompare(String(right.key), undefined, { numeric: true })));
}

function norm(values) {
  return Math.hypot(...values);
}

function vectorMetrics(rows, components) {
  const byComponent = new Map(rows.map((row) => [row.component, row]));
  const reference = components.map((component) => byComponent.get(component).reference);
  const solver = components.map((component) => byComponent.get(component).solver);
  const referenceNorm = norm(reference);
  const solverNorm = norm(solver);
  const dot = reference.reduce((sum, value, index) => sum + value * solver[index], 0);
  return Object.freeze({
    referenceNorm,
    solverNorm,
    normRatio: referenceNorm === 0 ? null : solverNorm / referenceNorm,
    relativeVectorError: referenceNorm === 0 ? null : norm(solver.map((value, index) => value - reference[index])) / referenceNorm,
    cosineSimilarity: referenceNorm === 0 || solverNorm === 0 ? null : dot / (referenceNorm * solverNorm),
  });
}

function sourceSifTypes(element) {
  return Object.freeze((element.sourceAnalysis?.sifs ?? [])
    .map((row) => Number(row.typeCode ?? row.type ?? row.SIFTYPE))
    .filter(Number.isFinite));
}

function topology(solved) {
  const index = new Map(solved.nodes.map((node) => [String(node.sourceNodeId), []]));
  for (const element of solved.elements) {
    const row = Object.freeze({ ...element, sourceSifTypes: sourceSifTypes(element) });
    index.get(String(element.fromNode))?.push(row);
    index.get(String(element.toNode))?.push(row);
  }
  return index;
}

function nodeRoles(node, adjacent) {
  const roles = [];
  if (node.restraint === 'ANCHOR') roles.push('ANCHOR');
  else if ((node.sourceRestraints ?? []).length > 0) roles.push('RESTRAINT');
  if (adjacent.some((row) => row.bendTagged)) roles.push('BEND_ADJACENT');
  if (adjacent.some((row) => row.rigid)) roles.push('RIGID_ADJACENT');
  if (adjacent.some((row) => row.sourceSifTypes.includes(3))) roles.push('SOURCE_SIF_TYPE_3_JUNCTION');
  if (adjacent.some((row) => row.sourceSifTypes.includes(5))) roles.push('SOURCE_SIF_TYPE_5_JUNCTION');
  return Object.freeze(roles.length === 0 ? ['STRAIGHT_FREE'] : roles);
}

function diagnostic(roles, displacementRows, loadRows) {
  const displacementFailed = displacementRows.some((row) => !row.passed);
  const normal = loadRows.filter((row) => (
    (row.identifier.includes('Rigid +Y') && row.component === 'FY')
    || (row.identifier.includes('Rigid +Z') && row.component === 'FZ')
  ));
  if (normal.some((row) => row.passed) && displacementFailed) return Object.freeze({
    code: 'CONTACT_NORMAL_VALIDATED_ADJACENT_MECHANICS',
    interpretation: 'Retain the confirmed contact state; isolate adjacent stiffness, coupling and recovery.',
  });
  if (normal.some((row) => row.absoluteRelativeError !== null && row.absoluteRelativeError < 0.06) && displacementFailed) {
    return Object.freeze({
      code: 'CONTACT_NORMAL_NEAR_TARGET_ADJACENT_MECHANICS',
      interpretation: 'The normal reaction is within six percent; separate contact magnitude from adjacent mechanics by perturbation.',
    });
  }
  if (roles.includes('SOURCE_SIF_TYPE_5_JUNCTION')) return Object.freeze({
    code: 'SOURCE_TYPE_5_JUNCTION_FLEXIBILITY_DEFERRED',
    interpretation: 'Test the source type-5 junction compliance before tuning unrelated spans.',
  });
  if (roles.includes('SOURCE_SIF_TYPE_3_JUNCTION')) return Object.freeze({
    code: 'SOURCE_TYPE_3_JUNCTION_STIFFNESS_OR_AXES',
    interpretation: 'Isolate junction flexibility ownership and branch/run axes one junction at a time.',
  });
  if (roles.includes('BEND_ADJACENT')) return Object.freeze({
    code: 'SOURCE_CHORD_BEND_COMPLIANCE_OR_RECOVERY',
    interpretation: 'Isolate bend flexibility, tangent axes and endpoint recovery.',
  });
  if (roles.includes('RIGID_ADJACENT')) return Object.freeze({
    code: 'RIGID_TRANSFER_OR_BODY_LOAD_CUSTODY',
    interpretation: 'Separate rigid stiffness, body weight, thermal exclusion and end-action transfer.',
  });
  if (roles.includes('ANCHOR') && loadRows.some((row) => !row.passed)) return Object.freeze({
    code: 'ANCHOR_REGIONAL_LOAD_PATH',
    interpretation: 'Reverse-trace element-end actions from the anchor to the first divergent span.',
  });
  if ([...displacementRows, ...loadRows].some((row) => !row.passed)) return Object.freeze({
    code: 'INHERITED_ADJACENT_COMPONENT_ERROR',
    interpretation: 'Compare adjacent element-end actions before tuning the straight source span.',
  });
  return Object.freeze({ code: 'STRICT_TARGET_SATISFIED', interpretation: 'All compared components satisfy the strict target.' });
}

function stiffnessIdentification() {
  return Object.freeze({
    status: 'INDEPENDENT_PERTURBATIONS_REQUIRED_FOR_MATRIX_IDENTIFICATION',
    existingPhysicalResponseColumns: Object.freeze({ OPE: 1, SUS: 1 }),
    reasonExistingCasesCannotShareOneMatrix: 'OPE and SUS have different unilateral active sets; EXP is derived and provides no independent column.',
    condensedNodeMatrix: Object.freeze({
      targetShape: '6x6',
      minimumIndependentPerturbationsPerUnchangedActiveState: 6,
      flexibilityDefinition: 'C_ij = delta_u_i / delta_P_j',
      stiffnessDefinition: 'K_condensed = inverse(C)',
      excitations: Object.freeze(['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ']),
      responses: Object.freeze(DOFS),
    }),
    twoNodeInterfaceMatrix: Object.freeze({
      targetShape: '12x12',
      minimumIndependentPerturbationsPerUnchangedActiveState: 12,
      rigidBodyModeHandlingRequired: true,
    }),
    invariants: Object.freeze([
      'Use incremental perturbed-minus-baseline responses.',
      'Keep the unilateral active set unchanged during every perturbation.',
      'Retain consistent force/moment and translation/rotation units.',
      'Record global and local element-end actions at both interface ends.',
    ]),
    priorityRegions: Object.freeze([
      'node 40 guide/+Y and adjacent bend region',
      'node 130 +Z and adjacent bend/junction region',
      'source type-5 junctions at nodes 100 and 140',
      'anchor path 150-160-170-180-190',
      'anchor path around node 240',
    ]),
  });
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function nodeCsv(rows) {
  const columns = [
    'caseNumber', 'caseLabel', 'nodeId', 'roles', 'adjacentElements',
    'displacementCompared', 'displacementPassed', 'displacementFailed',
    'restraintCompared', 'restraintPassed', 'restraintFailed',
    'translation', 'rotation', 'diagnosticCode', 'diagnosticInterpretation',
  ];
  const projected = rows.map((row) => ({
    ...row,
    diagnosticCode: row.diagnostic.code,
    diagnosticInterpretation: row.diagnostic.interpretation,
  }));
  return `${columns.join(',')}\n${projected.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`;
}

const solved = solveBm2AppNonfrictionCases();
const reference = parseBm2CiiOutput(readFileSync(BM2_OUTPUT_PATH, 'utf8'));
const appNodes = new Map(solved.nodes.map((node) => [String(node.sourceNodeId), node]));
const detail = [];
for (const caseLabel of CASES) {
  for (const row of reference.displacement.get(caseLabel).rows.filter((candidate) => appNodes.has(candidate.nodeId))) {
    for (const [referenceField, appDof] of [['DX', 'UX'], ['DY', 'UY'], ['DZ', 'UZ'], ['RX', 'RX'], ['RY', 'RY'], ['RZ', 'RZ']]) {
      const raw = appNodes.get(row.nodeId)[caseLabel].displacement[appDof];
      detail.push(comparisonRow({
        caseLabel,
        family: 'displacement',
        identifier: row.nodeId,
        nodeId: row.nodeId,
        component: appDof,
        reference: row[referenceField],
        solver: raw * (TRANSLATIONS.includes(appDof) ? 1000 : 180 / Math.PI),
        scope: 'APP_SOURCE_NODES; APP_TRANSLATION_M_TO_MM; APP_ROTATION_RAD_TO_DEG',
      }));
    }
  }
  for (const row of reference.restraint.get(caseLabel).rows) {
    const appNode = appNodes.get(row.nodeId);
    assert.ok(appNode, `BM2 app result lacks restraint node ${row.nodeId}.`);
    const owned = new Set(ownedRestraintDofs(row, appNode));
    for (const component of ['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ']) {
      const dof = REPORT_DOF[component];
      detail.push(comparisonRow({
        caseLabel,
        family: 'restraint',
        identifier: `${row.nodeId}:${row.type}:${row.occurrenceOrdinalWithinCaseFamilyAndPair}`,
        nodeId: row.nodeId,
        component,
        reference: row[component],
        solver: owned.has(dof) ? appNode[caseLabel].reaction[dof] : 0,
        scope: 'RETAINED_RESTRAINT_OCCURRENCES_WITH_DOF_OWNERSHIP',
      }));
    }
  }
}
detail.sort((left, right) => left.caseNumber - right.caseNumber
  || left.family.localeCompare(right.family)
  || compareIds(left.nodeId, right.nodeId)
  || left.identifier.localeCompare(right.identifier, undefined, { numeric: true })
  || left.component.localeCompare(right.component));

assert.equal(solved.nodes.length, 35, 'BM2 app source node custody');
for (const caseLabel of CASES) {
  assert.equal(detail.filter((row) => row.caseLabel === caseLabel && row.family === 'displacement').length, 210);
  assert.equal(detail.filter((row) => row.caseLabel === caseLabel && row.family === 'restraint').length, 36);
}
for (const caseLabel of ['OPE', 'SUS']) {
  const result = solved.physicalCases[caseLabel].result;
  assert.notEqual(result.execution.status, 'BLOCKED');
  assert.equal(result.codeResults, null);
  assert.equal(result.recovery.componentResultants.length, 0);
}
const node40 = appNodes.get('40');
const node130 = appNodes.get('130');
assert.ok(node40.OPE.reaction.UY === 0, 'OPE inactive +Y must have zero owned reaction');
assert.ok(node40.SUS.displacement.UY === 0, 'SUS active +Y must constrain UY');
assert.ok(node130.SUS.reaction.UZ === 0, 'SUS inactive +Z must have zero owned reaction');
assert.ok(node130.OPE.displacement.UZ === 0, 'OPE active +Z must constrain UZ');

const adjacency = topology(solved);
const nodeCases = Object.freeze(CASES.flatMap((caseLabel) => [...appNodes.entries()].map(([nodeId, node]) => {
  const displacementRows = detail.filter((row) => row.caseLabel === caseLabel && row.family === 'displacement' && row.nodeId === nodeId);
  const loadRows = detail.filter((row) => row.caseLabel === caseLabel && row.family === 'restraint' && row.nodeId === nodeId);
  const adjacent = adjacency.get(nodeId) ?? [];
  const roles = nodeRoles(node, adjacent);
  return Object.freeze({
    caseNumber: BM2_APP_NONFRICTION_CASES[caseLabel].caseNumber,
    caseLabel,
    nodeId,
    roles,
    adjacentElements: Object.freeze(adjacent.map((row) => Object.freeze({
      sourceElementId: row.sourceElementId,
      fromNode: row.fromNode,
      toNode: row.toNode,
      bendTagged: row.bendTagged,
      rigid: row.rigid,
      sourceSifTypes: row.sourceSifTypes,
    }))),
    displacementCompared: displacementRows.length,
    displacementPassed: displacementRows.filter((row) => row.passed).length,
    displacementFailed: displacementRows.filter((row) => !row.passed).length,
    restraintCompared: loadRows.length,
    restraintPassed: loadRows.filter((row) => row.passed).length,
    restraintFailed: loadRows.filter((row) => !row.passed).length,
    translation: vectorMetrics(displacementRows, TRANSLATIONS),
    rotation: vectorMetrics(displacementRows, ROTATIONS),
    diagnostic: diagnostic(roles, displacementRows, loadRows),
  });
})).sort((left, right) => left.caseNumber - right.caseNumber || compareIds(left.nodeId, right.nodeId)));

const report = Object.freeze({
  schema: 'bm2-app-nonfriction-node-reverse-engineering/v1',
  referenceAuthority: 'ASME_B31_3_2018_APPENDIX_D_SAMPLE_OUTPUT',
  caseAuthority: BM2_APP_NONFRICTION_CASES,
  solverPath: solved.solverPath,
  comparisonPolicy: Object.freeze({
    nonzeroReference: 'abs((solver-reference)/reference) < 0.05; exact boundary fails',
    zeroReference: 'solver must equal exact zero',
  }),
  units: Object.freeze({
    referenceTranslation: 'mm', appTranslation: 'm', translationConversion: 1000,
    referenceRotation: 'deg', appRotation: 'rad', rotationConversion: 180 / Math.PI,
    restraintForce: 'N', restraintMoment: 'N.m',
  }),
  coverage: Object.freeze({
    sourceNodesPerCase: solved.nodes.length,
    displacementScalarsPerCase: 210,
    restraintScalarsPerCase: 36,
    generatedBendAndJunctionStations: 'NOT_EMITTED_BY_PRODUCTION_APP_PATH',
    codeStress: 'BLOCKED_CODE_RESULTS_NULL',
  }),
  execution: Object.freeze(Object.fromEntries(['OPE', 'SUS'].map((caseLabel) => {
    const result = solved.physicalCases[caseLabel].result;
    return [caseLabel, Object.freeze({
      resultStatus: result.status,
      executionStatus: result.execution.status,
      normalizedResidual: result.execution.diagnostics.residual.value,
      residualStatus: result.execution.diagnostics.residual.status,
      codeResults: result.codeResults,
      componentResultantCount: result.recovery.componentResultants.length,
    })];
  }))),
  summary: Object.freeze({
    overall: summarize(detail),
    byCaseAndFamily: group(detail, (row) => `${row.caseNumber}:${row.family}`, (row) => ({
      caseNumber: row.caseNumber, caseLabel: row.caseLabel, family: row.family,
    })),
    byCaseFamilyAndComponent: group(detail, (row) => `${row.caseNumber}:${row.family}:${row.component}`, (row) => ({
      caseNumber: row.caseNumber, caseLabel: row.caseLabel, family: row.family, component: row.component,
    })),
  }),
  nodeCases,
  stiffnessIdentification: stiffnessIdentification(),
  detail: Object.freeze(detail),
  limitations: solved.limitations,
});

if (process.argv.includes('--write')) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(CSV_PATH, nodeCsv(nodeCases));
}
console.log(JSON.stringify({
  schema: report.schema,
  solverPath: report.solverPath,
  execution: report.execution,
  summary: report.summary.byCaseAndFamily,
  stiffnessIdentificationStatus: report.stiffnessIdentification.status,
}, null, 2));

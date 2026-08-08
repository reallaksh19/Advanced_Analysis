#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import {
  COMPONENT_GEOMETRY_SCHEMA,
  FACTOR_CALCULATION_REQUEST_SCHEMA,
  calculateB31Factors,
} from '../src/core/linear-fea-b31-factor-calculator/index.js';
import { classifyBranchLegs } from '../src/core/linear-fea-piping-components/index.js';
import { BM4_COMPARISON_POLICY, loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { BM4_INPUT_PATH, BM4_OUTPUT_PATH } from './lfea-m034-bm4-solve-fixtures.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';
import { normalizeBm4CiiLocalForceForM035 } from './lfea-bm4-local-force-reference-normalization.mjs';

const CASES = Object.freeze(['SUS', 'OPE', 'EXP']);
const CASE_NO = Object.freeze({ SUS: 19, OPE: 20, EXP: 21 });
const ENDS = Object.freeze(['I', 'J']);
const FIELDS = Object.freeze([
  ['fx', 1, 'AXIAL_FORCE', 'N'], ['fy', 2, 'SHEAR_FORCE', 'N'], ['fz', 2, 'SHEAR_FORCE', 'N'],
  ['mx', 3, 'TORSION', 'N*m'], ['my', 4, 'BENDING_MOMENT', 'N*m'], ['mz', 4, 'BENDING_MOMENT', 'N*m'],
]);
const FIELD_META = new Map(FIELDS.map(([field, level, name, units]) => [field, { level, name, units }]));
const LEVELS = Object.freeze([1, 2, 3, 4].map((level) => Object.freeze({
  level,
  name: FIELDS.find(([, candidate]) => candidate === level)[2],
})));
const FACTOR_PROFILE_ID = 'B31_3_2022_B31J_2017';
const MOMENT_MAPPING = Object.freeze({ inPlaneField: 'my', outOfPlaneField: 'mz' });

function pair(entry) { return `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`; }
function subtract(a, b) {
  return Object.fromEntries(FIELDS.map(([field]) => [field, (a?.[field] ?? 0) - (b?.[field] ?? 0)]));
}
function sourceActionMap(solved, recovery) {
  const recovered = new Map(recovery.elementActions.map((row) => [row.elementId, row]));
  const out = new Map();
  for (const source of solved.authorities.base.entries) {
    const sourceId = String(source.sourceSegment.id);
    const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === sourceId);
    const first = recovered.get(descendants[0]?.elementId);
    const last = recovered.get(descendants.at(-1)?.elementId);
    if (!first || !last) throw new Error(`M045 missing recovered action for ${sourceId}.`);
    out.set(pair(source), Object.freeze({
      sourceId,
      fromNode: String(source.sourceSegment.startNodeId),
      toNode: String(source.sourceSegment.endNodeId),
      I: first.local.I,
      J: last.local.J,
    }));
  }
  return out;
}
function caseActions(solved) {
  const sus = sourceActionMap(solved, solved.sustained.recovery);
  const ope = sourceActionMap(solved, solved.operating.recovery);
  const exp = new Map();
  for (const [key, hot] of ope) {
    const cold = sus.get(key);
    exp.set(key, Object.freeze({
      sourceId: hot.sourceId, fromNode: hot.fromNode, toNode: hot.toNode,
      I: Object.freeze(subtract(hot.I, cold.I)), J: Object.freeze(subtract(hot.J, cold.J)),
    }));
  }
  return new Map([['SUS', sus], ['OPE', ope], ['EXP', exp]]);
}
function compareMechanical(ours, cii, field) {
  const delta = ours - cii;
  const absDelta = Math.abs(delta);
  const nearZero = Math.abs(cii) <= BM4_COMPARISON_POLICY.nearZeroReferenceThreshold;
  const absPercent = nearZero ? null : 100 * absDelta / Math.abs(cii);
  const tolerance = ['fx', 'fy', 'fz'].includes(field)
    ? BM4_COMPARISON_POLICY.absoluteTolerance.force : BM4_COMPARISON_POLICY.absoluteTolerance.moment;
  return Object.freeze({ ours, cii, delta, absDelta, absPercent,
    passed: nearZero ? absDelta <= tolerance : absPercent <= BM4_COMPARISON_POLICY.targetTolerancePercent });
}
function stats(rows) {
  if (!rows.length) return Object.freeze({ compared: 0, passed: 0, failed: 0, passRate: null, mae: null, maxAbsDelta: null, worst: null });
  const passed = rows.filter((row) => row.passed).length;
  const worst = [...rows].sort((a, b) => b.absDelta - a.absDelta || a.pairKey.localeCompare(b.pairKey))[0];
  return Object.freeze({ compared: rows.length, passed, failed: rows.length - passed, passRate: passed / rows.length,
    mae: rows.reduce((sum, row) => sum + row.absDelta, 0) / rows.length, maxAbsDelta: worst.absDelta, worst });
}
function mechanicalAudit(solved, cii) {
  const oursByCase = caseActions(solved);
  const sourceById = new Map(solved.authorities.base.entries.map((entry) => [String(entry.sourceSegment.id), entry]));
  const rows = [];
  const unmatched = [];
  for (const caseLabel of CASES) {
    for (const [pairKey, authorityRows] of cii.localForce.get(caseLabel).byPair) {
      const ours = oursByCase.get(caseLabel).get(pairKey);
      if (!ours || authorityRows.length !== 1) {
        unmatched.push(Object.freeze({ caseLabel, pairKey, authorityRowCount: authorityRows.length, oursPresent: Boolean(ours) }));
        continue;
      }
      const source = sourceById.get(ours.sourceId);
      const reference = authorityRows[0];
      for (const end of ENDS) for (const [field, level, levelName, units] of FIELDS) rows.push(Object.freeze({
        sourceId: ours.sourceId, sourceType: source.sourceSegment.type, sourceComponentUid: source.sourceSegment.sourceComponentUid ?? null,
        pairKey, fromNode: ours.fromNode, toNode: ours.toNode, caseLabel, end,
        nodeId: end === 'I' ? ours.fromNode : ours.toNode, field, level, levelName, units,
        ...compareMechanical(ours[end][field], reference[end][field], field),
      }));
    }
  }
  const components = solved.authorities.base.entries.map((entry) => {
    const sourceId = String(entry.sourceSegment.id);
    const own = rows.filter((row) => row.sourceId === sourceId);
    const first = LEVELS.find((level) => own.some((row) => row.level === level.level && !row.passed)) ?? null;
    return Object.freeze({
      sourceId, pairKey: pair(entry), sourceType: entry.sourceSegment.type,
      fromNode: String(entry.sourceSegment.startNodeId), toNode: String(entry.sourceSegment.endNodeId),
      oneToOneAuthority: own.length > 0,
      firstFailedLevel: first,
      byLevel: Object.fromEntries(LEVELS.map((level) => [level.name, stats(own.filter((row) => row.level === level.level))])),
    });
  });
  const bendingResultants = [];
  for (const caseLabel of CASES) for (const component of components) for (const end of ENDS) {
    const my = rows.find((row) => row.caseLabel === caseLabel && row.sourceId === component.sourceId && row.end === end && row.field === 'my');
    const mz = rows.find((row) => row.caseLabel === caseLabel && row.sourceId === component.sourceId && row.end === end && row.field === 'mz');
    if (!my || !mz) continue;
    bendingResultants.push(Object.freeze({ caseLabel, sourceId: component.sourceId, pairKey: component.pairKey, end,
      ...compareMechanical(Math.hypot(my.ours, mz.ours), Math.hypot(my.cii, mz.cii), 'my') }));
  }
  return Object.freeze({ rows: Object.freeze(rows), unmatched: Object.freeze(unmatched), components: Object.freeze(components), bendingResultants: Object.freeze(bendingResultants) });
}

function numPair(inner, tag) {
  const element = findElements(inner, tag)[0];
  return element ? Object.freeze({ I: Number(element.attributes.FROM), J: Number(element.attributes.TO) }) : null;
}
function stressReports(xml) {
  const out = new Map();
  for (const report of findElements(xml, 'STRESS_REPORT')) {
    const match = /^CASE\s+(\d+)\b/u.exec(String(report.attributes.LOADCASE ?? ''));
    const caseLabel = match ? Object.keys(CASE_NO).find((key) => CASE_NO[key] === Number(match[1])) : null;
    if (!caseLabel) continue;
    const rows = findElements(report.inner, 'ELEMENT').map((element) => Object.freeze({
      fromNode: String(element.attributes.FROM_NODE), toNode: String(element.attributes.TO_NODE),
      pairKey: `${element.attributes.FROM_NODE}-${element.attributes.TO_NODE}`,
      sifIn: numPair(element.inner, 'SIF_IN_PLANE'), sifOut: numPair(element.inner, 'SIF_OUT_PLANE'),
      axialStress: numPair(element.inner, 'AXIAL_STRESS'), bendingStress: numPair(element.inner, 'BENDING_STRESS'),
      torsionStress: numPair(element.inner, 'TORSION_STRESS'), codeStress: numPair(element.inner, 'CODE_STRESS'),
    }));
    out.set(caseLabel, Object.freeze({ rows: Object.freeze(rows), byPair: new Map(rows.map((row) => [row.pairKey, row])) }));
  }
  return out;
}
function realNode(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? String(n).replace(/\.0+$/u, '') : null;
}
function bendDescriptors(inputXml, solved) {
  const sourceByPair = new Map(solved.authorities.base.entries.map((entry) => [pair(entry), String(entry.sourceSegment.id)]));
  return Object.freeze(findElements(inputXml, 'PIPINGELEMENT').flatMap((pipe) => {
    const bend = findElements(pipe.inner, 'BEND')[0];
    if (!bend) return [];
    const fromNode = realNode(pipe.attributes.FROM_NODE); const toNode = realNode(pipe.attributes.TO_NODE);
    const sourceId = sourceByPair.get(`${fromNode}-${toNode}`);
    if (!sourceId) throw new Error(`M045 unbound InputXML bend ${fromNode}-${toNode}.`);
    const sequence = [fromNode, ...['NODE1', 'NODE2', 'NODE3'].map((key) => realNode(bend.attributes[key])).filter(Boolean), toNode];
    return [Object.freeze({ sourceId, fromNode, toNode, sequence: Object.freeze(sequence),
      stressPairs: Object.freeze(sequence.slice(0, -1).map((node, index) => `${node}-${sequence[index + 1]}`)) })];
  }));
}
function resolvedBendFactors(solved) {
  const sourceById = new Map(solved.authorities.base.entries.map((entry) => [String(entry.sourceSegment.id), entry]));
  const out = new Map();
  for (const component of solved.authorities.bendExpansion.components) {
    const sourceId = component.componentId.replace(/^IXBEND\./u, '');
    const source = sourceById.get(sourceId);
    const analysis = source.sourceSegment.meta.analysis;
    const result = calculateB31Factors({
      schema: FACTOR_CALCULATION_REQUEST_SCHEMA,
      calculationId: `M045-${sourceId}`,
      componentId: sourceId,
      editionProfileId: FACTOR_PROFILE_ID,
      componentType: 'BEND',
      geometry: {
        schema: COMPONENT_GEOMETRY_SCHEMA, componentType: 'BEND', lengthUnit: 'm',
        outerDiameter: source.physicalSection.dimensions.outerDiameter,
        wallThickness: source.physicalSection.dimensions.wallThickness,
        bendRadius: component.geometry.declaredRadius,
        pressure: analysis.pressure,
        elasticModulus: solved.authorities.material.materialState.elasticModulus,
        bendAngleDegrees: component.geometry.sweepAngle * 180 / Math.PI,
        smooth90FlexibilityCorrection: false,
        sourceEvidence: { sourceId: `M045-BM4-RESOLVED-BEND-${sourceId}`, sourceRevision: solved.authorities.source.semanticHash },
      },
      momentDirectionMapping: MOMENT_MAPPING,
      semanticHash: '',
    });
    assert.equal(result.status, 'QUALIFIED', `M045 bend ${sourceId} factor calculation must qualify.`);
    assert.ok(Math.abs(result.factors.flexibility.inPlane - component.flexibility.factor) <= 1e-9 * Math.max(component.flexibility.factor, 1),
      `M045 bend ${sourceId} factor must reproduce assembled k.`);
    out.set(sourceId, Object.freeze({ component, result }));
  }
  return out;
}
function compareSif(ours, cii) {
  const delta = ours - cii; const absDelta = Math.abs(delta); const absPercent = 100 * absDelta / Math.max(Math.abs(cii), 1e-12);
  return Object.freeze({ ours, cii, delta, absDelta, absPercent, passed: absPercent <= BM4_COMPARISON_POLICY.targetTolerancePercent });
}
function stressPayload(authority, end) {
  return Object.freeze({ axial: authority.axialStress?.[end] ?? null, bending: authority.bendingStress?.[end] ?? null,
    torsion: authority.torsionStress?.[end] ?? null, code: authority.codeStress?.[end] ?? null });
}
function bendSifAudit(stresses, descriptors, factors) {
  const rows = [];
  for (const descriptor of descriptors) {
    const { component, result } = factors.get(descriptor.sourceId);
    for (const caseLabel of CASES) {
      const expected = caseLabel === 'SUS' ? result.factors.sustainedIndices : result.factors.displacementSifs;
      for (const pairKey of descriptor.stressPairs) {
        const authority = stresses.get(caseLabel).byPair.get(pairKey); if (!authority) continue;
        for (const end of ENDS) {
          const nodeId = end === 'I' ? authority.fromNode : authority.toNode;
          if (nodeId === descriptor.fromNode) continue;
          const values = [['IN_PLANE', authority.sifIn?.[end], expected.inPlaneBending], ['OUT_OF_PLANE', authority.sifOut?.[end], expected.outOfPlaneBending]];
          if (!values.some(([, cii]) => Number.isFinite(cii) && Math.abs(cii - 1) > 1e-9)) continue;
          for (const [direction, cii, ours] of values) if (Number.isFinite(cii)) rows.push(Object.freeze({
            family: 'BEND', componentId: component.componentId, sourceId: descriptor.sourceId, role: 'BEND', caseLabel,
            pairKey, end, nodeId, direction, ...compareSif(ours, cii), caesarStress: stressPayload(authority, end),
          }));
        }
      }
    }
  }
  return Object.freeze(rows);
}
function point(geometry, nodeId) {
  const node = geometry.nodes.find((row) => String(row.id) === String(nodeId));
  if (!node) throw new Error(`M045 missing node ${nodeId}.`);
  return [node.x, node.y, node.z];
}
function teeSifAudit(solved, stresses, descriptors) {
  const bendById = new Map(descriptors.map((row) => [row.sourceId, row]));
  const rows = [];
  for (const junction of solved.authorities.teeJunctions) {
    const nodeId = String(junction.junctionNodeId);
    const incident = solved.authorities.sourceGeometry.segments.filter((segment) => String(segment.startNodeId) === nodeId || String(segment.endNodeId) === nodeId);
    const classified = classifyBranchLegs(incident.map((segment) => ({ legId: String(segment.id), endPoint: point(solved.authorities.sourceGeometry,
      String(segment.startNodeId) === nodeId ? segment.endNodeId : segment.startNodeId) })), point(solved.authorities.sourceGeometry, nodeId), 1e-9);
    const roleById = new Map(classified.legs.map((leg) => [String(leg.legId), leg.role === 'BRANCH' ? 'branch' : 'run']));
    for (const segment of incident) {
      const sourceId = String(segment.id); const role = roleById.get(sourceId);
      const candidatePairs = bendById.get(sourceId)?.stressPairs ?? [`${segment.startNodeId}-${segment.endNodeId}`];
      for (const caseLabel of CASES) {
        const authority = candidatePairs.map((key) => stresses.get(caseLabel).byPair.get(key)).find((row) => row && (row.fromNode === nodeId || row.toNode === nodeId));
        if (!authority) continue;
        const end = authority.fromNode === nodeId ? 'I' : 'J';
        const expected = caseLabel === 'SUS' ? junction.factorResult.factors.sustainedIndices[role] : junction.factorResult.factors.displacementSifs[role];
        for (const [direction, cii, ours] of [['IN_PLANE', authority.sifIn?.[end], expected.inPlaneBending], ['OUT_OF_PLANE', authority.sifOut?.[end], expected.outOfPlaneBending]]) {
          if (!Number.isFinite(cii)) continue;
          rows.push(Object.freeze({ family: 'TEE', componentId: junction.factorResult.componentId, sourceId, role, caseLabel,
            pairKey: authority.pairKey, end, nodeId, direction, ...compareSif(ours, cii), caesarStress: stressPayload(authority, end) }));
        }
      }
    }
  }
  return Object.freeze(rows);
}
function sifStats(rows) {
  if (!rows.length) return Object.freeze({ compared: 0, passed: 0, failed: 0, passRate: null, maxAbsPercent: null, worst: null });
  const passed = rows.filter((row) => row.passed).length;
  const worst = [...rows].sort((a, b) => b.absPercent - a.absPercent)[0];
  return Object.freeze({ compared: rows.length, passed, failed: rows.length - passed, passRate: passed / rows.length, maxAbsPercent: worst.absPercent, worst });
}

const solved = solveBm4M035M036Combined();
const rawCii = loadBm4CiiOutputCases1921();
const cii = normalizeBm4CiiLocalForceForM035(rawCii, solved.authorities);
const mechanics = mechanicalAudit(solved, cii);
const stresses = stressReports(readFileSync(BM4_OUTPUT_PATH, 'utf8'));
const descriptors = bendDescriptors(readFileSync(BM4_INPUT_PATH, 'utf8'), solved);
const factors = resolvedBendFactors(solved);
const bendSifs = bendSifAudit(stresses, descriptors, factors);
const teeSifs = teeSifAudit(solved, stresses, descriptors);
const sifRows = Object.freeze([...bendSifs, ...teeSifs]);

assert.equal(mechanics.rows.length, 2988, 'M045 expects 498 matched ends x 6 local action components.');
assert.equal(mechanics.unmatched.length, 84, 'M045 must preserve 84 unmatched CAESAR station records.');
assert.equal(descriptors.length, 12, 'M045 expects 12 InputXML bends.');
assert.equal(factors.size, 12, 'M045 expects 12 qualified bend factor sets.');
assert.ok(sifRows.length > 0, 'M045 requires mapped bend/tee SIF comparisons.');

const byLevel = Object.fromEntries(LEVELS.map((level) => [level.name, stats(mechanics.rows.filter((row) => row.level === level.level))]));
const byCaseField = Object.fromEntries(CASES.map((caseLabel) => [caseLabel, Object.fromEntries(FIELDS.map(([field]) => [field, stats(mechanics.rows.filter((row) => row.caseLabel === caseLabel && row.field === field))]))]));
const firstFailures = Object.fromEntries(LEVELS.map((level) => [level.name, mechanics.components.filter((row) => row.firstFailedLevel?.level === level.level).length]));
firstFailures.NO_FAILURE_LEVELS_1_TO_4 = mechanics.components.filter((row) => row.oneToOneAuthority && row.firstFailedLevel === null).length;
firstFailures.NO_ONE_TO_ONE_FORCE_MOMENT_AUTHORITY = mechanics.components.filter((row) => !row.oneToOneAuthority).length;
const kBends = [...factors.entries()].map(([sourceId, entry]) => Object.freeze({ family: 'BEND', sourceId, componentId: entry.component.componentId,
  lfeaK: entry.component.flexibility.factor, recomputedK: entry.result.factors.flexibility.inPlane, caesarComputedK: null,
  status: 'NO_DIRECT_CAESAR_COMPUTED_K_IN_PINNED_INPUT_OUTPUT' }));
const kTees = solved.authorities.teeJunctions.flatMap((junction) => ['run', 'branch'].map((role) => Object.freeze({ family: 'TEE',
  componentId: junction.factorResult.componentId, junctionNodeId: junction.junctionNodeId, role,
  lfeaDirectionalK: junction.factorResult.factors.flexibility[role], caesarComputedK: null,
  status: 'NO_DIRECT_CAESAR_COMPUTED_K_IN_PINNED_INPUT_OUTPUT' })));

const report = Object.freeze({
  schema: 'lfea-m045-bm4-component-hierarchy/v2',
  targetCases: CASE_NO,
  policy: BM4_COMPARISON_POLICY,
  mechanics: Object.freeze({
    comparedRows: mechanics.rows.length, unmatchedAuthorityPairRecords: mechanics.unmatched.length,
    byLevel: Object.freeze(byLevel), byCaseField: Object.freeze(byCaseField),
    bendingResultantSecondary: stats(mechanics.bendingResultants),
    firstFailureDistribution: Object.freeze(firstFailures), components: mechanics.components, rows: mechanics.rows, unmatched: mechanics.unmatched,
  }),
  sif: Object.freeze({ overall: sifStats(sifRows), byFamily: Object.freeze({ BEND: sifStats(bendSifs), TEE: sifStats(teeSifs) }),
    byCase: Object.fromEntries(CASES.map((caseLabel) => [caseLabel, sifStats(sifRows.filter((row) => row.caseLabel === caseLabel))])), rows: sifRows }),
  flexibility: Object.freeze({ caesarDirectComputedKAvailable: false,
    authorityBoundary: 'INPUT_BEND_KFACTOR_UNSET_SENTINEL_AND_OUTPUT_HAS_NO_COMPUTED_K_OR_FLEXIBILITY_TAG',
    inferenceFromSifOrStressProhibited: true, bends: Object.freeze(kBends), tees: Object.freeze(kTees) }),
  stress: Object.freeze({ caesarDecompositionAvailable: true,
    fields: Object.freeze(['AXIAL_STRESS', 'BENDING_STRESS', 'TORSION_STRESS', 'CODE_STRESS', 'ALLOWABLE_STRESS']),
    lfeaQualifiedBm4CodePointStressAvailable: false,
    reason: 'M035_M036_RECOVERY_USES_RECOVER_COMPONENT_CODE_POINTS_FALSE',
    disposition: 'DO_NOT_RECREATE_STRESS_AD_HOC; ENABLE_QUALIFIED_BM4_CODE_POINT_RECOVERY_AND_EXISTING_B31_APPLICATION_PATH_FIRST' }),
  disposition: Object.freeze({ mechanicsChangedByM045: false, loadCasesChangedByM045: false, forcmntChangedByM045: false,
    bourdonErrorConcluded: false, outputFitUsed: false }),
});

const arg = process.argv.indexOf('--report');
if (arg >= 0) {
  const requested = process.argv[arg + 1]; if (!requested) throw new Error('--report requires a path.');
  const path = resolve(requested); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}
for (const level of LEVELS) {
  const s = report.mechanics.byLevel[level.name];
  console.log(`M045 ${level.name}: ${s.passed}/${s.compared} pass (${(100 * s.passRate).toFixed(2)}%); MAE=${s.mae.toFixed(3)}; max=${s.maxAbsDelta.toFixed(3)}.`);
}
for (const caseLabel of CASES) console.log(`M045 ${caseLabel} fields: ${JSON.stringify(Object.fromEntries(FIELDS.map(([field]) => [field, `${report.mechanics.byCaseField[caseLabel][field].passed}/${report.mechanics.byCaseField[caseLabel][field].compared}`])))}`);
console.log(`M045 first failure distribution: ${JSON.stringify(report.mechanics.firstFailureDistribution)}`);
console.log(`M045 SIF: overall ${report.sif.overall.passed}/${report.sif.overall.compared}; bend ${report.sif.byFamily.BEND.passed}/${report.sif.byFamily.BEND.compared}; tee ${report.sif.byFamily.TEE.passed}/${report.sif.byFamily.TEE.compared}; worst=${report.sif.overall.maxAbsPercent.toFixed(4)}%.`);
console.log('M045 k: direct CAESAR computed-k authority unavailable; no inferred comparison.');
console.log('M045 stress: CAESAR stress decomposition available; LFEA BM4 code-point stress path remains intentionally unqualified/disabled.');

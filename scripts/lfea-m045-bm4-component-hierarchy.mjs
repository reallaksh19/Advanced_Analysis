#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import { calculateB31FactorsFromCanonicalGeometry } from '../src/core/linear-fea-b31-factor-calculator/index.js';
import { classifyBranchLegs } from '../src/core/linear-fea-piping-components/index.js';
import {
  BM4_COMPARISON_POLICY,
  loadBm4CiiOutputCases1921,
} from './lfea-m034-bm4-output-comparison.mjs';
import { BM4_INPUT_PATH, BM4_OUTPUT_PATH } from './lfea-m034-bm4-solve-fixtures.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';
import { normalizeBm4CiiLocalForceForM035 } from './lfea-bm4-local-force-reference-normalization.mjs';

const CASES = Object.freeze(['SUS', 'OPE', 'EXP']);
const CASE_NUMBER = Object.freeze({ SUS: 19, OPE: 20, EXP: 21 });
const ENDS = Object.freeze(['I', 'J']);
const LEVELS = Object.freeze([
  Object.freeze({ level: 1, name: 'AXIAL_FORCE', fields: Object.freeze(['fx']), units: 'N' }),
  Object.freeze({ level: 2, name: 'SHEAR_FORCE', fields: Object.freeze(['fy', 'fz']), units: 'N' }),
  Object.freeze({ level: 3, name: 'TORSION', fields: Object.freeze(['mx']), units: 'N*m' }),
  Object.freeze({ level: 4, name: 'BENDING_MOMENT', fields: Object.freeze(['my', 'mz']), units: 'N*m' }),
]);
const FIELD_META = new Map(LEVELS.flatMap((level) => level.fields.map((field) => [field, level])));
const MOMENT_DIRECTION_MAPPING = Object.freeze({ inPlaneField: 'my', outOfPlaneField: 'mz' });
const FACTOR_PROFILE_ID = 'B31_3_2022_B31J_2017';
const SIF_TOLERANCE_PERCENT = BM4_COMPARISON_POLICY.targetTolerancePercent;

function subtract(left, right) {
  return Object.fromEntries(['fx', 'fy', 'fz', 'mx', 'my', 'mz']
    .map((field) => [field, (left?.[field] ?? 0) - (right?.[field] ?? 0)]));
}
function pairKey(entry) { return `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`; }
function sourceActions(solved, recovery) {
  const recovered = new Map(recovery.elementActions.map((row) => [row.elementId, row]));
  const out = new Map();
  for (const sourceEntry of solved.authorities.base.entries) {
    const sourceId = String(sourceEntry.sourceSegment.id);
    const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === sourceId);
    const first = recovered.get(descendants[0]?.elementId);
    const last = recovered.get(descendants.at(-1)?.elementId);
    if (!first || !last) throw new Error(`M045 missing recovered source actions for ${sourceId}.`);
    out.set(pairKey(sourceEntry), Object.freeze({
      sourceId,
      fromNode: String(sourceEntry.sourceSegment.startNodeId),
      toNode: String(sourceEntry.sourceSegment.endNodeId),
      local: Object.freeze({ I: first.local.I, J: last.local.J }),
    }));
  }
  return out;
}
function sourceCases(solved) {
  const sus = sourceActions(solved, solved.sustained.recovery);
  const ope = sourceActions(solved, solved.operating.recovery);
  const exp = new Map();
  for (const [key, hot] of ope) {
    const cold = sus.get(key);
    exp.set(key, Object.freeze({
      sourceId: hot.sourceId,
      fromNode: hot.fromNode,
      toNode: hot.toNode,
      local: Object.freeze({ I: subtract(hot.local.I, cold.local.I), J: subtract(hot.local.J, cold.local.J) }),
    }));
  }
  return new Map([['SUS', sus], ['OPE', ope], ['EXP', exp]]);
}
function absTolerance(field) {
  return ['fx', 'fy', 'fz'].includes(field)
    ? BM4_COMPARISON_POLICY.absoluteTolerance.force
    : BM4_COMPARISON_POLICY.absoluteTolerance.moment;
}
function compareMechanical(ours, cii, field) {
  const delta = ours - cii;
  const absDelta = Math.abs(delta);
  const nearZero = Math.abs(cii) <= BM4_COMPARISON_POLICY.nearZeroReferenceThreshold;
  const absPercent = nearZero ? null : absDelta / Math.abs(cii) * 100;
  return Object.freeze({
    ours, cii, delta, absDelta, absPercent,
    passed: nearZero ? absDelta <= absTolerance(field) : absPercent <= BM4_COMPARISON_POLICY.targetTolerancePercent,
  });
}
function sourceMeta(solved) {
  return new Map(solved.authorities.base.entries.map((entry) => [String(entry.sourceSegment.id), Object.freeze({
    sourceId: String(entry.sourceSegment.id),
    pairKey: pairKey(entry),
    fromNode: String(entry.sourceSegment.startNodeId),
    toNode: String(entry.sourceSegment.endNodeId),
    sourceType: entry.sourceSegment.type,
    sourceComponentUid: entry.sourceSegment.sourceComponentUid ?? null,
    hasBend: entry.sourceSegment.type === 'BEND',
  })]));
}
function mechanicalRows(solved, cii, oursByCase) {
  const meta = sourceMeta(solved);
  const rows = [];
  const unmatched = [];
  for (const caseLabel of CASES) {
    const ours = oursByCase.get(caseLabel);
    for (const [key, authorityRows] of cii.localForce.get(caseLabel).byPair) {
      const actual = ours.get(key);
      if (authorityRows.length !== 1 || !actual) {
        unmatched.push(Object.freeze({ caseLabel, pairKey: key, authorityRowCount: authorityRows.length, oursPresent: Boolean(actual) }));
        continue;
      }
      const source = meta.get(actual.sourceId);
      const reference = authorityRows[0];
      for (const end of ENDS) for (const field of FIELD_META.keys()) {
        const level = FIELD_META.get(field);
        rows.push(Object.freeze({
          ...source,
          caseLabel,
          end,
          nodeId: end === 'I' ? actual.fromNode : actual.toNode,
          field,
          level: level.level,
          levelName: level.name,
          units: level.units,
          ...compareMechanical(actual.local[end][field], reference[end][field], field),
        }));
      }
    }
  }
  return Object.freeze({ rows: Object.freeze(rows), unmatched: Object.freeze(unmatched) });
}
function aggregateRows(rows) {
  if (!rows.length) return Object.freeze({ compared: 0, passed: 0, failed: 0, passRate: null, mae: null, maxAbsDelta: null, worst: null });
  const passed = rows.filter((row) => row.passed).length;
  const worst = [...rows].sort((a, b) => b.absDelta - a.absDelta || a.pairKey.localeCompare(b.pairKey))[0];
  return Object.freeze({
    compared: rows.length,
    passed,
    failed: rows.length - passed,
    passRate: passed / rows.length,
    mae: rows.reduce((sum, row) => sum + row.absDelta, 0) / rows.length,
    maxAbsDelta: worst.absDelta,
    worst,
  });
}
function bendingResultantRows(rows) {
  const groups = new Map();
  for (const row of rows.filter((entry) => ['my', 'mz'].includes(entry.field))) {
    const key = `${row.caseLabel}:${row.sourceId}:${row.end}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].flatMap((group) => {
    const my = group.find((row) => row.field === 'my');
    const mz = group.find((row) => row.field === 'mz');
    if (!my || !mz) return [];
    const ours = Math.hypot(my.ours, mz.ours);
    const cii = Math.hypot(my.cii, mz.cii);
    return [Object.freeze({
      caseLabel: my.caseLabel, sourceId: my.sourceId, pairKey: my.pairKey, end: my.end, nodeId: my.nodeId,
      ...compareMechanical(ours, cii, 'my'),
    })];
  });
}
function componentMechanicalSummary(solved, rows, unmatched) {
  const meta = sourceMeta(solved);
  const unmatchedPairs = new Set(unmatched.map((row) => row.pairKey));
  return [...meta.values()].map((source) => {
    const own = rows.filter((row) => row.sourceId === source.sourceId);
    const firstFailed = LEVELS.find((level) => own.some((row) => row.level === level.level && !row.passed)) ?? null;
    return Object.freeze({
      ...source,
      oneToOneMechanicalAuthorityAvailable: own.length > 0,
      sourcePairInUnmatchedAuthorityBoundary: unmatchedPairs.has(source.pairKey),
      firstFailedLevel: firstFailed ? Object.freeze({ level: firstFailed.level, name: firstFailed.name }) : null,
      byLevel: Object.fromEntries(LEVELS.map((level) => [level.name, aggregateRows(own.filter((row) => row.level === level.level))])),
    });
  });
}

function numPair(inner, tag) {
  const element = findElements(inner, tag)[0];
  return element ? Object.freeze({ I: Number(element.attributes.FROM), J: Number(element.attributes.TO) }) : null;
}
function caseNumber(label) {
  const match = /^CASE\s+(\d+)\b/u.exec(String(label ?? '').trim());
  return match ? Number(match[1]) : null;
}
function stressCases(xml) {
  const byCase = new Map();
  for (const report of findElements(xml, 'STRESS_REPORT')) {
    const number = caseNumber(report.attributes.LOADCASE);
    const label = Object.keys(CASE_NUMBER).find((key) => CASE_NUMBER[key] === number);
    if (!label) continue;
    const rows = findElements(report.inner, 'ELEMENT').map((element) => Object.freeze({
      fromNode: String(element.attributes.FROM_NODE),
      toNode: String(element.attributes.TO_NODE),
      pairKey: `${element.attributes.FROM_NODE}-${element.attributes.TO_NODE}`,
      sifInPlane: numPair(element.inner, 'SIF_IN_PLANE'),
      sifOutPlane: numPair(element.inner, 'SIF_OUT_PLANE'),
      axialStress: numPair(element.inner, 'AXIAL_STRESS'),
      bendingStress: numPair(element.inner, 'BENDING_STRESS'),
      torsionStress: numPair(element.inner, 'TORSION_STRESS'),
      codeStress: numPair(element.inner, 'CODE_STRESS'),
      allowableStress: numPair(element.inner, 'ALLOWABLE_STRESS'),
    }));
    byCase.set(label, Object.freeze({ rows: Object.freeze(rows), byPair: new Map(rows.map((row) => [row.pairKey, row])) }));
  }
  return byCase;
}
function realNode(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? String(number).replace(/\.0+$/u, '') : null;
}
function bendDescriptors(inputXml, solved) {
  const sourceByPair = new Map(solved.authorities.base.entries.map((entry) => [pairKey(entry), String(entry.sourceSegment.id)]));
  const descriptors = [];
  for (const pipe of findElements(inputXml, 'PIPINGELEMENT')) {
    const bend = findElements(pipe.inner, 'BEND')[0];
    if (!bend) continue;
    const fromNode = realNode(pipe.attributes.FROM_NODE);
    const toNode = realNode(pipe.attributes.TO_NODE);
    const sourceId = sourceByPair.get(`${fromNode}-${toNode}`);
    if (!sourceId) throw new Error(`M045 cannot bind InputXML bend ${fromNode}-${toNode} to source geometry.`);
    const internal = ['NODE1', 'NODE2', 'NODE3'].map((key) => realNode(bend.attributes[key])).filter(Boolean);
    const sequence = [fromNode, ...internal, toNode];
    descriptors.push(Object.freeze({
      sourceId, fromNode, toNode, sequence: Object.freeze(sequence),
      stressPairs: Object.freeze(sequence.slice(0, -1).map((node, index) => `${node}-${sequence[index + 1]}`)),
    }));
  }
  return Object.freeze(descriptors);
}
function compareSif(ours, cii) {
  const delta = ours - cii;
  const absDelta = Math.abs(delta);
  const absPercent = absDelta / Math.max(Math.abs(cii), 1e-12) * 100;
  return Object.freeze({ ours, cii, delta, absDelta, absPercent, passed: absPercent <= SIF_TOLERANCE_PERCENT });
}
function bendFactorResults(solved) {
  const bendIds = solved.authorities.sourceGeometry.segments.filter((row) => row.type === 'BEND').map((row) => row.id);
  const results = calculateB31FactorsFromCanonicalGeometry({
    canonicalGeometry: solved.authorities.sourceGeometry,
    editionProfileId: FACTOR_PROFILE_ID,
    momentDirectionMapping: MOMENT_DIRECTION_MAPPING,
    segmentIds: bendIds,
  });
  return new Map(results.map((result) => [String(result.componentId), result]));
}
function bendSifRows(solved, stresses, descriptors, factors) {
  const rows = [];
  const componentBySource = new Map(solved.authorities.bendExpansion.components.map((component) => [component.componentId.replace(/^IXBEND\./u, ''), component]));
  for (const descriptor of descriptors) {
    const factor = factors.get(descriptor.sourceId);
    const component = componentBySource.get(descriptor.sourceId);
    assert.ok(factor && factor.status === 'QUALIFIED', `M045 bend ${descriptor.sourceId} factor result must qualify.`);
    assert.ok(component, `M045 bend ${descriptor.sourceId} component missing.`);
    const k = factor.factors.flexibility.inPlane;
    assert.ok(Math.abs(k - component.flexibility.factor) <= 1e-9 * Math.max(k, 1), `M045 bend ${descriptor.sourceId} k drifted from assembled component.`);
    for (const caseLabel of CASES) {
      const expected = caseLabel === 'SUS' ? factor.factors.sustainedIndices : factor.factors.displacementSifs;
      for (const pair of descriptor.stressPairs) {
        const authority = stresses.get(caseLabel).byPair.get(pair);
        if (!authority) continue;
        for (const end of ENDS) {
          const nodeId = end === 'I' ? authority.fromNode : authority.toNode;
          if (nodeId === descriptor.fromNode) continue;
          const inPlane = authority.sifInPlane?.[end];
          const outPlane = authority.sifOutPlane?.[end];
          if (![inPlane, outPlane].some((value) => Number.isFinite(value) && Math.abs(value - 1) > 1e-9)) continue;
          if (Number.isFinite(inPlane)) rows.push(Object.freeze({
            family: 'BEND', componentId: component.componentId, sourceId: descriptor.sourceId, role: 'BEND', caseLabel,
            pairKey: pair, end, nodeId, direction: 'IN_PLANE',
            ...compareSif(expected.inPlaneBending, inPlane),
            caesarStress: Object.freeze({ axial: authority.axialStress?.[end] ?? null, bending: authority.bendingStress?.[end] ?? null, torsion: authority.torsionStress?.[end] ?? null, code: authority.codeStress?.[end] ?? null }),
          }));
          if (Number.isFinite(outPlane)) rows.push(Object.freeze({
            family: 'BEND', componentId: component.componentId, sourceId: descriptor.sourceId, role: 'BEND', caseLabel,
            pairKey: pair, end, nodeId, direction: 'OUT_OF_PLANE',
            ...compareSif(expected.outOfPlaneBending, outPlane),
            caesarStress: Object.freeze({ axial: authority.axialStress?.[end] ?? null, bending: authority.bendingStress?.[end] ?? null, torsion: authority.torsionStress?.[end] ?? null, code: authority.codeStress?.[end] ?? null }),
          }));
        }
      }
    }
  }
  return Object.freeze(rows);
}
function point(geometry, nodeId) {
  const node = geometry.nodes.find((row) => String(row.id) === String(nodeId));
  if (!node) throw new Error(`M045 node ${nodeId} missing.`);
  return [node.x, node.y, node.z];
}
function teeSifRows(solved, stresses, descriptors) {
  const bendBySource = new Map(descriptors.map((row) => [row.sourceId, row]));
  const rows = [];
  for (const junction of solved.authorities.teeJunctions) {
    const junctionNode = String(junction.junctionNodeId);
    const incident = solved.authorities.sourceGeometry.segments.filter((segment) =>
      String(segment.startNodeId) === junctionNode || String(segment.endNodeId) === junctionNode);
    const topologyLegs = incident.map((segment) => {
      const atI = String(segment.startNodeId) === junctionNode;
      return { legId: String(segment.id), endPoint: point(solved.authorities.sourceGeometry, atI ? segment.endNodeId : segment.startNodeId) };
    });
    const classified = classifyBranchLegs(topologyLegs, point(solved.authorities.sourceGeometry, junctionNode), 1e-9);
    const roleById = new Map(classified.legs.map((row) => [String(row.legId), row.role === 'BRANCH' ? 'branch' : 'run']));
    for (const segment of incident) {
      const sourceId = String(segment.id);
      const role = roleById.get(sourceId);
      const atI = String(segment.startNodeId) === junctionNode;
      const descriptor = bendBySource.get(sourceId);
      const candidatePairs = descriptor?.stressPairs ?? [`${segment.startNodeId}-${segment.endNodeId}`];
      for (const caseLabel of CASES) {
        const expected = caseLabel === 'SUS'
          ? junction.factorResult.factors.sustainedIndices[role]
          : junction.factorResult.factors.displacementSifs[role];
        const authority = candidatePairs.map((key) => stresses.get(caseLabel).byPair.get(key)).find((row) => row && (row.fromNode === junctionNode || row.toNode === junctionNode));
        if (!authority) continue;
        const end = authority.fromNode === junctionNode ? 'I' : 'J';
        const inPlane = authority.sifInPlane?.[end];
        const outPlane = authority.sifOutPlane?.[end];
        if (Number.isFinite(inPlane)) rows.push(Object.freeze({
          family: 'TEE', componentId: junction.factorResult.componentId, sourceId, role, caseLabel,
          pairKey: authority.pairKey, end, nodeId: junctionNode, direction: 'IN_PLANE',
          ...compareSif(expected.inPlaneBending, inPlane),
          caesarStress: Object.freeze({ axial: authority.axialStress?.[end] ?? null, bending: authority.bendingStress?.[end] ?? null, torsion: authority.torsionStress?.[end] ?? null, code: authority.codeStress?.[end] ?? null }),
        }));
        if (Number.isFinite(outPlane)) rows.push(Object.freeze({
          family: 'TEE', componentId: junction.factorResult.componentId, sourceId, role, caseLabel,
          pairKey: authority.pairKey, end, nodeId: junctionNode, direction: 'OUT_OF_PLANE',
          ...compareSif(expected.outOfPlaneBending, outPlane),
          caesarStress: Object.freeze({ axial: authority.axialStress?.[end] ?? null, bending: authority.bendingStress?.[end] ?? null, torsion: authority.torsionStress?.[end] ?? null, code: authority.codeStress?.[end] ?? null }),
        }));
      }
    }
  }
  return Object.freeze(rows);
}
function sifStats(rows) {
  return Object.freeze({
    compared: rows.length,
    passed: rows.filter((row) => row.passed).length,
    failed: rows.filter((row) => !row.passed).length,
    maxAbsPercent: rows.length ? Math.max(...rows.map((row) => row.absPercent)) : null,
    worst: [...rows].sort((a, b) => b.absPercent - a.absPercent)[0] ?? null,
  });
}
function kInventory(solved, factors) {
  const bends = solved.authorities.bendExpansion.components.map((component) => Object.freeze({
    family: 'BEND', componentId: component.componentId, sourceId: component.componentId.replace(/^IXBEND\./u, ''),
    lfeaK: component.flexibility.factor,
    recomputedK: factors.get(component.componentId.replace(/^IXBEND\./u, '')).factors.flexibility.inPlane,
    caesarDirectComputedK: null,
    comparisonStatus: 'NO_DIRECT_CAESAR_COMPUTED_K_IN_PINNED_INPUT_OUTPUT',
  }));
  const tees = solved.authorities.teeJunctions.flatMap((junction) => ['run', 'branch'].map((role) => Object.freeze({
    family: 'TEE', componentId: junction.factorResult.componentId, junctionNodeId: junction.junctionNodeId, role,
    lfeaDirectionalK: junction.factorResult.factors.flexibility[role],
    caesarDirectComputedK: null,
    comparisonStatus: 'NO_DIRECT_CAESAR_COMPUTED_K_IN_PINNED_INPUT_OUTPUT',
  })));
  return Object.freeze({ bends: Object.freeze(bends), tees: Object.freeze(tees) });
}

const solved = solveBm4M035M036Combined();
const rawCii = loadBm4CiiOutputCases1921();
const cii = normalizeBm4CiiLocalForceForM035(rawCii, solved.authorities);
const oursByCase = sourceCases(solved);
const mechanics = mechanicalRows(solved, cii, oursByCase);
const components = componentMechanicalSummary(solved, mechanics.rows, mechanics.unmatched);
const bendingResultants = bendingResultantRows(mechanics.rows);
const inputXml = readFileSync(BM4_INPUT_PATH, 'utf8');
const outputXml = readFileSync(BM4_OUTPUT_PATH, 'utf8');
const stresses = stressCases(outputXml);
const descriptors = bendDescriptors(inputXml, solved);
const bendFactors = bendFactorResults(solved);
const bendSifs = bendSifRows(solved, stresses, descriptors, bendFactors);
const teeSifs = teeSifRows(solved, stresses, descriptors);
const sifs = Object.freeze([...bendSifs, ...teeSifs]);
const k = kInventory(solved, bendFactors);

assert.equal(mechanics.rows.length, 2988, 'M045 expects 498 matched ends x 6 local action components.');
assert.equal(mechanics.unmatched.length, 84, 'M045 must preserve M042 station-attribution boundary.');
assert.equal(descriptors.length, 12, 'M045 expects 12 BM4 InputXML bends.');
assert.equal(bendFactors.size, 12, 'M045 expects 12 qualified bend factor results.');
assert.ok(sifs.length > 0, 'M045 requires mapped bend/tee SIF comparisons.');

const mechanicalByLevel = Object.fromEntries(LEVELS.map((level) => [level.name, aggregateRows(mechanics.rows.filter((row) => row.level === level.level))]));
const mechanicalByCaseField = Object.fromEntries(CASES.map((caseLabel) => [caseLabel, Object.fromEntries(
  [...FIELD_META.keys()].map((field) => [field, aggregateRows(mechanics.rows.filter((row) => row.caseLabel === caseLabel && row.field === field))]),
)]));
const firstFailureDistribution = Object.fromEntries(LEVELS.map((level) => [level.name, components.filter((component) => component.firstFailedLevel?.level === level.level).length]));
firstFailureDistribution.NO_FAILURE_ON_COMPARABLE_LEVELS_1_TO_4 = components.filter((component) => component.oneToOneMechanicalAuthorityAvailable && component.firstFailedLevel === null).length;
firstFailureDistribution.NO_ONE_TO_ONE_FORCE_MOMENT_AUTHORITY = components.filter((component) => !component.oneToOneMechanicalAuthorityAvailable).length;

const report = Object.freeze({
  schema: 'lfea-m045-bm4-component-hierarchy/v1',
  targetCases: Object.freeze({ SUS: 19, OPE: 20, EXP: 21 }),
  hierarchy: Object.freeze([
    ...LEVELS,
    Object.freeze({ level: 5, name: 'SIF_IN_PLANE_OUT_OF_PLANE' }),
    Object.freeze({ level: 6, name: 'FLEXIBILITY_FACTOR_K' }),
    Object.freeze({ level: 7, name: 'FINAL_CODE_BEND_STRESS' }),
  ]),
  mechanics: Object.freeze({
    comparisonSpace: 'CAESAR_GLOBAL_RESULTANTS_PROJECTED_TO_LFEA_QUALIFIED_LOCAL_AXES',
    comparedRows: mechanics.rows.length,
    unmatchedAuthorityPairRecords: mechanics.unmatched.length,
    byLevel: Object.freeze(mechanicalByLevel),
    byCaseField: Object.freeze(mechanicalByCaseField),
    bendingResultantSecondary: aggregateRows(bendingResultants),
    firstFailureDistribution: Object.freeze(firstFailureDistribution),
    components: Object.freeze(components),
    rows: mechanics.rows,
    unmatched: mechanics.unmatched,
  }),
  sif: Object.freeze({
    comparisonPolicyPercent: SIF_TOLERANCE_PERCENT,
    overall: sifStats(sifs),
    byFamily: Object.freeze({ BEND: sifStats(bendSifs), TEE: sifStats(teeSifs) }),
    byCase: Object.fromEntries(CASES.map((caseLabel) => [caseLabel, sifStats(sifs.filter((row) => row.caseLabel === caseLabel))])),
    rows: sifs,
  }),
  flexibility: Object.freeze({
    caesarDirectComputedKAvailable: false,
    authorityBoundary: 'NO_DIRECT_CAESAR_COMPUTED_FLEXIBILITY_FACTOR_IN_PINNED_INPUT_OUTPUT; INPUT_BEND_KFACTOR_IS_UNSET_SENTINEL_AND_OUTPUT_HAS_NO_K/FLEXIBILITY_TAG',
    inferenceFromStressOrSifProhibited: true,
    inventory: k,
  }),
  stress: Object.freeze({
    caesarDecompositionAvailable: true,
    caesarFields: Object.freeze(['AXIAL_STRESS', 'BENDING_STRESS', 'TORSION_STRESS', 'CODE_STRESS', 'ALLOWABLE_STRESS']),
    lfeaBm4QualifiedComparisonAvailable: false,
    reason: 'M035_M036_RECOVERY_INTENTIONALLY_RUNS_WITH_RECOVER_COMPONENT_CODE_POINTS_FALSE; DO_NOT_RECREATE_CODE_STRESS_AD_HOC',
    nextBoundary: 'ENABLE_QUALIFIED_BM4_CODE_POINT_RECOVERY_AND_EXISTING_B31_APPLICATION_PATH_BEFORE_NUMERICAL_STRESS_COMPARISON',
  }),
  disposition: Object.freeze({
    mechanicsChangedByM045: false,
    forcmntChangedByM045: false,
    bourdonErrorConcluded: false,
    outputFitUsed: false,
  }),
});

const reportArg = process.argv.indexOf('--report');
if (reportArg >= 0) {
  const requested = process.argv[reportArg + 1];
  if (!requested) throw new Error('--report requires a path.');
  const path = resolve(requested);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(`M045 mechanics rows: ${report.mechanics.comparedRows}; unmatched station records: ${report.mechanics.unmatchedAuthorityPairRecords}.`);
for (const level of LEVELS) {
  const stat = report.mechanics.byLevel[level.name];
  console.log(`M045 ${level.name}: ${stat.passed}/${stat.compared} pass (${(100 * stat.passRate).toFixed(2)}%); MAE=${stat.mae.toFixed(3)} ${level.units}; max=${stat.maxAbsDelta.toFixed(3)} ${level.units}.`);
}
for (const caseLabel of CASES) for (const field of FIELD_META.keys()) {
  const stat = report.mechanics.byCaseField[caseLabel][field];
  console.log(`M045 ${caseLabel} ${field}: ${stat.passed}/${stat.compared} (${(100 * stat.passRate).toFixed(2)}%).`);
}
console.log(`M045 component first-failure distribution: ${JSON.stringify(report.mechanics.firstFailureDistribution)}`);
console.log(`M045 SIF overall: ${report.sif.overall.passed}/${report.sif.overall.compared} pass; max error=${report.sif.overall.maxAbsPercent.toFixed(4)}%.`);
console.log(`M045 bend SIF: ${report.sif.byFamily.BEND.passed}/${report.sif.byFamily.BEND.compared}; tee SIF: ${report.sif.byFamily.TEE.passed}/${report.sif.byFamily.TEE.compared}.`);
console.log('M045 k: LFEA factor inventory emitted; direct CAESAR computed-k authority unavailable, so no inferred k comparison.');
console.log('M045 stress: CAESAR decomposition inventoried; LFEA numerical stress comparison blocked until qualified BM4 code-point recovery is enabled.');

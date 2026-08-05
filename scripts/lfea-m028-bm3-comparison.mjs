import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import { CASE_KEYS, solveBm3InputXml } from './lfea-m028-bm3-fixtures.mjs';

export const BM3_OUTPUT_PATH = fileURLToPath(new URL('../benchmarks/LFEA/BM3/BM3_Output.xml', import.meta.url));
export const PERCENT_LIMIT = 10;
const MM_PER_M = 1000;
const DEG_PER_RAD = 180 / Math.PI;
const DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const ACTION_FIELDS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);
const ZERO_TOLERANCE = Object.freeze({
  displacementTranslation: 1e-6,
  displacementRotation: 1e-6,
  reactionForce: 1,
  reactionMoment: 1,
  elementForce: 1,
  elementMoment: 1,
});

function caseKey(loadcase) {
  const match = /^CASE\s+(\d+)\s+\(([A-Z]+)\)/u.exec(loadcase ?? '');
  if (!match) throw new Error(`Unrecognised BM3 LOADCASE label: ${loadcase}`);
  return `CASE${match[1]}_${match[2]}`;
}

function number(attributes, key) {
  const value = Number(attributes[key]);
  if (!Number.isFinite(value)) throw new Error(`Non-finite ${key} in BM3 CAESAR output: ${attributes[key]}`);
  return value;
}

export function parseBm3CiiOutput(xmlText) {
  const result = {
    displacement: new Map(),
    restraint: new Map(),
    globalForce: new Map(),
    localForce: new Map(),
    declaredCounts: { displacement: new Map(), restraint: new Map(), globalForce: new Map(), localForce: new Map() },
  };
  for (const report of findElements(xmlText, 'DISPLACEMENT_REPORT')) {
    const key = caseKey(report.attributes.LOADCASE);
    result.declaredCounts.displacement.set(key, Number(report.attributes.NUM_NODES));
    const rows = new Map();
    for (const node of findElements(report.inner, 'NODE')) {
      const translations = findElements(node.inner, 'TRANSLATIONS')[0];
      const rotations = findElements(node.inner, 'ROTATIONS')[0];
      rows.set(node.attributes.NUMBER, {
        UX: number(translations.attributes, 'DX') / MM_PER_M,
        UY: number(translations.attributes, 'DY') / MM_PER_M,
        UZ: number(translations.attributes, 'DZ') / MM_PER_M,
        RX: number(rotations.attributes, 'RX') / DEG_PER_RAD,
        RY: number(rotations.attributes, 'RY') / DEG_PER_RAD,
        RZ: number(rotations.attributes, 'RZ') / DEG_PER_RAD,
      });
    }
    result.displacement.set(key, rows);
  }
  for (const report of findElements(xmlText, 'RESTRAINT_REPORT')) {
    const key = caseKey(report.attributes.LOADCASE);
    result.declaredCounts.restraint.set(key, Number(report.attributes.NUM_RESTRAINTS));
    const rows = new Map();
    for (const row of findElements(report.inner, 'RESTRAINT')) {
      const forces = findElements(row.inner, 'FORCES')[0];
      const moments = findElements(row.inner, 'MOMENTS')[0];
      const nodeId = row.attributes.NODE;
      const existing = rows.get(nodeId) ?? { UX: 0, UY: 0, UZ: 0, RX: 0, RY: 0, RZ: 0, types: [] };
      rows.set(nodeId, {
        UX: existing.UX - number(forces.attributes, 'FX'),
        UY: existing.UY - number(forces.attributes, 'FY'),
        UZ: existing.UZ - number(forces.attributes, 'FZ'),
        RX: existing.RX - number(moments.attributes, 'MX'),
        RY: existing.RY - number(moments.attributes, 'MY'),
        RZ: existing.RZ - number(moments.attributes, 'MZ'),
        types: [...existing.types, row.attributes.TYPE],
      });
    }
    result.restraint.set(key, rows);
  }
  parseElementActions(xmlText, 'GLOBAL_FORCE_REPORT', result.globalForce, result.declaredCounts.globalForce);
  parseElementActions(xmlText, 'LOCAL_FORCE_REPORT', result.localForce, result.declaredCounts.localForce);
  for (const key of CASE_KEYS) {
    for (const family of ['displacement', 'restraint', 'globalForce', 'localForce']) {
      if (!result[family].has(key)) throw new Error(`BM3_Output.xml is missing ${family} for ${key}.`);
    }
  }
  return result;
}

function parseElementActions(xmlText, tag, destination, declaredCounts) {
  for (const report of findElements(xmlText, tag)) {
    const key = caseKey(report.attributes.LOADCASE);
    declaredCounts.set(key, Number(report.attributes.NUM_ELEMENTS));
    const rows = new Map();
    for (const row of findElements(report.inner, 'ELEMENT')) {
      const forces = findElements(row.inner, 'FORCES')[0];
      const moments = findElements(row.inner, 'MOMENTS')[0];
      const fromF = findElements(forces.inner, 'FROM')[0];
      const toF = findElements(forces.inner, 'TO')[0];
      const fromM = findElements(moments.inner, 'FROM')[0];
      const toM = findElements(moments.inner, 'TO')[0];
      rows.set(`${row.attributes.FROM_NODE}-${row.attributes.TO_NODE}`, {
        I: {
          fx: number(fromF.attributes, 'FX'), fy: number(fromF.attributes, 'FY'), fz: number(fromF.attributes, 'FZ'),
          mx: number(fromM.attributes, 'MX'), my: number(fromM.attributes, 'MY'), mz: number(fromM.attributes, 'MZ'),
        },
        J: {
          fx: number(toF.attributes, 'FX'), fy: number(toF.attributes, 'FY'), fz: number(toF.attributes, 'FZ'),
          mx: number(toM.attributes, 'MX'), my: number(toM.attributes, 'MY'), mz: number(toM.attributes, 'MZ'),
        },
      });
    }
    destination.set(key, rows);
  }
}

export function buildBm3CiiComparison() {
  const solved = solveBm3InputXml();
  const cii = parseBm3CiiOutput(readFileSync(BM3_OUTPUT_PATH, 'utf8'));
  const sourceSegments = new Map(solved.normalized.geometry.segments.map((row) => [`${row.startNodeId}-${row.endNodeId}`, row]));
  const cases = {};
  const allEntries = [];
  for (const key of CASE_KEYS) {
    const ours = solved.report.cases[key];
    const displacement = [];
    for (const [nodeId, reference] of cii.displacement.get(key)) {
      const actual = ours.nodes.get(nodeId)?.displacement;
      if (!actual) throw new Error(`M028 has no source displacement identity for ${key} node ${nodeId}.`);
      displacement.push(compareVector({ key, family: 'displacement', identity: `node ${nodeId}`, actual, reference, fields: DOFS, context: { nodeId } }));
    }
    const restraint = [];
    for (const [nodeId, reference] of cii.restraint.get(key)) {
      const actual = ours.nodes.get(nodeId)?.reaction ?? Object.fromEntries(DOFS.map((dof) => [dof, 0]));
      restraint.push(compareVector({ key, family: 'restraint', identity: `node ${nodeId}`, actual, reference, fields: DOFS, context: { nodeId, types: reference.types } }));
    }
    const globalForce = compareActionFamily({ key, family: 'globalForce', actual: ours.pairs, reference: cii.globalForce.get(key), sourceSegments });
    const localForce = compareActionFamily({ key, family: 'localForce', actual: ours.pairs, reference: cii.localForce.get(key), sourceSegments });
    const caseEntries = [...displacement.flatMap((row) => row.entries), ...restraint.flatMap((row) => row.entries), ...globalForce.flatMap((row) => row.entries), ...localForce.flatMap((row) => row.entries)];
    allEntries.push(...caseEntries);
    cases[key] = {
      displacement: { matched: displacement, summary: summarize(displacement.flatMap((row) => row.entries)) },
      restraint: { matched: restraint, summary: summarize(restraint.flatMap((row) => row.entries)) },
      globalForce: { matched: globalForce, summary: summarize(globalForce.flatMap((row) => row.entries)) },
      localForce: { matched: localForce, summary: summarize(localForce.flatMap((row) => row.entries)) },
      summary: summarize(caseEntries),
    };
  }
  const summary = { ...summarize(allEntries) };
  summary.byCase = Object.fromEntries(CASE_KEYS.map((key) => [key, cases[key].summary]));
  summary.byFamily = Object.fromEntries(['displacement', 'restraint', 'globalForce', 'localForce'].map((family) => [
    family,
    summarize(allEntries.filter((row) => row.family === family)),
  ]));
  summary.byCause = summarizeCauses(allEntries.filter((row) => !row.pass));
  return Object.freeze({
    schema: 'm028-bm3-cii-output-comparison/v1',
    inputSourceSemanticHash: solved.source.semanticHash,
    outputPath: 'benchmarks/LFEA/BM3/BM3_Output.xml',
    methodology: {
      percentLimit: PERCENT_LIMIT,
      zeroReferenceTolerances: ZERO_TOLERANCE,
      reactionSignConvention: 'CAESAR restraint hardware actions are negated to reactions applied to the structure.',
      matching: 'node number for displacement/restraint; exact FROM_NODE-TO_NODE for global/local element actions.',
      attribution: 'Failures carry one or more named unresolved authorities capable of affecting the value. Attribution is scoped, deterministic, and is not claimed to be an exclusive inverse solution.',
    },
    declaredCounts: Object.fromEntries(Object.entries(cii.declaredCounts).map(([family, rows]) => [family, Object.fromEntries(rows)])),
    ingestion: solved.report.counts,
    gaps: solved.report.gaps,
    solverQualification: solved.report.solverQualification,
    cases,
    summary,
    failures: allEntries.filter((row) => !row.pass),
  });
}

function compareActionFamily({ key, family, actual, reference, sourceSegments }) {
  const rows = [];
  for (const [pairKey, expected] of reference) {
    const pair = actual.get(pairKey)?.[family === 'globalForce' ? 'global' : 'local'];
    if (!pair) throw new Error(`M028 has no ${family} identity for ${key} element ${pairKey}.`);
    const sourceSegment = sourceSegments.get(pairKey);
    const entries = [];
    for (const end of ['I', 'J']) {
      entries.push(...compareVector({
        key,
        family,
        identity: `element ${pairKey} ${end}`,
        actual: pair[end],
        reference: expected[end],
        fields: ACTION_FIELDS,
        context: { pairKey, end, sourceSegment },
      }).entries);
    }
    rows.push({ pairKey, entries });
  }
  return rows;
}

function compareVector({ key, family, identity, actual, reference, fields, context }) {
  const entries = fields.map((component) => classify({
    caseKey: key,
    family,
    identity,
    component,
    ours: actual[component],
    caesar: reference[component],
    zeroTolerance: toleranceFor(family, component),
    causes: causesFor({ caseKey: key, family, component, context }),
  }));
  return { identity, entries };
}

function classify({ caseKey, family, identity, component, ours, caesar, zeroTolerance, causes }) {
  const absoluteDifference = ours - caesar;
  const referenceMagnitude = Math.abs(caesar);
  const nearZeroReference = referenceMagnitude <= zeroTolerance;
  const percentDifference = nearZeroReference ? null : (absoluteDifference / referenceMagnitude) * 100;
  const pass = nearZeroReference
    ? Math.abs(absoluteDifference) <= zeroTolerance
    : Math.abs(percentDifference) <= PERCENT_LIMIT;
  return Object.freeze({
    caseKey,
    family,
    identity,
    component,
    ours,
    caesar,
    absoluteDifference,
    percentDifference,
    nearZeroReference,
    zeroTolerance,
    pass,
    causes: pass ? [] : causes,
  });
}

function toleranceFor(family, component) {
  if (family === 'displacement') return component.startsWith('R') ? ZERO_TOLERANCE.displacementRotation : ZERO_TOLERANCE.displacementTranslation;
  if (family === 'restraint') return component.startsWith('R') ? ZERO_TOLERANCE.reactionMoment : ZERO_TOLERANCE.reactionForce;
  return component.startsWith('m') ? ZERO_TOLERANCE.elementMoment : ZERO_TOLERANCE.elementForce;
}

function causesFor({ caseKey, family, context }) {
  const causes = [{
    code: 'HANGER_SUPPORT_NOT_COMPILED',
    scope: 'SYSTEM_WIDE_CASE_STIFFNESS_AND_PRELOAD',
    detail: `${caseKey} contains H in the CAESAR formula; the two hanger spring/preload authorities are intentionally absent.`,
  }];
  if (['CASE5_OCC', 'CASE6_EXP', 'CASE7_EXP'].includes(caseKey)) {
    causes.push({
      code: 'DECLARED_FORCE_F1_NOT_COMPILED',
      scope: 'SYSTEM_WIDE_CASE_LOAD_PATH',
      detail: `${caseKey} contains or is derived from CASE5 OCC, where F1 at nodes 65 and 100 is intentionally absent.`,
    });
  }
  const segment = context.sourceSegment;
  if (segment?.type === 'BEND') {
    causes.push({
      code: 'BEND_SOURCE_SPAN_COMPILED_AS_STRAIGHT_CHORD',
      scope: `${family.toUpperCase()}_SOURCE_ELEMENT`,
      detail: `Source segment ${segment.id} is a bend whose undocumented station geometry is not inferred.`,
    });
  }
  if (segment && ['IX-S16', 'IX-S23'].includes(segment.id)) {
    causes.push({
      code: 'REDUCER_CANDIDATE_PENDING_PARITY',
      scope: `${family.toUpperCase()}_SOURCE_ELEMENT`,
      detail: `Source segment ${segment.id} uses the merged ten-cylinder midpoint-sampling candidate, not verified CAESAR parity.`,
    });
  }
  return causes;
}

function summarize(entries) {
  const total = entries.length;
  const failed = entries.filter((row) => !row.pass).length;
  return Object.freeze({ total, passed: total - failed, failed });
}

function summarizeCauses(failures) {
  const counts = new Map();
  for (const failure of failures) {
    for (const cause of failure.causes) counts.set(cause.code, (counts.get(cause.code) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => [code, count]));
}

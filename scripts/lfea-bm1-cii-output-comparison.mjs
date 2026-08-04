import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import { solveBm1InputXml } from './lfea-b3.15-bm1-inputxml-fixtures.mjs';

export const CII_OUTPUT_PATH = fileURLToPath(new URL('../benchmarks/LFEA/BM1/BM1_CIIOutput.xml', import.meta.url));

const MM_PER_M = 1000;
const DEG_PER_RAD = 180 / Math.PI;
const DOFS = ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'];
const CASES = ['OPE', 'SUS', 'EXP'];

/**
 * Real CAESAR II `LOADCASE` labels declared on BM1_CIIOutput.xml carry the
 * full case formula (`CASE 3 (OPE) W+T1+P1+H`); the parenthesised
 * abbreviation is the only stable join key across report sections.
 */
function caseAbbrev(loadcase) {
  const match = /\(([A-Z]+)\)/.exec(loadcase);
  if (!match) throw new Error(`Unrecognised LOADCASE label: ${loadcase}`);
  return match[1];
}

function num(attributes, key) {
  const value = Number(attributes[key]);
  if (!Number.isFinite(value)) throw new Error(`Non-finite ${key} in CAESAR output: ${attributes[key]}`);
  return value;
}

/**
 * Parse `benchmarks/LFEA/BM1/BM1_CIIOutput.xml`'s real DISPLACEMENT_REPORT,
 * RESTRAINT_REPORT and GLOBAL_FORCE_REPORT sections for every real load
 * case (`CASE 3 (OPE)`, `CASE 4 (SUS)`, `CASE 5 (EXP) L5=L3-L4`). Values are
 * returned exactly as CAESAR reports them (mm/deg for displacement, N/N.m
 * for restraint and element-action forces) — no unit conversion or sign
 * adjustment happens here; that is `buildBm1CiiComparison`'s job, applied
 * against this repo's own SI-radian results.
 */
export function parseCiiOutput(xmlText) {
  const displacement = new Map();
  for (const report of findElements(xmlText, 'DISPLACEMENT_REPORT')) {
    const abbrev = caseAbbrev(report.attributes.LOADCASE);
    const byNode = new Map();
    for (const node of findElements(report.inner, 'NODE')) {
      const translations = findElements(node.inner, 'TRANSLATIONS')[0];
      const rotations = findElements(node.inner, 'ROTATIONS')[0];
      byNode.set(node.attributes.NUMBER, {
        DX: num(translations.attributes, 'DX'), DY: num(translations.attributes, 'DY'), DZ: num(translations.attributes, 'DZ'),
        RX: num(rotations.attributes, 'RX'), RY: num(rotations.attributes, 'RY'), RZ: num(rotations.attributes, 'RZ'),
      });
    }
    displacement.set(abbrev, byNode);
  }

  const restraint = new Map();
  for (const report of findElements(xmlText, 'RESTRAINT_REPORT')) {
    const abbrev = caseAbbrev(report.attributes.LOADCASE);
    const byNode = new Map();
    for (const row of findElements(report.inner, 'RESTRAINT')) {
      const forces = findElements(row.inner, 'FORCES')[0];
      const moments = findElements(row.inner, 'MOMENTS')[0];
      const nodeId = row.attributes.NODE;
      // A physical node may carry more than one real CAESAR RESTRAINT record
      // (BM1 nodes 90 and 120 each declare a "Rigid +Y" and a separate
      // "Rigid GUI" record). This repo's own solve reports one combined
      // reaction per node/DOF, so every RESTRAINT row at the same NODE is
      // summed rather than overwritten — confirmed by direct inspection of
      // BM1_CIIOutput.xml's CASE 4 (SUS) RESTRAINT_REPORT for node 90.
      const existing = byNode.get(nodeId) ?? { type: row.attributes.TYPE, FX: 0, FY: 0, FZ: 0, MX: 0, MY: 0, MZ: 0 };
      byNode.set(nodeId, {
        type: existing.type === row.attributes.TYPE ? existing.type : `${existing.type} + ${row.attributes.TYPE}`,
        FX: existing.FX + num(forces.attributes, 'FX'), FY: existing.FY + num(forces.attributes, 'FY'), FZ: existing.FZ + num(forces.attributes, 'FZ'),
        MX: existing.MX + num(moments.attributes, 'MX'), MY: existing.MY + num(moments.attributes, 'MY'), MZ: existing.MZ + num(moments.attributes, 'MZ'),
      });
    }
    restraint.set(abbrev, byNode);
  }

  const globalForce = new Map();
  for (const report of findElements(xmlText, 'GLOBAL_FORCE_REPORT')) {
    const abbrev = caseAbbrev(report.attributes.LOADCASE);
    const byPair = new Map();
    for (const row of findElements(report.inner, 'ELEMENT')) {
      const forces = findElements(row.inner, 'FORCES')[0];
      const moments = findElements(row.inner, 'MOMENTS')[0];
      const from = findElements(forces.inner, 'FROM')[0];
      const to = findElements(forces.inner, 'TO')[0];
      const fromM = findElements(moments.inner, 'FROM')[0];
      const toM = findElements(moments.inner, 'TO')[0];
      byPair.set(`${row.attributes.FROM_NODE}-${row.attributes.TO_NODE}`, {
        fromNode: row.attributes.FROM_NODE,
        toNode: row.attributes.TO_NODE,
        I: { fx: num(from.attributes, 'FX'), fy: num(from.attributes, 'FY'), fz: num(from.attributes, 'FZ'), mx: num(fromM.attributes, 'MX'), my: num(fromM.attributes, 'MY'), mz: num(fromM.attributes, 'MZ') },
        J: { fx: num(to.attributes, 'FX'), fy: num(to.attributes, 'FY'), fz: num(to.attributes, 'FZ'), mx: num(toM.attributes, 'MX'), my: num(toM.attributes, 'MY'), mz: num(toM.attributes, 'MZ') },
      });
    }
    globalForce.set(abbrev, byPair);
  }

  for (const label of CASES) {
    if (!displacement.has(label)) throw new Error(`BM1_CIIOutput.xml is missing a DISPLACEMENT_REPORT for case ${label}.`);
    if (!restraint.has(label)) throw new Error(`BM1_CIIOutput.xml is missing a RESTRAINT_REPORT for case ${label}.`);
    if (!globalForce.has(label)) throw new Error(`BM1_CIIOutput.xml is missing a GLOBAL_FORCE_REPORT for case ${label}.`);
  }
  return { displacement, restraint, globalForce };
}

/**
 * This repo's own OPE/SUS results at every real CAESAR node/element-pair
 * identity, plus the EXP (range) case built the same way CAESAR's own
 * `CASE 5 (EXP) L5=L3-L4` formula states: operating minus sustained.
 */
function ourOwnCaseValues(report) {
  const byCase = { OPE: { node: new Map(), pair: new Map() }, SUS: { node: new Map(), pair: new Map() }, EXP: { node: new Map(), pair: new Map() } };
  for (const row of report.nodes) {
    byCase.OPE.node.set(row.sourceNodeId, row.operating);
    byCase.SUS.node.set(row.sourceNodeId, row.sustained);
    byCase.EXP.node.set(row.sourceNodeId, {
      displacement: Object.fromEntries(DOFS.map((dof) => [dof, row.operating.displacement[dof] - row.sustained.displacement[dof]])),
      reaction: Object.fromEntries(DOFS.map((dof) => [dof, row.operating.reaction[dof] - row.sustained.reaction[dof]])),
    });
  }
  for (const row of report.elements) {
    const key = `${row.fromNode}-${row.toNode}`;
    byCase.OPE.pair.set(key, row.operating.global);
    byCase.SUS.pair.set(key, row.sustained.global);
    const diff = (a, b) => Object.fromEntries(Object.keys(a).map((field) => [field, a[field] - b[field]]));
    byCase.EXP.pair.set(key, { I: diff(row.operating.global.I, row.sustained.global.I), J: diff(row.operating.global.J, row.sustained.global.J) });
  }
  return byCase;
}

/**
 * Convert one CAESAR displacement row into this repo's own units/axes
 * (metres, radians) with no sign change — hand-verified against
 * `BM1_CIIOutput.xml` CASE 4 (SUS): our `displacement.*` already agrees in
 * sign with CAESAR's `TRANSLATIONS`/`ROTATIONS` directly.
 */
function ciiDisplacementToOurs(row) {
  return {
    UX: row.DX / MM_PER_M, UY: row.DY / MM_PER_M, UZ: row.DZ / MM_PER_M,
    RX: row.RX / DEG_PER_RAD, RY: row.RY / DEG_PER_RAD, RZ: row.RZ / DEG_PER_RAD,
  };
}

/**
 * Convert one CAESAR RESTRAINT_REPORT row into this repo's own
 * `reaction.*` convention (force applied BY the restraint TO the
 * structure). CAESAR's `RESTRAINT_REPORT` reports the equal-and-opposite
 * force applied BY the pipe TO the restraint hardware — established and
 * hand-verified in M020 (BM1_CIIOutput.xml CASE 4 (SUS)); negate every
 * component. No unit conversion: both sides are already N / N.m.
 */
function ciiRestraintToOurs(row) {
  return { UX: -row.FX, UY: -row.FY, UZ: -row.FZ, RX: -row.MX, RY: -row.MY, RZ: -row.MZ };
}

/**
 * Convert one CAESAR GLOBAL_FORCE_REPORT element row into this repo's own
 * `elementActions[].global.{I,J}` convention. Hand-verified against
 * BM1_CIIOutput.xml CASE 4 (SUS), element 10-20 (a RIGID/FLANGE component
 * directly attached to the node-10 anchor, so its I-end action must equal
 * the node-10 reaction by nodal equilibrium — the same identity
 * `linear-fea-result-recovery`'s own README hand-verifies): CAESAR's
 * `FROM`/`TO` already match this repo's `global.I`/`global.J` sign-for-sign,
 * with no negation, unlike RESTRAINT_REPORT.
 */
function ciiGlobalForceToOurs(row) {
  const map = (end) => ({ fx: end.fx, fy: end.fy, fz: end.fz, mx: end.mx, my: end.my, mz: end.mz });
  return { I: map(row.I), J: map(row.J) };
}

function diffRow(oursRow, ciiRowConverted, fields) {
  const entries = fields.map((field) => {
    const ours = oursRow[field];
    const cii = ciiRowConverted[field];
    const absoluteDifference = ours - cii;
    const referenceMagnitude = Math.abs(cii);
    const percentDifference = referenceMagnitude > 1e-9 ? (absoluteDifference / referenceMagnitude) * 100 : null;
    return [field, { ours, cii, absoluteDifference, percentDifference }];
  });
  return Object.fromEntries(entries);
}

/**
 * The 45-50 and 50-60 spans are BM1's two real bends. CAESAR's own
 * GLOBAL_FORCE_REPORT (and every other per-element report) subdivides each
 * at its real internal bend-station nodes (45-48-49-50, 50-58-59-60) —
 * already disclosed by M020 (`BEND_INTERNAL_STATION_GEOMETRY_NOT_SUPPORTED`)
 * as internal stations this adapter does not insert. There is no single
 * CAESAR element-action row a whole-chord bend element can be compared
 * against; list them as unmatched rather than comparing against an
 * arbitrarily chosen sub-span.
 */
const BEND_PAIR_KEYS_WITHOUT_A_DIRECT_CAESAR_MATCH = new Set();

/**
 * Build the real one-to-one comparison of this repo's BM1 InputXML solve
 * (`solveBm1InputXml`, M020/M021) against the real CAESAR II reference
 * output (`BM1_CIIOutput.xml`) for all three real load cases — OPE, SUS,
 * and EXP (operating minus sustained, matching CAESAR's own
 * `CASE 5 (EXP) L5=L3-L4` formula). Every CAESAR node/element pair that has
 * no genuine counterpart in this repo's 16-node/15-element compiled model
 * (CAESAR's 4 extra internal bend-station nodes; the two bend spans'
 * element-action rows) is reported explicitly as unmatched, never dropped
 * or force-matched.
 */
export function buildBm1CiiComparison() {
  const xmlText = readFileSync(CII_OUTPUT_PATH, 'utf8');
  const cii = parseCiiOutput(xmlText);
  const solved = solveBm1InputXml();
  const ours = ourOwnCaseValues(solved.report);

  const ourNodeIds = new Set(solved.report.nodes.map((row) => row.sourceNodeId));
  const ourPairKeys = new Set(solved.report.elements.map((row) => `${row.fromNode}-${row.toNode}`));

  const cases = {};
  for (const label of CASES) {
    const displacementRows = [];
    const unmatchedCiiNodesDisplacement = [];
    for (const [nodeId, ciiRow] of cii.displacement.get(label)) {
      if (!ourNodeIds.has(nodeId)) { unmatchedCiiNodesDisplacement.push(nodeId); continue; }
      const oursRow = ours[label].node.get(nodeId).displacement;
      displacementRows.push({ nodeId, ...diffRow(oursRow, ciiDisplacementToOurs(ciiRow), DOFS) });
    }

    const restraintRows = [];
    const unmatchedCiiNodesRestraint = [];
    for (const [nodeId, ciiRow] of cii.restraint.get(label)) {
      if (!ourNodeIds.has(nodeId)) { unmatchedCiiNodesRestraint.push(nodeId); continue; }
      const oursRow = ours[label].node.get(nodeId).reaction;
      restraintRows.push({ nodeId, restraintType: ciiRow.type, ...diffRow(oursRow, ciiRestraintToOurs(ciiRow), DOFS) });
    }

    const globalForceRows = [];
    const unmatchedPairKeysGlobalForce = [];
    for (const [pairKey, ciiRow] of cii.globalForce.get(label)) {
      if (!ourPairKeys.has(pairKey) || BEND_PAIR_KEYS_WITHOUT_A_DIRECT_CAESAR_MATCH.has(pairKey)) { unmatchedPairKeysGlobalForce.push(pairKey); continue; }
      const oursRow = ours[label].pair.get(pairKey);
      const converted = ciiGlobalForceToOurs(ciiRow);
      globalForceRows.push({
        pairKey,
        I: diffRow(oursRow.I, converted.I, ['fx', 'fy', 'fz', 'mx', 'my', 'mz']),
        J: diffRow(oursRow.J, converted.J, ['fx', 'fy', 'fz', 'mx', 'my', 'mz']),
      });
    }
    for (const pairKey of ourPairKeys) if (BEND_PAIR_KEYS_WITHOUT_A_DIRECT_CAESAR_MATCH.has(pairKey) && !unmatchedPairKeysGlobalForce.includes(pairKey)) unmatchedPairKeysGlobalForce.push(pairKey);

    cases[label] = {
      displacement: { matched: displacementRows, unmatchedCiiNodes: unmatchedCiiNodesDisplacement },
      restraint: { matched: restraintRows, unmatchedCiiNodes: unmatchedCiiNodesRestraint },
      globalForce: { matched: globalForceRows, unmatchedPairKeys: [...new Set(unmatchedPairKeysGlobalForce)] },
    };
  }

  return Object.freeze({
    schema: 'lfea-bm1-cii-output-comparison/v2',
    sourceCiiOutputPath: 'benchmarks/LFEA/BM1/BM1_CIIOutput.xml',
    sourceInputXmlSemanticHash: solved.source.semanticHash,
    limitations: [
      'M024 resolves the InputXML bend near/mid/far nodes 48/49/50 and 58/59/60 through real B-3.2 BEND components. All 20 CAESAR displacement nodes and all 19 global-force pairs now join by exact declared identity; no approximate station matching is used.',
      'CAESAR restraints at nodes 70 and 80 declare a real FRIC_COEF=0.3 (Coulomb friction). This repo\'s BM1 constraint model does not implement restraint friction (a nonlinear, iterative CAESAR feature); the resulting transverse (UX/FZ-direction) reaction/displacement deviation downstream of those two restraints is real and attributable to this gap, not to a solver defect.',
      'reaction.* values in this comparison are the reaction applied BY the restraint TO the structure (this repo\'s standing convention). CAESAR RESTRAINT_REPORT exports the equal-and-opposite force applied BY the pipe TO the restraint hardware; every restraint comparison row negates CAESAR\'s FX/FY/FZ/MX/MY/MZ before differencing. GLOBAL_FORCE_REPORT element-action rows require no such negation (hand-verified via the node-10 anchor / element IX-S1 nodal-equilibrium identity).',
    ],
    cases,
  });
}

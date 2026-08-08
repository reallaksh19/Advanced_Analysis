import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// M044: BM4_NL -- a second, independent CAESAR benchmark of the SAME BM4
// topology, requested directly by the domain owner to settle two open
// questions from M043: (1) whether the FY sign convention M043 established
// (CAESAR reports force-on-support, LFEA reports force-on-structure) holds
// on a clean fixture, and (2) whether the repository's Output_BM4.xml is the
// same CAESAR authority as external CII data the owner has independently.
//
// BM4_NL.ACCDB (github.com/reallaksh19/Common, LFEA/BM4/BM4_NL.zip, commit
// 1728651c94504b497aae4041578b1095fd8e292e) is the SAME 96-element/30-support
// topology as BM4, diffed byte-for-byte against BM4.ACCDB's own
// INPUT_RESTRAINTS table: every unilateral +Y restraint (RES_TYPEID 14) is
// replaced by a bidirectional Y restraint (RES_TYPEID 3), and every nonzero
// GAP on a GUI/LIM restraint is cleared. Nothing else differs -- same
// elements, same weight/pressure/temperature, same (unused) FORCMNT records.
// That makes it exactly "no friction, no F1/F2, no gap, all bidirectional"
// -- purely linear FEA -- while keeping every other confound of the real
// model (real bend/tee geometry, real rigid weight) fixed.
//
// Extracted via mdbtools (mdb-export), filtered to CASE 19 (SUS) and
// CASE 20 (OPE) -- the only two cases this benchmark's own output carries;
// unlike BM4, BM4_NL's accdb has no CASE 21 (EXP) row, so EXP must be
// derived as L20-L19 by whoever consumes this fixture, not read directly.

const DIR = fileURLToPath(new URL('../benchmarks/LFEA/BM4/BM4_NL/', import.meta.url));
export const BM4NL_RESTRAINT_SUMMARY_PATH = `${DIR}OUTPUT_RESTRAINTS_SUMMARY_L19_L20.csv`;
export const BM4NL_DISPLACEMENTS_PATH = `${DIR}OUTPUT_DISPLACEMENTS_L19_L20.csv`;
export const BM4NL_INPUT_RESTRAINTS_PATH = `${DIR}INPUT_RESTRAINTS.csv`;
export const BM4NL_SOURCE_ID = 'CAESAR-II-BM4-NL-ACCDB-COMMON-1728651c9';

export const M044_CASE_NUMBERS = Object.freeze({ SUS: 19, OPE: 20 });
export const M044_CASES = Object.freeze(['SUS', 'OPE']);

// Same sign convention M043 established and measured across all 29 BM4 +Y
// shoes (magnitudes agreed, signs opposed): CAESAR reports force-on-support,
// LFEA reports force-on-structure. Re-derived independently here on BM4_NL
// (node 21470 case 19: CAESAR +656.90 N, LFEA reaction +590.05 N -- i.e. this
// node does NOT follow the negation, which is exactly the anomaly this
// module exists to surface, not paper over).
export const M044_REACTION_SIGN_CONVENTION = 'CAESAR_REPORTS_FORCE_ON_SUPPORT_LFEA_REPORTS_FORCE_ON_STRUCTURE';

export const M044_NODE_LEVEL_POLICY = Object.freeze({
  schema: 'lfea-m044-bm4nl-node-level-policy/v1',
  // Per-node restraint reaction comparison. Floors set from BM4_NL's own
  // measured scale (smallest real reactions are O(300-1700) N; MX/MY/MZ are
  // exactly 0 at every non-ANC node in this benchmark, so a moment floor only
  // matters at node 22490, the ANC).
  reaction: Object.freeze({
    targetTolerancePercent: 10,
    forceFloorNewtons: 50,
    momentFloorNewtonMetres: 5,
  }),
  displacement: Object.freeze({
    targetTolerancePercent: 10,
    translationFloorMetres: 1e-6,
    rotationFloorRadians: 1e-6,
  }),
});

const MILLIMETRES_TO_METRES = 1e-3;
const DEGREES_TO_RADIANS = Math.PI / 180;

/** Minimal RFC4180-ish CSV reader: quoted fields, embedded commas, no embedded newlines (mdb-export does not emit them here). */
function parseCsv(content) {
  const lines = content.replace(/\r\n/gu, '\n').split('\n').filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const parseLine = (line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (c === '"') { inQuotes = !inQuotes; continue; }
      if (c === ',' && !inQuotes) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  };
  const header = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row = {};
    header.forEach((name, index) => { row[name] = cells[index] ?? ''; });
    return row;
  });
}

function num(row, key) {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) throw new Error(`BM4_NL fixture: non-finite ${key}=${row[key]}`);
  return value;
}

function caseLabelForNumber(caseNumber) {
  const entry = Object.entries(M044_CASE_NUMBERS).find(([, value]) => value === caseNumber);
  if (!entry) throw new Error(`BM4_NL fixture: unrecognised CASE number ${caseNumber}`);
  return entry[0];
}

/**
 * Parses the committed BM4_NL CAESAR CSV authority into the SAME shape as
 * M034/M043's loadBm4CiiOutputCases1921(): {displacement, restraint} Maps of
 * label -> Map(nodeId -> row). Shared shape lets M043's caesarDisplacementSI
 * and caesarReactionSumSI run against BM4_NL unmodified.
 */
export function loadBm4NlCiiOutput() {
  const displacement = new Map(M044_CASES.map((label) => [label, new Map()]));
  const restraint = new Map(M044_CASES.map((label) => [label, new Map()]));

  for (const row of parseCsv(readFileSync(BM4NL_DISPLACEMENTS_PATH, 'utf8'))) {
    const label = caseLabelForNumber(Number(row.LCASE_NUM));
    if (row.DUNITS !== 'mm.' || row.RUNITS !== 'deg.') throw new Error(`BM4_NL displacement units drift: ${row.DUNITS}/${row.RUNITS}`);
    displacement.get(label).set(row.NODE, Object.freeze({
      nodeId: row.NODE, DX: num(row, 'DX'), DY: num(row, 'DY'), DZ: num(row, 'DZ'),
      RX: num(row, 'RX'), RY: num(row, 'RY'), RZ: num(row, 'RZ'),
    }));
  }
  for (const row of parseCsv(readFileSync(BM4NL_RESTRAINT_SUMMARY_PATH, 'utf8'))) {
    const label = caseLabelForNumber(Number(row.LCASE_NUM));
    if (row.FUNITS !== 'N.') throw new Error(`BM4_NL restraint force units drift: ${row.FUNITS}`);
    restraint.get(label).set(row.NODE, Object.freeze({
      nodeId: row.NODE, type: row.TYPE,
      FX: num(row, 'FX'), FY: num(row, 'FY'), FZ: num(row, 'FZ'),
      MX: num(row, 'MX'), MY: num(row, 'MY'), MZ: num(row, 'MZ'),
    }));
  }
  return Object.freeze({
    schema: 'lfea-bm4nl-cii-output-cases-19-20/v1',
    caseNumbers: M044_CASE_NUMBERS,
    displacement,
    restraint,
  });
}

const DISPLACEMENT_FIELDS = Object.freeze([
  Object.freeze({ caesarField: 'DX', dof: 'UX', scale: MILLIMETRES_TO_METRES }),
  Object.freeze({ caesarField: 'DY', dof: 'UY', scale: MILLIMETRES_TO_METRES }),
  Object.freeze({ caesarField: 'DZ', dof: 'UZ', scale: MILLIMETRES_TO_METRES }),
  Object.freeze({ caesarField: 'RX', dof: 'RX', scale: DEGREES_TO_RADIANS }),
  Object.freeze({ caesarField: 'RY', dof: 'RY', scale: DEGREES_TO_RADIANS }),
  Object.freeze({ caesarField: 'RZ', dof: 'RZ', scale: DEGREES_TO_RADIANS }),
]);

/** CAESAR displacements for one case, SI units, keyed by source node (same contract as M043's caesarDisplacementSI). */
export function caesarDisplacementSI(cii, caseLabel) {
  const report = cii.displacement.get(caseLabel);
  if (!report) throw new Error(`M044 has no BM4_NL displacement report for ${caseLabel}.`);
  const result = new Map();
  for (const [nodeId, row] of report) {
    const converted = {};
    for (const field of DISPLACEMENT_FIELDS) converted[field.dof] = row[field.caesarField] * field.scale;
    result.set(String(nodeId), Object.freeze(converted));
  }
  return result;
}

/**
 * Per-node CAESAR restraint reactions, sign-corrected to LFEA's
 * force-on-structure convention (M044_REACTION_SIGN_CONVENTION). Unlike
 * M043's caesarReactionSumSI (one global 6-vector), this keeps per-node
 * granularity: OUTPUT_RESTRAINTS_SUMMARY_L19_L20.csv already sums every
 * restraint-type component (Y/GUI/LIM/ANC) at a node into one row, so no
 * further aggregation is needed here.
 */
export function caesarNodalReactionSI(cii, caseLabel) {
  const report = cii.restraint.get(caseLabel);
  if (!report) throw new Error(`M044 has no BM4_NL restraint report for ${caseLabel}.`);
  const result = new Map();
  for (const [nodeId, row] of report) {
    result.set(String(nodeId), Object.freeze({
      UX: -row.FX, UY: -row.FY, UZ: -row.FZ, RX: -row.MX, RY: -row.MY, RZ: -row.MZ,
    }));
  }
  return result;
}

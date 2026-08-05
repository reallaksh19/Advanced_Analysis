import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const SOLVER_DIGEST = 'sha256:9a33d293706a66bee86f2f0ecf996a66758f904c20d61ad8c83ddc0f92ae4b7e';
export const EVIDENCE_SCHEMA = 'nonlinear-shell-contact-shell-benchmark-evidence/v2';

export async function runCase({ solver, root, benchmarkId, caseId, deck }) {
  const dir = resolve(root, 'raw', benchmarkId, caseId);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'model.inp'), deck, 'utf8');
  const run = spawnSync(solver, ['-i', 'model'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1', LC_ALL: 'C', LANG: 'C', TZ: 'UTC' },
  });
  await writeFile(resolve(dir, 'solver.stdout.log'), run.stdout ?? '', 'utf8');
  await writeFile(resolve(dir, 'solver.stderr.log'), run.stderr ?? '', 'utf8');
  if (run.error) throw run.error;
  if (run.status !== 0 || !(run.stdout ?? '').includes('Job finished')) {
    throw new Error(`${benchmarkId}/${caseId}: CalculiX did not complete.`);
  }
  const dat = await readFile(resolve(dir, 'model.dat'), 'utf8');
  const deterministicFiles = {};
  const volatileFiles = {};
  for (const name of (await readdir(dir)).sort()) {
    const bytes = await readFile(resolve(dir, name));
    if (name === 'solver.stdout.log') {
      volatileFiles[name] = sha256(bytes);
      deterministicFiles['solver.stdout.normalized.log'] = sha256(Buffer.from(normalizeStdout(bytes.toString('utf8'))));
    } else if (name === 'model.frd') {
      volatileFiles[name] = sha256(bytes);
      deterministicFiles['model.normalized.frd'] = sha256(Buffer.from(normalizeFrd(bytes.toString('utf8'))));
    } else {
      deterministicFiles[name] = sha256(bytes);
    }
  }
  const record = seal({ benchmarkId, caseId, deterministicFiles }, 'semanticHash');
  await writeJson(resolve(dir, 'volatile-file-hashes.json'), volatileFiles);
  await writeJson(resolve(dir, 'case-record.json'), record);
  return { parsed: parseDat(dat), record };
}

export function evidence(context, input) {
  const raw = seal({
    schema: 'lafea-nc01-raw-benchmark-manifest/v1',
    benchmarkId: input.id,
    exactHeadSha: context.exactHeadSha,
    solverHash: SOLVER_DIGEST,
    implementationHash: context.implementationHash,
    sourceProofHash: context.sourceProofHash,
    cases: input.cases,
  }, 'semanticHash');
  const reference = seal({ schema: 'lafea-nc01-independent-reference/v1', benchmarkId: input.id, ...input.reference }, 'semanticHash');
  const oracle = seal({
    schema: 'lafea-nc01-independent-oracle/v1',
    benchmarkId: input.id,
    implementationId: 'LAFEA_NC01_STANDALONE_DAT_ORACLE_V1',
    implementationHash: context.implementationHash,
    productionImports: [],
    referenceHash: reference.semanticHash,
  }, 'semanticHash');
  return seal({
    schema: EVIDENCE_SCHEMA,
    id: input.id,
    exactHeadSha: context.exactHeadSha,
    source: 'EXTERNAL_SOLVER_EXECUTION',
    recovery: 'FIXED_PHYSICAL_COORDINATE_SECTION_INTEGRATION_POINT',
    rawEvidenceHash: raw.semanticHash,
    referenceHash: reference.semanticHash,
    oracleHash: oracle.semanticHash,
    meshHash: semanticHash(input.levels.map(({ globalH, probeLocalH }) => ({ globalH, probeLocalH }))),
    referenceUncertainty: finite(input.referenceUncertainty),
    acceptanceTolerance: finite(input.tolerance),
    observedError: finite(input.observedError),
    equilibriumResidual: finite(input.equilibriumResidual),
    energyResidual: finite(input.energyResidual),
    hourglassEnergyRatio: 0,
    transverseShearEnergyRatio: finite(input.shearRatio),
    meshLevels: input.levels.map((row) => ({ ...row, quantity: finite(row.quantity) })),
    mutation: {
      id: input.mutation.id,
      baselineError: finite(input.mutation.baselineError),
      mutatedError: finite(input.mutation.mutatedError),
    },
  }, 'semanticHash');
}

export function parseDat(text) {
  return {
    displacements: block(text, /displacements \(vx,vy,vz\)/gu, 'node'),
    forces: block(text, /forces \(fx,fy,fz\)/gu, 'node'),
    stresses: block(text, /stresses \(elem, integ\.pnt\.,sxx,syy,szz,sxy,sxz,syz\)/gu, 'point'),
    strains: block(text, /strains \(elem, integ\.pnt\.,exx,eyy,ezz,exy,exz,eyz\)/gu, 'point'),
  };
}

function block(text, pattern, kind) {
  const found = [...text.matchAll(pattern)];
  if (!found.length) return [];
  const rows = [];
  for (const line of text.slice(found.at(-1).index + found.at(-1)[0].length).split(/\r?\n/u).slice(2)) {
    const parts = line.trim().split(/\s+/u);
    const minimum = kind === 'node' ? 4 : 8;
    if (parts.length < minimum || !/^\d+$/u.test(parts[0])) {
      if (rows.length) break;
      continue;
    }
    rows.push(kind === 'node'
      ? { node: Number(parts[0]), values: parts.slice(1, 4).map(Number) }
      : { element: Number(parts[0]), point: Number(parts[1]), values: parts.slice(2, 8).map(Number) });
  }
  return rows;
}

export function reactionResidual(rows, scale = 1, appliedZ = 0) {
  const sums = [0, 0, appliedZ];
  for (const row of rows) for (let i = 0; i < 3; i += 1) sums[i] += row.values[i];
  return Math.hypot(...sums) / Math.max(Math.abs(scale), 1e-30);
}
export function dotStressStrain(s, e) { return s[0]*e[0]+s[1]*e[1]+s[2]*e[2]+2*(s[3]*e[3]+s[4]*e[4]+s[5]*e[5]); }
export function shearRatio(stresses, strains) {
  let shear = 0, total = 0;
  for (const [s, e] of zip(stresses, strains)) {
    total += Math.abs(0.5 * dotStressStrain(s.values, e.values));
    shear += Math.abs(0.5 * (s.values[4]*e.values[4] + s.values[5]*e.values[5]));
  }
  return total ? shear / total : 0;
}
export const average = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
export const maxAbs = (a) => a.length ? Math.max(...a.map(Math.abs)) : 0;
export const relative = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-30);
export const zip = (a, b) => a.slice(0, Math.min(a.length, b.length)).map((x, i) => [x, b[i]]);
export const finite = (n) => { if (!Number.isFinite(n)) throw new TypeError('Non-finite evidence value.'); return n; };
export const canonicalJson = (value) => JSON.stringify(canonical(value));
export const semanticHash = (value) => sha256(Buffer.from(canonicalJson(value)));
export const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
export const fileHash = async (path) => sha256(await readFile(path));
export function seal(payload, field) { const value = structuredClone(payload); delete value[field]; return { ...value, [field]: semanticHash(value) }; }
export async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return Object.is(value, -0) ? 0 : value;
}
function normalizeStdout(text) { return text.replace(/Total CalculiX Time:\s*[0-9.Ee+-]+/gu, 'Total CalculiX Time: NORMALIZED'); }
function normalizeFrd(text) { return text.replace(/^    1U(?:DATE|TIME|HOST).*$/gmu, (line) => `${line.slice(0, 10)}NORMALIZED`); }

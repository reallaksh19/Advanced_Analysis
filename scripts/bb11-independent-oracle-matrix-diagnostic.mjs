import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourcePath = path.join(
  ROOT,
  'src/core/bucket-b/flange-hub-independent-oracle.js',
);
const outputDirectory = path.join(ROOT, 'reports/bb11-oracle-matrix');
const reportPath = path.join(outputDirectory, 'o0-pressure-matrix-diagnostic.json');
const temporaryPath = path.join(
  ROOT,
  'src/core/bucket-b',
  `.bb11-oracle-matrix-${process.pid}.mjs`,
);

const governedBlockMap = `function blockMap(block) {
  const outer = profile(block.profile);
  if (block.kind === 'STRIP') {
    return (u, v) => {`;
const correctedBlockMap = `function blockMap(block) {
  if (block.kind === 'STRIP') {
    const outer = profile(block.profile);
    return (u, v) => {`;
const solveLevelMarker = 'function solveLevel(definition, loadCaseId) {';
const systemExport = `export function buildIndependentOracleO0SystemDiagnostic(
  loadCaseId = 'FH-PRES-001',
) {
  if (loadCaseId !== 'FH-PRES-001') {
    throw new TypeError('ORACLE_DIAGNOSTIC_PRESSURE_ONLY');
  }
  const definition = { levelId: 'O0', refinement: 1 };
  const mesh = q4Mesh(definition);
  const nodeIndex = new Map(mesh.nodes.map((node, index) => [node.id, index]));
  const nodeById = new Map(mesh.nodes.map((node) => [node.id, node]));
  const dofCount = 2 * mesh.nodes.length;
  const stiffness = Array.from({ length: dofCount }, () => new Map());
  const force = new Float64Array(dofCount);
  const D = constitutive();
  let minimumDetJ = Infinity;
  let maximumDetJ = -Infinity;

  mesh.elements.forEach((element) => {
    const nodes = element.nodeIds.map((id) => nodeById.get(id));
    GAUSS2.forEach((gx) => GAUSS2.forEach((gy) => {
      const state = q4State(nodes, gx.value, gy.value);
      minimumDetJ = Math.min(minimumDetJ, state.detJ);
      maximumDetJ = Math.max(maximumDetJ, state.detJ);
    }));
    const ke = q4Element(nodes, D);
    const dofs = element.nodeIds.flatMap((id) => {
      const index = nodeIndex.get(id);
      return [2 * index, 2 * index + 1];
    });
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        const globalRow = dofs[row];
        const globalColumn = dofs[column];
        stiffness[globalRow].set(
          globalColumn,
          (stiffness[globalRow].get(globalColumn) ?? 0) + ke[row][column],
        );
      }
    }
  });

  const load = loadCaseDefinition(loadCaseId);
  const loadResultants = applyLoads(mesh, load, nodeById, nodeIndex, force);
  const constrained = constraintDofs(mesh, loadCaseId, nodeIndex);
  const constrainedSet = new Set(constrained);
  const free = Array.from({ length: dofCount }, (_, index) => index)
    .filter((index) => !constrainedSet.has(index));
  const freeIndex = new Map(free.map((dof, index) => [dof, index]));
  const rhs = Float64Array.from(free.map((dof) => force[dof]));
  const rows = free.map((globalRow) => {
    const entries = [];
    stiffness[globalRow].forEach((value, globalColumn) => {
      const localColumn = freeIndex.get(globalColumn);
      if (localColumn !== undefined && value !== 0) {
        entries.push({ column: localColumn, value });
      }
    });
    return entries.sort((left, right) => left.column - right.column);
  });
  const supportNodes = mesh.nodes
    .filter((node) => Math.abs(node.z - 90) < 1e-9
      && node.r >= 60 - 1e-9 && node.r <= 95 + 1e-9)
    .map((node) => node.id);

  return {
    schema: 'bb11-independent-oracle-o0-system/v1',
    loadCaseId,
    levelId: definition.levelId,
    nodeCount: mesh.nodes.length,
    elementCount: mesh.elements.length,
    dofCount,
    freeDofCount: free.length,
    constrainedDofCount: constrained.length,
    constrained,
    supportNodes,
    loadResultants,
    minimumDetJ,
    maximumDetJ,
    rows,
    rhs: Array.from(rhs),
  };
}

${solveLevelMarker}`;

await mkdir(outputDirectory, { recursive: true });
const original = await readFile(sourcePath, 'utf8');
assert.equal(occurrences(original, governedBlockMap), 1);
assert.equal(occurrences(original, solveLevelMarker), 1);
const transformed = original
  .replace(governedBlockMap, correctedBlockMap)
  .replace(solveLevelMarker, systemExport);
await writeFile(temporaryPath, transformed, 'utf8');

let report;
try {
  const moduleUrl = `${pathToFileURL(temporaryPath).href}?run=${Date.now()}`;
  const oracle = await import(moduleUrl);
  const system = oracle.buildIndependentOracleO0SystemDiagnostic('FH-PRES-001');
  const matrix = denseMatrix(system.rows);
  const symmetry = symmetryDiagnostic(matrix);
  const connectivity = graphConnectivity(system.rows);
  const diagonals = system.rows.map((row, index) => (
    row.find((entry) => entry.column === index)?.value ?? 0
  ));
  const cholesky = choleskyDiagnostic(matrix, system.rhs);
  const deterministicVectors = rayleighDiagnostics(matrix);
  report = {
    schema: 'bb11-independent-oracle-o0-matrix-diagnostic/v1',
    status: 'PASS',
    authority: 'NON_AUTHORIZING_DIAGNOSTIC_ONLY',
    governedOracleSha256: sha256(original),
    transformedOracleSha256: sha256(transformed),
    correction: 'DEFER_PROFILE_RESOLUTION_UNTIL_BLOCK_KIND_IS_STRIP',
    system: {
      ...system,
      rows: undefined,
      rhs: undefined,
      reducedNonzeroCount: system.rows.reduce((sum, row) => sum + row.length, 0),
      rhsNorm: norm(system.rhs),
      minimumDiagonal: Math.min(...diagonals),
      maximumDiagonal: Math.max(...diagonals),
      zeroOrNonpositiveDiagonalIndices: diagonals
        .map((value, index) => ({ value, index }))
        .filter((row) => !(row.value > 0)),
    },
    symmetry,
    connectivity,
    cholesky,
    rayleigh: deterministicVectors,
    classification: classify({ symmetry, connectivity, cholesky }),
  };
} catch (error) {
  report = {
    schema: 'bb11-independent-oracle-o0-matrix-diagnostic/v1',
    status: 'FAIL',
    authority: 'NON_AUTHORIZING_DIAGNOSTIC_ONLY',
    governedOracleSha256: sha256(original),
    transformedOracleSha256: sha256(transformed),
    error: error?.stack ?? String(error),
  };
} finally {
  await rm(temporaryPath, { force: true });
}

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report)}\n`);
if (report.status !== 'PASS') process.exitCode = 1;

function denseMatrix(rows) {
  const n = rows.length;
  const matrix = Array.from({ length: n }, () => new Float64Array(n));
  rows.forEach((row, i) => row.forEach((entry) => {
    matrix[i][entry.column] += entry.value;
  }));
  return matrix;
}

function symmetryDiagnostic(matrix) {
  let maximumAbsoluteAsymmetry = 0;
  let maximumReferenceMagnitude = 0;
  let location = null;
  for (let i = 0; i < matrix.length; i += 1) {
    for (let j = i + 1; j < matrix.length; j += 1) {
      const difference = Math.abs(matrix[i][j] - matrix[j][i]);
      const reference = Math.max(Math.abs(matrix[i][j]), Math.abs(matrix[j][i]));
      maximumReferenceMagnitude = Math.max(maximumReferenceMagnitude, reference);
      if (difference > maximumAbsoluteAsymmetry) {
        maximumAbsoluteAsymmetry = difference;
        location = { i, j, aij: matrix[i][j], aji: matrix[j][i] };
      }
    }
  }
  return {
    maximumAbsoluteAsymmetry,
    maximumRelativeAsymmetry: maximumAbsoluteAsymmetry
      / Math.max(1, maximumReferenceMagnitude),
    maximumReferenceMagnitude,
    location,
    accepted: maximumAbsoluteAsymmetry
      <= 1e-10 * Math.max(1, maximumReferenceMagnitude),
  };
}

function graphConnectivity(rows) {
  const visited = new Uint8Array(rows.length);
  const components = [];
  for (let start = 0; start < rows.length; start += 1) {
    if (visited[start]) continue;
    const stack = [start];
    visited[start] = 1;
    const members = [];
    while (stack.length) {
      const row = stack.pop();
      members.push(row);
      rows[row].forEach((entry) => {
        if (entry.column !== row && entry.value !== 0 && !visited[entry.column]) {
          visited[entry.column] = 1;
          stack.push(entry.column);
        }
      });
    }
    components.push({ size: members.length, minimumIndex: Math.min(...members) });
  }
  components.sort((left, right) => right.size - left.size);
  return {
    componentCount: components.length,
    components,
    accepted: components.length === 1,
  };
}

function choleskyDiagnostic(matrix, rhs) {
  const n = matrix.length;
  const L = Array.from({ length: n }, () => new Float64Array(n));
  const maximumDiagonal = Math.max(...matrix.map((row, index) => Math.abs(row[index])));
  const pivotTolerance = Math.max(1e-12, maximumDiagonal * 1e-14);
  let minimumPivot = Infinity;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let value = matrix[i][j];
      for (let k = 0; k < j; k += 1) value -= L[i][k] * L[j][k];
      if (i === j) {
        minimumPivot = Math.min(minimumPivot, value);
        if (!Number.isFinite(value) || !(value > pivotTolerance)) {
          return {
            factorized: false,
            failedPivotIndex: i,
            failedPivotValue: value,
            minimumPivot,
            maximumDiagonal,
            pivotTolerance,
          };
        }
        L[i][j] = Math.sqrt(value);
      } else {
        L[i][j] = value / L[j][j];
      }
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    let value = rhs[i];
    for (let j = 0; j < i; j += 1) value -= L[i][j] * y[j];
    y[i] = value / L[i][i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    let value = y[i];
    for (let j = i + 1; j < n; j += 1) value -= L[j][i] * x[j];
    x[i] = value / L[i][i];
  }
  const residual = multiply(matrix, x).map((value, index) => value - rhs[index]);
  return {
    factorized: true,
    minimumPivot,
    maximumDiagonal,
    pivotTolerance,
    solutionNorm: norm(x),
    explicitResidualNorm: norm(residual),
    relativeResidual: norm(residual) / Math.max(1, norm(rhs)),
  };
}

function rayleighDiagnostics(matrix) {
  const n = matrix.length;
  const vectors = [
    Float64Array.from({ length: n }, (_, index) => (index % 2 ? -1 : 1)),
    Float64Array.from({ length: n }, (_, index) => Math.sin((index + 1) * 0.731)),
    Float64Array.from({ length: n }, (_, index) => Math.cos((index + 1) * 1.173)),
  ];
  return vectors.map((vector, index) => {
    const product = multiply(matrix, vector);
    return {
      vectorId: `R${index + 1}`,
      quotient: dot(vector, product) / dot(vector, vector),
      curvature: dot(vector, product),
    };
  });
}

function multiply(matrix, vector) {
  return Float64Array.from(matrix, (row) => (
    row.reduce((sum, value, column) => sum + value * vector[column], 0)
  ));
}

function dot(left, right) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += left[index] * right[index];
  return sum;
}

function norm(values) {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

function classify({ symmetry, connectivity, cholesky }) {
  if (!symmetry.accepted) return 'REDUCED_MATRIX_ASYMMETRIC';
  if (!connectivity.accepted) return 'REDUCED_MATRIX_DISCONNECTED';
  if (!cholesky.factorized) return 'REDUCED_MATRIX_NOT_POSITIVE_DEFINITE';
  return 'REDUCED_MATRIX_SPD_ITERATIVE_SOLVER_DEFECT';
}

function occurrences(text, target) {
  return text.split(target).length - 1;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

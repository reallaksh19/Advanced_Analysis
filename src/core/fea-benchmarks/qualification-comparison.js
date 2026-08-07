import { deepFreeze } from '../shared-piping-model/immutable.js';
import {
  benchmarkResultRowIdentity,
  compareAscii,
  normalizeBenchmarkResultRows,
} from './qualification-contract.js';

/** Compare one case using combined absolute + relative tolerance. */
export function compareBenchmarkResultRows({
  caseId,
  referenceRows,
  actualRows,
  tolerances,
  optionalQuantities = [],
  exposedQuantities = [],
}) {
  const reference = normalizeBenchmarkResultRows(referenceRows, caseId);
  const actual = normalizeBenchmarkResultRows(actualRows, caseId);
  const referenceById = new Map(reference.map((row) => [benchmarkResultRowIdentity(row), row]));
  const actualById = new Map(actual.map((row) => [benchmarkResultRowIdentity(row), row]));
  const identities = [...new Set([...referenceById.keys(), ...actualById.keys()])].sort(compareAscii);
  const optional = new Set(optionalQuantities.map((value) => String(value).toUpperCase()));
  const exposed = new Set(exposedQuantities.map((value) => String(value).toUpperCase()));

  const rows = identities.map((identity) => compareOne({
    identity,
    reference: referenceById.get(identity) ?? null,
    actual: actualById.get(identity) ?? null,
    tolerances,
    optional,
    exposed,
  }));

  const failed = rows.filter((row) => row.status === 'FAIL');
  const compared = rows.filter((row) => row.status === 'PASS' || row.status === 'FAIL');
  const notExposed = rows.filter((row) => row.status === 'NOT_EXPOSED');
  const notCompared = rows.filter((row) => row.status === 'NOT_COMPARED');
  return deepFreeze({
    caseId: String(caseId),
    status: failed.length > 0 ? 'FAIL' : compared.length > 0 ? 'PASS' : 'NO_COMPARABLE_RESULTS',
    counts: {
      total: rows.length,
      compared: compared.length,
      passed: compared.length - failed.length,
      failed: failed.length,
      notExposed: notExposed.length,
      notCompared: notCompared.length,
    },
    rows,
  });
}

function compareOne({ identity, reference, actual, tolerances, optional, exposed }) {
  if (!reference) {
    return record(identity, actual, null, 'NOT_COMPARED', 'No reference result exists for this solver quantity.');
  }
  if (!actual) {
    const optionalResult = reference.required === false || optional.has(reference.quantity);
    const notExposed = !exposed.has(reference.quantity);
    if (optionalResult && notExposed) {
      return record(identity, null, reference, 'NOT_EXPOSED',
        `Solver does not expose equivalent ${reference.quantity} results; comparison is explicitly omitted.`);
    }
    return record(identity, null, reference, 'FAIL', 'Required solver result is missing.');
  }
  if (reference.unit !== actual.unit) {
    return record(identity, actual, reference, 'FAIL',
      `Unit mismatch: reference ${reference.unit}, solver ${actual.unit}.`);
  }

  const tolerance = resolveTolerance(tolerances, reference);
  const absoluteError = Math.abs(actual.value - reference.value);
  const scale = Math.max(Math.abs(reference.value), tolerance.scaleFloor);
  const relativeError = scale === 0 ? (absoluteError === 0 ? 0 : null) : absoluteError / scale;
  const limit = tolerance.absolute + tolerance.relative * scale;
  const status = absoluteError <= limit ? 'PASS' : 'FAIL';
  return deepFreeze({
    identity,
    caseId: reference.caseId,
    entityKind: reference.entityKind,
    entityId: reference.entityId,
    quantity: reference.quantity,
    component: reference.component,
    unit: reference.unit,
    referenceValue: reference.value,
    actualValue: actual.value,
    absoluteError,
    relativeError,
    tolerance,
    acceptanceLimit: limit,
    status,
    note: status === 'PASS' ? null : 'Combined absolute + relative tolerance exceeded.',
  });
}

function record(identity, actual, reference, status, note) {
  const source = reference ?? actual;
  return deepFreeze({
    identity,
    caseId: source.caseId,
    entityKind: source.entityKind,
    entityId: source.entityId,
    quantity: source.quantity,
    component: source.component,
    unit: reference?.unit ?? actual?.unit ?? null,
    referenceValue: reference?.value ?? null,
    actualValue: actual?.value ?? null,
    absoluteError: null,
    relativeError: null,
    tolerance: null,
    acceptanceLimit: null,
    status,
    note,
  });
}

function resolveTolerance(tolerances, row) {
  if (!tolerances || typeof tolerances !== 'object') {
    throw new TypeError('Benchmark tolerance policy is required.');
  }
  const keyed = tolerances[`${row.quantity}:${row.component}`]
    ?? tolerances[row.quantity]
    ?? tolerances.default;
  if (!keyed || typeof keyed !== 'object') {
    throw new TypeError(`No tolerance is defined for ${row.quantity}:${row.component}.`);
  }
  const absolute = finiteNonnegative(keyed.absolute ?? 0, 'tolerance.absolute');
  const relative = finiteNonnegative(keyed.relative ?? 0, 'tolerance.relative');
  const scaleFloor = finiteNonnegative(keyed.scaleFloor ?? 0, 'tolerance.scaleFloor');
  return deepFreeze({ absolute, relative, scaleFloor });
}

function finiteNonnegative(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${field} must be finite and nonnegative.`);
  return number;
}

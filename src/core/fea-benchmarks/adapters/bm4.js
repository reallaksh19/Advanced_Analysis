import { semanticHash } from '../../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../shared-piping-model/immutable.js';
import { normalizeBenchmarkResultRows } from '../qualification-contract.js';

export const BM4_QUALIFICATION_CASE_IDS = Object.freeze(['CASE19', 'CASE21']);
export const BM4_QUALIFICATION_ADAPTER_ID = 'BM4_CASE19_CASE21_ADAPTER_V1';

const FORCE_COMPONENTS = Object.freeze({ FX: 'UX', FY: 'UY', FZ: 'UZ', MX: 'RX', MY: 'RY', MZ: 'RZ' });
const DISPLACEMENT_COMPONENTS = Object.freeze({ DX: 'UX', DY: 'UY', DZ: 'UZ', UX: 'UX', UY: 'UY', UZ: 'UZ', RX: 'RX', RY: 'RY', RZ: 'RZ' });

/**
 * BM4 keeps InputXML/CAESAR-specific parsing here. The shared qualification
 * pipeline never inspects BM4 source shape or CASE semantics.
 */
export function createBm4QualificationAdapter({
  parseModel,
  parseReference = identity,
  referenceUnits = {},
} = {}) {
  if (typeof parseModel !== 'function') throw new TypeError('BM4 adapter requires parseModel.');
  if (typeof parseReference !== 'function') throw new TypeError('BM4 parseReference must be a function.');
  const units = resolveUnits(referenceUnits);

  return Object.freeze({
    adapterId: BM4_QUALIFICATION_ADAPTER_ID,
    benchmarkId: 'BM4',
    caseIds: BM4_QUALIFICATION_CASE_IDS,
    ingest(source) {
      if (!source || typeof source !== 'object') throw new TypeError('BM4 source bundle is required.');
      const modelInput = parseModel(source.modelSource ?? source.inputXml ?? source.modelInput);
      const parsedReference = parseReference(source.referenceSource ?? source.references);
      const references = Object.fromEntries(BM4_QUALIFICATION_CASE_IDS.map((caseId) => [
        caseId,
        normalizeBm4ReferenceCase(caseId, parsedReference?.[caseId], units),
      ]));
      const modelIdentity = source.modelIdentity
        ?? modelInput?.semanticHash
        ?? modelInput?.mechanicalModelSemanticHash
        ?? semanticHash(modelInput);
      const semanticIdentity = {
        benchmarkId: 'BM4',
        adapterId: BM4_QUALIFICATION_ADAPTER_ID,
        caseIds: BM4_QUALIFICATION_CASE_IDS,
        modelIdentity,
        references,
      };
      return deepFreeze({
        benchmarkId: 'BM4',
        adapterId: BM4_QUALIFICATION_ADAPTER_ID,
        caseIds: BM4_QUALIFICATION_CASE_IDS,
        modelInput,
        modelIdentity,
        references,
        semanticHash: semanticHash(semanticIdentity),
      });
    },
    referenceRows({ caseId, ingestion }) {
      if (!BM4_QUALIFICATION_CASE_IDS.includes(caseId)) {
        throw new TypeError(`BM4 qualification case ${caseId} is not CASE19 or CASE21.`);
      }
      return ingestion.references[caseId];
    },
  });
}

export function normalizeBm4ReferenceCase(caseId, value, referenceUnits = {}) {
  if (!BM4_QUALIFICATION_CASE_IDS.includes(caseId)) {
    throw new TypeError(`BM4 qualification case ${caseId} is not CASE19 or CASE21.`);
  }
  if (!value || typeof value !== 'object') throw new TypeError(`BM4 ${caseId} reference data is required.`);
  const units = resolveUnits(referenceUnits);
  if (Array.isArray(value.rows)) return normalizeBenchmarkResultRows(value.rows, caseId);

  const rows = [];
  for (const node of value.nodes ?? []) appendNodeRows(rows, node, units);
  for (const element of value.elements ?? []) appendElementRows(rows, element, units);
  return normalizeBenchmarkResultRows(rows, caseId);
}

function appendNodeRows(rows, node, units) {
  const nodeId = requiredId(node?.nodeId, 'BM4 reference nodeId');
  appendComponents(rows, node.displacements, (component, value) => {
    const mapped = DISPLACEMENT_COMPONENTS[String(component).toUpperCase()];
    if (!mapped) throw new TypeError(`Unsupported BM4 displacement component ${component}.`);
    const rotation = mapped.startsWith('R');
    return row('NODE', nodeId, rotation ? 'ROTATION' : 'DISPLACEMENT', mapped, value,
      rotation ? units.rotation : units.displacement, true);
  });
  appendComponents(rows, node.forces ?? node.reactions, (component, value) => {
    const mapped = FORCE_COMPONENTS[String(component).toUpperCase()] ?? String(component).toUpperCase();
    const moment = mapped.startsWith('R');
    return row('NODE', nodeId, moment ? 'MOMENT' : 'FORCE', mapped, value,
      moment ? units.moment : units.force, true);
  });
}

function appendElementRows(rows, element, units) {
  const elementId = requiredId(element?.elementId ?? element?.id, 'BM4 reference elementId');
  appendComponents(rows, element.forces, (component, value) => (
    row('ELEMENT', elementId, 'ELEMENT_FORCE', component, value, units.force, true)
  ));
  appendComponents(rows, element.moments, (component, value) => (
    row('ELEMENT', elementId, 'ELEMENT_MOMENT', component, value, units.moment, true)
  ));
  appendComponents(rows, element.stresses, (component, value) => (
    row('ELEMENT', elementId, 'STRESS', component, value, units.stress, false,
      'Compared only when the repository solve exposes an equivalent stress quantity.')
  ));
}

function appendComponents(target, values, build) {
  if (values === undefined || values === null) return;
  if (typeof values !== 'object' || Array.isArray(values)) throw new TypeError('BM4 component values must be an object.');
  for (const component of Object.keys(values).sort()) target.push(build(component, values[component]));
}

function row(entityKind, entityId, quantity, component, rawValue, unitSpec, required, note = null) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) throw new TypeError(`BM4 ${quantity}:${component} value must be finite.`);
  return {
    entityKind,
    entityId,
    quantity,
    component: String(component).toUpperCase(),
    value: value * unitSpec.factor,
    unit: unitSpec.unit,
    required,
    note,
  };
}

function resolveUnits(value) {
  return Object.freeze({
    displacement: unit(value.displacement, 'm'),
    rotation: unit(value.rotation, 'rad'),
    force: unit(value.force, 'N'),
    moment: unit(value.moment, 'N*m'),
    stress: unit(value.stress, 'Pa'),
  });
}

function unit(value, defaultUnit) {
  const record = value ?? {};
  const factor = Number(record.factor ?? 1);
  if (!Number.isFinite(factor) || factor <= 0) throw new TypeError(`BM4 ${defaultUnit} unit factor must be positive and finite.`);
  const unitName = String(record.unit ?? defaultUnit).trim();
  if (!unitName) throw new TypeError('BM4 reference unit is required.');
  return Object.freeze({ factor, unit: unitName });
}

function requiredId(value, field) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${field} is required.`);
  return text;
}

function identity(value) {
  return value;
}

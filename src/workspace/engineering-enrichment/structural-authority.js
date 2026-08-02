import {
  canonicalizeJson,
  semanticHash,
} from '../../core/shared-piping-model/canonical-json.js';
import {
  deepFreeze,
  isPlainRecord,
} from '../../core/shared-piping-model/immutable.js';
import {
  validateSharedPipingModel,
} from '../../core/shared-piping-model/shared-piping-model.js';

export const SHARED_MODEL_STRUCTURAL_AUTHORITY_SCHEMA =
  'SharedModelStructuralAuthority.v1';

const AUTHORITY_KEYS = Object.freeze([
  'schema',
  'sourceSharedModelHash',
  'projectDatasetId',
  'components',
  'supports',
  'unconnectedPorts',
  'sourceReferences',
  'structuralHash',
]);

export function buildSharedModelStructuralAuthority(model) {
  assertValidSharedModel(model);
  const material = {
    schema: SHARED_MODEL_STRUCTURAL_AUTHORITY_SCHEMA,
    sourceSharedModelHash: model.semanticHash,
    projectDatasetId: requiredText(
      model.project?.datasetId,
      'project.datasetId',
    ),
    components: sortedRows(
      model.components.map(structuralComponent),
      'componentKey',
    ),
    supports: sortedRows(
      model.supports.map(structuralSupport),
      'supportKey',
    ),
    unconnectedPorts: sortedRows(
      model.unconnectedPorts.map(structuralPort),
      'portKey',
    ),
    sourceReferences: canonicalSourceReferences(model.sourceReferences),
  };
  return deepFreeze({
    ...material,
    structuralHash: semanticHash(material),
  });
}

export function assertSharedModelStructuralAuthority(value) {
  assertExactKeys(
    value,
    AUTHORITY_KEYS,
    'Shared model structural authority',
  );
  if (value.schema !== SHARED_MODEL_STRUCTURAL_AUTHORITY_SCHEMA) {
    fail(`schema must be ${SHARED_MODEL_STRUCTURAL_AUTHORITY_SCHEMA}.`);
  }
  const material = {
    schema: value.schema,
    sourceSharedModelHash: value.sourceSharedModelHash,
    projectDatasetId: value.projectDatasetId,
    components: value.components,
    supports: value.supports,
    unconnectedPorts: value.unconnectedPorts,
    sourceReferences: value.sourceReferences,
  };
  if (value.structuralHash !== semanticHash(material)) {
    fail('structuralHash is invalid.', RangeError);
  }
  return value;
}

function structuralComponent(component) {
  return canonicalizeJson({
    componentKey: requiredText(component.componentKey, 'component.componentKey'),
    sourceEntityId: component.sourceEntityId ?? null,
    type: component.type ?? null,
    identity: component.identity ?? {},
    geometry: component.geometry ?? null,
    sourceReferences: component.sourceReferences ?? {},
  });
}

function structuralSupport(support) {
  return canonicalizeJson({
    supportKey: requiredText(support.supportKey, 'support.supportKey'),
    sourceEntityId: support.sourceEntityId ?? null,
    type: support.type ?? null,
    identity: support.identity ?? {},
    position: support.position ?? null,
    sourceReferences: support.sourceReferences ?? {},
  });
}

function structuralPort(port) {
  return canonicalizeJson({
    portKey: requiredText(port.portKey, 'port.portKey'),
    componentKey: requiredText(port.componentKey, 'port.componentKey'),
    role: port.role ?? null,
    position: port.position ?? null,
    sourceReference: port.sourceReference ?? null,
  });
}

function canonicalSourceReferences(value) {
  if (!isPlainRecord(value)) fail('sourceReferences must be an object.');
  const nodes = Array.isArray(value.nodes)
    ? sortedRows(value.nodes.map(canonicalizeJson), 'sourceNodeKey')
    : [];
  return deepFreeze({ nodes });
}

function sortedRows(rows, key) {
  return deepFreeze([...rows].sort((left, right) => compareAscii(
    String(left?.[key] ?? ''),
    String(right?.[key] ?? ''),
  )));
}

function assertValidSharedModel(model) {
  const validation = validateSharedPipingModel(model);
  if (!validation.ok) {
    fail(`sourceSharedModel is invalid: ${validation.errors.join(' | ')}.`);
  }
}

function assertExactKeys(value, expected, label) {
  if (!isPlainRecord(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort(compareAscii);
  const wanted = [...expected].sort(compareAscii);
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} keys must be exactly: ${wanted.join(', ')}.`);
  }
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message, Constructor = TypeError) {
  throw new Constructor(`SharedModelStructuralAuthority: ${message}`);
}

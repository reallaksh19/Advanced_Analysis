import {
  deepFreeze,
  semanticHash,
} from '../../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_AUTHORING_SESSION_SCHEMA =
  'TopologyEditAuthoringSession.v1';

export const TOPOLOGY_EDIT_AUTHORING_TOOLS = Object.freeze([
  'MOVE',
  'STRETCH',
  'ROUTE_ELBOW',
  'VALVE_ASSEMBLY',
  'FLANGE',
  'REDUCER',
  'BRANCH',
  'BLIND_FLANGE',
]);

export const TOPOLOGY_EDIT_AUTHORING_PHASES = Object.freeze([
  'IDLE',
  'TARGET_REQUIRED',
  'PARAMETERS_REQUIRED',
  'PREVIEW_READY',
  'VALIDATING',
  'READY_TO_APPLY',
  'BLOCKED',
  'APPLIED',
]);

const TOOL_SET = new Set(TOPOLOGY_EDIT_AUTHORING_TOOLS);
const PHASE_SET = new Set(TOPOLOGY_EDIT_AUTHORING_PHASES);

const TOOL_DEFINITIONS = deepFreeze({
  MOVE: {
    label: 'Move',
    targetKinds: ['node', 'run'],
    fields: [
      numberField('deltaX', 'Delta X', 'mm', 0),
      numberField('deltaY', 'Delta Y', 'mm', 0),
      numberField('deltaZ', 'Delta Z', 'mm', 0),
      enumField('axisLock', 'Axis lock', ['FREE', 'X', 'Y', 'Z'], 'FREE'),
    ],
  },
  STRETCH: {
    label: 'Stretch',
    targetKinds: ['open-endpoint'],
    fields: [
      numberField('newLengthMm', 'New length', 'mm', null, { positive: true }),
      numberField('deltaLengthMm', 'Length change', 'mm', 0),
      enumField('directionLock', 'Direction', ['EDGE_AXIS'], 'EDGE_AXIS'),
    ],
  },
  ROUTE_ELBOW: {
    label: 'Route + elbow',
    targetKinds: ['open-endpoint'],
    fields: [
      numberField('offsetX', 'Offset X', 'mm', 0),
      numberField('offsetY', 'Offset Y', 'mm', 0),
      numberField('offsetZ', 'Offset Z', 'mm', 0),
      numberField('nominalSizeMm', 'Nominal size', 'mm', null, { positive: true }),
      numberField('angleDeg', 'Elbow angle', 'deg', 90, { positive: true }),
      enumField('radiusType', 'Radius', ['LR', 'SR', 'CUSTOM'], 'LR'),
      numberField('radiusMm', 'Centerline radius', 'mm', null, { positive: true }),
      textField('pipingClass', 'Piping class'),
      numberField('componentMassKg', 'Weight', 'kg', null, { positive: true, authority: 'CATALOGUE' }),
    ],
  },
  VALVE_ASSEMBLY: {
    label: 'Valve with two flanges',
    targetKinds: ['straight-edge'],
    fields: [
      numberField('stationMm', 'Insertion station', 'mm', null, { positive: true }),
      textField('valveRecordId', 'Valve catalogue record'),
      textField('upstreamFlangeRecordId', 'Upstream flange record'),
      textField('downstreamFlangeRecordId', 'Downstream flange record'),
      textField('valveType', 'Valve type', { authority: 'CATALOGUE' }),
      textField('pressureClass', 'Rating', { authority: 'CATALOGUE' }),
      numberField('faceToFaceMm', 'Valve face-to-face', 'mm', null, { positive: true, authority: 'CATALOGUE' }),
      numberField('assemblyMassKg', 'Assembly weight', 'kg', null, { positive: true, authority: 'DERIVED' }),
    ],
  },
  FLANGE: {
    label: 'Flange',
    targetKinds: ['straight-edge', 'open-endpoint'],
    fields: [
      numberField('stationMm', 'Insertion station', 'mm', null, { positive: true }),
      textField('catalogueRecordId', 'Catalogue record'),
      textField('flangeType', 'Flange type', { authority: 'CATALOGUE' }),
      textField('pressureClass', 'Rating', { authority: 'CATALOGUE' }),
      textField('facing', 'Facing', { authority: 'CATALOGUE' }),
      numberField('componentMassKg', 'Weight', 'kg', null, { positive: true, authority: 'CATALOGUE' }),
    ],
  },
  REDUCER: {
    label: 'Reducer',
    targetKinds: ['straight-edge', 'open-endpoint'],
    fields: [
      numberField('stationMm', 'Insertion station', 'mm', null, { positive: true }),
      numberField('fromNominalSizeMm', 'From size', 'mm', null, { positive: true }),
      numberField('toNominalSizeMm', 'To size', 'mm', null, { positive: true }),
      enumField('reducerType', 'Reducer type', ['CONCENTRIC', 'ECCENTRIC'], 'CONCENTRIC'),
      enumField('orientation', 'Orientation', [
        'CONCENTRIC', 'FLAT_TOP', 'FLAT_BOTTOM', 'FLAT_LEFT', 'FLAT_RIGHT',
      ], 'CONCENTRIC'),
      numberField('componentLengthMm', 'Length', 'mm', null, { positive: true, authority: 'CATALOGUE' }),
      numberField('componentMassKg', 'Weight', 'kg', null, { positive: true, authority: 'CATALOGUE' }),
    ],
  },
  BRANCH: {
    label: 'Branch',
    targetKinds: ['straight-edge'],
    fields: [
      numberField('stationMm', 'Host station', 'mm', null, { positive: true }),
      enumField('junctionType', 'Junction', ['TEE', 'OLET'], 'TEE'),
      numberField('branchNominalSizeMm', 'Branch size', 'mm', 50, { positive: true }),
      numberField('branchAngleDeg', 'Branch angle', 'deg', 90, { positive: true }),
      numberField('branchLengthMm', 'Branch length', 'mm', null, { positive: true }),
      numberField('directionX', 'Direction X', null, 0),
      numberField('directionY', 'Direction Y', null, 1),
      numberField('directionZ', 'Direction Z', null, 0),
      textField('pipingClass', 'Piping class'),
      numberField('componentMassKg', 'Junction weight', 'kg', null, { positive: true, authority: 'CATALOGUE' }),
    ],
  },
  BLIND_FLANGE: {
    label: 'Blind flange',
    targetKinds: ['open-endpoint'],
    fields: [
      textField('catalogueRecordId', 'Catalogue record'),
      numberField('nominalSizeMm', 'Nominal size', 'mm', null, { positive: true }),
      textField('pressureClass', 'Rating', { authority: 'CATALOGUE' }),
      textField('facing', 'Facing', { authority: 'CATALOGUE' }),
      numberField('thicknessMm', 'Thickness', 'mm', null, { positive: true, authority: 'CATALOGUE' }),
      numberField('componentMassKg', 'Weight', 'kg', null, { positive: true, authority: 'CATALOGUE' }),
    ],
  },
});

export function topologyEditAuthoringToolDefinition(toolInput) {
  const tool = normalizeTool(toolInput);
  return TOOL_DEFINITIONS[tool];
}

export function createTopologyEditAuthoringSession(input = {}) {
  const tool = input.tool ? normalizeTool(input.tool) : null;
  const material = {
    schema: TOPOLOGY_EDIT_AUTHORING_SESSION_SCHEMA,
    revision: nonNegativeInteger(input.revision ?? 0, 'revision'),
    phase: tool ? 'TARGET_REQUIRED' : 'IDLE',
    tool,
    selection: normalizeSelection(input.selection),
    target: null,
    properties: tool ? defaultProperties(tool) : {},
    propertyAuthorities: tool ? defaultAuthorities(tool) : {},
    preview: null,
    validation: null,
    diagnostics: [],
    lastAppliedTransactionHash: null,
  };
  return freezeSession(material);
}

export function activateTopologyEditAuthoringTool(sessionInput, toolInput) {
  const session = assertTopologyEditAuthoringSession(sessionInput);
  const tool = normalizeTool(toolInput);
  return transition(session, {
    phase: 'TARGET_REQUIRED',
    tool,
    target: null,
    properties: defaultProperties(tool),
    propertyAuthorities: defaultAuthorities(tool),
    preview: null,
    validation: null,
    diagnostics: [],
  });
}

export function setTopologyEditAuthoringSelection(sessionInput, selectionInput) {
  const session = assertTopologyEditAuthoringSession(sessionInput);
  const selection = normalizeSelection(selectionInput);
  return transition(session, {
    selection,
    target: null,
    preview: null,
    validation: null,
    diagnostics: [],
    phase: session.tool ? 'TARGET_REQUIRED' : 'IDLE',
  });
}

export function setTopologyEditAuthoringTarget(sessionInput, targetInput) {
  const session = assertTopologyEditAuthoringSession(sessionInput);
  if (!session.tool) fail('a tool must be active before selecting a target.', RangeError);
  const target = normalizeTarget(targetInput);
  const allowed = new Set(TOOL_DEFINITIONS[session.tool].targetKinds);
  if (!allowed.has(target.kind)) {
    fail(`${session.tool} does not accept target kind ${target.kind}.`, RangeError);
  }
  return transition(session, {
    target,
    phase: 'PARAMETERS_REQUIRED',
    preview: null,
    validation: null,
    diagnostics: [],
  });
}

export function updateTopologyEditAuthoringProperties(sessionInput, patchInput, authority = 'USER_INPUT') {
  const session = assertTopologyEditAuthoringSession(sessionInput);
  if (!session.tool || !session.target) {
    fail('tool and target are required before editing properties.', RangeError);
  }
  if (!patchInput || typeof patchInput !== 'object' || Array.isArray(patchInput)) {
    fail('property patch must be an object.');
  }
  const definition = TOOL_DEFINITIONS[session.tool];
  const fields = new Map(definition.fields.map((field) => [field.key, field]));
  const properties = { ...session.properties };
  const propertyAuthorities = { ...session.propertyAuthorities };
  for (const [key, value] of Object.entries(patchInput)) {
    const field = fields.get(key);
    if (!field) fail(`unsupported ${session.tool} property ${key}.`, RangeError);
    properties[key] = normalizeFieldValue(field, value);
    propertyAuthorities[key] = normalizeAuthority(authority);
  }
  return transition(session, {
    properties,
    propertyAuthorities,
    phase: 'PARAMETERS_REQUIRED',
    preview: null,
    validation: null,
    diagnostics: [],
  });
}

export function publishTopologyEditAuthoringPreview(sessionInput, previewInput) {
  const session = assertTopologyEditAuthoringSession(sessionInput);
  if (!session.tool || !session.target) fail('tool and target are required for preview.', RangeError);
  const preview = normalizePreview(previewInput);
  return transition(session, {
    preview,
    validation: null,
    diagnostics: [],
    phase: 'PREVIEW_READY',
  });
}

export function beginTopologyEditAuthoringValidation(sessionInput) {
  const session = assertTopologyEditAuthoringSession(sessionInput);
  if (!session.preview) fail('preview is required before validation.', RangeError);
  return transition(session, {
    phase: 'VALIDATING',
    validation: null,
    diagnostics: [],
  });
}

export function completeTopologyEditAuthoringValidation(sessionInput, validationInput) {
  const session = assertTopologyEditAuthoringSession(sessionInput);
  if (session.phase !== 'VALIDATING') fail('session is not validating.', RangeError);
  const validation = normalizeValidation(validationInput);
  return transition(session, {
    validation,
    diagnostics: validation.diagnostics,
    phase: validation.blockingIssueCount === 0 ? 'READY_TO_APPLY' : 'BLOCKED',
  });
}

export function markTopologyEditAuthoringApplied(sessionInput, transactionHashInput) {
  const session = assertTopologyEditAuthoringSession(sessionInput);
  if (session.phase !== 'READY_TO_APPLY') fail('validated authoring state is not ready to apply.', RangeError);
  const transactionHash = requiredText(transactionHashInput, 'transactionHash');
  return transition(session, {
    phase: 'APPLIED',
    lastAppliedTransactionHash: transactionHash,
  });
}

export function cancelTopologyEditAuthoring(sessionInput) {
  const session = assertTopologyEditAuthoringSession(sessionInput);
  return createTopologyEditAuthoringSession({
    revision: session.revision + 1,
    selection: session.selection,
  });
}

export function assertTopologyEditAuthoringSession(value) {
  if (!value || value.schema !== TOPOLOGY_EDIT_AUTHORING_SESSION_SCHEMA) {
    fail(`session must use ${TOPOLOGY_EDIT_AUTHORING_SESSION_SCHEMA}.`);
  }
  if (!PHASE_SET.has(value.phase)) fail(`unsupported phase ${value.phase}.`, RangeError);
  if (value.tool !== null && !TOOL_SET.has(value.tool)) fail(`unsupported tool ${value.tool}.`, RangeError);
  const supplied = { ...value };
  delete supplied.sessionHash;
  if (value.sessionHash !== semanticHash(supplied)) fail('session hash mismatch.', RangeError);
  return value;
}

function transition(session, patch) {
  const material = {
    ...session,
    ...patch,
    revision: session.revision + 1,
  };
  delete material.sessionHash;
  return freezeSession(material);
}

function freezeSession(material) {
  return deepFreeze({ ...material, sessionHash: semanticHash(material) });
}

function defaultProperties(tool) {
  return Object.fromEntries(TOOL_DEFINITIONS[tool].fields.map((field) => [
    field.key,
    field.defaultValue,
  ]));
}

function defaultAuthorities(tool) {
  return Object.fromEntries(TOOL_DEFINITIONS[tool].fields.map((field) => [
    field.key,
    field.authority,
  ]));
}

function normalizeSelection(value) {
  const canonicalIds = Array.isArray(value?.canonicalIds)
    ? [...new Set(value.canonicalIds.map((id) => requiredText(id, 'selection canonical ID')))].sort()
    : [];
  const primaryId = value?.primaryId ? requiredText(value.primaryId, 'selection.primaryId') : null;
  if (primaryId && !canonicalIds.includes(primaryId)) canonicalIds.push(primaryId);
  canonicalIds.sort();
  return { canonicalIds, primaryId };
}

function normalizeTarget(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('target must be an object.');
  return {
    kind: requiredText(value.kind, 'target.kind').toLowerCase(),
    canonicalIds: Array.isArray(value.canonicalIds)
      ? [...new Set(value.canonicalIds.map((id) => requiredText(id, 'target canonical ID')))].sort()
      : [],
    stationMm: optionalFinite(value.stationMm, 'target.stationMm'),
    position: value.position ? finitePoint(value.position, 'target.position') : null,
    direction: value.direction ? finitePoint(value.direction, 'target.direction') : null,
    targetHash: requiredText(value.targetHash, 'target.targetHash'),
  };
}

function normalizePreview(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('preview must be an object.');
  return {
    previewHash: requiredText(value.previewHash, 'preview.previewHash'),
    planHash: requiredText(value.planHash, 'preview.planHash'),
    candidateCanonicalHash: requiredText(
      value.candidateCanonicalHash,
      'preview.candidateCanonicalHash',
    ),
    changedCanonicalIds: Array.isArray(value.changedCanonicalIds)
      ? [...new Set(value.changedCanonicalIds.map((id) => requiredText(id, 'preview changed ID')))].sort()
      : [],
  };
}

function normalizeValidation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('validation must be an object.');
  const diagnostics = Array.isArray(value.diagnostics)
    ? value.diagnostics.map((row, index) => ({
      code: requiredText(row?.code, `validation.diagnostics[${index}].code`).toUpperCase(),
      severity: requiredText(row?.severity ?? 'INFO', `validation.diagnostics[${index}].severity`).toUpperCase(),
      message: requiredText(row?.message, `validation.diagnostics[${index}].message`),
    }))
    : [];
  const blockingIssueCount = nonNegativeInteger(
    value.blockingIssueCount ?? diagnostics.filter((row) => row.severity === 'HIGH').length,
    'validation.blockingIssueCount',
  );
  return {
    validationHash: requiredText(value.validationHash, 'validation.validationHash'),
    status: requiredText(value.status, 'validation.status').toUpperCase(),
    blockingIssueCount,
    diagnostics,
  };
}

function normalizeFieldValue(field, value) {
  if (value === null || value === '') return null;
  if (field.type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) fail(`${field.label} must be finite.`, RangeError);
    if (field.positive && !(number > 0)) fail(`${field.label} must be positive.`, RangeError);
    return Object.is(number, -0) ? 0 : number;
  }
  const text = requiredText(value, field.label);
  if (field.type === 'enum' && !field.options.includes(text.toUpperCase())) {
    fail(`${field.label} has unsupported value ${text}.`, RangeError);
  }
  return field.type === 'enum' ? text.toUpperCase() : text;
}

function normalizeTool(value) {
  const tool = requiredText(value, 'tool').toUpperCase();
  if (!TOOL_SET.has(tool)) fail(`unsupported tool ${tool}.`, RangeError);
  return tool;
}

function normalizeAuthority(value) {
  const authority = requiredText(value, 'property authority').toUpperCase();
  if (!['SOURCE', 'CATALOGUE', 'DERIVED', 'USER_INPUT', 'USER_OVERRIDE'].includes(authority)) {
    fail(`unsupported property authority ${authority}.`, RangeError);
  }
  return authority;
}

function finitePoint(value, label) {
  const point = { x: Number(value?.x), y: Number(value?.y), z: Number(value?.z) };
  if (!Object.values(point).every(Number.isFinite)) fail(`${label} must contain finite x, y and z.`, RangeError);
  return point;
}

function optionalFinite(value, label) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) fail(`${label} must be finite.`, RangeError);
  return Object.is(number, -0) ? 0 : number;
}

function numberField(key, label, unit, defaultValue, options = {}) {
  return {
    key,
    label,
    unit,
    type: 'number',
    defaultValue,
    positive: Boolean(options.positive),
    authority: options.authority ?? 'USER_INPUT',
  };
}

function enumField(key, label, options, defaultValue) {
  return {
    key,
    label,
    unit: null,
    type: 'enum',
    options,
    defaultValue,
    positive: false,
    authority: 'USER_INPUT',
  };
}

function textField(key, label, options = {}) {
  return {
    key,
    label,
    unit: null,
    type: 'text',
    defaultValue: null,
    positive: false,
    authority: options.authority ?? 'USER_INPUT',
  };
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) fail(`${label} must be a non-negative integer.`, RangeError);
  return number;
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}

function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditAuthoringSession: ${message}`);
}

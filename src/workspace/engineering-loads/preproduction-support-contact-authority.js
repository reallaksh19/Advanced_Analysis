import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord, stringValue } from '../../core/shared-piping-model/immutable.js';
import { validateNonFeaAnalysisTopology } from '../../core/non-fea-engineering-foundation/analysis-topology.js';
import { validateNonFeaEffectiveRestraintCapabilityModel } from '../../core/non-fea-engineering-foundation/effective-restraint-capability.js';
import { validateRestraintCapabilityModel } from '../../core/support-restraints/index.js';

export const PREPRODUCTION_SUPPORT_CONTACT_SEMANTICS_SCHEMA =
  'engineering-preproduction-support-contact-semantics/v1';
export const PREPRODUCTION_SUPPORT_CONTACT_AUTHORITY_SCHEMA =
  'engineering-preproduction-support-contact-authority/v1';
export const PREPRODUCTION_SUPPORT_CONTACT_CURRENTNESS_SCHEMA =
  'engineering-preproduction-support-contact-currentness/v1';

const CONTACT_CAPABILITIES = Object.freeze([
  'UNILATERAL_REST',
  'BILATERAL',
  'SPRING',
  'UNRESOLVED',
]);
const INITIAL_STATES = Object.freeze(['CONTACTING', 'OPEN', 'UNRESOLVED']);
const TL03_VERTICAL_STATES = Object.freeze(['GAP', 'RESTRAINED']);
const GLOBAL_Z_PLUS = Object.freeze([0, 0, 1]);

/**
 * Explicit per-support contact semantics. This is review/adjudication evidence,
 * not mechanics authority. It intentionally does not accept stiffness,
 * displacement, reaction tolerance or final reaction fields.
 */
export function createPreproductionSupportContactSemantics(input) {
  exactKeys(input, [
    'supportKey', 'capability', 'verticalContactDirection',
    'tensileReactionPermitted', 'initialState', 'source',
  ], 'preproduction support-contact semantics input');
  const draft = {
    schema: PREPRODUCTION_SUPPORT_CONTACT_SEMANTICS_SCHEMA,
    supportKey: requiredText(input.supportKey, 'supportKey'),
    capability: oneOf(input.capability, CONTACT_CAPABILITIES, 'capability'),
    verticalContactDirection: oneOf(
      input.verticalContactDirection,
      ['GLOBAL_Z_PLUS', 'UNRESOLVED'],
      'verticalContactDirection',
    ),
    tensileReactionPermitted: booleanValue(input.tensileReactionPermitted, 'tensileReactionPermitted'),
    initialState: oneOf(input.initialState, INITIAL_STATES, 'initialState'),
    source: requireSourceIdentity(input.source, 'contact semantics source'),
  };
  return deepFreeze({ ...draft, semanticHash: semanticHash(draft) });
}

export function requirePreproductionSupportContactSemantics(value) {
  exactKeys(value, [
    'schema', 'supportKey', 'capability', 'verticalContactDirection',
    'tensileReactionPermitted', 'initialState', 'source', 'semanticHash',
  ], 'preproduction support-contact semantics');
  if (value.schema !== PREPRODUCTION_SUPPORT_CONTACT_SEMANTICS_SCHEMA) {
    throw codedError('Unexpected support-contact semantics schema.', 'PREPRODUCTION_SUPPORT_CONTACT_SEMANTICS_SCHEMA_INVALID');
  }
  const normalized = createPreproductionSupportContactSemantics({
    supportKey: value.supportKey,
    capability: value.capability,
    verticalContactDirection: value.verticalContactDirection,
    tensileReactionPermitted: value.tensileReactionPermitted,
    initialState: value.initialState,
    source: value.source,
  });
  if (normalized.semanticHash !== value.semanticHash) {
    throw codedError('Support-contact semantics are stale or tampered.', 'PREPRODUCTION_SUPPORT_CONTACT_SEMANTICS_HASH_MISMATCH');
  }
  return normalized;
}

/**
 * Builds source-bound, per-instance support/contact authority for later
 * nonlinear/contact qualification. It performs no reaction calculation and
 * deliberately refuses to promote generic restraint stiffness into TL-02
 * effective stiffness authority.
 */
export function buildPreproductionSupportContactAuthority(input) {
  exactKeys(input, [
    'analysisTopology', 'restraintCapabilityModel',
    'effectiveRestraintCapabilityModel', 'contactSemantics',
  ], 'preproduction support-contact authority input');

  const analysisTopology = requireAnalysisTopology(input.analysisTopology);
  const restraintModel = requireRestraintModel(input.restraintCapabilityModel);
  const effectiveModel = requireEffectiveRestraintModel(input.effectiveRestraintCapabilityModel);
  const contactSemantics = requireSemanticsList(input.contactSemantics);
  const blockers = [];

  if (analysisTopology.datasetId !== restraintModel.datasetId
      || effectiveModel.datasetId !== restraintModel.datasetId) {
    blockers.push(issue(
      'PREPRODUCTION_SUPPORT_CONTACT_DATASET_MISMATCH',
      'authority',
      'Analysis topology, source restraint model and effective restraint model must belong to one dataset.',
    ));
  }
  if (analysisTopology.sourceBindings?.restraintCapabilityModelSemanticHash !== restraintModel.semanticHash
      || effectiveModel.sourceRestraintCapabilitySemanticHash !== restraintModel.semanticHash) {
    blockers.push(issue(
      'PREPRODUCTION_SUPPORT_CONTACT_RESTRAINT_BINDING_MISMATCH',
      'authority',
      'Analysis/effective restraint authority must bind the exact source restraint capability model.',
    ));
  }
  if (analysisTopology.sourceBindings?.supportAttachmentModelSemanticHash !== effectiveModel.attachmentModelSemanticHash) {
    blockers.push(issue(
      'PREPRODUCTION_SUPPORT_CONTACT_ATTACHMENT_BINDING_MISMATCH',
      'authority',
      'Analysis topology and effective restraint authority must bind the exact support attachment model.',
    ));
  }
  if (effectiveModel.state !== 'READY') {
    blockers.push(issue(
      'PREPRODUCTION_SUPPORT_CONTACT_EFFECTIVE_RESTRAINT_BLOCKED',
      'authority',
      `Effective restraint authority state is ${effectiveModel.state}.`,
    ));
  }

  const stationIndex = uniqueIndex(
    analysisTopology.supportStations || [],
    (row) => row.supportKey,
    'analysis support stations',
  );
  const sourceRestraintIndex = uniqueIndex(
    restraintModel.restraints || [],
    (row) => row.supportKey,
    'source restraint rows',
  );
  const semanticsIndex = uniqueIndex(
    contactSemantics,
    (row) => row.supportKey,
    'contact semantics rows',
  );

  const expectedKeys = effectiveModel.restraints.map((row) => row.supportSiteId).sort(ascii);
  const semanticsKeys = [...semanticsIndex.keys()].sort(ascii);
  if (JSON.stringify(expectedKeys) !== JSON.stringify(semanticsKeys)) {
    blockers.push(issue(
      'PREPRODUCTION_SUPPORT_CONTACT_SEMANTICS_COVERAGE_MISMATCH',
      'authority',
      'Contact semantics must cover exactly every effective restraint support key.',
      { expectedSupportKeys: expectedKeys, actualSupportKeys: semanticsKeys },
    ));
  }

  const rows = effectiveModel.restraints.map((effectiveRow) => contactAuthorityRow({
    effectiveRow,
    station: only(stationIndex.get(effectiveRow.supportSiteId)),
    sourceRestraint: only(sourceRestraintIndex.get(effectiveRow.supportSiteId)),
    semantics: only(semanticsIndex.get(effectiveRow.supportSiteId)),
  })).sort((left, right) => ascii(left.supportKey, right.supportKey));

  rows.filter((row) => row.authorityStatus !== 'QUALIFIED_SOURCE_BOUND').forEach((row) => {
    blockers.push(...row.blockers.map((entry) => ({ ...entry, scope: row.supportKey })));
  });

  const normalizedBlockers = uniqueIssues(blockers);
  const summary = {
    supportCount: rows.length,
    qualifiedAuthorityCount: rows.filter((row) => row.authorityStatus === 'QUALIFIED_SOURCE_BOUND').length,
    tl03ReadyCount: rows.filter((row) => row.tl03Status === 'READY_FOR_TL03_CONTACT_INTAKE').length,
    tl03UnresolvedCount: rows.filter((row) => row.tl03Status === 'UNRESOLVED_GATE').length,
    blockerCount: normalizedBlockers.length,
  };
  const material = {
    schema: PREPRODUCTION_SUPPORT_CONTACT_AUTHORITY_SCHEMA,
    datasetId: restraintModel.datasetId,
    sourceBindings: {
      analysisTopologySemanticHash: analysisTopology.semanticHash,
      topologyGraphSemanticHash: analysisTopology.sourceBindings?.topologyGraphSemanticHash || null,
      supportAttachmentModelSemanticHash: effectiveModel.attachmentModelSemanticHash,
      restraintCapabilityModelSemanticHash: restraintModel.semanticHash,
      effectiveRestraintCapabilityModelSemanticHash: effectiveModel.semanticHash,
      supportSiteModelSemanticHash: analysisTopology.sourceBindings?.supportSiteModelSemanticHash || null,
      routePartitionModelSemanticHash: analysisTopology.sourceBindings?.routePartitionModelSemanticHash || null,
      contactSemanticsSemanticHashes: contactSemantics.map((row) => row.semanticHash).sort(ascii),
    },
    coordinateFrame: {
      basis: 'GLOBAL_XYZ_Z_UP',
      verticalContactDirection: 'GLOBAL_Z_PLUS',
      gapConvention: 'POSITIVE_OPEN_PIPE_TO_SUPPORT',
      gapUnit: 'M',
      routeChainageUnit: 'MM',
    },
    status: normalizedBlockers.length ? 'BLOCKED' : 'READY_FOR_PREPRODUCTION_CONTACT_AUTHORITY',
    rows,
    blockers: normalizedBlockers,
    summary,
    policy: {
      productionCalculationConsumptionEnabled: false,
      gravityMutationPermitted: false,
      supportAvailabilityScenarioExecutionEnabled: false,
      gapMechanicsExecuted: false,
      springMechanicsExecuted: false,
      frictionMechanicsExecuted: false,
      liftOffExecuted: false,
      activeSetRedistributionEnabled: false,
      finalHotReactionPublicationPermitted: false,
      tl03ContactAdapterPermitted: true,
      tl02StiffnessPromotionPermitted: false,
      reactionToleranceAuthorityCreated: false,
      supportMovementAuthorityCreated: false,
    },
  };
  return requirePreproductionSupportContactAuthority(deepFreeze({
    ...material,
    semanticHash: semanticHash(material),
  }));
}

export function requirePreproductionSupportContactAuthority(value) {
  exactKeys(value, [
    'schema', 'datasetId', 'sourceBindings', 'coordinateFrame', 'status',
    'rows', 'blockers', 'summary', 'policy', 'semanticHash',
  ], 'preproduction support-contact authority');
  if (value.schema !== PREPRODUCTION_SUPPORT_CONTACT_AUTHORITY_SCHEMA) {
    throw codedError('Unexpected preproduction support-contact authority schema.', 'PREPRODUCTION_SUPPORT_CONTACT_SCHEMA_INVALID');
  }
  requiredText(value.datasetId, 'datasetId');
  if (!['READY_FOR_PREPRODUCTION_CONTACT_AUTHORITY', 'BLOCKED'].includes(value.status)) {
    throw codedError('Preproduction support-contact authority status is invalid.', 'PREPRODUCTION_SUPPORT_CONTACT_STATUS_INVALID');
  }
  if (!Array.isArray(value.rows) || !Array.isArray(value.blockers)) {
    throw new TypeError('Preproduction support-contact authority rows/blockers must be arrays.');
  }
  const keys = value.rows.map((row) => validateAuthorityRow(row));
  if (!strictlySortedUnique(keys)) {
    throw codedError('Support-contact authority rows must be unique and supportKey-sorted.', 'PREPRODUCTION_SUPPORT_CONTACT_ROW_ORDER_INVALID');
  }
  const expectedSummary = {
    supportCount: value.rows.length,
    qualifiedAuthorityCount: value.rows.filter((row) => row.authorityStatus === 'QUALIFIED_SOURCE_BOUND').length,
    tl03ReadyCount: value.rows.filter((row) => row.tl03Status === 'READY_FOR_TL03_CONTACT_INTAKE').length,
    tl03UnresolvedCount: value.rows.filter((row) => row.tl03Status === 'UNRESOLVED_GATE').length,
    blockerCount: value.blockers.length,
  };
  if (semanticHash(value.summary) !== semanticHash(expectedSummary)) {
    throw codedError('Support-contact authority summary is stale.', 'PREPRODUCTION_SUPPORT_CONTACT_SUMMARY_INVALID');
  }
  if (value.policy?.productionCalculationConsumptionEnabled !== false
      || value.policy?.gravityMutationPermitted !== false
      || value.policy?.supportAvailabilityScenarioExecutionEnabled !== false
      || value.policy?.gapMechanicsExecuted !== false
      || value.policy?.springMechanicsExecuted !== false
      || value.policy?.frictionMechanicsExecuted !== false
      || value.policy?.liftOffExecuted !== false
      || value.policy?.activeSetRedistributionEnabled !== false
      || value.policy?.finalHotReactionPublicationPermitted !== false
      || value.policy?.tl03ContactAdapterPermitted !== true
      || value.policy?.tl02StiffnessPromotionPermitted !== false
      || value.policy?.reactionToleranceAuthorityCreated !== false
      || value.policy?.supportMovementAuthorityCreated !== false) {
    throw codedError('Support-contact authority crossed the preproduction boundary.', 'PREPRODUCTION_SUPPORT_CONTACT_POLICY_INVALID');
  }
  if (value.status === 'READY_FOR_PREPRODUCTION_CONTACT_AUTHORITY' && value.blockers.length) {
    throw codedError('READY support-contact authority cannot retain blockers.', 'PREPRODUCTION_SUPPORT_CONTACT_READY_INVALID');
  }
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) {
    throw codedError('Support-contact authority semantic hash mismatch.', 'PREPRODUCTION_SUPPORT_CONTACT_HASH_MISMATCH');
  }
  return deepFreeze(structuredClone(value));
}

export function evaluatePreproductionSupportContactAuthorityCurrentness(input) {
  exactKeys(input, [
    'authority', 'analysisTopology', 'restraintCapabilityModel',
    'effectiveRestraintCapabilityModel', 'contactSemantics',
  ], 'preproduction support-contact currentness input');
  const authority = requirePreproductionSupportContactAuthority(input.authority);
  const rebuilt = buildPreproductionSupportContactAuthority({
    analysisTopology: input.analysisTopology,
    restraintCapabilityModel: input.restraintCapabilityModel,
    effectiveRestraintCapabilityModel: input.effectiveRestraintCapabilityModel,
    contactSemantics: input.contactSemantics,
  });
  const differences = [];
  if (authority.semanticHash !== rebuilt.semanticHash) differences.push('authoritySemanticHash');
  if (authority.sourceBindings.analysisTopologySemanticHash !== rebuilt.sourceBindings.analysisTopologySemanticHash) differences.push('analysisTopologySemanticHash');
  if (authority.sourceBindings.effectiveRestraintCapabilityModelSemanticHash !== rebuilt.sourceBindings.effectiveRestraintCapabilityModelSemanticHash) differences.push('effectiveRestraintCapabilityModelSemanticHash');
  if (semanticHash(authority.sourceBindings.contactSemanticsSemanticHashes)
      !== semanticHash(rebuilt.sourceBindings.contactSemanticsSemanticHashes)) differences.push('contactSemanticsSemanticHashes');
  const material = {
    schema: PREPRODUCTION_SUPPORT_CONTACT_CURRENTNESS_SCHEMA,
    authoritySemanticHash: authority.semanticHash,
    observedAuthoritySemanticHash: rebuilt.semanticHash,
    status: differences.length ? 'STALE_REBUILD_REQUIRED' : 'CURRENT',
    differences,
    productionCalculationConsumptionEnabled: false,
  };
  return deepFreeze({ ...material, semanticHash: semanticHash(material) });
}

function contactAuthorityRow({ effectiveRow, station, sourceRestraint, semantics }) {
  const supportKey = requiredText(effectiveRow.supportSiteId, 'effective restraint support key');
  const blockers = [];
  if (!station || !station.supportSiteId || !Number.isFinite(station.chainageMm)) {
    blockers.push(issue(
      'PREPRODUCTION_SUPPORT_CONTACT_STATION_UNRESOLVED',
      supportKey,
      'Exact support-site identity and route chainage are required.',
    ));
  }
  if (!sourceRestraint) {
    blockers.push(issue(
      'PREPRODUCTION_SUPPORT_CONTACT_SOURCE_RESTRAINT_MISSING',
      supportKey,
      'Exact source restraint capability row is required.',
    ));
  }
  if (!semantics) {
    blockers.push(issue(
      'PREPRODUCTION_SUPPORT_CONTACT_SEMANTICS_MISSING',
      supportKey,
      'Explicit per-support contact semantics are required.',
    ));
  }

  const effective = effectiveRow.effectiveCapability || {};
  const source = effectiveRow.sourceCapability || {};
  const effectiveType = canonicalType(effective.type);
  const effectiveDirection = canonicalType(effective.direction);
  const effectiveAxis = normalizeAxis(effective.explicitAxis);
  const gapMm = Number.isFinite(effective.gapMm) ? effective.gapMm : null;
  if (gapMm === null || gapMm < 0) {
    blockers.push(issue(
      'PREPRODUCTION_SUPPORT_CONTACT_GAP_UNRESOLVED',
      supportKey,
      'A finite non-negative effective cold gap in millimetres is required.',
    ));
  }

  if (semantics) {
    if (semantics.capability === 'UNRESOLVED') {
      blockers.push(issue(
        'PREPRODUCTION_SUPPORT_CONTACT_CAPABILITY_UNRESOLVED',
        supportKey,
        'Contact capability remains explicitly unresolved.',
      ));
    } else if (effectiveType !== semantics.capability) {
      blockers.push(issue(
        'PREPRODUCTION_SUPPORT_CONTACT_CAPABILITY_MISMATCH',
        supportKey,
        'Explicit contact semantics must equal the governed effective restraint type; no type inference is permitted.',
        { effectiveType, declaredCapability: semantics.capability },
      ));
    }
    if (semantics.verticalContactDirection !== 'GLOBAL_Z_PLUS'
        || effectiveDirection !== 'VERTICAL'
        || !sameAxis(effectiveAxis, GLOBAL_Z_PLUS)) {
      blockers.push(issue(
        'PREPRODUCTION_SUPPORT_CONTACT_DIRECTION_UNRESOLVED',
        supportKey,
        'GLOBAL_Z_PLUS contact requires governed VERTICAL direction and explicit +Z axis.',
        { effectiveDirection, effectiveAxis },
      ));
    }
    if (semantics.capability === 'UNILATERAL_REST' && semantics.tensileReactionPermitted !== false) {
      blockers.push(issue(
        'PREPRODUCTION_SUPPORT_CONTACT_UNILATERAL_TENSION_INVALID',
        supportKey,
        'UNILATERAL_REST must explicitly prohibit tensile reaction.',
      ));
    }
    if (semantics.capability === 'BILATERAL' && semantics.tensileReactionPermitted !== true) {
      blockers.push(issue(
        'PREPRODUCTION_SUPPORT_CONTACT_BILATERAL_TENSION_UNRESOLVED',
        supportKey,
        'BILATERAL contact must explicitly permit tensile reaction.',
      ));
    }
  }

  const authorityStatus = blockers.length ? 'BLOCKED' : 'QUALIFIED_SOURCE_BOUND';
  const verticalState = source.translationalStates?.vertical || 'UNKNOWN';
  const tl03Blockers = [...blockers];
  if (semantics?.capability !== 'UNILATERAL_REST') {
    tl03Blockers.push(issue(
      'PREPRODUCTION_SUPPORT_CONTACT_TL03_CAPABILITY_UNSUPPORTED',
      supportKey,
      'TL-03 contact intake currently admits UNILATERAL_REST only.',
    ));
  }
  if (semantics?.initialState !== 'CONTACTING') {
    tl03Blockers.push(issue(
      'PREPRODUCTION_SUPPORT_CONTACT_TL03_INITIAL_STATE_UNSUPPORTED',
      supportKey,
      'TL-03 local screening requires an explicitly CONTACTING cold state.',
    ));
  }
  if (!TL03_VERTICAL_STATES.includes(verticalState)) {
    tl03Blockers.push(issue(
      'PREPRODUCTION_SUPPORT_CONTACT_TL03_VERTICAL_STATE_UNSUPPORTED',
      supportKey,
      'TL-03 contact intake requires governed GAP or RESTRAINED vertical source state.',
      { verticalState },
    ));
  }

  const rowMaterial = {
    supportKey,
    supportSiteId: station?.supportSiteId || null,
    routeId: station?.routeId || null,
    routeChainageMm: Number.isFinite(station?.chainageMm) ? station.chainageMm : null,
    restraintId: effectiveRow.restraintId,
    attachmentId: effectiveRow.attachmentId || null,
    attachedComponentKey: effectiveRow.attachedComponentKey || null,
    sourceRestraintCapabilityHash: sourceRestraint ? semanticHash(sourceRestraint) : null,
    contactSemanticsHash: semantics?.semanticHash || null,
    effectiveType,
    effectiveDirection,
    effectiveAxis,
    verticalState,
    capability: semantics?.capability || 'UNRESOLVED',
    tensileReactionPermitted: semantics?.tensileReactionPermitted ?? null,
    initialState: semantics?.initialState || 'UNRESOLVED',
    verticalContactDirection: semantics?.verticalContactDirection || 'UNRESOLVED',
    coldGapM: gapMm === null ? null : gapMm / 1000,
    gapConvention: 'POSITIVE_OPEN_PIPE_TO_SUPPORT',
    gapEvidenceHash: semanticHash(sourceRestraint?.gapEvidence || {}),
    restraintStiffnessEvidenceValue: Number.isFinite(effective.stiffnessNPerM) ? effective.stiffnessNPerM : null,
    stiffnessEvidenceHash: semanticHash({
      effectiveValue: Number.isFinite(effective.stiffnessNPerM) ? effective.stiffnessNPerM : null,
      sourceEvidence: sourceRestraint?.stiffnessEvidence || [],
    }),
    springRateEvidenceHash: semanticHash(sourceRestraint?.springRateEvidence || []),
    frictionCoefficient: Number.isFinite(effective.friction) ? effective.friction : null,
    frictionEvidenceHash: semanticHash({
      effectiveValue: Number.isFinite(effective.friction) ? effective.friction : null,
      sourceEvidence: sourceRestraint?.frictionEvidence || [],
    }),
    authorityStatus,
    tl03Status: authorityStatus === 'QUALIFIED_SOURCE_BOUND' && tl03Blockers.length === 0
      ? 'READY_FOR_TL03_CONTACT_INTAKE'
      : 'UNRESOLVED_GATE',
    blockers: uniqueIssues(blockers),
    tl03Blockers: uniqueIssues(tl03Blockers),
    evidenceOnly: {
      tl02EffectiveStiffnessAuthority: 'UNQUALIFIED_APPLICABILITY_REQUIRED',
      springMechanics: (sourceRestraint?.springRateEvidence || []).length
        ? 'EVIDENCE_ONLY_NOT_EXECUTED' : 'NOT_PROVIDED',
      frictionMechanics: Number.isFinite(effective.friction)
        ? 'EVIDENCE_ONLY_NOT_EXECUTED' : 'NOT_PROVIDED',
      supportMovementAuthority: 'NOT_PROVIDED_BY_THIS_CONTRACT',
      reactionToleranceAuthority: 'NOT_PROVIDED_BY_THIS_CONTRACT',
    },
  };
  return deepFreeze({ ...rowMaterial, semanticHash: semanticHash(rowMaterial) });
}

function validateAuthorityRow(row) {
  exactKeys(row, [
    'supportKey', 'supportSiteId', 'routeId', 'routeChainageMm', 'restraintId',
    'attachmentId', 'attachedComponentKey', 'sourceRestraintCapabilityHash',
    'contactSemanticsHash', 'effectiveType', 'effectiveDirection', 'effectiveAxis',
    'verticalState', 'capability', 'tensileReactionPermitted', 'initialState',
    'verticalContactDirection', 'coldGapM', 'gapConvention', 'gapEvidenceHash',
    'restraintStiffnessEvidenceValue', 'stiffnessEvidenceHash',
    'springRateEvidenceHash', 'frictionCoefficient', 'frictionEvidenceHash',
    'authorityStatus', 'tl03Status', 'blockers', 'tl03Blockers', 'evidenceOnly',
    'semanticHash',
  ], 'preproduction support-contact authority row');
  const supportKey = requiredText(row.supportKey, 'row.supportKey');
  if (!['QUALIFIED_SOURCE_BOUND', 'BLOCKED'].includes(row.authorityStatus)) {
    throw new TypeError('row.authorityStatus is invalid.');
  }
  if (!['READY_FOR_TL03_CONTACT_INTAKE', 'UNRESOLVED_GATE'].includes(row.tl03Status)) {
    throw new TypeError('row.tl03Status is invalid.');
  }
  if (!Array.isArray(row.blockers) || !Array.isArray(row.tl03Blockers)) {
    throw new TypeError('row blockers must be arrays.');
  }
  if (row.authorityStatus === 'QUALIFIED_SOURCE_BOUND') {
    requiredText(row.supportSiteId, 'row.supportSiteId');
    requiredText(row.routeId, 'row.routeId');
    if (!Number.isFinite(row.routeChainageMm)) throw new TypeError('row.routeChainageMm must be finite.');
    if (!Number.isFinite(row.coldGapM) || row.coldGapM < 0) throw new TypeError('row.coldGapM must be non-negative and finite.');
  }
  if (row.evidenceOnly?.tl02EffectiveStiffnessAuthority !== 'UNQUALIFIED_APPLICABILITY_REQUIRED'
      || row.evidenceOnly?.supportMovementAuthority !== 'NOT_PROVIDED_BY_THIS_CONTRACT'
      || row.evidenceOnly?.reactionToleranceAuthority !== 'NOT_PROVIDED_BY_THIS_CONTRACT') {
    throw codedError('Authority row promoted unavailable TL-02/TL-01/tolerance evidence.', 'PREPRODUCTION_SUPPORT_CONTACT_EVIDENCE_BOUNDARY_INVALID');
  }
  const { semanticHash: actual, ...material } = row;
  if (actual !== semanticHash(material)) {
    throw codedError('Support-contact authority row semantic hash mismatch.', 'PREPRODUCTION_SUPPORT_CONTACT_ROW_HASH_MISMATCH');
  }
  return supportKey;
}

function requireAnalysisTopology(value) {
  const validation = validateNonFeaAnalysisTopology(value);
  if (!validation.ok) throw new TypeError(`Preproduction contact authority requires valid analysis topology: ${validation.errors.join(' ')}`);
  return value;
}

function requireRestraintModel(value) {
  const validation = validateRestraintCapabilityModel(value);
  if (!validation.ok) throw new TypeError(`Preproduction contact authority requires valid source restraint model: ${validation.errors.join(' ')}`);
  return value;
}

function requireEffectiveRestraintModel(value) {
  const validation = validateNonFeaEffectiveRestraintCapabilityModel(value);
  if (!validation.ok) throw new TypeError(`Preproduction contact authority requires valid effective restraint model: ${validation.errors.join(' ')}`);
  return value;
}

function requireSemanticsList(value) {
  if (!Array.isArray(value)) throw new TypeError('contactSemantics must be an array.');
  const rows = value.map(requirePreproductionSupportContactSemantics).sort((left, right) => ascii(left.supportKey, right.supportKey));
  if (!strictlySortedUnique(rows.map((row) => row.supportKey))) {
    throw new TypeError('contactSemantics support keys must be unique.');
  }
  return rows;
}

function requireSourceIdentity(value, label) {
  exactKeys(value, ['sourceId', 'sourceRevision', 'sourceSemanticHash'], label);
  return deepFreeze({
    sourceId: requiredText(value.sourceId, `${label}.sourceId`),
    sourceRevision: requiredText(value.sourceRevision, `${label}.sourceRevision`),
    sourceSemanticHash: requiredHash(value.sourceSemanticHash, `${label}.sourceSemanticHash`),
  });
}

function uniqueIndex(rows, keyOf, label) {
  const map = new Map();
  rows.forEach((row) => {
    const key = requiredText(keyOf(row), `${label} key`);
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  });
  return map;
}

function only(rows) {
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

function normalizeAxis(value) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => !Number.isFinite(item))) return null;
  const magnitude = Math.hypot(...value);
  if (!(magnitude > 1e-12)) return null;
  return value.map((item) => item / magnitude);
}

function sameAxis(left, right) {
  return Array.isArray(left) && left.length === 3
    && left.every((value, index) => Math.abs(value - right[index]) <= 1e-12);
}

function canonicalType(value) {
  return stringValue(value).toUpperCase().replace(/[ -]+/gu, '_');
}

function issue(code, scope, message, details = null) {
  return deepFreeze({ code, severity: 'ERROR', scope, message, details });
}

function uniqueIssues(rows) {
  return [...new Map(rows.map((row) => [
    `${row.code}|${row.scope}|${row.message}|${semanticHash(row.details)}`,
    deepFreeze({ ...row }),
  ])).values()].sort((left, right) => ascii(`${left.code}|${left.scope}`, `${right.code}|${right.scope}`));
}

function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}

function requiredText(value, label) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${label} must be a non-empty string.`);
  return normalized;
}

function requiredHash(value, label) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    throw new TypeError(`${label} must be an FNV-1a semantic hash.`);
  }
  return value;
}

function booleanValue(value, label) {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be Boolean.`);
  return value;
}

function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw new TypeError(`${label} must be one of: ${allowed.join(', ')}.`);
  return value;
}

function strictlySortedUnique(values) {
  return values.every((value, index) => index === 0 || ascii(values[index - 1], value) < 0);
}

function ascii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

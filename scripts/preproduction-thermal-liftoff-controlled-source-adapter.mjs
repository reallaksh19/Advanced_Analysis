import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord, stringValue } from '../src/core/shared-piping-model/immutable.js';
import { requirePhysicalLoadCase } from '../src/core/linear-fea-load-case/index.js';
import { requireSolverExecution } from '../src/core/linear-fea-solver/index.js';
import { requirePreproductionSupportContactAuthority } from '../src/workspace/engineering-loads/preproduction-support-contact-authority.js';
import { createPreproductionThermalLiftoffDisplacementAuthority } from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-displacement-authority.js';
import {
  createPreproductionThermalLiftoffApplicabilityBinding,
  createPreproductionThermalLiftoffStiffnessEvidence,
  requirePreproductionThermalLiftoffReactionToleranceAuthority,
  requirePreproductionThermalLiftoffStiffnessEvidence,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-mechanics-authority.js';
import {
  buildPreproductionThermalLiftoffPrerequisiteAuthority,
  buildPreproductionThermalLiftoffPrerequisiteBridge,
  requirePreproductionThermalLiftoffPrerequisiteAuthority,
  requirePreproductionThermalLiftoffPrerequisiteBridge,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-prerequisite-authority.js';

export const PREPRODUCTION_TL_CONTROLLED_SOURCE_SCHEMA =
  'engineering-preproduction-thermal-liftoff-controlled-source-qualification/v1';

const FRAME_MATERIAL = { basis: 'GLOBAL_XYZ_Z_UP', verticalUnitVector: { x: 0, y: 0, z: 1 } };
const FRAME = deepFreeze({ ...FRAME_MATERIAL, semanticHash: semanticHash(FRAME_MATERIAL) });
const SUPPORT_MOVEMENT_SOURCE_KINDS = new Set(['GOVERNED_IMPORT', 'APPROVED_ENGINEERING_DATA', 'MEASURED_SURVEY']);

/**
 * Qualification-only adapter. It may consume already-sealed LFEA evidence to
 * prove the PR #938 source contracts, but it is not under src/, is never a Load
 * Calc dependency, never executes a solver, and never becomes TL runtime
 * authority. The produced PR #938 child authorities are the only downstream
 * shapes being qualified here.
 */
export function buildControlledThermalLiftoffSourceQualification(input) {
  exact(input, [
    'contactAuthority', 'referenceState', 'hotState', 'supportMappings',
    'stiffnessProbes', 'reactionTolerance',
  ], 'controlled source qualification input');

  const contact = requirePreproductionSupportContactAuthority(input.contactAuthority);
  if (contact.status !== 'READY_FOR_PREPRODUCTION_CONTACT_AUTHORITY') throw coded('TL_SOURCE_CONTACT_AUTHORITY_BLOCKED');
  const reference = sourceState(input.referenceState, 'referenceState');
  const hot = sourceState(input.hotState, 'hotState');
  sameStiffnessState(reference, hot, 'TL_SOURCE_TARGET_STIFFNESS_STATE_MISMATCH');

  const readyRows = contact.rows
    .filter((row) => row.tl03Status === 'READY_FOR_TL03_CONTACT_INTAKE')
    .sort((a, b) => ascii(a.supportSiteId, b.supportSiteId));
  const contactBySite = uniqueIndex(readyRows, 'supportSiteId', 'contact rows');
  const mappings = indexedList(input.supportMappings, supportMapping, 'support mappings');
  const probes = indexedList(input.stiffnessProbes, stiffnessProbe, 'stiffness probes');
  exactCoverage(contactBySite, mappings, 'TL_SOURCE_DISPLACEMENT_COVERAGE_MISMATCH');
  exactCoverage(contactBySite, probes, 'TL_SOURCE_STIFFNESS_COVERAGE_MISMATCH');

  const tolerance = requirePreproductionThermalLiftoffReactionToleranceAuthority(input.reactionTolerance);
  if (tolerance.qualification !== 'QUALIFIED') throw coded('TL_SOURCE_REACTION_TOLERANCE_UNQUALIFIED');

  const displacements = [];
  const stiffnessEntries = [];
  const sourceRows = [];
  for (const contactRow of readyRows) {
    const mapping = mappings.get(contactRow.supportSiteId);
    const probe = probes.get(contactRow.supportSiteId);
    if (mapping.nodeId !== probe.nodeId) throw coded('TL_SOURCE_NODE_BINDING_MISMATCH');

    const pipeDelta = subtract(translation(hot.execution, mapping.nodeId), translation(reference.execution, mapping.nodeId));
    const supportReference = vector(mapping.referenceSupportMovementM, 'referenceSupportMovementM');
    const supportHot = vector(mapping.hotSupportMovementM, 'hotSupportMovementM');
    const supportDelta = subtract(supportHot, supportReference);
    const movementSource = movementSourceIdentity(mapping.supportMovementSource);
    const displacementSourceHash = semanticHash({
      supportSiteId: contactRow.supportSiteId,
      nodeId: mapping.nodeId,
      referenceExecutionSemanticHash: reference.execution.semanticHash,
      hotExecutionSemanticHash: hot.execution.semanticHash,
      referencePhysicalLoadCaseHash: reference.loadCase.physicalLoadCaseHash,
      hotPhysicalLoadCaseHash: hot.loadCase.physicalLoadCaseHash,
      supportMovementSource: movementSource,
      supportReference,
      supportHot,
    });
    const displacement = createPreproductionThermalLiftoffDisplacementAuthority({
      displacementId: `TL01-CONTROLLED:${contactRow.supportSiteId}`,
      loadCaseId: hot.loadCase.loadCaseId,
      supportSiteId: contactRow.supportSiteId,
      coordinateFrame: FRAME,
      pipeDisplacementM: pipeDelta,
      supportDisplacementM: supportDelta,
      provenance: 'SOURCE_BACKED_SUPPORT_DISPLACEMENT',
      source: {
        sourceId: `CONTROLLED-SOLVER-DISPLACEMENT:${contactRow.supportSiteId}`,
        sourceRevision: text(hot.execution.modelRevision, 'hot execution modelRevision'),
        sourceSemanticHash: displacementSourceHash,
        sourceKind: 'GOVERNED_IMPORT',
      },
      mappingAuthority: null,
      horizontalComponentAuthority: mapping.horizontalComponentAuthority,
    });
    if (displacement.qualification !== 'QUALIFIED') throw coded('TL_SOURCE_DISPLACEMENT_UNQUALIFIED');

    const derived = deriveLocalStiffness({
      probe,
      contact,
      contactRow,
      targetState: reference,
    });
    displacements.push(displacement);
    stiffnessEntries.push(derived.stiffness);
    sourceRows.push(freezeHash({
      supportSiteId: contactRow.supportSiteId,
      nodeId: mapping.nodeId,
      contactRowSemanticHash: contactRow.semanticHash,
      displacementSemanticHash: displacement.semanticHash,
      stiffnessSemanticHash: derived.stiffness.semanticHash,
      zeroProbeExecutionSemanticHash: derived.zero.execution.semanticHash,
      displacedProbeExecutionSemanticHash: derived.displaced.execution.semanticHash,
      effectiveVerticalStiffnessNPerM: derived.stiffness.data.effectiveVerticalStiffnessNPerM,
    }));
  }

  displacements.sort((a, b) => ascii(a.supportSiteId, b.supportSiteId));
  stiffnessEntries.sort((a, b) => ascii(a.supportSiteId, b.supportSiteId));
  sourceRows.sort((a, b) => ascii(a.supportSiteId, b.supportSiteId));
  const prerequisiteAuthority = buildPreproductionThermalLiftoffPrerequisiteAuthority({
    contactAuthority: contact,
    displacements,
    stiffnessEntries,
    reactionTolerance: tolerance,
  });
  const prerequisiteBridge = buildPreproductionThermalLiftoffPrerequisiteBridge({
    authority: prerequisiteAuthority,
    displacements,
    stiffnessEntries,
    reactionTolerance: tolerance,
  });
  const ready = prerequisiteAuthority.status === 'READY_FOR_TL03_PREREQUISITE_BRIDGE'
    && prerequisiteBridge.status === 'READY_FOR_TL03_INPUT_RECONCILIATION';

  return requireControlledThermalLiftoffSourceQualification(freezeHash({
    schema: PREPRODUCTION_TL_CONTROLLED_SOURCE_SCHEMA,
    status: ready ? 'READY_FOR_TL03_CONTROLLED_SOURCE_RECONCILIATION' : 'UNRESOLVED_GATE',
    loadCaseId: hot.loadCase.loadCaseId,
    contactAuthoritySemanticHash: contact.semanticHash,
    referenceExecutionSemanticHash: reference.execution.semanticHash,
    hotExecutionSemanticHash: hot.execution.semanticHash,
    mechanicalModelSemanticHash: hot.execution.mechanicalModelSemanticHash,
    stiffnessStateHash: hot.execution.stiffnessStateHash,
    reactionToleranceSemanticHash: tolerance.semanticHash,
    displacements,
    stiffnessEntries,
    sourceRows,
    prerequisiteAuthority,
    prerequisiteBridge,
    summary: {
      supportCount: sourceRows.length,
      qualifiedDisplacementCount: displacements.length,
      qualifiedLocalStiffnessCount: stiffnessEntries.filter((row) => row.tl03LocalStiffnessEligible).length,
    },
    policy: {
      qualificationOnly: true,
      sourceSolverExecutedByAdapter: false,
      srcRuntimeDependencyCreated: false,
      reactionToleranceInferredFromSolver: false,
      solverInternalTolerancePromoted: false,
      localScreenExecutionPerformed: false,
      activeSetRedistributionPerformed: false,
      finalHotReactionPublicationPermitted: false,
      productionCalculationConsumptionEnabled: false,
      productionMethodRegistrationPermitted: false,
    },
  }));
}

export function requireControlledThermalLiftoffSourceQualification(value) {
  if (value?.schema !== PREPRODUCTION_TL_CONTROLLED_SOURCE_SCHEMA) throw coded('TL_CONTROLLED_SOURCE_SCHEMA_INVALID');
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) throw coded('TL_CONTROLLED_SOURCE_HASH_MISMATCH');
  value.stiffnessEntries.forEach(requirePreproductionThermalLiftoffStiffnessEvidence);
  requirePreproductionThermalLiftoffPrerequisiteAuthority(value.prerequisiteAuthority);
  requirePreproductionThermalLiftoffPrerequisiteBridge(value.prerequisiteBridge);
  const p = value.policy || {};
  if (p.qualificationOnly !== true
      || p.sourceSolverExecutedByAdapter !== false
      || p.srcRuntimeDependencyCreated !== false
      || p.reactionToleranceInferredFromSolver !== false
      || p.solverInternalTolerancePromoted !== false
      || p.localScreenExecutionPerformed !== false
      || p.activeSetRedistributionPerformed !== false
      || p.finalHotReactionPublicationPermitted !== false
      || p.productionCalculationConsumptionEnabled !== false
      || p.productionMethodRegistrationPermitted !== false) {
    throw coded('TL_CONTROLLED_SOURCE_POLICY_INVALID');
  }
  return deepFreeze(structuredClone(value));
}

function deriveLocalStiffness({ probe, contact, contactRow, targetState }) {
  const zero = sourceState(probe.zeroState, `zeroState:${contactRow.supportSiteId}`);
  const displaced = sourceState(probe.displacedState, `displacedState:${contactRow.supportSiteId}`);
  sameStiffnessState(zero, displaced, 'TL_SOURCE_PROBE_STIFFNESS_STATE_MISMATCH');
  sameStiffnessState(targetState, zero, 'TL_SOURCE_PROBE_TARGET_STIFFNESS_MISMATCH');
  if (probe.contactAuthoritySemanticHash !== contact.semanticHash) throw coded('TL_SOURCE_PROBE_CONTACT_BINDING_MISMATCH');

  const zeroPrimitive = prescribedProbePrimitive(zero.loadCase, probe.nodeId, true);
  const displacedPrimitive = prescribedProbePrimitive(displaced.loadCase, probe.nodeId, false);
  if (zeroPrimitive.prescribedSlotId !== displacedPrimitive.prescribedSlotId) throw coded('TL_SOURCE_PROBE_SLOT_MISMATCH');
  if (displacement(zero.execution, probe.nodeId, 'UZ') !== zeroPrimitive.value
      || displacement(displaced.execution, probe.nodeId, 'UZ') !== displacedPrimitive.value) {
    throw coded('TL_SOURCE_PROBE_DISPLACEMENT_MISMATCH');
  }
  const deltaU = displacedPrimitive.value - zeroPrimitive.value;
  const deltaReaction = reaction(displaced.execution, probe.nodeId, 'UZ') - reaction(zero.execution, probe.nodeId, 'UZ');
  const effectiveVerticalStiffnessNPerM = deltaReaction / deltaU;
  if (!Number.isFinite(effectiveVerticalStiffnessNPerM) || !(effectiveVerticalStiffnessNPerM > 0)) {
    throw coded('TL_SOURCE_PROBE_STIFFNESS_NONPOSITIVE');
  }

  const source = sourceSolverIdentity(probe.source);
  const applicability = createPreproductionThermalLiftoffApplicabilityBinding({
    applicabilityId: `TL02-CONTROLLED-APP:${contactRow.supportSiteId}`,
    supportSiteId: contactRow.supportSiteId,
    classId: 'TL-A',
    templateId: 'CONTROLLED_PRESCRIBED_UZ_SOURCE_PROBE',
    templateRevision: source.sourceRevision,
    contactAuthoritySemanticHash: contact.semanticHash,
    contactRowSemanticHash: contactRow.semanticHash,
    geometrySemanticHash: zero.execution.mechanicalModelSemanticHash,
    supportCapabilitySemanticHash: hash(contactRow.sourceRestraintCapabilityHash, 'sourceRestraintCapabilityHash'),
    linePropertySemanticHash: zero.execution.stiffnessStateHash,
    coordinateFrameSemanticHash: FRAME.semanticHash,
    source,
  });
  const stiffness = createPreproductionThermalLiftoffStiffnessEvidence({
    entryId: `TL02-CONTROLLED:${contactRow.supportSiteId}`,
    supportSiteId: contactRow.supportSiteId,
    representation: 'LOCAL_EFFECTIVE_VERTICAL_STIFFNESS',
    data: { kind: 'SCALAR', effectiveVerticalStiffnessNPerM },
    units: 'N_PER_M',
    ordering: [contactRow.supportSiteId],
    source,
    benchmarkReference: benchmark(probe.benchmarkReference),
    applicability,
    qualification: 'QUALIFIED',
  });
  if (!stiffness.tl03LocalStiffnessEligible) throw coded('TL_SOURCE_PROBE_STIFFNESS_UNQUALIFIED');
  return { zero, displaced, stiffness };
}

function sourceState(value, label) {
  exact(value, ['loadCase', 'execution'], label);
  const loadCase = requirePhysicalLoadCase(value.loadCase);
  const execution = requireSolverExecution(value.execution);
  if (execution.status !== 'QUALIFIED') throw coded('TL_SOURCE_EXECUTION_NOT_QUALIFIED');
  if (execution.physicalLoadCaseHash !== loadCase.physicalLoadCaseHash) throw coded('TL_SOURCE_LOAD_CASE_BINDING_MISMATCH');
  if (execution.modelIdentity !== loadCase.modelReference.modelIdentity
      || execution.mechanicalModelSemanticHash !== loadCase.modelReference.mechanicalModelSemanticHash
      || execution.stiffnessStateHash !== loadCase.modelReference.stiffnessStateHash) {
    throw coded('TL_SOURCE_MODEL_BINDING_MISMATCH');
  }
  return deepFreeze({ loadCase, execution });
}

function sameStiffnessState(a, b, code) {
  if (a.execution.modelIdentity !== b.execution.modelIdentity
      || String(a.execution.modelRevision) !== String(b.execution.modelRevision)
      || a.execution.mechanicalModelSemanticHash !== b.execution.mechanicalModelSemanticHash
      || a.execution.stiffnessStateHash !== b.execution.stiffnessStateHash
      || a.execution.solverProfileSemanticHash !== b.execution.solverProfileSemanticHash) throw coded(code);
}

function prescribedProbePrimitive(loadCase, nodeId, zeroRequired) {
  if (loadCase.loadCaseClass !== 'PRESCRIBED_MOVEMENT' || loadCase.primitives.length !== 1) throw coded('TL_SOURCE_PROBE_LOAD_CASE_INVALID');
  const primitive = loadCase.primitives[0];
  if (primitive.kind !== 'PRESCRIBED_MOVEMENT' || primitive.nodeId !== nodeId || primitive.dof !== 'UZ') throw coded('TL_SOURCE_PROBE_PRIMITIVE_INVALID');
  if (zeroRequired ? primitive.value !== 0 : !(primitive.value > 0)) throw coded('TL_SOURCE_PROBE_MOVEMENT_INVALID');
  return primitive;
}

function supportMapping(value) {
  exact(value, [
    'supportSiteId', 'nodeId', 'referenceSupportMovementM', 'hotSupportMovementM',
    'supportMovementSource', 'horizontalComponentAuthority',
  ], 'support mapping');
  return deepFreeze({
    supportSiteId: text(value.supportSiteId, 'supportSiteId'),
    nodeId: text(value.nodeId, 'nodeId'),
    referenceSupportMovementM: vector(value.referenceSupportMovementM, 'referenceSupportMovementM'),
    hotSupportMovementM: vector(value.hotSupportMovementM, 'hotSupportMovementM'),
    supportMovementSource: movementSourceIdentity(value.supportMovementSource),
    horizontalComponentAuthority: value.horizontalComponentAuthority,
  });
}

function stiffnessProbe(value) {
  exact(value, [
    'supportSiteId', 'nodeId', 'zeroState', 'displacedState', 'source',
    'benchmarkReference', 'contactAuthoritySemanticHash',
  ], 'stiffness probe');
  return deepFreeze({
    supportSiteId: text(value.supportSiteId, 'supportSiteId'),
    nodeId: text(value.nodeId, 'nodeId'),
    zeroState: value.zeroState,
    displacedState: value.displacedState,
    source: sourceSolverIdentity(value.source),
    benchmarkReference: benchmark(value.benchmarkReference),
    contactAuthoritySemanticHash: hash(value.contactAuthoritySemanticHash, 'contactAuthoritySemanticHash'),
  });
}

function indexedList(value, normalize, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  const map = new Map();
  for (const raw of value) {
    const item = normalize(raw);
    if (map.has(item.supportSiteId)) throw coded('TL_SOURCE_DUPLICATE_SITE');
    map.set(item.supportSiteId, item);
  }
  return map;
}

function uniqueIndex(value, key, label) {
  const map = new Map();
  for (const item of value) {
    if (map.has(item[key])) throw new TypeError(`${label} must be unique by ${key}.`);
    map.set(item[key], item);
  }
  return map;
}

function exactCoverage(expected, actual, code) {
  if (JSON.stringify([...expected.keys()].sort(ascii)) !== JSON.stringify([...actual.keys()].sort(ascii))) throw coded(code);
}

function translation(execution, nodeId) {
  return deepFreeze({
    x: displacement(execution, nodeId, 'UX'),
    y: displacement(execution, nodeId, 'UY'),
    z: displacement(execution, nodeId, 'UZ'),
  });
}

function displacement(execution, nodeId, dof) {
  const matches = execution.displacement.filter((entry) => entry.nodeId === nodeId && entry.dof === dof);
  if (matches.length !== 1) throw coded('TL_SOURCE_DISPLACEMENT_ENTRY_AMBIGUOUS');
  return finite(matches[0].value, `displacement:${nodeId}:${dof}`);
}

function reaction(execution, nodeId, dof) {
  const matches = execution.reactions.filter((entry) => entry.nodeId === nodeId && entry.dof === dof);
  if (matches.length !== 1) throw coded('TL_SOURCE_REACTION_ENTRY_AMBIGUOUS');
  return finite(matches[0].value, `reaction:${nodeId}:${dof}`);
}

function subtract(a, b) { return deepFreeze({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }); }

function movementSourceIdentity(value) {
  exact(value, ['sourceId', 'sourceRevision', 'sourceSemanticHash', 'sourceKind'], 'support movement source');
  const sourceKind = text(value.sourceKind, 'sourceKind');
  if (!SUPPORT_MOVEMENT_SOURCE_KINDS.has(sourceKind)) throw coded('TL_SOURCE_SUPPORT_MOVEMENT_SOURCE_UNQUALIFIED');
  return deepFreeze({
    sourceId: text(value.sourceId, 'sourceId'),
    sourceRevision: text(value.sourceRevision, 'sourceRevision'),
    sourceSemanticHash: hash(value.sourceSemanticHash, 'sourceSemanticHash'),
    sourceKind,
  });
}

function sourceSolverIdentity(value) {
  exact(value, ['sourceId', 'sourceRevision', 'sourceSemanticHash', 'sourceKind'], 'source solver identity');
  if (value.sourceKind !== 'SOURCE_SOLVER') throw coded('TL_SOURCE_PROBE_SOURCE_KIND_INVALID');
  return deepFreeze({
    sourceId: text(value.sourceId, 'sourceId'),
    sourceRevision: text(value.sourceRevision, 'sourceRevision'),
    sourceSemanticHash: hash(value.sourceSemanticHash, 'sourceSemanticHash'),
    sourceKind: 'SOURCE_SOLVER',
  });
}

function benchmark(value) {
  exact(value, ['benchmarkId', 'benchmarkRevision', 'benchmarkSemanticHash'], 'benchmark reference');
  return deepFreeze({
    benchmarkId: text(value.benchmarkId, 'benchmarkId'),
    benchmarkRevision: text(value.benchmarkRevision, 'benchmarkRevision'),
    benchmarkSemanticHash: hash(value.benchmarkSemanticHash, 'benchmarkSemanticHash'),
  });
}

function vector(value, label) {
  exact(value, ['x', 'y', 'z'], label);
  return deepFreeze({ x: finite(value.x, `${label}.x`), y: finite(value.y, `${label}.y`), z: finite(value.z, `${label}.z`) });
}

function exact(value, keys, label) {
  if (!isPlainRecord(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}

function text(value, label) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${label} must be a non-empty string.`);
  return normalized;
}

function hash(value, label) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) throw new TypeError(`${label} must be an FNV-1a semantic hash.`);
  return value;
}

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
  return value;
}

function freezeHash(material) { return deepFreeze({ ...material, semanticHash: semanticHash(material) }); }
function ascii(a, b) { return String(a).localeCompare(String(b), 'en', { numeric: false, sensitivity: 'variant' }); }
function coded(code) { const error = new Error(code); error.code = code; return error; }

import { canonicalStringify, semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import {
  LINEAR_FEA_CONVENTIONS,
  LINEAR_FEA_UNITS,
  LINEAR_FEA_FORMULATION_REGISTRY_VERSION,
  LINEAR_FEA_MODEL_SCHEMA,
  LINEAR_FEA_VALIDATION_PROFILE,
  sealLinearFeaModel,
} from '../linear-fea-contract/index.js';
import {
  BINDING_TRACE_KEYS,
  COMPILATION_RECORD_KEYS,
  MECHANICAL_MODEL_COMPILATION_SCHEMA,
  REPRESENTABLE_CONSTRAINT_KINDS,
  fail,
  requireArray,
  requireExactKeys,
  requireHash,
  requireIdentity,
  requireMechanicalModelCompilerProfile,
  requireRecord,
} from './model-compiler-contract.js';
import {
  requireConditionedTopology,
  requireConstraintDeclarations,
  requireElementBindings,
  requireLocalAxisMap,
  requireMaterialStateMap,
  requireNodeBindings,
  requireSectionStateMap,
} from './model-compiler-intake.js';

const COMPILER_INPUT_KEYS = Object.freeze([
  'modelIdentity',
  'modelRevision',
  'sourceSemanticHash',
  'conditionedTopology',
  'nodeBindings',
  'elementBindings',
  'materialResolutions',
  'sectionResolutions',
  'localAxisResults',
  'localAxisProfile',
  'constraintDeclarations',
  'profile',
]);

const AXIS_FALLBACK_LIMITATION_CODE = 'MODEL_COMPILER_LIMITATION_LOCAL_AXIS_FALLBACK_REFERENCE';

/**
 * Bind conditioned topology, resolved material states, resolved section states,
 * qualified local axes and linear-constraint declarations into one sealed
 * `fea-linear-model/v1` record — the LFEA-B2.5 exit boundary.
 *
 * The compiler decides nothing an upstream authority already decided. It binds,
 * proves the binding is complete and unambiguous, and refuses everything else.
 * It never creates a material, section, formulation or axis result that a
 * caller did not supply, and it never repairs a conflicting constraint set.
 *
 * @param {object} input Explicit compilation inputs — see `COMPILER_INPUT_KEYS`.
 * @returns {Readonly<object>} `fea-linear-mechanical-model-compilation/v1`.
 */
export function compileMechanicalModel(input) {
  requireExactKeys(input, COMPILER_INPUT_KEYS, 'input', 'MODEL_COMPILER_INPUT_INVALID');
  const profile = requireMechanicalModelCompilerProfile(
    requireRecord(input.profile, 'profile', 'MODEL_COMPILER_PROFILE_INVALID'),
  );
  const modelIdentity = requireIdentity(input.modelIdentity, 'modelIdentity', 'MODEL_COMPILER_INPUT_INVALID');
  if (!Number.isInteger(input.modelRevision) || input.modelRevision < 1) {
    fail('modelRevision must be a positive integer.', 'MODEL_COMPILER_INPUT_INVALID');
  }
  const sourceSemanticHash = requireHash(
    input.sourceSemanticHash,
    'sourceSemanticHash',
    'MODEL_COMPILER_INPUT_INVALID',
  );

  const topology = requireConditionedTopology(input.conditionedTopology);
  const nodeBindings = requireNodeBindings(input.nodeBindings, topology);
  const elementBindings = requireElementBindings(input.elementBindings, topology);
  const materials = requireMaterialStateMap(input.materialResolutions);
  const sections = requireSectionStateMap(input.sectionResolutions);
  const axes = requireLocalAxisMap(input.localAxisResults, input.localAxisProfile);

  const nodes = buildNodes(topology, nodeBindings, elementBindings);
  const compiled = buildElements({ topology, nodeBindings, elementBindings, materials, sections, axes, profile });
  const constraints = buildConstraints(
    requireConstraintDeclarations(input.constraintDeclarations),
    nodes,
    compiled.elements,
  );

  const usedMaterialIds = new Set(compiled.elements.map((element) => element.materialStateId));
  const usedSectionIds = new Set(compiled.elements.map((element) => element.sectionStateId));
  const limitations = mergeLimitationRecords(compiled.limitations);

  const model = sealLinearFeaModel({
    schema: LINEAR_FEA_MODEL_SCHEMA,
    modelIdentity,
    modelRevision: input.modelRevision,
    units: LINEAR_FEA_UNITS,
    conventions: LINEAR_FEA_CONVENTIONS,
    ancestry: {
      sourceSemanticHash,
      conditionedGeometrySemanticHash: topology.conditionedTopologyHash,
      compilerProfileSemanticHash: profile.semanticHash,
    },
    formulationRegistryVersion: LINEAR_FEA_FORMULATION_REGISTRY_VERSION,
    validationProfile: { ...LINEAR_FEA_VALIDATION_PROFILE, semanticHash: '' },
    nodes,
    materialStates: [...usedMaterialIds].map((id) => materialStateRecord(materials.get(id))),
    sectionStates: [...usedSectionIds].map((id) => sectionStateRecord(sections.get(id))),
    elements: compiled.elements,
    constraints,
    limitations,
    diagnostics: compiled.diagnostics,
    stiffnessStateHash: '',
    semanticHash: '',
    evidenceHash: '',
  });

  const draft = {
    schema: MECHANICAL_MODEL_COMPILATION_SCHEMA,
    profileId: profile.profileId,
    compilerProfileSemanticHash: profile.semanticHash,
    sourceSemanticHash,
    conditionedTopologyHash: topology.conditionedTopologyHash,
    mechanicalModelSemanticHash: model.semanticHash,
    stiffnessStateHash: model.stiffnessStateHash,
    model,
    bindings: compiled.bindings,
    limitations: model.limitations.map((limitation) => ({ ...limitation })),
    diagnostics: model.diagnostics.map((diagnostic) => ({ ...diagnostic })),
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = computeCompilationSemanticHash(draft);
  draft.evidenceHash = computeCompilationEvidenceHash(draft);
  return requireMechanicalModelCompilation(draft);
}

function buildNodes(topology, nodeBindings, elementBindings) {
  const incidentComponentIds = new Map(
    [...topology.nodes.keys()].map((nodeId) => [nodeId, new Set()]),
  );
  for (const span of topology.spans) {
    const binding = elementBindings.get(span.id);
    const sourceIds = [span.sourceComponentUid, binding?.sourceComponentId]
      .filter((value) => typeof value === 'string' && value.length > 0);
    for (const nodeId of [span.startNodeId, span.endNodeId]) {
      const target = incidentComponentIds.get(nodeId);
      sourceIds.forEach((sourceId) => target.add(sourceId));
    }
  }

  return [...topology.nodes.values()].map((node) => {
    const binding = nodeBindings.get(node.id);
    const sourceComponentIds = incidentComponentIds.get(node.id);
    if (node.sourceComponentUid !== null) sourceComponentIds.add(node.sourceComponentUid);
    return {
      nodeId: binding.nodeId,
      position: { x: node.x, y: node.y, z: node.z },
      sourceAncestry: {
        conditionedNodeId: binding.conditionedNodeId,
        sourceNodeIds: [node.id],
        sourceComponentIds: [...sourceComponentIds].sort(compareAscii),
        creationBasis: node.creationBasis,
      },
    };
  });
}

function buildElements({ topology, nodeBindings, elementBindings, materials, sections, axes, profile }) {
  const elements = [];
  const bindings = [];
  const diagnostics = [];
  const limitations = [];

  for (const span of topology.spans) {
    const binding = elementBindings.get(span.id);
    const material = materials.get(binding.materialStateId);
    if (!material) {
      fail(
        `Element span ${span.id} binds material state ${binding.materialStateId}, which was not resolved by B-2.2.`,
        'MODEL_COMPILER_MATERIAL_BINDING_MISSING',
      );
    }
    const section = sections.get(binding.sectionStateId);
    if (!section) {
      fail(
        `Element span ${span.id} binds section state ${binding.sectionStateId}, which was not resolved by B-2.3.`,
        'MODEL_COMPILER_SECTION_BINDING_MISSING',
      );
    }
    const axisResult = axes.map.get(binding.localAxisEvidenceIdentity);
    if (!axisResult) {
      fail(
        `Element span ${span.id} binds local-axis evidence ${binding.localAxisEvidenceIdentity}, which was not supplied by B-2.4.`,
        'MODEL_COMPILER_AXIS_BINDING_MISSING',
      );
    }

    const start = topology.nodes.get(span.startNodeId);
    const end = topology.nodes.get(span.endNodeId);
    const delta = [end.x - start.x, end.y - start.y, end.z - start.z];
    const length = Math.hypot(delta[0], delta[1], delta[2]);
    if (!(length > profile.minimumElementLength.value)) {
      fail(
        `Element span ${span.id} is at or below the declared minimum element length.`,
        'MODEL_COMPILER_ELEMENT_BELOW_MINIMUM_LENGTH',
      );
    }
    requireAxisAgreesWithSpan(axisResult, delta, length, profile, span.id);

    const nodeI = nodeBindings.get(span.startNodeId).nodeId;
    const nodeJ = nodeBindings.get(span.endNodeId).nodeId;
    elements.push({
      elementId: binding.elementId,
      formulationId: binding.formulationId,
      nodeI,
      nodeJ,
      materialStateId: binding.materialStateId,
      sectionStateId: binding.sectionStateId,
      localAxes: {
        x: [...axisResult.axes.x],
        y: [...axisResult.axes.y],
        z: [...axisResult.axes.z],
        policyId: axisResult.policyId,
        evidenceIdentity: binding.localAxisEvidenceIdentity,
      },
      sourceAncestry: {
        conditionedSegmentId: binding.conditionedSegmentId,
        sourceComponentId: binding.sourceComponentId,
      },
    });

    bindings.push({
      elementId: binding.elementId,
      conditionedSegmentId: binding.conditionedSegmentId,
      topologySegmentId: binding.topologySegmentId,
      sourceComponentId: binding.sourceComponentId,
      formulationId: binding.formulationId,
      materialStateId: binding.materialStateId,
      materialResolutionSemanticHash: material.semanticHash,
      sectionStateId: binding.sectionStateId,
      sectionResolutionSemanticHash: section.semanticHash,
      localAxisEvidenceIdentity: binding.localAxisEvidenceIdentity,
      localAxisResultSemanticHash: axisResult.semanticHash,
      localAxisReferenceSource: axisResult.selectedReference.source,
    });

    diagnostics.push({
      severity: 'INFO',
      code: 'MODEL_ELEMENT_BINDING_RESOLVED',
      entityType: 'ELEMENT',
      entityId: binding.elementId,
      message: 'Element span bound to one material state, one section state, one formulation and one local-axis result.',
      evidence: [
        {
          evidenceId: 'MATERIAL-STATE',
          sourceId: 'LFEA-B2.2-MATERIAL-RESOLUTION',
          sourceSemanticHash: material.semanticHash,
        },
        {
          evidenceId: 'SECTION-STATE',
          sourceId: 'LFEA-B2.3-PIPE-SECTION-RESOLUTION',
          sourceSemanticHash: section.semanticHash,
        },
        {
          evidenceId: 'LOCAL-AXES',
          sourceId: 'LFEA-B2.4-FRAME-LOCAL-AXES',
          sourceSemanticHash: axisResult.semanticHash,
        },
      ],
      qualificationEvidenceIds: ['LFEA-B2.5'],
    });

    for (const limitation of section.limitations) limitations.push(limitation);
    if (axisResult.selectedReference.source === 'FALLBACK') {
      limitations.push(axisFallbackLimitation(axisResult.policyId));
    }
  }

  return { elements, bindings, diagnostics, limitations };
}

/**
 * Confirm the supplied axis triad belongs to this span. The axes are used
 * exactly as B-2.4 released them — nothing here reorients, renormalises or
 * flips a vector, because a repaired axis silently changes signed local
 * bending and shear.
 */
function requireAxisAgreesWithSpan(axisResult, delta, length, profile, spanId) {
  const unit = [delta[0] / length, delta[1] / length, delta[2] / length];
  const axisX = axisResult.axes.x;
  const alignment = axisX[0] * unit[0] + axisX[1] * unit[1] + axisX[2] * unit[2];
  const residual = Math.hypot(
    axisX[1] * unit[2] - axisX[2] * unit[1],
    axisX[2] * unit[0] - axisX[0] * unit[2],
    axisX[0] * unit[1] - axisX[1] * unit[0],
  );
  if (!(residual <= profile.spanDirectionTolerance.value) || !(alignment > 0)) {
    fail(
      `Local-axis result for span ${spanId} does not run from I to J within the declared span-direction tolerance.`,
      'MODEL_COMPILER_AXIS_ELEMENT_MISMATCH',
    );
  }
}

function axisFallbackLimitation(policyId) {
  return {
    code: AXIS_FALLBACK_LIMITATION_CODE,
    severity: 'WARNING',
    scope: 'ELEMENT',
    stiffnessRelevant: false,
    details: {
      disclosure: 'One or more element spans use the B-2.4 fallback reference vector rather than a supplied reference.',
      policyId,
    },
  };
}

/**
 * Merge propagated limitations by code. Two authorities that disclose the same
 * code with different content are a contradiction, not something to reconcile
 * here, so the compilation is blocked instead of one disclosure being dropped.
 */
function mergeLimitationRecords(limitations) {
  const merged = new Map();
  for (const limitation of limitations) {
    const encoded = canonicalStringify(limitation);
    const existing = merged.get(limitation.code);
    if (existing === undefined) {
      merged.set(limitation.code, encoded);
    } else if (existing !== encoded) {
      fail(
        `Limitation ${limitation.code} is disclosed with conflicting content.`,
        'MODEL_COMPILER_LIMITATION_CONFLICT',
      );
    }
  }
  return [...merged.values()].map((encoded) => JSON.parse(encoded));
}

function materialStateRecord(resolution) {
  const state = resolution.materialState;
  return {
    materialStateId: state.materialStateId,
    materialId: state.materialId,
    elasticModulus: state.elasticModulus,
    shearModulus: state.shearModulus,
    poissonRatio: state.poissonRatio,
    massDensity: state.massDensity,
    thermalExpansionCoefficient: state.thermalExpansionCoefficient,
    evaluationTemperature: state.evaluationTemperature,
    sourceEvidence: state.sourceEvidence.map((entry) => ({ ...entry })),
  };
}

function sectionStateRecord(resolution) {
  const state = resolution.sectionState;
  return {
    sectionStateId: state.sectionStateId,
    area: state.area,
    secondMomentY: state.secondMomentY,
    secondMomentZ: state.secondMomentZ,
    polarMoment: state.polarMoment,
    sourceEvidence: state.sourceEvidence.map((entry) => ({ ...entry })),
  };
}

/**
 * Apply section 5.3. Every declaration is first resolved to the global node DOF
 * it acts on; two declarations acting on one node DOF block compilation. Only
 * then is representability decided, so a conflict is reported as a conflict
 * rather than being masked by the feature gap.
 */
function buildConstraints(declarations, nodes, elements) {
  const nodeIds = new Set(nodes.map((node) => node.nodeId));
  const elementsById = new Map(elements.map((element) => [element.elementId, element]));
  const occupied = new Map();

  const resolved = declarations.map((declaration) => {
    let nodeId;
    if (declaration.kind === 'END_RELEASE') {
      const element = elementsById.get(declaration.elementId);
      if (!element) {
        fail(
          `Constraint declaration ${declaration.declarationId} references element ${declaration.elementId}, which is not in the compiled model.`,
          'MODEL_COMPILER_CONSTRAINT_ELEMENT_UNKNOWN',
        );
      }
      nodeId = declaration.end === 'I' ? element.nodeI : element.nodeJ;
    } else {
      nodeId = declaration.nodeId;
      if (!nodeIds.has(nodeId)) {
        fail(
          `Constraint declaration ${declaration.declarationId} references node ${nodeId}, which is not in the compiled model.`,
          'MODEL_COMPILER_CONSTRAINT_NODE_UNKNOWN',
        );
      }
    }
    return { ...declaration, resolvedNodeId: nodeId };
  });

  for (const declaration of resolved) {
    const slot = `${declaration.resolvedNodeId}:${declaration.dof}`;
    const existing = occupied.get(slot);
    if (existing !== undefined) {
      fail(
        `Declarations ${existing} and ${declaration.declarationId} both define ${slot}; conflicting release, restraint and rigid-link definitions block compilation.`,
        'MODEL_COMPILER_CONSTRAINT_CONFLICT',
      );
    }
    occupied.set(slot, declaration.declarationId);
  }

  for (const declaration of resolved) {
    if (REPRESENTABLE_CONSTRAINT_KINDS.includes(declaration.kind)) continue;
    if (declaration.kind === 'END_RELEASE') {
      fail(
        `Declaration ${declaration.declarationId} is an element end release; fea-linear-model/v1 carries no element release set, so it must be compiled by the element-formulation package rather than dropped here.`,
        'MODEL_COMPILER_END_RELEASE_NOT_REPRESENTABLE',
      );
    }
    fail(
      `Declaration ${declaration.declarationId} is a ${declaration.kind}; fea-linear-model/v1 carries no rigid kinematic relation, so it must be compiled by the component package rather than dropped here.`,
      'MODEL_COMPILER_RIGID_LINK_NOT_REPRESENTABLE',
    );
  }

  return resolved.map((declaration) => ({
    constraintId: declaration.declarationId,
    nodeId: declaration.resolvedNodeId,
    dof: declaration.dof,
    behavior: declaration.behavior,
    basis: 'GLOBAL',
    stiffness: declaration.stiffness,
  }));
}

export function compilationSemanticProjection(record) {
  return {
    schema: record.schema,
    profileId: record.profileId,
    compilerProfileSemanticHash: record.compilerProfileSemanticHash,
    sourceSemanticHash: record.sourceSemanticHash,
    conditionedTopologyHash: record.conditionedTopologyHash,
    mechanicalModelSemanticHash: record.mechanicalModelSemanticHash,
    stiffnessStateHash: record.stiffnessStateHash,
    bindings: [...record.bindings].sort(byElementId),
    limitations: [...record.limitations].sort(byCode),
  };
}

export function compilationEvidenceProjection(record) {
  return {
    semanticHash: record.semanticHash,
    modelEvidenceHash: record.model.evidenceHash,
    diagnostics: [...record.diagnostics],
  };
}

export function computeCompilationSemanticHash(record) {
  return semanticHash(compilationSemanticProjection(record));
}

export function computeCompilationEvidenceHash(record) {
  return semanticHash(compilationEvidenceProjection(record));
}

function byElementId(left, right) {
  return compareAscii(left.elementId, right.elementId);
}

function byCode(left, right) {
  return compareAscii(left.code, right.code);
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = a.charCodeAt(index) - b.charCodeAt(index);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  if (a.length === b.length) return 0;
  return a.length < b.length ? -1 : 1;
}

export function requireMechanicalModelCompilation(record) {
  requireExactKeys(record, COMPILATION_RECORD_KEYS, 'compilation', 'MODEL_COMPILER_RESULT_INVALID');
  if (record.schema !== MECHANICAL_MODEL_COMPILATION_SCHEMA) {
    fail('compilation.schema is unsupported.', 'MODEL_COMPILER_RESULT_INVALID');
  }
  requireIdentity(record.profileId, 'compilation.profileId', 'MODEL_COMPILER_RESULT_INVALID');
  for (const field of [
    'compilerProfileSemanticHash',
    'sourceSemanticHash',
    'conditionedTopologyHash',
    'mechanicalModelSemanticHash',
    'stiffnessStateHash',
    'semanticHash',
    'evidenceHash',
  ]) {
    requireHash(record[field], `compilation.${field}`, 'MODEL_COMPILER_RESULT_INVALID');
  }
  requireRecord(record.model, 'compilation.model', 'MODEL_COMPILER_RESULT_INVALID');
  if (record.mechanicalModelSemanticHash !== record.model.semanticHash) {
    fail(
      'compilation.mechanicalModelSemanticHash must be the sealed model semantic hash.',
      'MODEL_COMPILER_IDENTITY_CHAIN_BROKEN',
    );
  }
  if (record.stiffnessStateHash !== record.model.stiffnessStateHash) {
    fail(
      'compilation.stiffnessStateHash must be the sealed model stiffness-state hash.',
      'MODEL_COMPILER_IDENTITY_CHAIN_BROKEN',
    );
  }
  if (record.conditionedTopologyHash !== record.model.ancestry.conditionedGeometrySemanticHash
    || record.sourceSemanticHash !== record.model.ancestry.sourceSemanticHash
    || record.compilerProfileSemanticHash !== record.model.ancestry.compilerProfileSemanticHash) {
    fail('compilation ancestry does not match the sealed model ancestry.', 'MODEL_COMPILER_IDENTITY_CHAIN_BROKEN');
  }
  requireArray(record.bindings, 'compilation.bindings', 'MODEL_COMPILER_RESULT_INVALID');
  requireArray(record.limitations, 'compilation.limitations', 'MODEL_COMPILER_RESULT_INVALID');
  requireArray(record.diagnostics, 'compilation.diagnostics', 'MODEL_COMPILER_RESULT_INVALID');
  record.bindings.forEach((binding, index) => {
    requireExactKeys(binding, BINDING_TRACE_KEYS, `compilation.bindings[${index}]`, 'MODEL_COMPILER_RESULT_INVALID');
  });
  if (record.semanticHash !== computeCompilationSemanticHash(record)
    || record.evidenceHash !== computeCompilationEvidenceHash(record)) {
    fail('compilation hashes are stale.', 'MODEL_COMPILER_HASH_MISMATCH');
  }
  return deepFreeze({
    ...record,
    bindings: [...record.bindings].sort(byElementId),
    limitations: [...record.limitations].sort(byCode),
    diagnostics: [...record.diagnostics],
  });
}

import {
  conditionGeometry,
  FRAME_LOCAL_AXIS_PROFILE,
  resolveFrameLocalAxes,
} from '../src/core/centerline-beam-fea/index.js';
import {
  COMPONENT_GEOMETRY_SCHEMA,
  FACTOR_CALCULATION_REQUEST_SCHEMA,
  calculateB31Factors,
} from '../src/core/linear-fea-b31-factor-calculator/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import {
  classifyBranchLegs,
  computePipingComponentSemanticHash,
  deriveB31JDirectionalBranchEndModifiers,
  requirePipingComponent,
} from '../src/core/linear-fea-piping-components/index.js';
import {
  compilePhysicalLoadCase,
  modelReferenceFromCompilation,
} from '../src/core/linear-fea-load-case/index.js';
import {
  compileSolverExecution,
  elementContributionFromFrameElement,
  elementContributionsFromPipingComponent,
} from '../src/core/linear-fea-solver/index.js';
import { compileResultRecovery } from '../src/core/linear-fea-result-recovery/index.js';
import {
  compileInputXmlBendFeatureExpansion,
  detectInputXmlInlineReducerTransitions,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { compilerProfile } from './lfea-b2.5-model-compiler-fixtures.mjs';
import { componentProfile } from './lfea-b3.2-piping-component-fixtures.mjs';
import { loadCaseProfile } from './lfea-b3.3-load-case-fixtures.mjs';
import { solverProfile } from './lfea-b3.4-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.5-result-recovery-fixtures.mjs';
import {
  BM4_SOLVER_CONDITIONING_PROFILE,
  BM4_SOURCE_ID,
  GRAVITY,
  INSTALLATION_TEMPERATURE,
  THERMAL_EXPANSION_COEFFICIENT,
  buildBm4SolveAuthorities,
  sourceEvidence,
} from './lfea-m034-bm4-solve-fixtures.mjs';

const FACTOR_PROFILE_ID = 'B31_3_2022_B31J_2017';
const MOMENT_DIRECTION_MAPPING = Object.freeze({ inPlaneField: 'my', outOfPlaneField: 'mz' });
const CONDITIONING_PROFILE = Object.freeze({
  spanSeedingLimit: { value: 1000, source: 'M035 feature-aware BM4 retains one span except qualified feature expansion' },
  bendSeedingSegments: { value: 4, source: 'M035 bends are already explicitly expanded before conditioning' },
  bendLengthErrorLimit: { value: 0.01, source: 'M035 inherited InputXML geometry disclosure' },
});
const COMPONENT_PROFILE = componentProfile({
  bendPressureStiffeningRule: 'BEND_PRESSURE_STIFFENING_DECLARED_FACTOR_V1',
});

export function buildBm4M035FeatureAuthorities() {
  const base = buildBm4SolveAuthorities();
  const sourceGeometry = base.normalized.geometry;
  const bendIds = sourceGeometry.segments.filter((row) => row.type === 'BEND').map((row) => String(row.id));
  const materialBySegmentId = new Map(bendIds.map((id) => [id, base.material]));
  const sectionBySegmentId = new Map(bendIds.map((id) => [id, base.physicalSections.get(id)]));
  const bendExpansion = compileInputXmlBendFeatureExpansion({
    canonicalGeometry: sourceGeometry,
    editionProfileId: FACTOR_PROFILE_ID,
    momentDirectionMapping: MOMENT_DIRECTION_MAPPING,
    smooth90FlexibilityCorrection: false,
    materialBySegmentId,
    sectionBySegmentId,
    frameElementProfile: base.frameProfile,
    pipingComponentProfile: COMPONENT_PROFILE,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    segmentIds: bendIds,
  });
  const analysisGeometry = bendExpansion.analysisGeometry;
  const teeJunctions = compileBm4TeeJunctionAuthorities({ base, sourceGeometry });
  const teeModifierBySourceSegmentId = mergeTeeModifiers(teeJunctions);
  const bendComponentById = new Map(bendExpansion.components.map((row) => [row.componentId, row]));
  const baseEntryBySourceId = new Map(base.entries.map((row) => [String(row.sourceSegment.id), row]));

  const entries = analysisGeometry.segments.map((segment) => {
    const sourceSegmentId = String(segment.meta?.sourceSegmentId ?? segment.id);
    const sourceEntry = baseEntryBySourceId.get(sourceSegmentId);
    if (!sourceEntry) throw new Error(`M035 analysis segment ${segment.id} lacks source entry ${sourceSegmentId}.`);
    const bendComponent = segment.meta?.analysisRole === 'BEND_ARC'
      ? bendComponentById.get(segment.meta.componentId)
      : null;
    const componentElement = bendComponent?.elements?.[segment.meta.componentElementIndex] ?? null;
    if (bendComponent && (!componentElement || componentElement.elementId !== segment.id)) {
      throw new Error(`M035 bend component binding is stale for ${segment.id}.`);
    }
    const teeModifier = teeModifierBySourceSegmentId.get(sourceSegmentId) ?? null;
    if (bendComponent && teeModifier) {
      throw new Error(`M035 source segment ${sourceSegmentId} cannot be both a bend arc and tee-modified span.`);
    }
    const analysisSection = bendComponent || segment.meta?.analysisRole === 'BEND_INCOMING_STRAIGHT'
      ? sourceEntry.physicalSection
      : sourceEntry.analysisSection;
    const elementId = componentElement?.elementId ?? `BM4M035.${segment.id}`;
    return Object.freeze({
      segment,
      sourceSegmentId,
      sourceEntry,
      elementId,
      nodeI: `BM4M035.N${segment.startNodeId}`,
      nodeJ: `BM4M035.N${segment.endNodeId}`,
      analysisSection,
      bendComponent,
      componentElementIndex: segment.meta?.componentElementIndex ?? null,
      teeModifier,
      referenceVector: componentElement
        ? bendComponent.geometry.planeNormal
        : teeModifier?.referenceVector ?? sourceEntry.referenceVector,
    });
  });
  const entryByElementId = new Map(entries.map((row) => [row.elementId, row]));
  const conditioned = conditionGeometry(analysisGeometry, [], CONDITIONING_PROFILE);
  const localAxisResults = entries.map((entry) => ({
    evidenceIdentity: `AXIS-${entry.elementId}`,
    result: entry.bendComponent
      ? entry.bendComponent.elements[entry.componentElementIndex].frameElement.localAxes
      : resolveEntryAxes(analysisGeometry, entry),
  }));
  const sections = new Map();
  for (const entry of entries) sections.set(entry.analysisSection.semanticHash, entry.analysisSection);
  const compilation = compileMechanicalModel({
    modelIdentity: 'BM4-LIVE-INPUTXML-M035-FEATURES',
    modelRevision: 1,
    sourceSemanticHash: base.source.semanticHash,
    conditionedTopology: conditioned,
    nodeBindings: analysisGeometry.nodes.map((node) => ({
      nodeId: `BM4M035.N${node.id}`,
      conditionedNodeId: `CN-${node.id}`,
      topologyNodeId: String(node.id),
    })),
    elementBindings: entries.map((entry) => ({
      elementId: entry.elementId,
      conditionedSegmentId: String(entry.segment.id),
      topologySegmentId: String(entry.segment.id),
      materialStateId: base.material.materialState.materialStateId,
      sectionStateId: entry.analysisSection.sectionState.sectionStateId,
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      localAxisEvidenceIdentity: `AXIS-${entry.elementId}`,
      sourceComponentId: entry.bendComponent?.componentId
        ?? entry.sourceEntry.rigidAuthority?.rigidElementId
        ?? entry.sourceEntry.sourceSegment.sourceComponentUid,
    })),
    materialResolutions: [base.material],
    sectionResolutions: [...sections.values()],
    localAxisResults,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: constraintDeclarations(analysisGeometry),
    profile: compilerProfile(),
  });
  const inlineReducers = detectInputXmlInlineReducerTransitions({ canonicalGeometry: sourceGeometry });
  return Object.freeze({
    ...base,
    sourceGeometry,
    analysisGeometry,
    bendExpansion,
    teeJunctions,
    teeModifierBySourceSegmentId,
    inlineReducers,
    entries,
    entryByElementId,
    conditioned,
    compilation,
  });
}

export function solveBm4M035FeatureCases() {
  const authorities = buildBm4M035FeatureAuthorities();
  const sustained = analyseCase(authorities, 'BM4-M035-SUSTAINED-W-P1', false);
  const operating = analyseCase(authorities, 'BM4-M035-OPERATING-W-T1-P1', true);
  const expansion = differenceCase(authorities, sustained, operating);
  return Object.freeze({
    authorities,
    sustained,
    operating,
    expansion,
    report: buildReport(authorities, sustained, operating, expansion),
  });
}

function compileBm4TeeJunctionAuthorities({ base, sourceGeometry }) {
  const sourceEntryById = new Map(base.entries.map((row) => [String(row.sourceSegment.id), row]));
  const junctions = sourceGeometry.nodes.flatMap((node) => {
    const nodeId = String(node.id);
    const incident = sourceGeometry.segments.filter((row) =>
      String(row.startNodeId) === nodeId || String(row.endNodeId) === nodeId);
    if (incident.length !== 3 || !incident.some((row) => row.type === 'TEE')) return [];
    const junctionPosition = point(sourceGeometry, nodeId);
    const topologyLegs = incident.map((segment) => {
      const atI = String(segment.startNodeId) === nodeId;
      const otherNodeId = atI ? String(segment.endNodeId) : String(segment.startNodeId);
      return { legId: String(segment.id), endPoint: point(sourceGeometry, otherNodeId) };
    });
    const classification = classifyBranchLegs(
      topologyLegs,
      junctionPosition,
      COMPONENT_PROFILE.runCollinearityTolerance,
    );
    const roleById = new Map(classification.legs.map((row) => [row.legId, row.role]));
    const runLegs = incident.filter((row) => roleById.get(String(row.id)) === 'RUN');
    const branch = incident.find((row) => roleById.get(String(row.id)) === 'BRANCH');
    if (runLegs.length !== 2 || !branch) throw new Error(`BM4 M035 tee ${nodeId} topology did not resolve 2 run + 1 branch.`);
    const runSection = sourceEntryById.get(String(runLegs[0].id)).physicalSection;
    const branchSection = sourceEntryById.get(String(branch.id)).physicalSection;
    const factorResult = calculateB31Factors({
      schema: FACTOR_CALCULATION_REQUEST_SCHEMA,
      calculationId: `M035-BM4-TEE-${nodeId}`,
      componentId: `BM4-TEE-JUNCTION-${nodeId}`,
      editionProfileId: FACTOR_PROFILE_ID,
      componentType: 'WELDING_TEE',
      geometry: {
        schema: COMPONENT_GEOMETRY_SCHEMA,
        componentType: 'WELDING_TEE',
        lengthUnit: 'm',
        runOuterDiameter: runSection.dimensions.outerDiameter,
        runWallThickness: runSection.dimensions.wallThickness,
        branchOuterDiameter: branchSection.dimensions.outerDiameter,
        branchWallThickness: branchSection.dimensions.wallThickness,
        fittingQuality: 'UNVERIFIED',
        sourceEvidence: {
          sourceId: `${BM4_SOURCE_ID}:TEE:${nodeId}`,
          sourceRevision: base.source.sourceRevision,
        },
      },
      momentDirectionMapping: MOMENT_DIRECTION_MAPPING,
      semanticHash: '',
    });
    if (factorResult.status !== 'QUALIFIED') throw new Error(`BM4 M035 tee ${nodeId} B31J factors did not qualify.`);
    const legs = incident.map((segment) => {
      const sourceEntry = sourceEntryById.get(String(segment.id));
      const atI = String(segment.startNodeId) === nodeId;
      const otherNodeId = atI ? String(segment.endNodeId) : String(segment.startNodeId);
      return {
        legId: String(segment.id),
        nodeId: otherNodeId,
        junctionEnd: atI ? 'I' : 'J',
        endPoint: point(sourceGeometry, otherNodeId),
        material: base.material,
        section: sourceEntry.physicalSection,
      };
    });
    const modifiers = deriveB31JDirectionalBranchEndModifiers({
      componentId: `BM4-TEE-JUNCTION-${nodeId}`,
      factorResult,
      junctionPosition,
      legs,
      runCollinearityTolerance: COMPONENT_PROFILE.runCollinearityTolerance,
    });
    return [Object.freeze({
      junctionNodeId: nodeId,
      factorResult,
      modifiers,
      incidentSegmentIds: Object.freeze(incident.map((row) => String(row.id)).sort()),
    })];
  }).sort((left, right) => left.junctionNodeId.localeCompare(right.junctionNodeId));
  if (junctions.length !== 2) throw new Error(`BM4 M035 expected two physical tee junctions; found ${junctions.length}.`);
  return Object.freeze(junctions);
}

function mergeTeeModifiers(junctions) {
  const result = new Map();
  for (const junction of junctions) {
    for (const modifier of junction.modifiers.modifiers) {
      const existing = result.get(modifier.legId);
      if (existing) throw new Error(`BM4 M035 does not support source span ${modifier.legId} being modified by two tee junctions.`);
      result.set(modifier.legId, Object.freeze({
        referenceVector: modifier.referenceVector,
        endSprings: modifier.rotationalSprings,
        rigidOffsets: modifier.rigidOffset === null ? null : modifier.junctionEnd === 'I'
          ? { I: offsetRecord(modifier.rigidOffset), J: null }
          : { I: null, J: offsetRecord(modifier.rigidOffset) },
      }));
    }
  }
  return result;
}

function analyseCase(authorities, loadCaseId, thermal) {
  const loadCase = compileCase(authorities, loadCaseId, thermal);
  const loadsByElement = new Map(
    loadCase.primitives.filter((row) => row.kind === 'DISTRIBUTED_LOAD').map((row) => [row.elementId, row]),
  );
  const temperatureByElement = new Map(
    loadCase.primitives.filter((row) => row.kind === 'TEMPERATURE').map((row) => [row.elementId, row]),
  );
  const frames = authorities.entries
    .filter((entry) => !entry.bendComponent)
    .map((entry) => compileFrameElement({
      elementId: entry.elementId,
      material: authorities.material,
      section: entry.analysisSection,
      localAxes: { result: resolveEntryAxes(authorities.analysisGeometry, entry), profile: FRAME_LOCAL_AXIS_PROFILE },
      profile: authorities.frameProfile,
      distributedLoads: [loadsByElement.get(entry.elementId)],
      temperature: temperatureByElement.get(entry.elementId) ?? null,
      releases: [],
      endSprings: entry.teeModifier?.endSprings ?? [],
      rigidOffsets: entry.teeModifier?.rigidOffsets ?? null,
    }));
  const loadedComponents = authorities.bendExpansion.components.map((component) => {
    const elements = component.elements.map((componentElement) => {
      const entry = authorities.entryByElementId.get(componentElement.elementId);
      if (!entry) throw new Error(`Missing M035 analysis entry for bend element ${componentElement.elementId}.`);
      const frameElement = compileFrameElement({
        elementId: componentElement.elementId,
        material: authorities.material,
        section: entry.analysisSection,
        localAxes: { result: componentElement.frameElement.localAxes, profile: FRAME_LOCAL_AXIS_PROFILE },
        profile: authorities.frameProfile,
        distributedLoads: [loadsByElement.get(componentElement.elementId)],
        temperature: temperatureByElement.get(componentElement.elementId) ?? null,
        releases: [],
        endSprings: [],
        rigidOffsets: null,
      });
      if (!sameMatrix(frameElement.globalStiffness, componentElement.frameElement.globalStiffness)) {
        throw new Error(`Loading changed uncorrected bend stiffness for ${componentElement.elementId}.`);
      }
      return Object.freeze({ ...componentElement, frameElement });
    });
    const draft = { ...component, elements, semanticHash: '' };
    draft.semanticHash = computePipingComponentSemanticHash(draft);
    return requirePipingComponent(draft);
  });
  const execution = compileSolverExecution({
    compilation: authorities.compilation,
    elementContributions: [
      ...frames.map(elementContributionFromFrameElement),
      ...loadedComponents.flatMap(elementContributionsFromPipingComponent),
    ],
    loadCase,
    solverProfile: solverProfile(BM4_SOLVER_CONDITIONING_PROFILE),
  });
  const recovery = compileResultRecovery({
    compilation: authorities.compilation,
    execution,
    loadCase,
    frameElements: frames,
    pipingComponents: loadedComponents,
    recoveryProfile: recoveryProfile(),
  });
  return Object.freeze({ loadCase, frames, pipingComponents: loadedComponents, execution, recovery });
}

function compileCase(authorities, loadCaseId, thermal) {
  const primitives = [];
  for (const entry of authorities.entries) {
    const analysis = entry.sourceEntry.sourceSegment.meta.analysis;
    const lineWeight = entry.sourceEntry.rigidAuthority
      ? entry.sourceEntry.rigidAuthority.gravity.totalLineWeight
      : physicalLineWeight(entry.sourceEntry);
    primitives.push({
      schema: 'fea-linear-load-primitive/v1',
      primitiveId: `${loadCaseId}-WEIGHT-${entry.elementId}`,
      kind: 'DISTRIBUTED_LOAD',
      elementId: entry.elementId,
      basis: 'GLOBAL',
      variation: 'UNIFORM',
      startIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
      endIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
      units: { distributedForce: 'N/m', length: 'm' },
      sourceEvidence: sourceEvidence({ sourceId: `${BM4_SOURCE_ID}-M035-WEIGHT`, sourceRevision: `${entry.sourceSegmentId}:${lineWeight}` }),
    });
    if (analysis.pressure > 0) {
      primitives.push({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `${loadCaseId}-PRESSURE-${entry.elementId}`,
        kind: 'PRESSURE',
        elementId: entry.elementId,
        pressure: analysis.pressure,
        pressureBasis: 'GAUGE',
        authorizedEffects: { codeStress: true, pressureStiffening: false, axialThrust: false, bourdon: false },
        sourceEvidence: sourceEvidence({ sourceId: `${BM4_SOURCE_ID}-M035-PRESSURE`, sourceRevision: `${entry.sourceSegmentId}:${analysis.pressure}` }),
      });
    }
    if (thermal) {
      primitives.push({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `${loadCaseId}-TEMP-${entry.elementId}`,
        kind: 'TEMPERATURE',
        elementId: entry.elementId,
        operatingTemperature: analysis.operatingTemperature,
        installationTemperature: INSTALLATION_TEMPERATURE,
        stiffnessEvaluationMaterialStateId: authorities.material.materialState.materialStateId,
        thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
        sourceEvidence: sourceEvidence({ sourceId: `${BM4_SOURCE_ID}-M035-TEMP`, sourceRevision: `${entry.sourceSegmentId}:${analysis.operatingTemperature}` }),
      });
    }
  }
  return compilePhysicalLoadCase({
    loadCaseId,
    loadCaseClass: 'MIXED_PHYSICAL',
    presentation: { label: loadCaseId, description: 'M035 BM4 feature-aware linear solve.' },
    modelReference: modelReferenceFromCompilation(authorities.compilation),
    primitives,
    profile: loadCaseProfile({ gravitationalAcceleration: { value: GRAVITY, source: 'SI-STANDARD-GRAVITY-EXACT' } }),
  });
}

function differenceCase(authorities, sustained, operating) {
  const susByNode = new Map(sustained.recovery.nodalDisplacements.map((row) => [row.nodeId, row]));
  const opeByNode = new Map(operating.recovery.nodalDisplacements.map((row) => [row.nodeId, row]));
  const susByElement = sourceActionMap(authorities, sustained.recovery);
  const opeByElement = sourceActionMap(authorities, operating.recovery);
  const nodalDisplacements = [...opeByNode].map(([nodeId, ope]) => {
    const sus = susByNode.get(nodeId);
    return { nodeId, displacement: subtractRecord(ope.displacement, sus.displacement) };
  });
  const elementActions = authorities.baseEntriesForReport.map((sourceEntry) => {
    const sus = susByElement.get(String(sourceEntry.sourceSegment.id));
    const ope = opeByElement.get(String(sourceEntry.sourceSegment.id));
    return {
      sourceSegmentId: String(sourceEntry.sourceSegment.id),
      local: { I: subtractRecord(ope.local.I, sus.local.I), J: subtractRecord(ope.local.J, sus.local.J) },
      global: { I: subtractRecord(ope.global.I, sus.global.I), J: subtractRecord(ope.global.J, sus.global.J) },
    };
  });
  return Object.freeze({ nodalDisplacements, elementActions });
}

function buildReport(authorities, sustained, operating, expansion) {
  authorities.baseEntriesForReport = authorities.entries
    .map((row) => row.sourceEntry)
    .filter((row, index, all) => all.findIndex((candidate) => candidate.sourceSegment.id === row.sourceSegment.id) === index);
  const susSource = sourceActionMap(authorities, sustained.recovery);
  const opeSource = sourceActionMap(authorities, operating.recovery);
  const expSource = new Map(expansion.elementActions.map((row) => [row.sourceSegmentId, row]));
  const susDisp = new Map(sustained.recovery.nodalDisplacements.map((row) => [row.nodeId, row]));
  const opeDisp = new Map(operating.recovery.nodalDisplacements.map((row) => [row.nodeId, row]));
  const expDisp = new Map(expansion.nodalDisplacements.map((row) => [row.nodeId, row]));
  const susReact = new Map(sustained.recovery.reactionByNode.map((row) => [row.nodeId, row]));
  const opeReact = new Map(operating.recovery.reactionByNode.map((row) => [row.nodeId, row]));
  const constraints = authorities.compilation.model.constraints;
  return Object.freeze({
    schema: 'm035-bm4-feature-solve-report/v1',
    sourceSemanticHash: authorities.source.semanticHash,
    featureSemanticHash: semanticHash({
      bendExpansion: authorities.bendExpansion.semanticHash,
      tees: authorities.teeJunctions.map((row) => row.modifiers.semanticHash),
      reducers: authorities.inlineReducers.semanticHash,
    }),
    summary: {
      sourceNodes: authorities.sourceGeometry.nodes.length,
      sourceElements: authorities.base.entries.length,
      analysisNodes: authorities.analysisGeometry.nodes.length,
      analysisElements: authorities.entries.length,
      bendComponents: authorities.bendExpansion.components.length,
      teeJunctions: authorities.teeJunctions.length,
      inlineReducerCandidates: authorities.inlineReducers.transitionCount,
      reducerCondensationActive: 0,
    },
    limitations: [
      'M035 activates real-arc bend flexibility and B31J directional tee rotational flexibility generically.',
      'BM4 inline reducer transitions are detected but condensation is not activated because finite reducer geometry and CAESAR ten-cylinder stiffness/sampling parity are not established.',
      'One-way +Y supports remain represented by the M034 engaged bilateral UY state; lift-off belongs to M036/#668.',
      'Friction is not modeled in this M035 linear feature solve.',
    ],
    nodes: authorities.sourceGeometry.nodes.map((node) => {
      const kernel = `BM4M035.N${node.id}`;
      const sus = susDisp.get(kernel)?.displacement ?? null;
      const ope = opeDisp.get(kernel)?.displacement ?? null;
      const exp = expDisp.get(kernel)?.displacement ?? null;
      return {
        referenceNodeId: String(node.id),
        position: [node.x, node.y, node.z],
        sustained: sus,
        operating: ope,
        expansion: exp,
      };
    }),
    restraints: constraints.map((constraint) => ({
      nodeId: constraint.nodeId,
      referenceNodeId: constraint.nodeId.replace(/^BM4M035\.N/u, ''),
      dof: constraint.dof,
      behavior: constraint.behavior,
      sustained: susReact.get(constraint.nodeId)?.reaction?.[constraint.dof] ?? 0,
      operating: opeReact.get(constraint.nodeId)?.reaction?.[constraint.dof] ?? 0,
    })),
    elements: authorities.base.entries.map((sourceEntry) => {
      const id = String(sourceEntry.sourceSegment.id);
      return {
        sourceElementId: id,
        fromNode: String(sourceEntry.sourceSegment.startNodeId),
        toNode: String(sourceEntry.sourceSegment.endNodeId),
        sourceType: sourceEntry.sourceSegment.type,
        sustained: susSource.get(id),
        operating: opeSource.get(id),
        expansion: expSource.get(id),
      };
    }),
  });
}

function sourceActionMap(authorities, recovery) {
  const actionByElement = new Map(recovery.elementActions.map((row) => [row.elementId, row]));
  const result = new Map();
  for (const sourceEntry of authorities.base.entries) {
    const sourceId = String(sourceEntry.sourceSegment.id);
    const analysisEntries = authorities.entries.filter((row) => row.sourceSegmentId === sourceId);
    if (analysisEntries.length === 0) throw new Error(`Missing M035 analysis entries for source ${sourceId}.`);
    const first = actionByElement.get(analysisEntries[0].elementId);
    const last = actionByElement.get(analysisEntries.at(-1).elementId);
    if (!first || !last) throw new Error(`Missing M035 recovered source end actions for ${sourceId}.`);
    result.set(sourceId, {
      local: { I: first.local.I, J: last.local.J },
      global: { I: first.global.I, J: last.global.J },
    });
  }
  return result;
}

function resolveEntryAxes(geometry, entry) {
  const rawI = point(geometry, entry.segment.startNodeId);
  const rawJ = point(geometry, entry.segment.endNodeId);
  const physicalI = addOffset(rawI, entry.teeModifier?.rigidOffsets?.I);
  const physicalJ = addOffset(rawJ, entry.teeModifier?.rigidOffsets?.J);
  return resolveFrameLocalAxes({
    nodeI: physicalI,
    nodeJ: physicalJ,
    referenceVector: entry.referenceVector,
    profile: FRAME_LOCAL_AXIS_PROFILE,
  });
}

function constraintDeclarations(geometry) {
  const rows = new Map();
  const add = (nodeId, dof, reason) => rows.set(`${nodeId}:${dof}`, {
    declarationId: `BM4M035-C-${nodeId}-${dof}-${reason}`,
    kind: 'NODAL_RESTRAINT',
    nodeId: `BM4M035.N${nodeId}`,
    dof,
    behavior: 'FIXED',
  });
  for (const node of geometry.nodes) {
    if (node.restraint === 'ANCHOR') for (const dof of ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']) add(node.id, dof, 'ANCHOR');
    for (const restraint of node.meta?.restraints ?? []) {
      if (restraint.typeCode === '14') add(node.id, 'UY', 'PLUS-Y-LINEARIZED');
      if (restraint.typeCode === '9') {
        const direction = [Math.abs(restraint.xCosine ?? 0), Math.abs(restraint.yCosine ?? 0), Math.abs(restraint.zCosine ?? 0)];
        const axis = direction.indexOf(Math.max(...direction));
        add(node.id, ['UX', 'UY', 'UZ'][axis], 'GUIDE');
      }
    }
  }
  return [...rows.values()];
}

function physicalLineWeight(entry) {
  const analysis = entry.sourceSegment.meta.analysis;
  const section = entry.physicalSection;
  const pipe = analysis.pipeDensity * section.sectionState.area * GRAVITY;
  const innerArea = Math.PI * section.dimensions.innerDiameter ** 2 / 4;
  const contents = (analysis.fluidDensity ?? 0) * innerArea * GRAVITY;
  const insulatedOd = section.dimensions.outerDiameter + 2 * (analysis.insulationThickness ?? 0);
  const insulationArea = Math.PI * (insulatedOd ** 2 - section.dimensions.outerDiameter ** 2) / 4;
  const insulation = (analysis.insulationDensity ?? 0) * insulationArea * GRAVITY;
  return pipe + contents + insulation;
}

function point(geometry, nodeId) {
  const node = geometry.nodes.find((row) => String(row.id) === String(nodeId));
  if (!node) throw new Error(`BM4 M035 node ${nodeId} is missing.`);
  return [node.x, node.y, node.z];
}
function addOffset(pointValue, offset) {
  if (!offset) return pointValue;
  return [pointValue[0] + offset.x, pointValue[1] + offset.y, pointValue[2] + offset.z];
}
function offsetRecord(vector) { return { x: vector[0], y: vector[1], z: vector[2] }; }
function sameMatrix(left, right) {
  return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}
function subtractRecord(left, right) {
  const result = {};
  for (const key of Object.keys(left)) result[key] = left[key] - right[key];
  return result;
}

import {
  FRAME_LOCAL_AXIS_PROFILE,
  resolveFrameLocalAxes,
} from '../src/core/centerline-beam-fea/index.js';
import { calculateB31JWeldingTeeFactors } from '../src/core/linear-fea-b31-factor-calculator/index.js';
import {
  compileFrameElement,
  frameLocalStiffness,
  transformStiffnessToGlobal,
} from '../src/core/linear-fea-frame-element/index.js';
import { compilePhysicalLoadCase, modelReferenceFromCompilation } from '../src/core/linear-fea-load-case/index.js';
import {
  compileCaesarRigidElementAuthority,
  sealRigidElementRequest,
} from '../src/core/linear-fea-rigid-element/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import { applyBendingFlexibilityCorrection } from '../src/core/linear-fea-piping-components/index.js';
import {
  compileSolverExecution,
  requireElementContribution,
} from '../src/core/linear-fea-solver/index.js';
import {
  gatherJointDisplacement12,
  recoverElementEndAction,
} from '../src/core/linear-fea-result-recovery/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { compilerProfile } from './lfea-b2.5-model-compiler-fixtures.mjs';
import {
  BM2_SOURCE_ID,
  GRAVITY,
  INSTALLATION_TEMPERATURE,
  sourceEvidence,
} from './lfea-b3.26-bm2-solve-fixtures.mjs';
import { loadCaseProfile, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import { buildBm2BendExpandedAuthorities } from './lfea-b3.29-bm2-bend-geometry-authority-v2.mjs';

export const BM2_M031_SOLVER_CONDITIONING_PROFILE = Object.freeze({
  backend: 'FEA_SPARSE_DIRECT_CHOLESKY_LDLT_V1',
  nearZeroPivotTolerance: Object.freeze({
    value: 1e-12,
    source: 'M031 BM2 scaled sparse factorization; no regularization or diagonal penalty is permitted',
  }),
  conditionWarning: Object.freeze({
    value: 1e14,
    source: 'M031 BM2 qualification threshold for the diagonally energy-scaled free stiffness partition',
  }),
  conditionBlock: Object.freeze({
    value: 1e18,
    source: 'M031 BM2 qualification block threshold; a worse system is rejected rather than regularized',
  }),
});

export const BM2_M031_ACTIVE_SET_PROFILE = Object.freeze({
  schema: 'lfea-bm2-unilateral-active-set-profile/v2',
  contacts: Object.freeze([
    Object.freeze({ typeCode: '14', dof: 'UY', permittedGapDirection: '+Y' }),
    Object.freeze({ typeCode: '15', dof: 'UZ', permittedGapDirection: '+Z' }),
  ]),
  initialState: 'ALL_CANDIDATES_ACTIVE',
  gapTolerance: 1e-9,
  reactionTolerance: 1e-6,
  maximumIterations: 32,
  rule: 'g>=0;R>=0;g*R=0',
  sourceAuthority: 'CAESAR_INPUTXML_RESTRAINT_TYPE_EXPORT_CORRECTION_V1',
});

const DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const UNILATERAL_CONTACT_BY_TYPE = new Map(
  BM2_M031_ACTIVE_SET_PROFILE.contacts.map((contact) => [contact.typeCode, contact]),
);
const contactKey = (nodeId, dof) => `${nodeId}:${dof}`;
const FLEXIBILITY_OWNER = 'M031_BM2_MATRIX_ASSEMBLY_SINGLE_OWNER_V1';

function compareIds(left, right) {
  const a = Number(left);
  const b = Number(right);
  if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a - b;
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
}

function clean(value) {
  return Object.is(value, -0) || Math.abs(value) < 1e-18 ? 0 : value;
}

function subtract(left, right) {
  return left.map((value, index) => value - right[index]);
}

function scale(vector, factor) {
  return vector.map((value) => value * factor);
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function norm(vector) {
  return Math.hypot(...vector);
}

function unit(vector, label) {
  const length = norm(vector);
  if (!(length > 0)) throw new Error(`${label} has zero length.`);
  return scale(vector, 1 / length);
}

function point(geometry, nodeId) {
  const node = geometry.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`BM2 node ${nodeId} is missing.`);
  return [node.x, node.y, node.z];
}

function sourceSegmentId(segment, baseEntryBySegment, junctions) {
  if (baseEntryBySegment.has(segment.id)) return segment.id;
  if (segment.meta?.expandedFromSegmentId && baseEntryBySegment.has(segment.meta.expandedFromSegmentId)) {
    return segment.meta.expandedFromSegmentId;
  }
  if (segment.meta?.b31jFictitiousRigid) {
    const junction = junctions.find((row) => row.centerNodeId === segment.meta.junctionCenterNodeId);
    if (junction && baseEntryBySegment.has(junction.branchSegmentId)) return junction.branchSegmentId;
  }
  throw new Error(`BM2 expanded segment ${segment.id} has no source-segment authority.`);
}

function physicalLineWeight(entry) {
  if (entry.sourceSegment.meta?.participatesInGravity === false) return 0;
  const analysis = entry.sourceAuthority.meta.analysis;
  const section = entry.physicalSection;
  const pipe = (analysis.pipeDensity ?? 0) * section.sectionState.area * GRAVITY;
  const innerArea = Math.PI * section.dimensions.innerDiameter ** 2 / 4;
  const contents = (analysis.fluidDensity ?? 0) * innerArea * GRAVITY;
  const insulatedOd = section.dimensions.outerDiameter + 2 * (analysis.insulationThickness ?? 0);
  const insulationArea = Math.PI * (insulatedOd ** 2 - section.dimensions.outerDiameter ** 2) / 4;
  const insulation = (analysis.insulationDensity ?? 0) * insulationArea * GRAVITY;
  return pipe + contents + insulation;
}

function expandedEntries(authorities) {
  const baseEntryBySegment = new Map(authorities.entries.map((entry) => [entry.sourceSegment.id, entry]));
  return authorities.geometry.segments.map((segment) => {
    const parentId = sourceSegmentId(segment, baseEntryBySegment, authorities.junctions);
    const base = baseEntryBySegment.get(parentId);
    const isJunctionStub = segment.meta?.b31jFictitiousRigid === true;
    return Object.freeze({
      elementId: `BM2.${segment.id}`,
      sourceSegmentId: parentId,
      sourceSegment: segment,
      sourceAuthority: base.sourceSegment,
      nodeI: `BM2.N${segment.startNodeId}`,
      nodeJ: `BM2.N${segment.endNodeId}`,
      physicalSection: base.physicalSection,
      analysisSection: isJunctionStub ? base.physicalSection : base.analysisSection,
      rigidAuthority: isJunctionStub ? null : base.rigidAuthority,
      referenceVector: segment.meta?.referenceVector ?? [0, 0, 1],
      bendFlexibilityFactor: segment.meta?.bendFlexibilityFactor ?? null,
      isJunctionStub,
    });
  });
}

function directionAway(geometry, segment, centerNodeId) {
  if (segment.startNodeId === centerNodeId) {
    return unit(subtract(point(geometry, segment.endNodeId), point(geometry, centerNodeId)), `${segment.id} direction`);
  }
  if (segment.endNodeId === centerNodeId) {
    return unit(subtract(point(geometry, segment.startNodeId), point(geometry, centerNodeId)), `${segment.id} direction`);
  }
  throw new Error(`Segment ${segment.id} is not incident to junction ${centerNodeId}.`);
}

function teeAuthorities(authorities, entries) {
  const bySource = new Map();
  for (const entry of entries) {
    if (!bySource.has(entry.sourceSegmentId)) bySource.set(entry.sourceSegmentId, []);
    bySource.get(entry.sourceSegmentId).push(entry);
  }
  const byExpandedSegmentId = new Map(entries.map((entry) => [entry.sourceSegment.id, entry]));
  const records = [];
  for (const junction of authorities.junctions) {
    const runBase = authorities.entries.find((entry) => entry.sourceSegment.id === junction.runSegmentIds[0]);
    const branchBase = authorities.entries.find((entry) => entry.sourceSegment.id === junction.branchSegmentId);
    if (!runBase || !branchBase) throw new Error(`BM2 junction ${junction.centerNodeId} lacks run/branch section authority.`);
    const runSection = runBase.physicalSection;
    const branchSection = branchBase.physicalSection;
    const componentClass = junction.sifTypeCode === 3
      ? 'B31J_SKETCH_2_1_WELDING_TEE'
      : 'B31J_SKETCH_2_6_WELDOLET';
    const fittingQuality = junction.sifTypeCode === 3 ? 'VERIFIED_B16_9' : null;
    const factors = junction.sifTypeCode === 3
      ? calculateB31JWeldingTeeFactors({
        runOuterDiameter: runSection.dimensions.outerDiameter,
        runWallThickness: runSection.dimensions.wallThickness,
        branchOuterDiameter: branchSection.dimensions.outerDiameter,
        branchWallThickness: branchSection.dimensions.wallThickness,
        fittingQuality,
      })
      : Object.freeze({
        schema: 'lfea-b31j-weldolet-structural-authority/v1',
        componentClass,
        sourceSifTypeCode: junction.sifTypeCode,
        flexibility: Object.freeze({
          run: Object.freeze({ inPlane: 1, outOfPlane: 1, torsional: 1 }),
          branch: Object.freeze({ inPlane: 1, outOfPlane: 1, torsional: 1 }),
        }),
        displacementSifs: null,
        status: 'CLASSIFIED_SKETCH_2_6_FLEXIBILITY_DEFERRED',
        reason: 'The shared factor calculator has no governed B31J Sketch 2.6 equation kernel; welding-tee equations are not substituted.',
      });
    const firstRunSource = authorities.normalized.geometry.segments.find(
      (segment) => segment.id === junction.runSegmentIds[0],
    );
    const runDirection = directionAway(authorities.normalized.geometry, firstRunSource, junction.centerNodeId);
    const branchSource = authorities.normalized.geometry.segments.find(
      (segment) => segment.id === junction.branchSegmentId,
    );
    const branchSourceDirection = unit(
      subtract(
        point(authorities.normalized.geometry, branchSource.endNodeId),
        point(authorities.normalized.geometry, branchSource.startNodeId),
      ),
      `junction ${junction.centerNodeId} source branch direction`,
    );
    const planeNormal = unit(
      cross(runDirection, branchSourceDirection),
      `junction ${junction.centerNodeId} plane normal`,
    );
    const runEntries = junction.runSegmentIds.flatMap((segmentId) => (bySource.get(segmentId) ?? [])
      .filter((entry) => [entry.sourceSegment.startNodeId, entry.sourceSegment.endNodeId].includes(junction.centerNodeId)));
    if (runEntries.length !== 2) {
      throw new Error(`BM2 junction ${junction.centerNodeId} must own exactly two run-side element ends; found ${runEntries.length}.`);
    }
    const stubId = `BM2.JUNCTION.${junction.centerNodeId}.SURFACE.RIGID`;
    const branchStub = byExpandedSegmentId.get(stubId);
    if (!branchStub) throw new Error(`BM2 junction ${junction.centerNodeId} lacks its center-to-surface branch element.`);
    records.push(Object.freeze({
      junctionId: `BM2.J${junction.centerNodeId}`,
      centerNodeId: junction.centerNodeId,
      surfaceNodeId: junction.surfaceNodeId,
      runEntries: Object.freeze(runEntries),
      branchStub,
      planeNormal: Object.freeze(planeNormal),
      factors: Object.freeze(factors),
      componentClass,
      fittingQuality,
      sourceSifTypeCode: junction.sifTypeCode,
      sourceApplicability: junction.sifTypeCode === 3
        ? 'B31J_SKETCH_2_1_WELDING_TEE_EQUATIONS_APPLIED'
        : 'B31J_SKETCH_2_6_WELDOLET_CLASSIFIED_EQUATIONS_DEFERRED',
    }));
  }
  return Object.freeze(records);
}

function rotationalSpringRate(factor, rigidity, characteristicLength) {
  if (!(factor > 1)) return null;
  return rigidity / ((factor - 1) * characteristicLength);
}

function junctionMechanics(tees, material) {
  const referenceVectorByElement = new Map();
  const endSpringsByElement = new Map();
  const directionalCorrectionByElement = new Map();
  const reportingPlaneByNodeId = new Map();
  const ownershipRows = [];
  const setReference = (elementId, normal, junctionId) => {
    const prior = referenceVectorByElement.get(elementId);
    if (prior && Math.abs(Math.abs(dot(prior.normal, normal)) - 1) > 1e-9) {
      throw new Error(`Element ${elementId} receives incompatible tee planes from ${prior.junctionId} and ${junctionId}.`);
    }
    referenceVectorByElement.set(elementId, { normal, junctionId });
  };
  for (const tee of tees) {
    reportingPlaneByNodeId.set(tee.centerNodeId, tee.planeNormal);
    reportingPlaneByNodeId.set(tee.surfaceNodeId, tee.planeNormal);
    const E = material.materialState.elasticModulus;
    const G = material.materialState.shearModulus;
    const diameter = tee.runEntries[0].physicalSection.dimensions.outerDiameter;
    for (const entry of tee.runEntries) {
      setReference(entry.elementId, tee.planeNormal, tee.junctionId);
      const end = entry.sourceSegment.startNodeId === tee.centerNodeId ? 'I' : 'J';
      const section = entry.analysisSection.sectionState;
      const springCandidates = [
        ['RX', rotationalSpringRate(tee.factors.flexibility.run.torsional, G * section.polarMoment, diameter)],
        ['RY', rotationalSpringRate(tee.factors.flexibility.run.inPlane, E * section.secondMomentY, diameter)],
        ['RZ', rotationalSpringRate(tee.factors.flexibility.run.outOfPlane, E * section.secondMomentZ, diameter)],
      ];
      const springs = endSpringsByElement.get(entry.elementId) ?? [];
      for (const [dof, stiffness] of springCandidates) {
        if (stiffness !== null) springs.push(Object.freeze({ end, dof, stiffness }));
      }
      endSpringsByElement.set(entry.elementId, springs);
    }
    setReference(tee.branchStub.elementId, tee.planeNormal, tee.junctionId);
    const branchFlexibility = tee.factors.flexibility.branch;
    if ([branchFlexibility.inPlane, branchFlexibility.outOfPlane, branchFlexibility.torsional]
      .some((factor) => factor > 1)) {
      directionalCorrectionByElement.set(tee.branchStub.elementId, Object.freeze({
        role: 'BRANCH',
        inPlane: branchFlexibility.inPlane,
        outOfPlane: branchFlexibility.outOfPlane,
        torsional: branchFlexibility.torsional,
        junctionId: tee.junctionId,
      }));
    }
    ownershipRows.push(Object.freeze({
      owner: FLEXIBILITY_OWNER,
      junctionId: tee.junctionId,
      runElementEnds: Object.freeze(tee.runEntries.map((entry) => Object.freeze({
        elementId: entry.elementId,
        end: entry.sourceSegment.startNodeId === tee.centerNodeId ? 'I' : 'J',
      }))),
      branchElementId: tee.branchStub.elementId,
      factors: tee.factors.flexibility,
      componentClass: tee.componentClass,
      sourceSifTypeCode: tee.sourceSifTypeCode,
      sourceApplicability: tee.sourceApplicability,
      duplicateOwners: 0,
    }));
  }
  return Object.freeze({
    referenceVectorByElement,
    endSpringsByElement,
    directionalCorrectionByElement,
    reportingPlaneByNodeId,
    ownershipRows: Object.freeze(ownershipRows),
  });
}

function correctedDirectionalStiffness(frameElement, factors) {
  const section = frameElement.section;
  const local = frameLocalStiffness({
    elasticModulus: frameElement.material.elasticModulus,
    shearModulus: frameElement.material.shearModulus,
    area: section.area,
    secondMomentY: section.secondMomentY / factors.inPlane,
    secondMomentZ: section.secondMomentZ / factors.outOfPlane,
    polarMoment: section.polarMoment / factors.torsional,
    length: frameElement.geometry.length,
    shearDeformation: frameElement.shearDeformation,
    shearCorrectionFactorY: frameElement.shearCorrection?.y.value,
    shearCorrectionFactorZ: frameElement.shearCorrection?.z.value,
  }).matrix;
  return Object.freeze({
    kind: 'B31J_DIRECTIONAL_JUNCTION_STIFFNESS_V1',
    owner: FLEXIBILITY_OWNER,
    factors,
    localStiffness: Object.freeze(local),
    globalStiffness: Object.freeze(transformStiffnessToGlobal(local, frameElement.transformation.matrix)),
  });
}

function unilateralCandidates(geometry) {
  const candidates = new Map();
  for (const node of geometry.nodes) {
    for (const restraint of node.meta?.restraints ?? []) {
      const contact = UNILATERAL_CONTACT_BY_TYPE.get(String(restraint.typeCode));
      if (!contact) continue;
      const key = contactKey(node.id, contact.dof);
      candidates.set(key, Object.freeze({
        key,
        nodeId: node.id,
        typeCode: contact.typeCode,
        dof: contact.dof,
        permittedGapDirection: contact.permittedGapDirection,
      }));
    }
  }
  return Object.freeze([...candidates.values()].sort((left, right) => (
    compareIds(left.nodeId, right.nodeId) || left.dof.localeCompare(right.dof)
  )));
}

function constraintDeclarations(geometry, activeContacts) {
  const rows = new Map();
  const add = (nodeId, dof, reason) => rows.set(`${nodeId}:${dof}`, {
    declarationId: `BM2-M031-C-${nodeId}-${dof}-${reason}`,
    kind: 'NODAL_RESTRAINT',
    nodeId: `BM2.N${nodeId}`,
    dof,
    behavior: 'FIXED',
  });
  for (const node of geometry.nodes) {
    if (node.restraint === 'ANCHOR') {
      for (const dof of DOFS) add(node.id, dof, 'ANCHOR');
    }
    for (const restraint of node.meta?.restraints ?? []) {
      const contact = UNILATERAL_CONTACT_BY_TYPE.get(String(restraint.typeCode));
      if (contact && activeContacts.has(contactKey(node.id, contact.dof))) {
        add(node.id, contact.dof, `${contact.permittedGapDirection.replace('+', 'PLUS-')}-ACTIVE`);
      }
      if (restraint.typeCode === '9') {
        const direction = [
          Math.abs(restraint.xCosine ?? 0),
          Math.abs(restraint.yCosine ?? 0),
          Math.abs(restraint.zCosine ?? 0),
        ];
        const axis = direction.indexOf(Math.max(...direction));
        add(node.id, ['UX', 'UY', 'UZ'][axis], 'GUIDE');
      }
    }
  }
  return [...rows.values()];
}

function compileModel(authorities, entries, mechanics, activeContacts, iteration) {
  const axes = entries.map((entry) => {
    const referenceVector = mechanics.referenceVectorByElement.get(entry.elementId)?.normal ?? entry.referenceVector;
    return {
      evidenceIdentity: `AXIS-${entry.elementId}`,
      result: resolveFrameLocalAxes({
        nodeI: point(authorities.geometry, entry.sourceSegment.startNodeId),
        nodeJ: point(authorities.geometry, entry.sourceSegment.endNodeId),
        referenceVector,
        profile: FRAME_LOCAL_AXIS_PROFILE,
      }),
    };
  });
  const sectionResolutions = new Map();
  for (const entry of entries) sectionResolutions.set(entry.analysisSection.semanticHash, entry.analysisSection);
  return compileMechanicalModel({
    modelIdentity: 'BM2-LIVE-INPUTXML-M031',
    modelRevision: iteration + 1,
    sourceSemanticHash: semanticHash({
      source: authorities.source.semanticHash,
      activeContacts: [...activeContacts].sort(),
      mechanics: FLEXIBILITY_OWNER,
    }),
    conditionedTopology: authorities.conditioned,
    nodeBindings: authorities.geometry.nodes.map((node) => ({
      nodeId: `BM2.N${node.id}`,
      conditionedNodeId: `CN-${node.id}`,
      topologyNodeId: node.id,
    })),
    elementBindings: entries.map((entry) => ({
      elementId: entry.elementId,
      conditionedSegmentId: entry.sourceSegment.id,
      topologySegmentId: entry.sourceSegment.id,
      materialStateId: authorities.material.materialState.materialStateId,
      sectionStateId: entry.analysisSection.sectionState.sectionStateId,
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      localAxisEvidenceIdentity: `AXIS-${entry.elementId}`,
      sourceComponentId: entry.sourceSegment.sourceComponentUid,
    })),
    materialResolutions: [authorities.material],
    sectionResolutions: [...sectionResolutions.values()],
    localAxisResults: axes,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: constraintDeclarations(authorities.geometry, activeContacts),
    profile: compilerProfile(),
  });
}

function compileCase(authorities, entries, compilation, label, thermal) {
  const primitives = [];
  for (const entry of entries) {
    const analysis = entry.sourceAuthority.meta.analysis;
    const lineWeight = entry.rigidAuthority
      ? entry.rigidAuthority.gravity.totalLineWeight
      : physicalLineWeight(entry);
    if (lineWeight !== 0) {
      primitives.push({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `BM2-M031-${label}-WEIGHT-${entry.elementId}`,
        kind: 'DISTRIBUTED_LOAD',
        elementId: entry.elementId,
        basis: 'GLOBAL',
        variation: 'UNIFORM',
        startIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
        endIntensity: { fx: 0, fy: -lineWeight, fz: 0 },
        units: { distributedForce: 'N/m', length: 'm' },
        sourceEvidence: sourceEvidence({
          sourceId: entry.rigidAuthority ? `${BM2_SOURCE_ID}-RIGID-WEIGHT` : `${BM2_SOURCE_ID}-PHYSICAL-WEIGHT`,
          sourceRevision: `${entry.sourceSegmentId}:${entry.sourceSegment.id}:${lineWeight}`,
        }),
      });
    }
    if ((analysis.pressure ?? 0) > 0) {
      primitives.push({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `BM2-M031-${label}-PRESSURE-${entry.elementId}`,
        kind: 'PRESSURE',
        elementId: entry.elementId,
        pressure: analysis.pressure,
        pressureBasis: 'GAUGE',
        authorizedEffects: { codeStress: true, pressureStiffening: false, axialThrust: false, bourdon: false },
        sourceEvidence: sourceEvidence({
          sourceId: `${BM2_SOURCE_ID}-PRESSURE1`,
          sourceRevision: `${entry.sourceSegmentId}:${analysis.pressure}`,
        }),
      });
    }
    if (thermal && entry.sourceSegment.meta?.participatesInThermalExpansion !== false) {
      primitives.push({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `BM2-M031-${label}-TEMPERATURE-${entry.elementId}`,
        kind: 'TEMPERATURE',
        elementId: entry.elementId,
        operatingTemperature: analysis.operatingTemperature,
        installationTemperature: INSTALLATION_TEMPERATURE,
        stiffnessEvaluationMaterialStateId: authorities.material.materialState.materialStateId,
        thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
        sourceEvidence: sourceEvidence({
          sourceId: `${BM2_SOURCE_ID}-TEMP_EXP_C1`,
          sourceRevision: `${entry.sourceSegmentId}:${analysis.operatingTemperature}`,
        }),
      });
    }
  }
  return compilePhysicalLoadCase({
    loadCaseId: `BM2-M031-${label}`,
    loadCaseClass: 'MIXED_PHYSICAL',
    presentation: { label, description: `M031 BM2 ${label} qualified mechanics solve.` },
    modelReference: modelReferenceFromCompilation(compilation),
    primitives,
    profile: loadCaseProfile({ gravitationalAcceleration: { value: GRAVITY, source: 'SI-STANDARD-GRAVITY-EXACT' } }),
  });
}

function b31jFictitiousRigidCorrection(authorities, entry, frameElement) {
  if (!entry.isJunctionStub) return null;
  const section = entry.physicalSection;
  const material = authorities.material.materialState;
  const authority = compileCaesarRigidElementAuthority(sealRigidElementRequest({
    schema: 'fea-linear-rigid-element-request/v1',
    rigidElementId: entry.elementId,
    length: frameElement.geometry.length,
    insideDiameter: section.dimensions.innerDiameter,
    enteredOutsideDiameter: section.dimensions.outerDiameter,
    pipeWallThickness: section.dimensions.wallThickness,
    enteredRigidWeight: 0,
    fluidDensity: 0,
    insulationThickness: 0,
    insulationDensity: 0,
    refractoryWeight: 0,
    claddingWeight: 0,
    gravityAcceleration: GRAVITY,
    installationTemperature: INSTALLATION_TEMPERATURE,
    operatingTemperature: INSTALLATION_TEMPERATURE,
    material: {
      elasticModulus: material.elasticModulus,
      shearModulus: material.shearModulus,
      thermalExpansionCoefficient: material.thermalExpansionCoefficient,
    },
    sourceEvidence: {
      sourceId: `${BM2_SOURCE_ID}-B31J-FICTITIOUS-RIGID`,
      sourceRevision: `${entry.sourceSegmentId}:${entry.sourceSegment.id}`,
      sourceSemanticHash: authorities.source.semanticHash,
    },
    semanticHash: '',
  }));
  const localStiffness = authority.stiffnessSection.localStiffness;
  return Object.freeze({
    kind: 'B31J_FICTITIOUS_RIGID_10X_WALL_V1',
    owner: FLEXIBILITY_OWNER,
    authority,
    localStiffness: Object.freeze([...localStiffness]),
    globalStiffness: Object.freeze(transformStiffnessToGlobal(
      localStiffness,
      frameElement.transformation.matrix,
    )),
  });
}

function compileElements(authorities, entries, mechanics, loadCase) {
  const distributedByElement = new Map();
  const temperatureByElement = new Map();
  for (const primitive of loadCase.primitives) {
    if (primitive.kind === 'DISTRIBUTED_LOAD') {
      if (!distributedByElement.has(primitive.elementId)) distributedByElement.set(primitive.elementId, []);
      distributedByElement.get(primitive.elementId).push(primitive);
    }
    if (primitive.kind === 'TEMPERATURE') temperatureByElement.set(primitive.elementId, primitive);
  }
  return Object.freeze(entries.map((entry) => {
    const referenceVector = mechanics.referenceVectorByElement.get(entry.elementId)?.normal ?? entry.referenceVector;
    const frameElement = compileFrameElement({
      elementId: entry.elementId,
      material: authorities.material,
      section: entry.analysisSection,
      localAxes: {
        result: resolveFrameLocalAxes({
          nodeI: point(authorities.geometry, entry.sourceSegment.startNodeId),
          nodeJ: point(authorities.geometry, entry.sourceSegment.endNodeId),
          referenceVector,
          profile: FRAME_LOCAL_AXIS_PROFILE,
        }),
        profile: FRAME_LOCAL_AXIS_PROFILE,
      },
      profile: authorities.frameProfile,
      distributedLoads: distributedByElement.get(entry.elementId) ?? [],
      temperature: temperatureByElement.get(entry.elementId) ?? null,
      releases: [],
      endSprings: mechanics.endSpringsByElement.get(entry.elementId) ?? [],
      rigidOffsets: null,
    });
    const bendCorrection = entry.bendFlexibilityFactor === null
      ? null
      : applyBendingFlexibilityCorrection(frameElement, entry.bendFlexibilityFactor);
    const junctionFactors = mechanics.directionalCorrectionByElement.get(entry.elementId) ?? null;
    if (bendCorrection !== null && junctionFactors !== null) {
      throw new Error(`Element ${entry.elementId} received both bend and junction stiffness ownership.`);
    }
    const junctionCorrection = junctionFactors === null
      ? null
      : correctedDirectionalStiffness(frameElement, junctionFactors);
    const rigidCorrection = b31jFictitiousRigidCorrection(authorities, entry, frameElement);
    if (rigidCorrection !== null && (bendCorrection !== null || junctionCorrection !== null)) {
      throw new Error(`Element ${entry.elementId} received conflicting bend, junction and rigid stiffness ownership.`);
    }
    const correction = rigidCorrection ?? bendCorrection ?? junctionCorrection;
    return Object.freeze({
      entry,
      frameElement,
      correction,
      effectiveLocalStiffness: correction?.localStiffness ?? frameElement.localStiffness,
      effectiveGlobalStiffness: correction?.globalStiffness ?? frameElement.globalStiffness,
      owner: correction === null && (mechanics.endSpringsByElement.get(entry.elementId)?.length ?? 0) === 0
        ? null
        : FLEXIBILITY_OWNER,
    });
  }));
}

function elementContributions(records) {
  return records.map((record) => requireElementContribution({
    elementId: record.frameElement.elementId,
    globalStiffness: [...record.effectiveGlobalStiffness],
    equivalentLoadGlobal: [...record.frameElement.equivalentLoadVector.global],
    initialStrainLoadGlobal: [...record.frameElement.initialStrainLoadVector.global],
  }));
}

function recoverActions(compilation, execution, records) {
  const displacementIndex = new Map(execution.displacement.map((row) => [`${row.nodeId}:${row.dof}`, row.value]));
  const modelElements = new Map(compilation.model.elements.map((entry) => [entry.elementId, entry]));
  const actions = records.map((record) => {
    const modelElement = modelElements.get(record.entry.elementId);
    const jointDisplacement12 = gatherJointDisplacement12(
      displacementIndex,
      modelElement.nodeI,
      modelElement.nodeJ,
    );
    const recovered = recoverElementEndAction({
      frameElementRecord: record.frameElement,
      effectiveLocalStiffness: record.effectiveLocalStiffness,
      jointDisplacement12,
    });
    return Object.freeze({
      elementId: record.entry.elementId,
      ownerComponentId: record.owner,
      local: recovered.local,
      global: recovered.global,
    });
  });
  return Object.freeze({ elementActions: Object.freeze(actions) });
}

function valueAt(rows, nodeId, dof) {
  return rows.find((row) => row.nodeId === nodeId && row.dof === dof)?.value ?? 0;
}

function activeSetLedger(execution, candidates, activeSet) {
  const reactionScale = Math.max(
    1,
    ...candidates.map((candidate) => Math.abs(
      valueAt(execution.reactions, `BM2.N${candidate.nodeId}`, candidate.dof),
    )),
  );
  return Object.freeze(candidates.map((candidate) => {
    const active = activeSet.has(candidate.key);
    const gap = clean(valueAt(execution.displacement, `BM2.N${candidate.nodeId}`, candidate.dof));
    const reaction = active
      ? clean(valueAt(execution.reactions, `BM2.N${candidate.nodeId}`, candidate.dof))
      : 0;
    const penetrationResidual = Math.max(0, -gap / BM2_M031_ACTIVE_SET_PROFILE.gapTolerance);
    const tensileResidual = Math.max(0, -reaction / BM2_M031_ACTIVE_SET_PROFILE.reactionTolerance);
    const productResidual = Math.abs(gap * reaction)
      / (Math.max(BM2_M031_ACTIVE_SET_PROFILE.gapTolerance, Math.abs(gap)) * reactionScale);
    return Object.freeze({
      key: candidate.key,
      nodeId: candidate.nodeId,
      typeCode: candidate.typeCode,
      dof: candidate.dof,
      permittedGapDirection: candidate.permittedGapDirection,
      state: active ? 'ACTIVE' : 'INACTIVE',
      gap,
      reaction,
      complementarityProduct: gap * reaction,
      normalizedResidual: penetrationResidual + tensileResidual + productResidual,
      passed: gap >= -BM2_M031_ACTIVE_SET_PROFILE.gapTolerance
        && reaction >= -BM2_M031_ACTIVE_SET_PROFILE.reactionTolerance
        && Math.abs(gap * reaction) <= BM2_M031_ACTIVE_SET_PROFILE.gapTolerance * reactionScale,
    });
  }));
}

function activeSetTransitions(ledger) {
  const activate = ledger
    .filter((row) => row.state === 'INACTIVE' && row.gap < -BM2_M031_ACTIVE_SET_PROFILE.gapTolerance)
    .map((row) => row.key);
  const deactivate = ledger
    .filter((row) => row.state === 'ACTIVE' && row.reaction < -BM2_M031_ACTIVE_SET_PROFILE.reactionTolerance)
    .map((row) => row.key);
  return Object.freeze({ activate: Object.freeze(activate), deactivate: Object.freeze(deactivate) });
}

function conditioningEvidence(execution, compilation) {
  const constrained = new Set(compilation.model.constraints
    .filter((constraint) => constraint.behavior !== 'LINEAR_SPRING')
    .map((constraint) => `${constraint.nodeId}:${constraint.dof}`));
  const freeEntries = execution.dofMap.entries.filter((entry) => !constrained.has(`${entry.nodeId}:${entry.dof}`));
  const handle = execution.factorizationHandle;
  let pivots = [];
  let permutation = null;
  if (handle.kind === 'CHOLESKY') pivots = handle.sparseFactor?.pivots ?? [];
  else {
    pivots = handle.sparseFactor?.D ?? handle.D ?? [];
    permutation = handle.sparseFactor?.permutation ?? null;
  }
  let weakest = null;
  if (pivots.length > 0) {
    let position = 0;
    for (let index = 1; index < pivots.length; index += 1) {
      if (Math.abs(pivots[index]) < Math.abs(pivots[position])) position = index;
    }
    const freeIndex = permutation?.[position] ?? position;
    const dof = freeEntries[freeIndex] ?? null;
    weakest = dof === null ? null : Object.freeze({
      diagnostic: 'WEAKEST_SCALED_FACTORIZATION_PIVOT_V1',
      nodeId: dof.nodeId,
      dof: dof.dof,
      pivot: pivots[position],
      factorPosition: position,
      freeDofIndex: freeIndex,
    });
  }
  return Object.freeze({
    conditionEstimate: execution.factorization.conditionEstimate,
    conditionEstimateMethod: execution.factorization.conditionEstimateMethod,
    pivotStatistics: execution.factorization.pivotStatistics,
    weakestNodeDof: weakest,
    scaledSystemStatus: execution.diagnostics.conditioning.status,
    backwardResidual: execution.diagnostics.residual,
    matrixConditioned: execution.diagnostics.conditioning.status !== 'FAIL'
      && execution.factorization.pivotStatistics.negativePivotCount === 0,
    residualQualified: execution.diagnostics.residual.status === 'PASS',
    wellConditioned: execution.diagnostics.conditioning.status !== 'FAIL'
      && execution.factorization.pivotStatistics.negativePivotCount === 0
      && execution.diagnostics.residual.status === 'PASS',
    qualificationStatus: execution.diagnostics.conditioning.status === 'FAIL'
      || execution.factorization.pivotStatistics.negativePivotCount !== 0
      ? 'FAIL'
      : execution.diagnostics.residual.status === 'PASS'
        ? 'PASS'
        : 'CONDITIONAL_RESIDUAL_WARN',
  });
}

function solveIteration(authorities, entries, mechanics, candidates, activeSet, label, thermal, iteration) {
  const compilation = compileModel(authorities, entries, mechanics, activeSet, iteration);
  const loadCase = compileCase(authorities, entries, compilation, label, thermal);
  const elementRecords = compileElements(authorities, entries, mechanics, loadCase);
  const execution = compileSolverExecution({
    compilation,
    elementContributions: elementContributions(elementRecords),
    loadCase,
    solverProfile: solverProfile(BM2_M031_SOLVER_CONDITIONING_PROFILE),
  });
  const recovery = recoverActions(compilation, execution, elementRecords);
  const ledger = activeSetLedger(execution, candidates, activeSet);
  return Object.freeze({
    compilation,
    loadCase,
    elementRecords,
    execution,
    recovery,
    activeSet: new Set(activeSet),
    ledger,
    conditioning: conditioningEvidence(execution, compilation),
  });
}

function solvePhysicalCase(authorities, entries, mechanics, candidates, label, thermal) {
  let activeSet = new Set(candidates.map((candidate) => candidate.key));
  const history = [];
  const signatures = new Set();
  for (let iteration = 0; iteration < BM2_M031_ACTIVE_SET_PROFILE.maximumIterations; iteration += 1) {
    const signature = [...activeSet].sort(compareIds).join(',');
    if (signatures.has(signature)) {
      throw new Error(`BM2 ${label} unilateral active set cycled at ${signature}.`);
    }
    signatures.add(signature);
    const solved = solveIteration(
      authorities,
      entries,
      mechanics,
      candidates,
      activeSet,
      label,
      thermal,
      iteration,
    );
    const transitions = activeSetTransitions(solved.ledger);
    history.push(Object.freeze({
      iteration: iteration + 1,
      activeContactKeys: Object.freeze([...activeSet].sort()),
      activeNodeIds: Object.freeze([...new Set([...activeSet].map((key) => key.split(':')[0]))].sort(compareIds)),
      transitions,
      conditionEstimate: solved.conditioning.conditionEstimate,
    }));
    if (transitions.activate.length === 0 && transitions.deactivate.length === 0) {
      if (!solved.ledger.every((row) => row.passed)) {
        throw new Error(`BM2 ${label} active set stopped with a non-complementary support state.`);
      }
      return Object.freeze({
        ...solved,
        activeSetHistory: Object.freeze(history),
        nonlinearStatus: 'COMPLEMENTARITY_CONVERGED',
      });
    }
    const next = new Set(activeSet);
    transitions.deactivate.forEach((key) => next.delete(key));
    transitions.activate.forEach((key) => next.add(key));
    activeSet = next;
  }
  throw new Error(`BM2 ${label} unilateral active set exceeded its iteration limit.`);
}

function nodalResult(analysis, physicalNodeId) {
  const kernelNodeId = `BM2.N${physicalNodeId}`;
  return Object.freeze({
    displacement: Object.freeze(Object.fromEntries(DOFS.map((dof) => [
      dof,
      clean(valueAt(analysis.execution.displacement, kernelNodeId, dof)),
    ]))),
    reaction: Object.freeze(Object.fromEntries(DOFS.map((dof) => [
      dof,
      clean(valueAt(analysis.execution.reactions, kernelNodeId, dof)),
    ]))),
  });
}

function actionIndex(analysis) {
  return new Map(analysis.recovery.elementActions.map((row) => [row.elementId, row]));
}

function recordIndex(analysis) {
  return new Map(analysis.elementRecords.map((row) => [row.entry.elementId, row]));
}

function caesarStraightReportAxes(axis) {
  const a = unit(axis, 'BM2 CAESAR straight local a');
  const vertical = [0, 1, 0];
  const b = Math.abs(dot(a, vertical)) >= 1 - 1e-10
    ? [1, 0, 0]
    : unit(cross(a, vertical), 'BM2 CAESAR straight local b');
  const c = unit(cross(a, b), 'BM2 CAESAR straight local c');
  return Object.freeze({ a: Object.freeze(a), b: Object.freeze(b), c: Object.freeze(c) });
}

function caesarBendReportAxes(authorities, record, nodeId) {
  const sourceSegmentId = record.entry.sourceSegment.meta?.expandedFromSegmentId;
  const bend = authorities.bendAuthorities.find((row) => row.sourceSegmentId === sourceSegmentId);
  if (!bend) throw new Error(`BM2 bend reporting authority ${sourceSegmentId} is unavailable.`);
  const radius = subtract(point(authorities.geometry, nodeId), bend.centre);
  const a = unit(cross(bend.planeNormal, radius), `BM2 ${sourceSegmentId} tangent at ${nodeId}`);
  const b = scale(bend.planeNormal, -1);
  const c = unit(cross(a, b), `BM2 ${sourceSegmentId} local c at ${nodeId}`);
  return Object.freeze({ a: Object.freeze(a), b: Object.freeze(b), c: Object.freeze(c) });
}

function caesarEndpointReportAxes(authorities, mechanics, record, end) {
  const nodeId = end === 'I'
    ? record.entry.sourceSegment.startNodeId
    : record.entry.sourceSegment.endNodeId;
  const intersectionPlane = mechanics.reportingPlaneByNodeId.get(nodeId);
  if (intersectionPlane) {
    const a = unit(
      subtract(
        point(authorities.geometry, record.entry.sourceSegment.endNodeId),
        point(authorities.geometry, record.entry.sourceSegment.startNodeId),
      ),
      `BM2 intersection local a at ${nodeId}`,
    );
    const b = [...intersectionPlane];
    const c = unit(cross(a, b), `BM2 intersection local c at ${nodeId}`);
    return Object.freeze({ a: Object.freeze(a), b: Object.freeze(b), c: Object.freeze(c) });
  }
  if (record.entry.sourceSegment.meta?.expandedRole === 'BEND_ARC') {
    return caesarBendReportAxes(authorities, record, nodeId);
  }
  return caesarStraightReportAxes(record.frameElement.localAxes.axes.x);
}

function projectGlobalActionToCaesarLocal(global, axes) {
  const force = [global.fx, global.fy, global.fz];
  const moment = [global.mx, global.my, global.mz];
  return Object.freeze({
    fx: clean(dot(axes.a, force)),
    fy: clean(dot(axes.b, force)),
    fz: clean(dot(axes.c, force)),
    mx: clean(dot(axes.a, moment)),
    my: clean(dot(axes.b, moment)),
    mz: clean(dot(axes.c, moment)),
  });
}

function reportedEndpoint(authorities, mechanics, action, record, end) {
  const global = action.global[end];
  const axes = caesarEndpointReportAxes(authorities, mechanics, record, end);
  return Object.freeze({ local: projectGlobalActionToCaesarLocal(global, axes), global });
}

function endpointAction(authorities, mechanics, action, record, nodeId) {
  if (record.entry.sourceSegment.startNodeId === nodeId) {
    return reportedEndpoint(authorities, mechanics, action, record, 'I');
  }
  if (record.entry.sourceSegment.endNodeId === nodeId) {
    return reportedEndpoint(authorities, mechanics, action, record, 'J');
  }
  return null;
}

function transferEndpoint(authorities, mechanics, analysis, transfer) {
  const elementId = `BM2.${transfer.elementId}`;
  const action = actionIndex(analysis).get(elementId);
  const record = recordIndex(analysis).get(elementId);
  if (!action || !record) throw new Error(`BM2 transfer action ${elementId} is unavailable.`);
  return reportedEndpoint(authorities, mechanics, action, record, transfer.end);
}

function pairAction(authorities, mechanics, analysis, group) {
  if (group.elementIds.length === 0) {
    const endpoint = transferEndpoint(authorities, mechanics, analysis, group.transferAction);
    return Object.freeze({
      local: Object.freeze({ I: endpoint.local, J: endpoint.local }),
      global: Object.freeze({ I: endpoint.global, J: endpoint.global }),
    });
  }
  const [reportFrom, reportTo] = group.key.split('-');
  const physicalFrom = group.physicalFromNodeId ?? authorities.reportNodeAliases[reportFrom] ?? reportFrom;
  const physicalTo = group.physicalToNodeId ?? authorities.reportNodeAliases[reportTo] ?? reportTo;
  const actions = actionIndex(analysis);
  const records = recordIndex(analysis);
  const candidates = group.elementIds.map((id) => {
    const elementId = `BM2.${id}`;
    const action = actions.get(elementId);
    const record = records.get(elementId);
    if (!action || !record) throw new Error(`BM2 pair ${group.key} lacks element ${elementId}.`);
    return { action, record };
  });
  const from = candidates.map(({ action, record }) => endpointAction(authorities, mechanics, action, record, physicalFrom)).find(Boolean);
  const to = candidates.map(({ action, record }) => endpointAction(authorities, mechanics, action, record, physicalTo)).find(Boolean);
  if (!from || !to) {
    throw new Error(`BM2 pair ${group.key} does not resolve both physical endpoints ${physicalFrom}/${physicalTo}.`);
  }
  return Object.freeze({
    local: Object.freeze({ I: from.local, J: to.local }),
    global: Object.freeze({ I: from.global, J: to.global }),
  });
}

function reportNodeIds(authorities) {
  const ids = new Set(authorities.normalized.geometry.nodes.map((node) => node.id));
  for (const group of authorities.pairGroups.values()) {
    const [from, to] = group.key.split('-');
    ids.add(from);
    ids.add(to);
  }
  return Object.freeze([...ids].sort(compareIds));
}

function derivedLedger(operating, sustained) {
  const susByKey = new Map(sustained.ledger.map((row) => [row.key, row]));
  return Object.freeze(operating.ledger.map((ope) => {
    const sus = susByKey.get(ope.key);
    return Object.freeze({
      key: ope.key,
      nodeId: ope.nodeId,
      typeCode: ope.typeCode,
      dof: ope.dof,
      permittedGapDirection: ope.permittedGapDirection,
      state: 'DERIVED_OPE_MINUS_SUS_NOT_REITERATED',
      gap: clean(ope.gap - sus.gap),
      reaction: clean(ope.reaction - sus.reaction),
      complementarityProduct: null,
      normalizedResidual: null,
      passed: true,
    });
  }));
}

function buildReport(authorities, entries, mechanics, sustained, operating) {
  const nodeIds = reportNodeIds(authorities);
  const elements = [...authorities.pairGroups.values()]
    .sort((left, right) => compareIds(left.key.split('-')[0], right.key.split('-')[0])
      || compareIds(left.key.split('-')[1], right.key.split('-')[1]))
    .map((group) => {
      const [fromNode, toNode] = group.key.split('-');
      const memberRecords = group.elementIds.map((id) => entries.find((entry) => entry.sourceSegment.id === id)).filter(Boolean);
      return Object.freeze({
        sourceElementId: `BM2.PAIR.${group.key}`,
        kernelElementId: group.elementIds.length > 0
          ? group.elementIds.map((id) => `BM2.${id}`).join('|')
          : `BM2.${group.transferAction.elementId}:${group.transferAction.end}`,
        fromNode,
        toNode,
        sourceType: group.role,
        bendTagged: group.role.includes('BEND') || memberRecords.some((row) => row.bendFlexibilityFactor !== null),
        rigid: group.role.includes('RIGID') || memberRecords.some((row) => row.rigidAuthority !== null),
        codeStressEligible: !group.role.includes('FICTITIOUS_RIGID'),
        sustained: pairAction(authorities, mechanics, sustained, group),
        operating: pairAction(authorities, mechanics, operating, group),
      });
    });
  const activeSetStatus = sustained.ledger.every((row) => row.passed)
      && operating.ledger.every((row) => row.passed)
    ? 'QUALIFIED_COMPLEMENTARITY_ACTIVE_SET_V1'
    : 'BLOCKED';
  return Object.freeze({
    schema: 'm031-bm2-qualified-solve-report/v1',
    sourceSemanticHash: authorities.source.semanticHash,
    solverConditioningProfile: BM2_M031_SOLVER_CONDITIONING_PROFILE,
    counts: Object.freeze({
      sourceNodes: authorities.normalized.geometry.nodes.length,
      retainedReportNodes: nodeIds.length,
      expandedAnalysisNodes: authorities.geometry.nodes.length,
      expandedAnalysisElements: entries.length,
      retainedReportPairs: elements.length,
      bends: authorities.bendAuthorities.length,
      bendStations: authorities.geometry.summary.bendDeclaredStationCount,
      b31jJunctions: mechanics.ownershipRows.length,
      unilateralCandidates: unilateralCandidates(authorities.geometry).length,
      plusYCandidates: unilateralCandidates(authorities.geometry).filter((row) => row.typeCode === '14').length,
      plusZCandidates: unilateralCandidates(authorities.geometry).filter((row) => row.typeCode === '15').length,
    }),
    limitations: Object.freeze([
      Object.freeze({ code: 'BM2_WELDOLET_SKETCH_2_6_FLEXIBILITY_EQUATIONS_DEFERRED', cause: 'Source SIF type 5 is governed as a B31J Sketch 2.6 Weldolet; no welding-tee equation is substituted while the shared Sketch 2.6 factor kernel is unavailable.' }),
      Object.freeze({ code: 'BM2_RIGID_BODY_LOAD_DISTRIBUTION_ASSUMPTION', cause: 'Source rigid-body mass is retained as a consistent line load over its entered finite length.' }),
      Object.freeze({ code: 'BM2_JUNCTION_INTERNAL_STUB_ZERO_MASS', cause: 'The existing B31J center-to-surface internal branch span remains zero-mass and non-thermal; only its directional stiffness and recovery participate.' }),
      Object.freeze({ code: 'BM2_CODE_STRESS_DEFERRED', cause: 'M031 closes displacement, restraint and force/station mechanics; final piping-code stress evaluation remains a separate package.' }),
    ]),
    flexibilityOwnership: Object.freeze({
      owner: FLEXIBILITY_OWNER,
      bendElements: entries.filter((entry) => entry.bendFlexibilityFactor !== null).length,
      junctions: mechanics.ownershipRows,
      fictitiousRigidElements: entries.filter((entry) => entry.isJunctionStub).length,
      fictitiousRigidAuthority: 'CAESAR_RIGID_10X_ENTERED_WALL_ZERO_MASS_ZERO_THERMAL_V1',
      duplicateOwnerCount: 0,
    }),
    junctionClassification: Object.freeze({
      weldingTees: mechanics.ownershipRows.filter((row) => row.sourceSifTypeCode === 3).length,
      weldolets: mechanics.ownershipRows.filter((row) => row.sourceSifTypeCode === 5).length,
      type5Status: 'B31J_SKETCH_2_6_WELDOLET_CLASSIFIED_EQUATIONS_DEFERRED',
      falseWeldingTeeSubstitutions: 0,
    }),
    localForceReportingAuthority: Object.freeze({
      rule: 'CAESAR_ELEMENT_ENDPOINT_LOCAL_ABC_V1',
      straight: 'a=FROM_TO;b=a_X_GLOBAL_Y_OR_GLOBAL_X_IF_VERTICAL;c=a_X_b',
      bend: 'a=TANGENT_TOWARD_FAR_END;b=BEND_PLANE_NORMAL;c=a_X_b',
      intersection: 'a=FROM_TO;b=COMMON_INTERSECTION_PLANE_NORMAL;c=a_X_b',
    }),
    restraintClassification: Object.freeze({
      correctionProfile: 'CAESAR_INPUTXML_RESTRAINT_TYPE_EXPORT_CORRECTION_V1',
      type15: Object.freeze({ canonicalType: '+Z', dof: 'UZ', mechanics: 'UNILATERAL_COMPLEMENTARITY_ACTIVE_SET' }),
      status: 'SOURCE_CLASSIFIED_AND_MECHANICALLY_COMPILED',
    }),
    nonlinearRestraints: Object.freeze({
      profile: BM2_M031_ACTIVE_SET_PROFILE,
      status: activeSetStatus,
      sustained: Object.freeze({
        status: sustained.nonlinearStatus,
        history: sustained.activeSetHistory,
        ledger: sustained.ledger,
      }),
      operating: Object.freeze({
        status: operating.nonlinearStatus,
        history: operating.activeSetHistory,
        ledger: operating.ledger,
      }),
      expansion: Object.freeze({
        status: 'DERIVED_FROM_CONVERGED_PHYSICAL_CASES',
        ledger: derivedLedger(operating, sustained),
      }),
    }),
    conditioning: Object.freeze({
      sustained: sustained.conditioning,
      operating: operating.conditioning,
      rigidElement615AdjacentModeReview: Object.freeze({
        diagnosticRule: 'WEAKEST_SCALED_FACTORIZATION_PIVOT_BY_NODE_DOF',
        sustainedWeakest: sustained.conditioning.weakestNodeDof,
        operatingWeakest: operating.conditioning.weakestNodeDof,
      }),
    }),
    stationCustody: Object.freeze({
      sourceLevelScalarDenominator: 3240,
      fullRetainedStationScalarDenominator: 5598,
      retainedReportNodes: nodeIds.length,
      retainedReportPairs: elements.length,
      generatedStationRule: 'NORMALIZED_SOURCE_NODES_PLUS_QUALIFIED_BEND_AND_B31J_PAIR_ENDPOINTS_V1',
      manifestHash: semanticHash({
        nodes: nodeIds,
        pairs: elements.map((row) => [row.fromNode, row.toNode]),
      }),
    }),
    nodes: Object.freeze(nodeIds.map((sourceNodeId) => {
      const physicalNodeId = authorities.reportNodeAliases[sourceNodeId] ?? sourceNodeId;
      const sourceNode = authorities.normalized.geometry.nodes.find((node) => node.id === sourceNodeId);
      const physicalNode = authorities.geometry.nodes.find((node) => node.id === physicalNodeId);
      return Object.freeze({
        sourceNodeId,
        kernelNodeId: `BM2.N${physicalNodeId}`,
        restraint: sourceNode?.restraint ?? physicalNode?.restraint ?? 'FREE',
        sourceRestraints: sourceNode?.meta?.restraints ?? [],
        position: Object.freeze({ x: physicalNode.x, y: physicalNode.y, z: physicalNode.z }),
        sustained: nodalResult(sustained, physicalNodeId),
        operating: nodalResult(operating, physicalNodeId),
      });
    })),
    elements: Object.freeze(elements),
  });
}

export function solveBm2InputXmlQualified() {
  const authorities = buildBm2BendExpandedAuthorities();
  const entries = expandedEntries(authorities);
  const tees = teeAuthorities(authorities, entries);
  const mechanics = junctionMechanics(tees, authorities.material);
  const candidates = unilateralCandidates(authorities.geometry);
  const sustained = solvePhysicalCase(authorities, entries, mechanics, candidates, 'SUS', false);
  const operating = solvePhysicalCase(authorities, entries, mechanics, candidates, 'OPE', true);
  const report = buildReport(authorities, entries, mechanics, sustained, operating);
  return Object.freeze({
    ...authorities,
    entries,
    teeAuthorities: tees,
    junctionMechanics: mechanics,
    sustained,
    operating,
    report,
  });
}

export const solveBm2InputXmlConditioned = solveBm2InputXmlQualified;

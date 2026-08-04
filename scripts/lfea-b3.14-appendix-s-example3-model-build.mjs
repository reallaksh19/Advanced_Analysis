import { FRAME_LOCAL_AXIS_PROFILE, resolveFrameLocalAxes } from '../src/core/centerline-beam-fea/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import { compilePhysicalLoadCase, modelReferenceFromCompilation } from '../src/core/linear-fea-load-case/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import { compilePipingComponent } from '../src/core/linear-fea-piping-components/index.js';
import {
  augmentPipingComponentTemperatureAuthorities,
  expandPipeWallGravitySourceAuthorities,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import {
  compileSolverExecution,
  elementContributionFromFrameElement,
  elementContributionsFromPipingComponent,
} from '../src/core/linear-fea-solver/index.js';
import { compileResultRecovery } from '../src/core/linear-fea-result-recovery/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { compilerProfile } from './lfea-b2.5-model-compiler-fixtures.mjs';
import { eulerBernoulliProfile } from './lfea-b3.1-frame-element-fixtures.mjs';
import { componentProfile } from './lfea-b3.2-piping-component-fixtures.mjs';
import { loadCaseProfile, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';
import {
  APPENDIX_S3_SOURCE,
  BRANCH_OUTER_DIAMETER,
  GRAVITATIONAL_ACCELERATION,
  HEADER_OUTER_DIAMETER,
  INSTALLATION_TEMPERATURE,
  JUNCTION_POINTS,
  METER_DERIVATION,
  METER_LENGTH,
  METER_MASS,
  OPERATING_PRESSURE,
  OPERATING_TEMPERATURE,
  STRAIGHT_SPANS,
  TEE_DEFINITIONS,
  TEE_DERIVATION,
  TEE_STUB_LENGTH,
} from './lfea-b3.14-appendix-s-example3-data.mjs';
import {
  materialAuthority,
  sectionAuthorities,
  sourceEvidence,
  teeFlexibilityFactorSet,
} from './lfea-b3.14-appendix-s-example3-code-authorities.mjs';

export function buildAppendixS3Authorities() {
  const material = materialAuthority();
  const sections = sectionAuthorities();
  const frameProfile = eulerBernoulliProfile();
  const teeProfile = componentProfile({
    branchFlexibilityMethod: 'BRANCH_JUNCTION_ROTATIONAL_FLEXIBILITY_V1',
    convergenceRequired: false,
  });
  const meterProfile = componentProfile({
    valveBodyRule: 'VALVE_SEMI_RIGID_BODY_V1',
    convergenceRequired: false,
  });
  const teeComponents = TEE_DEFINITIONS.map((definition) => compileTee(
    definition,
    material,
    sections,
    frameProfile,
    teeProfile,
  ));
  const meterComponents = [
    compileMeter('APP-S3.M130', JUNCTION_POINTS['APP-S3.N120'], JUNCTION_POINTS['APP-S3.N130'], 'east', material, sections, frameProfile, meterProfile),
    compileMeter('APP-S3.M230', JUNCTION_POINTS['APP-S3.N220'], JUNCTION_POINTS['APP-S3.N230'], 'west', material, sections, frameProfile, meterProfile),
  ];
  const components = [...teeComponents, ...meterComponents];
  const elementRegions = new Map();
  for (const definition of TEE_DEFINITIONS) {
    const sortedLegs = [...definition.legs].sort((left, right) => left.legId < right.legId ? -1 : left.legId > right.legId ? 1 : 0);
    sortedLegs.forEach((leg, index) => elementRegions.set(`${definition.componentId}.E${index + 1}`, leg.region));
  }
  elementRegions.set('APP-S3.M130.E1', 'east');
  elementRegions.set('APP-S3.M230.E1', 'west');
  STRAIGHT_SPANS.forEach((entry) => elementRegions.set(entry.elementId, entry.region));
  const model = buildMechanicalModel({ material, sections, components });
  return { material, sections, frameProfile, components, teeComponents, meterComponents, elementRegions, compilation: model };
}

function compileTee(definition, material, sections, frameProfile, profile) {
  return compilePipingComponent({
    componentId: definition.componentId,
    componentType: 'BRANCH_JUNCTION',
    profile,
    junctionId: `${definition.componentId}.JUNCTION`,
    junctionPosition: definition.junctionPosition,
    legs: definition.legs.map((leg) => ({
      legId: leg.legId,
      endPoint: leg.direction.map((value, axis) => definition.junctionPosition[axis] + value * TEE_STUB_LENGTH),
      material,
      section: sections[leg.section],
    })),
    frameElementProfile: frameProfile,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    referenceVector: [0, 1, 0],
    factorSet: teeFlexibilityFactorSet(definition.componentId),
    nominalDiameters: Object.fromEntries(definition.legs.map((leg) => [
      leg.legId,
      leg.section === 'header' ? HEADER_OUTER_DIAMETER : BRANCH_OUTER_DIAMETER,
    ])),
  });
}

function compileMeter(componentId, start, end, region, material, sections, frameProfile, profile) {
  const midpoint = start.map((value, index) => 0.5 * (value + end[index]));
  const component = compilePipingComponent({
    componentId,
    componentType: 'VALVE_FLANGE',
    profile,
    start,
    end,
    material,
    section: sections.meter,
    massProperties: {
      mass: { value: METER_MASS, source: 'Appendix S Table S303.3 meter weight / standard gravity' },
      centreOfGravity: midpoint,
    },
    endConnections: {
      I: { portId: `${componentId}.PORT-I`, connectionType: 'FLANGED' },
      J: { portId: `${componentId}.PORT-J`, connectionType: 'FLANGED' },
    },
    bodyStiffnessMultiplier: {
      value: 1,
      source: 'Equivalent annular section derived from meter mass already carries the selected semi-rigid stiffness',
    },
    frameElementProfile: frameProfile,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    referenceVector: [0, 1, 0],
  });
  component.elements.forEach((entry) => {
    if (entry.frameElement.geometry.length !== METER_LENGTH) {
      throw new Error(`${componentId} must retain the published 5-ft/1.52-m finite length.`);
    }
  });
  void region;
  return component;
}

function buildMechanicalModel({ material, sections, components }) {
  const nodes = collectNodes(components);
  const componentSegments = components.flatMap(componentSegmentsFor);
  const straightSegments = STRAIGHT_SPANS.map((entry) => ({
    ...entry,
    sourceComponentId: 'APP-S3.PIPE',
    sectionStateId: sections[entry.section].sectionState.sectionStateId,
  }));
  const segments = [...straightSegments, ...componentSegments];
  const localAxisResults = segments.map((segment) => ({
    evidenceIdentity: `AXIS-${segment.elementId}`,
    result: resolveFrameLocalAxes({
      nodeI: nodePosition(nodes, segment.nodeI),
      nodeJ: nodePosition(nodes, segment.nodeJ),
      referenceVector: [0, 1, 0],
      profile: FRAME_LOCAL_AXIS_PROFILE,
    }),
  }));
  const constraints = [
    ...['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => restraint('APP-S3.N10', dof)),
    ...['UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => restraint('APP-S3.N310', dof)),
    ...['APP-S3.N110', 'APP-S3.N140', 'APP-S3.N210', 'APP-S3.N240'].map((nodeId) => restraint(nodeId, 'UY')),
  ];
  return compileMechanicalModel({
    modelIdentity: 'APP-S-EXAMPLE-3-MOMENT-REVERSAL',
    modelRevision: 1,
    sourceSemanticHash: semanticHash({
      source: APPENDIX_S3_SOURCE,
      junctionPoints: JUNCTION_POINTS,
      tee: TEE_DERIVATION,
      meter: METER_DERIVATION,
    }),
    conditionedTopology: {
      geometry: {
        schemaVersion: 'canonical-geometry-v1',
        nodes: nodes.map((entry) => ({
          id: `TOPO/${entry.nodeId}`,
          x: entry.position[0],
          y: entry.position[1],
          z: entry.position[2],
          restraint: 'FREE',
          sourceComponentUid: entry.sourceComponentId,
          meta: {},
        })),
        segments: segments.map((entry) => ({
          id: `TOPO/${entry.elementId}`,
          startNodeId: `TOPO/${entry.nodeI}`,
          endNodeId: `TOPO/${entry.nodeJ}`,
          type: 'PIPE',
          sourceComponentUid: entry.sourceComponentId,
        })),
        source: APPENDIX_S3_SOURCE,
        unit: 'm',
        diagnostics: [],
        summary: {},
      },
      semanticHash: semanticHash({
        nodes: nodes.map((entry) => [entry.nodeId, entry.position]),
        segments: segments.map((entry) => [entry.elementId, entry.nodeI, entry.nodeJ]),
      }),
    },
    nodeBindings: nodes.map((entry) => ({
      nodeId: entry.nodeId,
      conditionedNodeId: `CN-${entry.nodeId}`,
      topologyNodeId: `TOPO/${entry.nodeId}`,
    })),
    elementBindings: segments.map((entry) => ({
      elementId: entry.elementId,
      conditionedSegmentId: `CS-${entry.elementId}`,
      topologySegmentId: `TOPO/${entry.elementId}`,
      materialStateId: material.materialState.materialStateId,
      sectionStateId: entry.sectionStateId,
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      localAxisEvidenceIdentity: `AXIS-${entry.elementId}`,
      sourceComponentId: entry.sourceComponentId,
    })),
    materialResolutions: [material],
    sectionResolutions: [sections.header, sections.branch, sections.meter],
    localAxisResults,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: constraints,
    profile: compilerProfile(),
  });
}

function collectNodes(components) {
  const plain = [
    ['APP-S3.N10', JUNCTION_POINTS['APP-S3.N10']],
    ['APP-S3.N35', JUNCTION_POINTS['APP-S3.N35']],
    ['APP-S3.N45', JUNCTION_POINTS['APP-S3.N45']],
    ['APP-S3.N110', JUNCTION_POINTS['APP-S3.N110']],
    ['APP-S3.N140', JUNCTION_POINTS['APP-S3.N140']],
    ['APP-S3.N210', JUNCTION_POINTS['APP-S3.N210']],
    ['APP-S3.N240', JUNCTION_POINTS['APP-S3.N240']],
    ['APP-S3.N310', JUNCTION_POINTS['APP-S3.N310']],
    ['APP-S3.N335', JUNCTION_POINTS['APP-S3.N335']],
    ['APP-S3.N345', JUNCTION_POINTS['APP-S3.N345']],
  ].map(([nodeId, position]) => ({ nodeId, position, sourceComponentId: 'APP-S3.PIPE' }));
  const generated = components.flatMap((component) => {
    if (component.componentType === 'BRANCH_JUNCTION') {
      return [
        { nodeId: `${component.componentId}.N0`, position: component.geometry.junctionPosition, sourceComponentId: component.componentId },
        ...component.codeStations.map((station) => ({ nodeId: station.nodeId, position: station.position, sourceComponentId: component.componentId })),
      ];
    }
    return component.codeStations.map((station) => ({
      nodeId: station.nodeId,
      position: station.position,
      sourceComponentId: component.componentId,
    }));
  });
  return [...plain, ...generated];
}

function componentSegmentsFor(component) {
  if (component.componentType === 'BRANCH_JUNCTION') {
    return component.elements.map((entry, index) => ({
      elementId: entry.elementId,
      nodeI: `${component.componentId}.N0`,
      nodeJ: component.codeStations[index].nodeId,
      sourceComponentId: component.componentId,
      sectionStateId: entry.frameElement.section.sectionStateId,
    }));
  }
  return [{
    elementId: component.elements[0].elementId,
    nodeI: component.codeStations.find((entry) => entry.stationId.endsWith('CP-I')).nodeId,
    nodeJ: component.codeStations.find((entry) => entry.stationId.endsWith('CP-J')).nodeId,
    sourceComponentId: component.componentId,
    sectionStateId: component.elements[0].frameElement.section.sectionStateId,
  }];
}

function restraint(nodeId, dof) {
  return {
    declarationId: `C-${nodeId}-${dof}`,
    kind: 'NODAL_RESTRAINT',
    nodeId,
    dof,
    behavior: 'FIXED',
  };
}

function nodePosition(nodes, nodeId) {
  const found = nodes.find((entry) => entry.nodeId === nodeId);
  if (found === undefined) throw new Error(`Missing node position for ${nodeId}.`);
  return found.position;
}

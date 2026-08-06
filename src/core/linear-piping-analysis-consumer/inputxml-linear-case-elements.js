import {
  FRAME_LOCAL_AXIS_PROFILE,
  resolveFrameLocalAxes,
} from '../centerline-beam-fea/index.js';
import { compileFrameElement } from '../linear-fea-frame-element/index.js';
import { requirePhysicalLoadCase } from '../linear-fea-load-case/index.js';
import { elementContributionFromFrameElement } from '../linear-fea-solver/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';

const AXIS_CUSTODY_TOLERANCE = 1e-12;

export function compileInputXmlCaseElementAuthorities({
  structuralPreparation,
  frameProfile,
  physicalCase,
  stiffnessElementLedger,
}) {
  const loadCase = requirePhysicalLoadCase(physicalCase);
  const compilation = structuralPreparation.compilation;
  const model = compilation.model;
  const materials = new Map(structuralPreparation.materialResolutions.map((resolution) => [
    resolution.materialState.materialStateId,
    resolution,
  ]));
  const sections = new Map(structuralPreparation.sectionResolutions.map((resolution) => [
    resolution.sectionState.sectionStateId,
    resolution,
  ]));
  const nodes = new Map(model.nodes.map((node) => [node.nodeId, node]));
  const stiffnessByElement = new Map(stiffnessElementLedger.map((row) => [row.elementId, row]));
  const loads = indexElementLoads(loadCase, new Set(model.elements.map((row) => row.elementId)));
  const frameElements = [];
  const elementContributions = [];
  const elementLedger = [];

  for (const element of [...model.elements].sort((left, right) => compareAscii(left.elementId, right.elementId))) {
    const material = materials.get(element.materialStateId);
    const section = sections.get(element.sectionStateId);
    const nodeI = nodes.get(element.nodeI);
    const nodeJ = nodes.get(element.nodeJ);
    const expectedStiffness = stiffnessByElement.get(element.elementId);
    if (!material || !section || !nodeI || !nodeJ || !expectedStiffness) {
      throw new TypeError(`InputXML case element ${element.elementId} has stale authority bindings.`);
    }
    const axes = resolveFrameLocalAxes({
      nodeI: position(nodeI),
      nodeJ: position(nodeJ),
      referenceVector: [...element.localAxes.y],
      profile: FRAME_LOCAL_AXIS_PROFILE,
    });
    requireAxisCustody(element, axes);
    const distributedLoads = loads.distributed.get(element.elementId) ?? [];
    const temperature = loads.temperature.get(element.elementId) ?? null;
    const frameElement = compileFrameElement({
      elementId: element.elementId,
      material,
      section,
      localAxes: { result: axes, profile: FRAME_LOCAL_AXIS_PROFILE },
      profile: frameProfile,
      distributedLoads,
      temperature,
      releases: [],
      endSprings: [],
      rigidOffsets: null,
    });
    const contribution = elementContributionFromFrameElement(frameElement);
    const globalStiffnessHash = semanticHash(contribution.globalStiffness);
    if (globalStiffnessHash !== expectedStiffness.globalStiffnessHash) {
      throw new TypeError(
        `InputXML case element ${element.elementId} stiffness differs from qualified preflight.`,
      );
    }
    frameElements.push(frameElement);
    elementContributions.push(contribution);
    elementLedger.push(Object.freeze({
      elementId: element.elementId,
      frameElementSemanticHash: frameElement.semanticHash,
      globalStiffnessHash,
      qualifiedStiffnessHash: expectedStiffness.globalStiffnessHash,
      distributedPrimitiveIds: Object.freeze(distributedLoads.map((row) => row.primitiveId)),
      temperaturePrimitiveId: temperature?.primitiveId ?? null,
      codeOnlyPrimitiveIds: Object.freeze((loads.pressure.get(element.elementId) ?? [])
        .map((row) => row.primitiveId)),
    }));
  }
  return Object.freeze({
    frameElements: Object.freeze(frameElements),
    elementContributions: Object.freeze(elementContributions),
    elementLedger: Object.freeze(elementLedger),
  });
}

function indexElementLoads(loadCase, modelElementIds) {
  const distributed = new Map();
  const temperature = new Map();
  const pressure = new Map();
  for (const primitive of loadCase.primitives) {
    if (!Object.hasOwn(primitive, 'elementId')) continue;
    if (!modelElementIds.has(primitive.elementId)) {
      throw new TypeError(
        `InputXML physical case ${loadCase.loadCaseId} targets unknown element ${primitive.elementId}.`,
      );
    }
    if (primitive.kind === 'DISTRIBUTED_LOAD') {
      append(distributed, primitive.elementId, primitive);
    } else if (primitive.kind === 'TEMPERATURE') {
      if (temperature.has(primitive.elementId)) {
        throw new TypeError(
          `InputXML physical case ${loadCase.loadCaseId} has duplicate temperature primitives for ${primitive.elementId}.`,
        );
      }
      temperature.set(primitive.elementId, primitive);
    } else if (primitive.kind === 'PRESSURE') {
      append(pressure, primitive.elementId, primitive);
    }
  }
  return { distributed, temperature, pressure };
}

function append(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
  map.get(key).sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));
}

function requireAxisCustody(element, resolved) {
  for (const axis of ['x', 'y', 'z']) {
    for (let index = 0; index < 3; index += 1) {
      if (Math.abs(element.localAxes[axis][index] - resolved.axes[axis][index])
        > AXIS_CUSTODY_TOLERANCE) {
        throw new TypeError(`InputXML case element ${element.elementId} local-axis custody is inconsistent.`);
      }
    }
  }
}

function position(node) {
  return [node.position.x, node.position.y, node.position.z];
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

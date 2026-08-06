import {
  FRAME_LOCAL_AXIS_PROFILE,
  resolveFrameLocalAxes,
} from '../centerline-beam-fea/index.js';
import { compileFrameElement } from '../linear-fea-frame-element/index.js';
import { elementContributionFromFrameElement } from '../linear-fea-solver/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';

const AXIS_CUSTODY_TOLERANCE = 1e-12;

export function compileInputXmlStiffnessElementAuthorities(structuralPreparation, frameProfile) {
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
  const frameElements = [];
  const elementContributions = [];
  const elementLedger = [];

  for (const element of [...model.elements].sort((left, right) => compareAscii(left.elementId, right.elementId))) {
    const material = materials.get(element.materialStateId);
    const section = sections.get(element.sectionStateId);
    const nodeI = nodes.get(element.nodeI);
    const nodeJ = nodes.get(element.nodeJ);
    if (!material || !section || !nodeI || !nodeJ) {
      throw new TypeError(`InputXML stiffness element ${element.elementId} has stale model authority bindings.`);
    }
    const axes = resolveFrameLocalAxes({
      nodeI: position(nodeI),
      nodeJ: position(nodeJ),
      referenceVector: [...element.localAxes.y],
      profile: FRAME_LOCAL_AXIS_PROFILE,
    });
    requireAxisCustody(element, axes);
    const frameElement = compileFrameElement({
      elementId: element.elementId,
      material,
      section,
      localAxes: { result: axes, profile: FRAME_LOCAL_AXIS_PROFILE },
      profile: frameProfile,
      distributedLoads: [],
      temperature: null,
      releases: [],
      endSprings: [],
      rigidOffsets: null,
    });
    const contribution = elementContributionFromFrameElement(frameElement);
    frameElements.push(frameElement);
    elementContributions.push(contribution);
    elementLedger.push(Object.freeze({
      elementId: element.elementId,
      nodeI: element.nodeI,
      nodeJ: element.nodeJ,
      materialStateId: element.materialStateId,
      sectionStateId: element.sectionStateId,
      sourceComponentId: element.sourceAncestry.sourceComponentId,
      localAxisEvidenceIdentity: element.localAxes.evidenceIdentity,
      localAxisResultSemanticHash: axes.semanticHash,
      frameElementSemanticHash: frameElement.semanticHash,
      globalStiffnessHash: semanticHash(contribution.globalStiffness),
      stiffnessRelevantLimitationCodes: Object.freeze(frameElement.limitations
        .filter((row) => row.stiffnessRelevant)
        .map((row) => row.code)
        .sort(compareAscii)),
    }));
  }
  return Object.freeze({
    frameElements: Object.freeze(frameElements),
    elementContributions: Object.freeze(elementContributions),
    elementLedger: Object.freeze(elementLedger),
  });
}

function requireAxisCustody(element, resolved) {
  for (const axis of ['x', 'y', 'z']) {
    for (let index = 0; index < 3; index += 1) {
      if (Math.abs(element.localAxes[axis][index] - resolved.axes[axis][index]) > AXIS_CUSTODY_TOLERANCE) {
        throw new TypeError(`InputXML stiffness element ${element.elementId} local-axis custody is inconsistent.`);
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

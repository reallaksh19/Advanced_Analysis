import {
  BM4_SOURCE_ID,
  GRAVITY,
  INSTALLATION_TEMPERATURE,
} from './lfea-m034-bm4-solve-fixtures.mjs';
import { analyseCase, buildBm4M035FeatureAuthorities } from './lfea-m035-bm4-feature-solve-runtime.mjs';

// M046: native, fully-resolved element-level export of BM4/BM4_NL's analysis
// model, in this app's OWN post-compilation form -- the same nodes,
// elements, bend-arc stations, tangent trims, tee-junction modifiers,
// section/material states and restraint declarations the solver itself
// consumes (buildBm4M035FeatureAuthorities + analyseCase, unmodified).
//
// Why this exists: independent RCA sessions on this benchmark have each
// re-derived their own bend expansion, tangent geometry and node mapping
// from InputXML/accdb source data, and those independent derivations do not
// agree at the element level (M045's own commit and the conversation record
// document one such disagreement at the IX-S36 bend). Re-deriving geometry
// is exactly the step that should not be repeated per session: this module
// exports the ALREADY-VALIDATED result (verified against BM4_NL's real
// restraint/coordinate data at node 20295/21430, see conversation record)
// so downstream analysis work can treat geometry as a fixed, shared input
// and iterate only on the ANALYSIS/PHYSICS layer built on top of it.
export const NATIVE_MODEL_SCHEMA = 'bm4-native-analysis-model/v1';
export const NATIVE_MODEL_USAGE_CONTRACT =
  'Nodes, elements, bend geometry, section/material states and restraints in '
  + 'this export are AUTHORITATIVE and already validated against BM4_NL\'s '
  + 'real CAESAR output (see M044/M045/M046 in the source repository). '
  + 'Downstream analysis work must not re-derive bend tangent trims, tee '
  + 'end-springs/offsets, or restraint linearization from source InputXML/ '
  + 'accdb data -- consume this export as-is and iterate ONLY on additional '
  + 'physics/analysis mechanics layered on top of it (e.g. an extra '
  + 'initial-strain or load term), analogous to how M045 adds pressure '
  + 'elongation without touching geometry.';

const NODE_PREFIX = 'BM4M035.N';
const ELEMENT_PREFIX = 'BM4M035.';

function bareNode(id) {
  return String(id).replace(NODE_PREFIX, '');
}

function bareElement(id) {
  return String(id).replace(ELEMENT_PREFIX, '');
}

function nodeList(authorities) {
  return authorities.analysisGeometry.nodes
    .map((node) => Object.freeze({ nodeId: String(node.id), x: node.x, y: node.y, z: node.z }))
    .sort((a, b) => (a.nodeId < b.nodeId ? -1 : 1));
}

function sectionOf(entry) {
  const dims = entry.analysisSection.dimensions;
  const state = entry.analysisSection.sectionState;
  return Object.freeze({
    innerDiameter: dims.innerDiameter,
    outerDiameter: dims.outerDiameter,
    wallThickness: dims.wallThickness,
    area: state.area,
    secondMomentY: state.secondMomentY,
    secondMomentZ: state.secondMomentZ,
    polarMoment: state.polarMoment,
  });
}

function elementLoadByElementId(loadCase) {
  const byElement = new Map();
  const get = (id) => {
    if (!byElement.has(id)) byElement.set(id, { lineWeightNewtonPerMetre: 0, pressurePascal: 0, operatingTemperatureK: null });
    return byElement.get(id);
  };
  for (const primitive of loadCase.primitives) {
    if (primitive.kind === 'DISTRIBUTED_LOAD') get(primitive.elementId).lineWeightNewtonPerMetre = -primitive.startIntensity.fy;
    if (primitive.kind === 'PRESSURE') get(primitive.elementId).pressurePascal = primitive.pressure;
    if (primitive.kind === 'TEMPERATURE') get(primitive.elementId).operatingTemperatureK = primitive.operatingTemperature;
  }
  return byElement;
}

function straightElements(authorities, loadByElement) {
  return authorities.entries
    .filter((entry) => !entry.bendComponent)
    .map((entry) => {
      const load = loadByElement.get(entry.elementId) ?? { lineWeightNewtonPerMetre: 0, pressurePascal: 0, operatingTemperatureK: null };
      return Object.freeze({
        elementId: bareElement(entry.elementId),
        kind: 'STRAIGHT_FRAME',
        sourceSegmentId: entry.sourceSegmentId,
        nodeI: bareNode(entry.nodeI),
        nodeJ: bareNode(entry.nodeJ),
        section: sectionOf(entry),
        lineWeightNewtonPerMetre: load.lineWeightNewtonPerMetre,
        pressurePascal: load.pressurePascal,
        operatingTemperatureK: load.operatingTemperatureK,
        hasEndSprings: (entry.teeModifier?.endSprings ?? []).length > 0,
        hasRigidOffsets: entry.teeModifier?.rigidOffsets != null,
      });
    })
    .sort((a, b) => (a.elementId < b.elementId ? -1 : 1));
}

function bendComponents(authorities, loadByElement) {
  return authorities.bendExpansion.components.map((component) => Object.freeze({
    bendComponentId: component.componentId,
    radius: component.geometry.radius,
    sweepAngle: component.geometry.sweepAngle,
    arcLength: component.geometry.arcLength,
    planeNormal: [...component.geometry.planeNormal],
    tangentStart: [...component.geometry.tangentStart],
    tangentEnd: [...component.geometry.tangentEnd],
    elements: component.elements.map((componentElement) => {
      const entry = authorities.entryByElementId.get(componentElement.elementId);
      const load = loadByElement.get(componentElement.elementId) ?? { lineWeightNewtonPerMetre: 0, pressurePascal: 0, operatingTemperatureK: null };
      return Object.freeze({
        elementId: bareElement(componentElement.elementId),
        kind: 'BEND_ARC',
        nodeI: bareNode(entry.nodeI),
        nodeJ: bareNode(entry.nodeJ),
        role: componentElement.role,
        section: sectionOf(entry),
        lineWeightNewtonPerMetre: load.lineWeightNewtonPerMetre,
        pressurePascal: load.pressurePascal,
        operatingTemperatureK: load.operatingTemperatureK,
      });
    }),
  }));
}

function restraintList(authorities) {
  return authorities.compilation.model.constraints
    .map((row) => Object.freeze({ nodeId: bareNode(row.nodeId), dof: row.dof, behavior: row.behavior }))
    .sort((a, b) => (a.nodeId === b.nodeId ? (a.dof < b.dof ? -1 : 1) : (a.nodeId < b.nodeId ? -1 : 1)));
}

export function buildNativeAnalysisModel() {
  const authorities = buildBm4M035FeatureAuthorities();
  const sustained = analyseCase(authorities, 'BM4-M046-NATIVE-SUS', false);
  const operating = analyseCase(authorities, 'BM4-M046-NATIVE-OPE', true);
  const susLoads = elementLoadByElementId(sustained.loadCase);
  const opeLoads = elementLoadByElementId(operating.loadCase);
  return Object.freeze({
    schema: NATIVE_MODEL_SCHEMA,
    usageContract: NATIVE_MODEL_USAGE_CONTRACT,
    provenance: Object.freeze({
      sourceId: BM4_SOURCE_ID,
      sourceSemanticHash: authorities.source.semanticHash,
      restraintConvention: 'BM4_NL_BIDIRECTIONAL_NO_GAP_LINEARIZED_V1',
      gravitationalAcceleration: GRAVITY,
      installationTemperatureK: INSTALLATION_TEMPERATURE,
    }),
    units: Object.freeze({
      length: 'm', force: 'N', moment: 'N*m', temperature: 'K', pressure: 'Pa', angle: 'rad',
    }),
    nodes: nodeList(authorities),
    material: Object.freeze({
      elasticModulus: authorities.material.materialState.elasticModulus,
      shearModulus: authorities.material.materialState.shearModulus,
      poissonRatio: authorities.material.materialState.poissonRatio,
      thermalExpansionCoefficient: authorities.material.materialState.thermalExpansionCoefficient,
    }),
    straightElements: straightElements(authorities, susLoads),
    bendComponents: bendComponents(authorities, susLoads),
    loadCases: Object.freeze({
      SUS: Object.freeze({ thermal: false }),
      OPE: Object.freeze({ thermal: true, elementOperatingTemperatureK: Object.fromEntries([...opeLoads].map(([id, row]) => [bareElement(id), row.operatingTemperatureK])) }),
    }),
    restraints: restraintList(authorities),
  });
}

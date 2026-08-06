import {
  LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  resolveLinearFeaMaterialState,
  sealMaterialTable,
} from '../linear-fea-material/index.js';
import {
  PIPE_SECTION_FORMULATION_ID,
  PIPE_SECTION_PROFILE,
  PIPE_SECTION_REQUEST_SCHEMA,
  computePipeSectionRequestSemanticHash,
  resolvePipeSection,
} from '../linear-fea-section/index.js';
import {
  RIGID_ELEMENT_REQUEST_SCHEMA,
  compileCaesarRigidElementAuthority,
  sealRigidElementRequest,
} from '../linear-fea-rigid-element/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';

export const GRAVITY = 9.80665;
export const DEFAULT_INSTALLATION_TEMPERATURE = 293.15;

export function sourceEvidence(value) {
  return { sourceId: value.sourceId, sourceRevision: value.sourceRevision, sourceSemanticHash: semanticHash(value) };
}

export function point(geometry, nodeId) {
  const node = geometry.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`Node ${nodeId} is missing from geometry.`);
  return [node.x, node.y, node.z];
}

export function physicalLineWeight(entry) {
  const analysis = entry.sourceSegment.meta.analysis;
  const section = entry.physicalSection;
  const pipe = (analysis.pipeDensity ?? 0) * section.sectionState.area * GRAVITY;
  const innerArea = Math.PI * section.dimensions.innerDiameter ** 2 / 4;
  const contents = (analysis.fluidDensity ?? 0) * innerArea * GRAVITY;
  const insulatedOd = section.dimensions.outerDiameter + 2 * (analysis.insulationThickness ?? 0);
  const insulationArea = Math.PI * (insulatedOd ** 2 - section.dimensions.outerDiameter ** 2) / 4;
  const insulation = (analysis.insulationDensity ?? 0) * insulationArea * GRAVITY;
  return pipe + contents + insulation;
}

export function materialAuthority(geometry, source, modelId, thermalExpansionCoefficient) {
  const analyses = geometry.segments.map((segment) => segment.meta.analysis);
  const missing = analyses.filter(
    (analysis) => !(analysis.elasticModulus > 0) || !(analysis.pipeDensity > 0) || !(analysis.poissonRatio > 0),
  );
  if (missing.length > 0) {
    const error = new Error(`${missing.length} of ${analyses.length} segment(s) are missing a required material field (elasticModulus, pipeDensity, or poissonRatio).`);
    error.code = 'GENERIC_SOLVE_MATERIAL_FIELD_MISSING';
    throw error;
  }
  const first = analyses[0];
  const evaluationTemperature = Math.max(...analyses.map((row) => row.operatingTemperature));
  const pointValue = {
    absoluteTemperature: evaluationTemperature,
    elasticModulus: first.elasticModulus,
    shearModulus: first.elasticModulus / (2 * (1 + first.poissonRatio)),
    poissonRatio: first.poissonRatio,
    massDensity: first.pipeDensity,
    thermalExpansionCoefficient: thermalExpansionCoefficient ?? 0,
  };
  const table = sealMaterialTable({
    schema: 'fea-linear-material-table/v1',
    materialId: `${modelId}-MATERIAL`,
    sourceEvidence: sourceEvidence({
      sourceId: `${modelId}-MATERIAL`,
      sourceRevision: source.sourceRevision,
      point: pointValue,
    }),
    points: [pointValue],
    semanticHash: '',
  });
  return resolveLinearFeaMaterialState({
    table,
    request: { materialStateId: `${modelId}-MAT`, materialId: table.materialId, evaluationTemperature },
    profile: LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  });
}

export function resolveSection({ sectionStateId, outerDiameter, wallThickness, sourceId, sourceRevision }) {
  const payload = {
    schema: PIPE_SECTION_REQUEST_SCHEMA,
    sectionStateId,
    formulationId: PIPE_SECTION_FORMULATION_ID,
    outerDiameter,
    wallThickness,
    sourceEvidence: sourceEvidence({ sourceId, sourceRevision, outerDiameter, wallThickness }),
  };
  return resolvePipeSection({
    request: { ...payload, semanticHash: computePipeSectionRequestSemanticHash(payload) },
    profile: PIPE_SECTION_PROFILE,
  });
}

export function physicalSectionAuthorities(geometry, source, modelId) {
  const byKey = new Map();
  const bySegment = new Map();
  for (const segment of geometry.segments) {
    const key = `${segment.diameter}:${segment.thickness}`;
    let section = byKey.get(key);
    if (!section) {
      section = resolveSection({
        sectionStateId: `${modelId}-SEC-${byKey.size + 1}`,
        outerDiameter: segment.diameter,
        wallThickness: segment.thickness,
        sourceId: `${modelId}-PHYSICAL-SECTION`,
        sourceRevision: `${source.sourceRevision}:${key}`,
      });
      byKey.set(key, section);
    }
    bySegment.set(segment.id, section);
  }
  return bySegment;
}

export function rigidAuthorityFor(segment, physicalSection, modelId, thermalExpansionCoefficient) {
  const analysis = segment.meta.analysis;
  const request = sealRigidElementRequest({
    schema: RIGID_ELEMENT_REQUEST_SCHEMA,
    rigidElementId: `${modelId}-RIGID-${segment.id}`,
    length: segment.length,
    insideDiameter: physicalSection.dimensions.innerDiameter,
    enteredOutsideDiameter: physicalSection.dimensions.outerDiameter,
    pipeWallThickness: physicalSection.dimensions.wallThickness,
    enteredRigidWeight: analysis.rigid.weight ?? 0,
    fluidDensity: analysis.fluidDensity ?? 0,
    insulationThickness: analysis.insulationThickness ?? 0,
    insulationDensity: analysis.insulationDensity ?? 0,
    refractoryWeight: 0,
    claddingWeight: 0,
    gravityAcceleration: GRAVITY,
    installationTemperature: DEFAULT_INSTALLATION_TEMPERATURE,
    operatingTemperature: analysis.operatingTemperature,
    material: {
      elasticModulus: analysis.elasticModulus,
      shearModulus: analysis.elasticModulus / (2 * (1 + analysis.poissonRatio)),
      thermalExpansionCoefficient: thermalExpansionCoefficient ?? 0,
    },
    sourceEvidence: sourceEvidence({
      sourceId: `${modelId}-RIGID-${segment.id}`,
      sourceRevision: `rigid:${segment.id}`,
      rigid: analysis.rigid,
      physicalSectionHash: physicalSection.semanticHash,
    }),
    semanticHash: '',
  });
  return compileCaesarRigidElementAuthority(request);
}

export function rigidStiffnessSection(segment, authority, modelId) {
  return resolveSection({
    sectionStateId: `${modelId}-RIGID-SEC-${segment.meta.sourceIndex + 1}`,
    outerDiameter: authority.stiffnessSection.outsideDiameter,
    wallThickness: authority.stiffnessSection.wallThickness,
    sourceId: `${modelId}-RIGID-STIFFNESS-SECTION`,
    sourceRevision: `${segment.id}:${authority.semanticHash}`,
  });
}

export function modelEntries(geometry, physicalSections, modelId, thermalExpansionCoefficient) {
  return geometry.segments.map((sourceSegment) => {
    const physicalSection = physicalSections.get(sourceSegment.id);
    const rigidAuthority = sourceSegment.meta.analysis.rigid
      ? rigidAuthorityFor(sourceSegment, physicalSection, modelId, thermalExpansionCoefficient)
      : null;
    const analysisSection = rigidAuthority
      ? rigidStiffnessSection(sourceSegment, rigidAuthority, modelId)
      : physicalSection;
    return Object.freeze({
      sourceSegment,
      elementId: `${modelId}.${sourceSegment.id}`,
      physicalSection,
      analysisSection,
      rigidAuthority,
      referenceVector: [0, 0, 1],
    });
  });
}

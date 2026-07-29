import { semanticHash as hashCanonicalValue } from '../shared-piping-model/canonical-json.js';
import { canonicalizeLinearFeaModel } from './model-canonicalization.js';
import { canonicalDiagnosticEvidence } from './model-diagnostics.js';

export function computeValidationProfileSemanticHash(profile) {
  return hashCanonicalValue({
    profileId: profile.profileId,
    zeroLengthTolerance: profile.zeroLengthTolerance,
    unitVectorTolerance: profile.unitVectorTolerance,
    orthogonalityTolerance: profile.orthogonalityTolerance,
    handednessTolerance: profile.handednessTolerance,
  });
}

function stiffnessConstraintProjection(constraint) {
  if (constraint.behavior === 'LINEAR_SPRING') {
    return {
      nodeId: constraint.nodeId,
      dof: constraint.dof,
      behavior: constraint.behavior,
      basis: constraint.basis,
      stiffness: constraint.stiffness,
    };
  }
  return {
    nodeId: constraint.nodeId,
    dof: constraint.dof,
    basis: constraint.basis,
    partition: 'CONSTRAINED',
  };
}

export function stiffnessStateProjection(candidate) {
  const model = canonicalizeLinearFeaModel(candidate);
  const materials = new Map(model.materialStates.map((state) => [state.materialStateId, state]));
  const sections = new Map(model.sectionStates.map((state) => [state.sectionStateId, state]));
  return {
    schema: model.schema,
    units: model.units,
    conventions: model.conventions,
    formulationRegistryVersion: model.formulationRegistryVersion,
    nodes: model.nodes.map((node) => ({
      nodeId: node.nodeId,
      position: node.position,
    })),
    elements: model.elements.map((element) => {
      const material = materials.get(element.materialStateId);
      const section = sections.get(element.sectionStateId);
      return {
        formulationId: element.formulationId,
        nodeI: element.nodeI,
        nodeJ: element.nodeJ,
        localAxes: {
          x: element.localAxes.x,
          y: element.localAxes.y,
          z: element.localAxes.z,
        },
        material: {
          elasticModulus: material?.elasticModulus,
          shearModulus: material?.shearModulus,
        },
        section: {
          area: section?.area,
          secondMomentY: section?.secondMomentY,
          secondMomentZ: section?.secondMomentZ,
          polarMoment: section?.polarMoment,
        },
      };
    }),
    constraints: model.constraints.map(stiffnessConstraintProjection),
    limitations: model.limitations
      .filter((limitation) => limitation.stiffnessRelevant)
      .map((limitation) => ({
        code: limitation.code,
        severity: limitation.severity,
        scope: limitation.scope,
        details: limitation.details,
      })),
  };
}

export function semanticProjection(candidate) {
  const model = canonicalizeLinearFeaModel(candidate);
  const {
    diagnostics: _diagnostics,
    stiffnessStateHash: _stiffnessStateHash,
    semanticHash: _semanticHash,
    evidenceHash: _evidenceHash,
    ...semanticModel
  } = model;
  return semanticModel;
}

export function evidenceProjection(candidate) {
  const model = canonicalizeLinearFeaModel(candidate);
  return {
    semanticHash: model.semanticHash,
    diagnostics: canonicalDiagnosticEvidence(model.diagnostics),
  };
}

export function computeStiffnessStateHash(candidate) {
  return hashCanonicalValue(stiffnessStateProjection(candidate));
}

export function computeSemanticHash(candidate) {
  return hashCanonicalValue(semanticProjection(candidate));
}

export function computeEvidenceHash(candidate) {
  return hashCanonicalValue(evidenceProjection(candidate));
}

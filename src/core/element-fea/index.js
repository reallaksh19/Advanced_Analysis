export {
  BACKEND_ID, CONTINUUM_MODEL_SCHEMA, CONTINUUM_RESULT_SCHEMA, CONTINUUM_RESULT_SCHEMA_V2, CONTINUUM_RESULT_SCHEMA_V3,
  DOF_ORDER, EDGE_LOAD_TYPES, ELEMENT_TYPE, ELEMENT_TYPES, FORMULATIONS, JACOBI_PRECONDITIONER_ID,
  LFEA_PROFILE_SCHEMA, LFEA_PROFILE_SCHEMA_V2, LINEAR_BACKENDS, PRESSURE_CONVENTION, Q4_INTEGRATION_RULE,
  Q4_NODE_ORDER, Q4_STRESS_LOCATION, REACTION_CONVENTION, RESULT_STATUS, SPARSE_STORAGE_ID, STRAIN_ORDER, STRESS_ORDER,
} from './constants.js';
export { constitutiveMatrix, planeStrainMatrix, planeStressMatrix, principalStress, recoverSigmaZ, vonMisesStress } from './constitutive.js';
export { createDofMap, elementEquationIndices, equationLookup } from './dof-map.js';
export { createElementOperator, equivalentElementEdgeLoad, recoverElementResult } from './element-dispatch.js';
export { assertNoCoincidentNodes, assertNoHangingNodes, assertNoImproperEdgeIntersections, elementEdges, qualifyQ4Geometry } from './element-quality.js';
export { EDGE_GAUSS_POINTS, Q4_EDGE_DESCRIPTORS, Q4_GAUSS_POINTS, Q4_NATURAL_CORNERS, q4IntegrationRuleEvidence } from './integration-points.js';
export { solveDenseLdlt } from './linear-backend.js';
export { solveLinearSystem } from './linear-backend-dispatch.js';
export { createContinuumModel, qualifyContinuumModel } from './model.js';
export { createLfeaProfile, profileLinearBackend, validateLfeaProfile } from './profile.js';
export { createQ4Operator, equivalentQ4EdgeLoad, recoverQ4Result } from './q4-element.js';
export { createQ4IntegrationGeometry, createQ4PointGeometry, determinant2, inverse2, q4GlobalCoordinates, q4GlobalDerivatives, q4Jacobian, q4NaturalDerivatives, q4ShapeFunctions, q4StrainDisplacementMatrix } from './q4-geometry.js';
export { validateContinuumResult } from './result.js';
export { solveContinuumModel } from './solver.js';
export { assembleSparseContinuumSystem } from './sparse-assembly.js';
export { CSR_STORAGE_ID, buildCsrMatrix, createCsrFromRows, csrDiagonal, csrMultiply, estimateCsrStorageBytes } from './sparse-csr.js';
export { multiplySparseSystem, partitionSparseSystem } from './sparse-partition.js';
export { JACOBI_PRECONDITIONER_ID as PCG_JACOBI_ID, SPARSE_BACKEND_ID, SUCCESS_TERMINATION, solveSparsePcg } from './sparse-pcg.js';
export { equivalentEdgeLoad, createT3Operator, recoverT3Result } from './t3-element.js';
export { createT3Geometry, outwardEdgeNormal, signedArea, strainDisplacementMatrix } from './t3-geometry.js';
export {
  CONVERGENCE_RESULT_SCHEMA, CONVERGENCE_STUDY_SCHEMA, POINT_QUANTITIES,
  Q4_EXTRAPOLATION_MATRIX_ID, RAW_STRESS_COMPONENTS, REVIEW_PROJECTION_STATUS,
  SCALAR_CLASSIFICATIONS, STRESS_PROJECTION_SCHEMA, STRESS_TRENDS,
} from './interpretation-constants.js';
export { createConvergenceStudy, quantityHistory } from './convergence-study.js';
export { deriveRegionMeshMetrics, elementPhysicalArea, refinementRatios } from './mesh-metrics.js';
export { recoverPointProbe, verifyProbeMapping } from './physical-probes.js';
export { interpretConvergenceStudy, validateConvergenceResult } from './interpretation-result.js';
export { classifyScalarSequence, scalarConvergenceEvidence, stressTrendEvidence } from './stress-trend.js';
export { createStressProjection, Q4_GAUSS_TO_CORNER_MATRIX, validateStressProjection } from './stress-projection.js';

export {
  CONSTRAINT_COMPONENT_TYPES, EDGE_CLASSIFICATIONS, LOCAL_EDGE_IDS, MAPPING_STATUS,
  MESH_ADAPTER_PROFILE_SCHEMA, MESH_ADAPTER_RESULT_SCHEMA, MESH_ADAPTER_STATUS,
  MESH_COORDINATE_SYSTEM, MESH_PACKAGE_SCHEMA, MESH_PACKAGE_UNITS, SELECTOR_TYPES,
} from './mesh-package-constants.js';
export { createMeshAdapterProfile, createMeshPackage, validateMeshAdapterProfile, validateMeshPackage } from './mesh-package-contract.js';
export { buildMeshPackageTopology } from './mesh-package-topology.js';
export { resolveMeshPackageEntities } from './mesh-package-entities.js';
export { resolveMeshPackageAssignments } from './mesh-package-assignments.js';
export { adaptMeshPackage } from './mesh-package-adapter.js';
export { createAcceptedMeshAdapterResult, createRejectedMeshAdapterResult, validateMeshAdapterResult } from './mesh-package-result.js';
export {
  DIAGNOSTIC_SEVERITIES, ENGINEERING_REVIEW_SCHEMA, EVIDENCE_EXPORT_SCHEMA, EXPORT_STATUS,
  PROJECTED_STRESS_AUTHORITY, QUALIFICATION_ROW_STATUSES, RAW_STRESS_AUTHORITY,
  REVIEW_INPUT_SCHEMA, REVIEW_PROFILE_SCHEMA, REVIEW_STATUSES, SCALED_GEOMETRY_AUTHORITY,
  createReviewInput, createReviewProfile, validateReviewInput, validateReviewProfile,
} from './review-contract.js';
export { qualifyReviewEvidence, ReviewQualificationError, sourceArtifactHashes, sourceArtifactIdentities } from './review-qualification.js';
export { createGeometryReview } from './review-geometry.js';
export { createResultReviews, createRawStressReview, createProjectedStressReview, createConvergenceReview } from './review-results.js';
export { createEngineeringReview } from './review-model.js';
export { createCsv, createReviewCsvFiles, validateCsv } from './review-csv.js';
export { createReviewMarkdown } from './review-markdown.js';
export { createEvidenceExport, validateEvidenceExport } from './review-export.js';
export { createQualifiedReviewResult, createRejectedReviewResult, reviewSemanticHash, validateEngineeringReview } from './review-result.js';

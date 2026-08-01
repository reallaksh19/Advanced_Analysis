import {
  createTemplateBenchmarkManifest,
  asciiCompare,
} from '../contracts.js';
import { requireLafeaApplicationTemplate } from '../template-registry.js';
import {
  LAFEA_T5_QUALIFICATION_TEMPLATE_IDS,
  listT5CompilerReferenceCases,
} from '../benchmark-fixtures/t5-controlled-reference.js';

const BUCKET_MANIFEST_IDS = Object.freeze({
  ANALYTICAL_MECHANICS: 'BM-BUCKET-A-ANALYTICAL-V1',
  CONTINUUM_2D_FEA: 'BM-BUCKET-B-CONTINUUM-V1',
});

export const LAFEA_T5_TEMPLATE_BENCHMARK_MANIFESTS = Object.freeze(
  LAFEA_T5_QUALIFICATION_TEMPLATE_IDS.map(createCandidateManifest)
    .sort((left, right) => asciiCompare(left.benchmarkManifestId, right.benchmarkManifestId)),
);

export function requireT5TemplateBenchmarkManifest(templateId) {
  const result = LAFEA_T5_TEMPLATE_BENCHMARK_MANIFESTS
    .find((manifest) => manifest.templateId === templateId);
  if (!result) throw new TypeError(`Unknown T5 template benchmark manifest: ${templateId}.`);
  return result;
}

function createCandidateManifest(templateId) {
  const template = requireLafeaApplicationTemplate(templateId);
  const compilerCases = listT5CompilerReferenceCases(templateId).map((reference) => ({
    benchmarkId: reference.benchmarkId,
    category: reference.category,
    evidenceBasis: reference.evidenceBasis,
    expectedResultHash: reference.expectedResultHash,
    sourceRef: {
      datasetSchema: reference.schema,
      datasetPath: `benchmark-fixtures/t5-controlled-reference.js#${reference.benchmarkId}`,
      independenceRule: reference.independenceRule,
    },
    toleranceProfileId: reference.toleranceProfileId,
    status: 'NOT_RUN',
  }));
  const goldenCase = {
    benchmarkId: `${templateId}-GOLDEN-E2E-01`,
    category: template.bucketId === 'CONTINUUM_2D_FEA' ? 'MESH_REQUEST' : 'STAGE_HANDOFF',
    evidenceBasis: 'UNRESOLVED',
    expectedResultHash: null,
    sourceRef: {
      document: 'LAFEA_Application_Template_and_Computational_Bucket_Architecture_Concept_Note',
      section: '12.3 End-to-end golden templates',
    },
    toleranceProfileId: null,
    status: 'BLOCKED',
  };
  return createTemplateBenchmarkManifest({
    benchmarkManifestId: template.benchmarkManifestId,
    templateId,
    bucketId: template.bucketId,
    revision: 2,
    parentRegistryHash: template.parentRegistryHash,
    bucketBenchmarkManifestId: BUCKET_MANIFEST_IDS[template.bucketId],
    benchmarks: [...compilerCases, goldenCase],
    qualificationStatus: 'NOT_QUALIFIED',
    limitations: [
      'Controlled reference projections are authored independently of the production compiler.',
      'Compiler cases remain NOT_RUN until exact-head execution retains actual result hashes.',
      'End-to-end engine mechanics, convergence and external-reference evidence remain BLOCKED.',
      'No template release, readiness or executable status is promoted by this manifest.',
    ],
  });
}

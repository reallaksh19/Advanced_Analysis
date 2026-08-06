import { requirePackageBasicShape } from './inputxml-linear-analysis-result-package-shape-basic.js';
import {
  requirePortableInputXmlAnalysisResultPackage,
} from './inputxml-linear-analysis-result-package-portability.js';
import { requireComputedPackageCustody } from './inputxml-linear-analysis-result-package-derived-custody.js';
import { requirePackageContext } from './inputxml-linear-analysis-result-package-context.js';
import { requirePackageCases } from './inputxml-linear-analysis-result-package-cases.js';
import {
  requirePackageEvaluation,
  requirePackageManifest,
} from './inputxml-linear-analysis-result-package-evaluation.js';

export function requireInputXmlAnalysisResultPackageDraft(value, keys) {
  requirePackageBasicShape(value, keys);
  const { health, solve, preflight } = requirePackageContext(value);
  const { derived } = requirePackageCases(value, solve, preflight);
  requirePackageEvaluation(value, solve, preflight, derived);
  requirePackageManifest(value.evidenceManifest, value, health, solve, preflight);
  requireComputedPackageCustody(value);
  requirePortableInputXmlAnalysisResultPackage(value);
}

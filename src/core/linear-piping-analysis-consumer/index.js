export * from './governed-index.js';

// Keep the public authority names visible in this entrypoint for the existing
// anti-drift gate while the full governed surface remains grouped above.
export {
  LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_V2_SCHEMA,
  compileLinearPipingInputXmlAnalysisContext,
  compileLinearPipingSourceAnalysisContext,
  normalizeLinearPipingInputXmlGeometry,
  runLinearPipingAnalysisFromSourceAuthorities,
  sealLinearPipingInputXmlUnitProfile,
} from './governed-index.js';

export { parseGovernedInputXmlSourceBundle } from './inputxml-source-binding.js';

export {
  diagnoseInputXmlModelHealthProximity,
  diagnoseInputXmlModelHealthTopology,
} from './inputxml-model-health.js';

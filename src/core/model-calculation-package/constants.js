export const MODEL_CALCULATION_PACKAGE_SCHEMA = 'model-calculation-package/v1';
export const MODEL_CALCULATION_LEDGER_SCHEMA = 'model-calculation-ledger/v1';
export const MODEL_CALCULATION_LEDGER_ENTRY_SCHEMA = 'model-calculation-ledger-entry/v1';
export const MODEL_CALCULATION_REPORT_SCHEMA = 'model-calculation-report/v1';
export const MODEL_CALCULATION_EXPORT_ARTIFACT_SCHEMA = 'model-calculation-export-artifact/v1';
export const PACKAGE_MODES = Object.freeze({
  SCREENING: 'TRIBUTARY_SCREENING_ONLY',
  BEAM: 'VERTICAL_BEAM_ONLY',
  COMBINED: 'SCREENING_AND_VERTICAL_BEAM',
});
export const EXPORT_FORMATS = Object.freeze({ JSON: 'JSON', CSV: 'CSV', MARKDOWN: 'MARKDOWN' });
export const ENGINEERING_LEVELS = Object.freeze({
  SCREENING: 'BENCHMARKED_SCREENING',
  BEAM: 'LINEAR_ELASTIC_VERTICAL_BEAM',
});
export const PACKAGE_LIMITATIONS = Object.freeze([
  'No 3D piping flexibility.',
  'No thermal expansion analysis.',
  'No pressure-stress analysis.',
  'No spring or gap nonlinearities.',
  'No horizontal restraint-force analysis.',
  'No code-stress qualification.',
  'No nozzle-load qualification.',
  'Not a full pipe-stress or code-compliance calculation package.',
]);
export const MAX_LEDGER_ENTRIES = 100;

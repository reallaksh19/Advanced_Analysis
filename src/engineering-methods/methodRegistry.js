/**
 * Engineering method registry
 *
 * This module defines a registry of screening‑level engineering methods
 * supported by the simplified analysis application.  Each entry describes
 * the method, its domain, associated formulas, required inputs, units,
 * limitations, and benchmark case IDs.  Solver modules should reference
 * method identifiers rather than free‑form strings to ensure
 * consistency across the application.
 */

export const METHOD_REGISTRY = {
  GC_BASIC_12EI: {
    methodId: 'GC_BASIC_12EI',
    title: 'Guided cantilever (12EI/L³)',
    discipline: 'mechanical-piping',
    qualificationLevel: 'SCREENING',
    applicableModules: ['3d-guided-cantilever'],
    formulaIds: ['GUIDED_CANTILEVER_F_12EID_OVER_L3'],
    requiredInputs: [],
    requiredUnits: {},
    limitations: [],
    benchmarkCaseIds: ['2D-GC-001']
  },
  GC_ANCHOR_GUIDE_3EI: {
    methodId: 'GC_ANCHOR_GUIDE_3EI',
    title: 'Anchor‑guide cantilever (3EI/L³)',
    discipline: 'mechanical-piping',
    qualificationLevel: 'SCREENING',
    applicableModules: ['3d-guided-cantilever'],
    formulaIds: ['GUIDED_CANTILEVER_F_3EID_OVER_L3'],
    requiredInputs: [],
    requiredUnits: {},
    limitations: [],
    benchmarkCaseIds: []
  },
  SIMPLE_SPAN_DISTRIBUTED: {
    methodId: 'SIMPLE_SPAN_DISTRIBUTED',
    title: 'Simple span with uniformly distributed load',
    discipline: 'mechanical-piping',
    qualificationLevel: 'SCREENING',
    applicableModules: ['2d-simplified-stress-check'],
    formulaIds: ['SIMPLE_SPAN_UDL_M_WL2_8', 'SIMPLE_SPAN_UDL_DELTA_5WL4_384EI'],
    requiredInputs: [],
    requiredUnits: {},
    limitations: [],
    benchmarkCaseIds: ['2D-UDL-001']
  },
  SIMPLE_SPAN_CONCENTRATED: {
    methodId: 'SIMPLE_SPAN_CONCENTRATED',
    title: 'Simple span with concentrated load',
    discipline: 'mechanical-piping',
    qualificationLevel: 'SCREENING',
    applicableModules: ['2d-simplified-stress-check'],
    formulaIds: ['SIMPLE_SPAN_POINT_M_PAB_OVER_L'],
    requiredInputs: [],
    requiredUnits: {},
    limitations: [],
    benchmarkCaseIds: ['2D-POINT-001']
  },
  CANTILEVER_END_LOAD: {
    methodId: 'CANTILEVER_END_LOAD',
    title: 'Cantilever with end load',
    discipline: 'mechanical-piping',
    qualificationLevel: 'SCREENING',
    applicableModules: ['2d-math', '2d-simplified-stress-check'],
    formulaIds: ['CANTILEVER_M_PL', 'CANTILEVER_STRESS_M_OVER_Z', 'CANTILEVER_DELTA_PL3_3EI'],
    requiredInputs: [],
    requiredUnits: {},
    limitations: [],
    benchmarkCaseIds: ['2D-CANT-001']
  },
  PIPERACK_LOOP_ORDER: {
    methodId: 'PIPERACK_LOOP_ORDER',
    title: 'Pipe rack loop ordering',
    discipline: 'mechanical-piping',
    qualificationLevel: 'SCREENING',
    applicableModules: ['piperack-expansion-loop'],
    formulaIds: ['PIPERACK_LOOP_REQUIRED_LEG'],
    requiredInputs: ['lines', 'anchorDistanceFt', 'allowableStressPsi'],
    requiredUnits: { anchorDistanceFt: 'ft', allowableStressPsi: 'psi' },
    limitations: ['Screening loop order only; not final stress qualification.'],
    benchmarkCaseIds: ['PR-LOOP-001', 'PR-LOOP-001-L10', 'PR-LOOP-001-L8', 'PR-LOOP-001-L4', 'PR-BUNDLE-001', 'PR-MISSING-DATA-001']
  },
  PIPERACK_LINE_SPACING: {
    methodId: 'PIPERACK_LINE_SPACING',
    title: 'Pipe rack line spacing',
    discipline: 'mechanical-piping',
    qualificationLevel: 'SCREENING',
    applicableModules: ['piperack-expansion-loop'],
    formulaIds: ['PIPERACK_LINE_SPACING_CLEARANCE'],
    requiredInputs: ['lines', 'rackSpacingMargin'],
    requiredUnits: { rackSpacingMargin: 'mm' },
    limitations: ['Screening spacing only; must be checked against project rack standard.'],
    benchmarkCaseIds: []
  },
  MIST_NOZZLE_SCREENING: {
    methodId: 'MIST_NOZZLE_SCREENING',
    title: 'MIST/nozzle screening',
    discipline: 'mechanical-piping',
    qualificationLevel: 'SCREENING',
    applicableModules: ['calc-extended', 'piperack-expansion-loop'],
    formulaIds: ['MIST_VENDOR_LOAD_SCREENING'],
    requiredInputs: ['vendorLoads', 'nozzleAllowables'],
    requiredUnits: {},
    limitations: ['Nozzle loads require project/vendor qualified allowables; placeholders are not qualified.'],
    benchmarkCaseIds: ['PR-MIST-001', 'PR-MIST-FAIL-001', 'EXT-MIST-001']
  },
  KOVES_FLANGE_SCREENING: {
    methodId: 'KOVES_FLANGE_SCREENING',
    title: 'Koves flange screening',
    discipline: 'mechanical-piping',
    qualificationLevel: 'SCREENING',
    applicableModules: ['calc-extended'],
    formulaIds: ['KOVES_EQUIVALENT_LOAD'],
    requiredInputs: [],
    requiredUnits: {},
    limitations: [],
    benchmarkCaseIds: ['EXT-FLANG-001']
  },

  PIPE_DATA_LOOKUP: {
    methodId: 'PIPE_DATA_LOOKUP',
    title: 'Pipe property database lookup',
    discipline: 'mechanical-piping',
    qualificationLevel: 'DATA_INTERFACE',
    applicableModules: ['engineering-data'],
    formulaIds: ['PIPE_SECTION_I_HOLLOW_CIRCLE', 'PIPE_SECTION_Z_I_OVER_C'],
    requiredInputs: ['nps', 'schedule'],
    requiredUnits: { length: 'in' },
    limitations: ['Data table lookup; not a stress calculation.'],
    benchmarkCaseIds: ['PR-PIPE-DATA-EXISTS-001', 'PR-PIPE-DATA-MISSING-001']
  },
  MATERIAL_DATA_LOOKUP: {
    methodId: 'MATERIAL_DATA_LOOKUP',
    title: 'Material property database lookup',
    discipline: 'mechanical-piping',
    qualificationLevel: 'DATA_INTERFACE',
    applicableModules: ['engineering-data'],
    formulaIds: ['MATERIAL_PROPERTY_LOOKUP'],
    requiredInputs: ['materialId', 'temperature_F'],
    requiredUnits: { temperature: 'F' },
    limitations: ['Linear table lookup only; source data must be project verified before final engineering use.'],
    benchmarkCaseIds: ['EXT-MATERIAL-DATA-EXISTS-001', 'EXT-MATERIAL-DATA-MISSING-001', 'EXT-MATERIAL-TEMP-RANGE-001']
  },
  UI_MOCK_CATALOG_PROOF: {
    methodId: 'UI_MOCK_CATALOG_PROOF',
    title: 'Benchmark mock card proof',
    discipline: 'mechanical-piping',
    qualificationLevel: 'SYSTEM',
    applicableModules: ['ui-proof'],
    formulaIds: ['UI_MOCK_CATALOG_COMPLETENESS'],
    requiredInputs: [],
    requiredUnits: {},
    limitations: ['UI proof checks static catalog metadata, not browser rendering.'],
    benchmarkCaseIds: ['UI-MOCK-CARDS-001', 'UI-MOCK-LOAD-001']
  },
  REPORT_DETERMINISTIC_JSON: {
    methodId: 'REPORT_DETERMINISTIC_JSON',
    title: 'Deterministic JSON report generation',
    discipline: 'mechanical-piping',
    qualificationLevel: 'SCREENING',
    applicableModules: ['reporting'],
    formulaIds: ['REPORT_JSON_STABLE_HASH'],
    requiredInputs: ['reportPayload'],
    requiredUnits: {},
    limitations: ['Timestamp is excluded from deterministic hash.'],
    benchmarkCaseIds: ['RPT-001']
  },
  REPORT_MARKDOWN_CALC_SHEET: {
    methodId: 'REPORT_MARKDOWN_CALC_SHEET',
    title: 'Markdown calculation sheet generation',
    discipline: 'mechanical-piping',
    qualificationLevel: 'SCREENING',
    applicableModules: ['reporting'],
    formulaIds: ['REPORT_MARKDOWN_CALC_SHEET'],
    requiredInputs: ['reportPayload'],
    requiredUnits: {},
    limitations: ['Markdown report is a calculation sheet, not a formal signed engineering report.'],
    benchmarkCaseIds: ['RPT-002', 'RPT-003', 'RPT-MISSING-PIPE-DATA-001', 'RPT-NOT-QUALIFIED-VENDOR-LOAD-001', 'RPT-SCREENING-ONLY-001', 'RPT-FAILED-001']
  }
};

/**
 * Returns a method definition by identifier.  Returns null if not found.
 *
 * @param {string} methodId
 */
export function getMethod(methodId) {
  return METHOD_REGISTRY[methodId] || null;
}
/**
 * Structured lookup used by QA and solvers when an unknown method must be
 * reported without throwing.
 */
export function lookupMethod(methodId) {
  const method = getMethod(methodId);
  if (method) return { ok: true, method, diagnostics: [] };
  return {
    ok: false,
    method: null,
    diagnostics: [
      {
        code: 'UNKNOWN_METHOD_ID',
        severity: 'ERROR',
        message: `Unknown engineering methodId: ${methodId}`
      }
    ]
  };
}

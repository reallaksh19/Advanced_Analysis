/**
 * Formula trace definitions used by solver, benchmark, and report layers.
 */
export const FORMULA_TRACE = {
  CANTILEVER_M_PL: {
    id: 'CANTILEVER_M_PL',
    expression: 'M = P * L',
    inputs: { P: 'force', L: 'length' },
    output: { M: 'moment' },
    limitations: []
  },
  CANTILEVER_STRESS_M_OVER_Z: {
    id: 'CANTILEVER_STRESS_M_OVER_Z',
    expression: 'σ = M / Z',
    inputs: { M: 'moment', Z: 'section modulus' },
    output: { σ: 'stress' },
    limitations: []
  },
  CANTILEVER_DELTA_PL3_3EI: {
    id: 'CANTILEVER_DELTA_PL3_3EI',
    expression: 'δ = (P * L³) / (3 * E * I)',
    inputs: { P: 'force', L: 'length', E: 'modulus', I: 'moment of inertia' },
    output: { δ: 'deflection' },
    limitations: []
  },
  SIMPLE_SPAN_UDL_M_WL2_8: {
    id: 'SIMPLE_SPAN_UDL_M_WL2_8',
    expression: 'M = (w * L²) / 8',
    inputs: { w: 'force/length', L: 'length' },
    output: { M: 'moment' },
    limitations: []
  },
  SIMPLE_SPAN_UDL_DELTA_5WL4_384EI: {
    id: 'SIMPLE_SPAN_UDL_DELTA_5WL4_384EI',
    expression: 'δ = (5 * w * L⁴) / (384 * E * I)',
    inputs: { w: 'force/length', L: 'length', E: 'modulus', I: 'moment of inertia' },
    output: { δ: 'deflection' },
    limitations: []
  },
  SIMPLE_SPAN_POINT_M_PAB_OVER_L: {
    id: 'SIMPLE_SPAN_POINT_M_PAB_OVER_L',
    expression: 'M = (P * a * b) / L',
    inputs: { P: 'force', a: 'length', b: 'length', L: 'length' },
    output: { M: 'moment' },
    limitations: []
  },
  GUIDED_CANTILEVER_F_12EID_OVER_L3: {
    id: 'GUIDED_CANTILEVER_F_12EID_OVER_L3',
    expression: 'F = (12 * E * I * δ) / L³',
    inputs: { E: 'modulus', I: 'moment of inertia', δ: 'deflection', L: 'length' },
    output: { F: 'force' },
    limitations: ['Fixed-guided/guided-cantilever screening coefficient.']
  },
  GUIDED_CANTILEVER_F_3EID_OVER_L3: {
    id: 'GUIDED_CANTILEVER_F_3EID_OVER_L3',
    expression: 'F = (3 * E * I * δ) / L³',
    inputs: { E: 'modulus', I: 'moment of inertia', δ: 'deflection', L: 'length' },
    output: { F: 'force' },
    limitations: ['Fixed-free equivalent screening coefficient; not interchangeable with 12EI method.']
  },
  GUIDED_CANTILEVER_M_FL_OVER_2: {
    id: 'GUIDED_CANTILEVER_M_FL_OVER_2',
    expression: 'M = (F * L) / 2',
    inputs: { F: 'force', L: 'length' },
    output: { M: 'moment' },
    limitations: []
  },
  PIPE_SECTION_I_HOLLOW_CIRCLE: {
    id: 'PIPE_SECTION_I_HOLLOW_CIRCLE',
    expression: 'I = (π/64) * (D⁴ - d⁴)',
    inputs: { D: 'outside diameter', d: 'inside diameter' },
    output: { I: 'moment of inertia' },
    limitations: []
  },
  PIPE_SECTION_Z_I_OVER_C: {
    id: 'PIPE_SECTION_Z_I_OVER_C',
    expression: 'Z = I / c',
    inputs: { I: 'moment of inertia', c: 'distance to extreme fibre' },
    output: { Z: 'section modulus' },
    limitations: []
  },
  THERMAL_EXPANSION_ALPHA_L_DT: {
    id: 'THERMAL_EXPANSION_ALPHA_L_DT',
    expression: 'δ = α * L * ΔT',
    inputs: { α: 'thermal expansion coefficient', L: 'length', ΔT: 'temperature change' },
    output: { δ: 'deflection' },
    limitations: []
  },
  PIPERACK_LOOP_REQUIRED_LEG: {
    id: 'PIPERACK_LOOP_REQUIRED_LEG',
    expression: 'L_req = sqrt(3 * E * OD * δ / (144 * S_allow))',
    inputs: { E: 'modulus', OD: 'outside diameter', δ: 'thermal expansion', S_allow: 'allowable stress' },
    output: { L_req: 'length' },
    limitations: ['Simplified rack loop screening formula.']
  },
  PIPERACK_LINE_SPACING_CLEARANCE: {
    id: 'PIPERACK_LINE_SPACING_CLEARANCE',
    expression: 'S = physical gap + flange allowance + thermal bowing + standard guide gap',
    inputs: { physicalGap: 'length', flangeAllowance: 'length', bowing: 'length', standardGap: 'length' },
    output: { S: 'length' },
    limitations: ['Screening rack spacing formula; project standard governs final spacing.']
  },
  KOVES_EQUIVALENT_LOAD: {
    id: 'KOVES_EQUIVALENT_LOAD',
    expression: 'P_eq = f(P, M)',
    inputs: { P: 'pressure or load', M: 'moment' },
    output: { P_eq: 'equivalent load' },
    limitations: ['Screening method; flange specialist check may be required.']
  },
  MIST_VENDOR_LOAD_SCREENING: {
    id: 'MIST_VENDOR_LOAD_SCREENING',
    expression: 'Compare nozzle loads against vendor allowable',
    inputs: { vendorLoads: 'load set', allowables: 'allowable set' },
    output: { interactionRatio: 'ratio' },
    limitations: ['Requires verified vendor loads and allowables.']
  },
  MATERIAL_PROPERTY_LOOKUP: {
    id: 'MATERIAL_PROPERTY_LOOKUP',
    expression: 'Select verified material property row for materialId and temperature range',
    inputs: { materialId: 'identifier', temperature_F: 'temperature' },
    output: { E_psi: 'stress', alpha_in_in_F: 'thermal expansion coefficient' },
    limitations: ['Lookup is only as valid as the source table revision.']
  },
  UI_MOCK_CATALOG_COMPLETENESS: {
    id: 'UI_MOCK_CATALOG_COMPLETENESS',
    expression: 'Count missing icon, fixture, methodId, and loadTarget fields in mock catalog',
    inputs: { mockCatalog: 'metadata list' },
    output: { missingCounts: 'integer checks' },
    limitations: ['Static metadata proof; browser rendering requires e2e testing.']
  },
  REPORT_STATUS_HEADLINE: {
    id: 'REPORT_STATUS_HEADLINE',
    expression: 'Report headline reflects worst engineering status',
    inputs: { status: 'result status', diagnostics: 'diagnostic list' },
    output: { headline: 'report status heading' },
    limitations: ['Text proof benchmark for report semantics.']
  },
  REPORT_JSON_STABLE_HASH: {
    id: 'REPORT_JSON_STABLE_HASH',
    expression: 'stableHash = hash(canonical_json(report without timestamp))',
    inputs: { report: 'object' },
    output: { stableHash: 'string' },
    limitations: ['Hash is deterministic only for canonicalized JSON payload.']
  },
  REPORT_MARKDOWN_CALC_SHEET: {
    id: 'REPORT_MARKDOWN_CALC_SHEET',
    expression: 'markdown = render(header + status + inputs + method + formulas + results + diagnostics)',
    inputs: { report: 'object' },
    output: { markdown: 'string' },
    limitations: ['Markdown output must be reviewed before issue.']
  }
};

for (const trace of Object.values(FORMULA_TRACE)) {
  trace.inputUnits = trace.inputUnits || trace.inputs || {};
  trace.outputUnits = trace.outputUnits || trace.output || {};
  trace.limitations = trace.limitations || [];
}

export function getFormula(id) {
  return FORMULA_TRACE[id] || null;
}

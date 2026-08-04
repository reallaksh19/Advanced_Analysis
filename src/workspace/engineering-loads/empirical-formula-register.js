import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { freezeDeep } from '../dataset-utils.js';

export const EMPIRICAL_FORMULA_REGISTER_SCHEMA = 'empirical-formula-register/v1';
export const EMPIRICAL_FORMULA_METHOD = 'CHAINAGE_TRIBUTARY_SPAN_V2';

const REQUIRED_TERM_IDS = Object.freeze([
  'PIPE_INSIDE_DIAMETER',
  'PIPE_METAL_MASS',
  'INSULATION_MASS',
  'FLUID_MASS',
  'COMPONENT_MASS',
  'GRAVITY_FORCE',
  'POINT_REACTION_DISTRIBUTION',
  'UNIFORM_SEGMENT_EQUIVALENT',
  'REACTION_ACCUMULATION',
  'EQUILIBRIUM_CHECK',
]);

export function createEmpiricalFormulaRegister() {
  const draft = {
    schema: EMPIRICAL_FORMULA_REGISTER_SCHEMA,
    method: EMPIRICAL_FORMULA_METHOD,
    implementation: 'src/workspace/engineering-loads/support-load-distribution-v3.js',
    classification: 'EMPIRICAL_GRAVITY_SCREENING',
    sourceAxisBasis: 'Z_UP',
    verticalForceConvention: 'positive reaction opposes source-axis gravity',
    applicability: {
      included: [
        'source-backed pipe metal gravity',
        'source-backed insulation gravity',
        'EMPTY/OPE/HYD internal-fluid gravity',
        'governed concentrated component mass',
        'one-dimensional route-chainage distribution',
        'two-bracketing-support static allocation',
        'force and moment equilibrium audit',
      ],
      excluded: [
        'elastic pipe/support stiffness distribution',
        'thermal or imposed-displacement reaction',
        'friction',
        'gaps, line stops, guides and liftoff',
        'support steel or civil structural distribution',
        'dynamic, wind, seismic, surge, slug or relief loads',
        'code stress, LFEA, LAFEA or continuum FEA',
      ],
    },
    terms: [
      term({
        termId: 'PIPE_INSIDE_DIAMETER',
        concept: 'Derive the clear pipe bore from outside diameter and wall thickness.',
        equation: 'Di_mm = Do_mm - 2 * t_mm',
        outputUnit: 'mm',
        authorities: ['loadCalculation.pipeSectionProperties'],
        blockers: ['MISSING_PIPE_SECTION', 'INVALID_PIPE_SECTION', 'INVALID_PIPE_INSIDE_DIAMETER'],
        benchmarks: ['EMP-GRAVITY-SYMMETRIC-001'],
      }),
      term({
        termId: 'PIPE_METAL_MASS',
        concept: 'Uniform annular pipe-wall volume multiplied by approved material density.',
        equation: 'mMetal_kg = PI * (Do_mm^2 - Di_mm^2) / 4e6 * L_m * rhoMaterial_kg_m3',
        outputUnit: 'kg',
        authorities: [
          'loadCalculation.pipeSectionProperties',
          'loadCalculation.materialDensitiesKgPerM3',
          'route-partition-model/v1 edge length',
        ],
        blockers: ['MISSING_PIPE_SECTION', 'MISSING_MATERIAL_DENSITY', 'INVALID_PIPE_SECTION', 'INVALID_PIPE_INSIDE_DIAMETER'],
        benchmarks: ['EMP-GRAVITY-SYMMETRIC-001'],
      }),
      term({
        termId: 'INSULATION_MASS',
        concept: 'Uniform full-circumference insulation annulus over the pipe edge length.',
        equation: 'mIns_kg = PI * ((Do_mm + 2*tIns_mm)^2 - Do_mm^2) / 4e6 * L_m * rhoIns_kg_m3',
        outputUnit: 'kg',
        authorities: [
          'loadCalculation.pipeSectionProperties',
          'loadCalculation.insulationDensitiesKgPerM3',
          'route-partition-model/v1 edge length',
        ],
        blockers: ['MISSING_INSULATION_THICKNESS', 'MISSING_INSULATION_DENSITY'],
        benchmarks: ['EMP-GRAVITY-SYMMETRIC-001'],
      }),
      term({
        termId: 'FLUID_MASS',
        concept: 'Internal cylindrical volume multiplied by the load-case fluid density.',
        equation: 'mFluid_kg = PI * Di_mm^2 / 4e6 * L_m * rhoFluid_kg_m3',
        outputUnit: 'kg',
        authorities: [
          'loadCalculation.operatingFluidDensitiesKgPerM3',
          'loadCalculation.hydroFluidDensitiesKgPerM3',
          'loadCalculation.activeLoadCases',
        ],
        blockers: ['MISSING_FLUID_DENSITY'],
        benchmarks: ['EMP-GRAVITY-SYMMETRIC-001'],
      }),
      term({
        termId: 'COMPONENT_MASS',
        concept: 'Exact governed component mass selected by CATALOG_KEY or sourceEntityId.',
        equation: 'mComponent_kg = approvedComponentWeight_kg',
        outputUnit: 'kg',
        authorities: ['loadCalculation.componentWeightsKg', 'exact source identity'],
        blockers: ['MISSING_COMPONENT_MASS'],
        benchmarks: ['EMP-GRAVITY-SYMMETRIC-001', 'EMP-POINT-UNEQUAL-001'],
      }),
      term({
        termId: 'GRAVITY_FORCE',
        concept: 'Convert each qualified mass contribution to gravity force.',
        equation: 'P_N = mass_kg * gravity_m_s2 * loadFactor',
        outputUnit: 'N',
        authorities: ['loadCalculation.gravityMPerS2', 'loadCalculation.loadFactor'],
        blockers: ['EMPIRICAL_INPUT_NUMBER_INVALID'],
        benchmarks: ['EMP-GRAVITY-SYMMETRIC-001', 'EMP-POINT-UNEQUAL-001'],
      }),
      term({
        termId: 'POINT_REACTION_DISTRIBUTION',
        concept: 'Statically distribute a point force to the exact lower and upper bracketing supports.',
        equation: 'R1=P*(x2-x)/(x2-x1); R2=P*(x-x1)/(x2-x1)',
        outputUnit: 'N',
        authorities: ['route chainage', 'qualified vertical support chainages'],
        blockers: ['ROUTE_REQUIRES_TWO_QUALIFIED_VERTICAL_SUPPORTS', 'UNBRACKETED_ROUTE_LOAD', 'MISSING_ROUTE_CHAINAGE'],
        benchmarks: ['EMP-GRAVITY-SYMMETRIC-001', 'EMP-POINT-UNEQUAL-001', 'EMP-POINT-AT-SUPPORT-001'],
      }),
      term({
        termId: 'UNIFORM_SEGMENT_EQUIVALENT',
        concept: 'Split a uniformly loaded pipe interval at support chainages and replace each segment by its midpoint resultant.',
        equation: 'Ps=Ptotal*(b-a)/(upper-lower); xc=(a+b)/2',
        outputUnit: 'N at mm chainage',
        authorities: ['route entity chainages', 'qualified vertical support chainages'],
        blockers: ['UNBRACKETED_ROUTE_LOAD', 'MISSING_ROUTE_CHAINAGE'],
        benchmarks: ['EMP-GRAVITY-SYMMETRIC-001', 'EMP-UNIFORM-MULTISPAN-001'],
      }),
      term({
        termId: 'REACTION_ACCUMULATION',
        concept: 'Accumulate every qualified allocation by exact supportSiteId.',
        equation: 'Rsite_N = SUM(allocation_N for exact supportSiteId)',
        outputUnit: 'N',
        authorities: ['support-site-model/v1 exact siteId'],
        blockers: ['SUPPORT_LOAD_SITE_IDENTITY_MISMATCH'],
        benchmarks: ['EMP-GRAVITY-SYMMETRIC-001', 'EMP-UNIFORM-MULTISPAN-001'],
      }),
      term({
        termId: 'EQUILIBRIUM_CHECK',
        concept: 'Verify total force and route-chainage moment balance before publishing reactions.',
        equation: 'forceResidual=SUM(R)-SUM(P); momentResidual=SUM(R*x)-SUM(P*x)',
        outputUnit: 'N and N*mm',
        authorities: ['loadCalculation.equilibriumTolerances'],
        blockers: ['MISSING_EQUILIBRIUM_TOLERANCE', 'EQUILIBRIUM_CHECK_FAILED'],
        benchmarks: ['EMP-GRAVITY-SYMMETRIC-001', 'EMP-POINT-UNEQUAL-001', 'EMP-UNIFORM-MULTISPAN-001'],
      }),
    ],
    benchmarkCatalogue: 'benchmarks/empirical/empirical-gravity-benchmarks.json',
    validation: {
      formulaImplementation: 'QUALIFIED_FOR_REGISTERED_FIXTURES',
      realProjectAccuracy: 'NOT_QUANTIFIED',
      detailedAnalysisSubstitution: false,
    },
  };
  const register = freezeDeep({ ...draft, semanticHash: semanticHash(draft) });
  return requireEmpiricalFormulaRegister(register);
}

export function requireEmpiricalFormulaRegister(value) {
  if (!value || typeof value !== 'object') fail('EMPIRICAL_FORMULA_REGISTER_INVALID', 'Formula register must be an object.');
  if (value.schema !== EMPIRICAL_FORMULA_REGISTER_SCHEMA) fail('EMPIRICAL_FORMULA_REGISTER_SCHEMA_INVALID', 'Unexpected formula-register schema.');
  if (value.method !== EMPIRICAL_FORMULA_METHOD) fail('EMPIRICAL_FORMULA_REGISTER_METHOD_INVALID', 'Unexpected empirical method.');
  if (!Array.isArray(value.terms)) fail('EMPIRICAL_FORMULA_REGISTER_TERMS_INVALID', 'Formula terms must be an array.');
  const ids = value.terms.map((row) => row?.termId);
  if (new Set(ids).size !== ids.length) fail('EMPIRICAL_FORMULA_REGISTER_DUPLICATE_TERM', 'Formula term IDs must be unique.');
  if (JSON.stringify(ids) !== JSON.stringify(REQUIRED_TERM_IDS)) fail('EMPIRICAL_FORMULA_REGISTER_TERM_SET_INVALID', 'Formula term order or coverage is incomplete.');
  value.terms.forEach((row) => {
    if (!row || typeof row !== 'object'
      || typeof row.concept !== 'string' || row.concept.length === 0
      || typeof row.equation !== 'string' || row.equation.length === 0
      || typeof row.outputUnit !== 'string' || row.outputUnit.length === 0
      || !Array.isArray(row.authorities) || row.authorities.length === 0
      || !Array.isArray(row.blockers) || row.blockers.length === 0
      || !Array.isArray(row.benchmarks) || row.benchmarks.length === 0) {
      fail('EMPIRICAL_FORMULA_REGISTER_TERM_INVALID', `Formula term ${row?.termId || '<missing>'} is incomplete.`);
    }
  });
  const { semanticHash: suppliedHash, ...projection } = value;
  if (suppliedHash !== semanticHash(projection)) fail('EMPIRICAL_FORMULA_REGISTER_HASH_MISMATCH', 'Formula-register semantic hash mismatch.');
  return freezeDeep(value);
}

export const EMPIRICAL_FORMULA_REGISTER = createEmpiricalFormulaRegister();

function term(value) {
  return {
    status: 'IMPLEMENTED',
    ...value,
  };
}

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

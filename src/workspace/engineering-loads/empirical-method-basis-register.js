import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { freezeDeep } from '../dataset-utils.js';
import { EMPIRICAL_FORMULA_REGISTER } from './empirical-formula-register.js';
import { EMPIRICAL_METHOD_REGISTRY } from './empirical-method-registry.js';
import { EMPIRICAL_RESTRAINT_NETWORK_FORMULA_IDS } from './empirical-restraint-network-profile.js';
import { EMPIRICAL_COUPLED_RESTRAINT_NETWORK_FORMULA_IDS } from './empirical-coupled-restraint-network-profile.js';

export const EMPIRICAL_METHOD_BASIS_REGISTER_SCHEMA = 'empirical-method-basis-register/v1';

const BASIS_DRAFTS = Object.freeze([
  basis({
    methodId: 'CHAINAGE_TRIBUTARY_SPAN_V2',
    implementation: 'src/workspace/engineering-loads/support-load-distribution-v3.js',
    classification: 'EMPIRICAL_GRAVITY_SCREENING',
    governingBasis: [
      'annular pipe, insulation and fluid mass from governed dimensions and densities',
      'mass-to-force conversion P = m*g*LF',
      'one-dimensional route-chainage point and uniform-load statics',
      'force and route-chainage moment equilibrium',
    ],
    basisIds: EMPIRICAL_FORMULA_REGISTER.terms.map((row) => row.termId),
    authoritativeInputs: [
      'normalized workspace dataset identity',
      'Project Data loadCalculation authorities',
      'support-site-model/v1',
      'route-partition-model/v1',
      'current master-source hashes',
    ],
    applicability: {
      included: [
        'EMPTY/OPE/HYD gravity screening',
        'qualified vertical supports',
        'exact component mass lookup',
      ],
      excluded: [
        'elastic stiffness redistribution',
        'thermal or imposed-displacement reactions',
        'friction, gaps, guides, line stops and lift-off',
        'support-steel or civil structural distribution',
      ],
    },
    qualificationEvidence: [
      'benchmarks/empirical/empirical-gravity-benchmarks.json',
      'scripts/empirical-formula-register-check.mjs',
    ],
    benchmarkIds: [
      'EMP-GRAVITY-SYMMETRIC-001',
      'EMP-POINT-UNEQUAL-001',
      'EMP-POINT-AT-SUPPORT-001',
      'EMP-UNIFORM-MULTISPAN-001',
    ],
    sourceDocumentation: [
      'docs/empericalformulaconceptnote.md',
    ],
    compatibility: {
      legacyFormulaRegisterSemanticHash: EMPIRICAL_FORMULA_REGISTER.semanticHash,
    },
  }),
  basis({
    methodId: 'CHAINAGE_TRIBUTARY_SPAN_V3_COG',
    implementation: 'src/workspace/engineering-loads/support-load-distribution-v3.js',
    classification: 'EMPIRICAL_GRAVITY_SCREENING_COG_AWARE',
    governingBasis: [
      'all CHAINAGE_TRIBUTARY_SPAN_V2 mass, force and statics relations',
      'qualified on-route component CoG chainage replaces the V2 component midpoint application point',
      'off-route or ambiguous CoG and positive explicit point moments fail closed',
      'force and route-chainage moment equilibrium after CoG relocation',
    ],
    basisIds: [
      ...EMPIRICAL_FORMULA_REGISTER.terms.map((row) => row.termId),
      'QUALIFIED_COMPONENT_COG_APPLICATION_POINT',
    ],
    authoritativeInputs: [
      'all CHAINAGE_TRIBUTARY_SPAN_V2 authorities',
      'empirical component-load authority audit',
      'source-backed component CoG coordinates and units',
      'unique route membership and on-route projection',
    ],
    applicability: {
      included: [
        'V2 gravity domain',
        'qualified on-route component CoG sensitivity',
      ],
      excluded: [
        'off-route CoG converted into vertical reaction pairs',
        'ambiguous route projection',
        'unsupported explicit point-moment distribution',
        'structural moment transfer',
      ],
    },
    qualificationEvidence: [
      'scripts/empirical-cog-load-distribution-check.mjs',
      'scripts/authorized-empirical-method-execution-check.mjs',
      'docs/empericalformulaconceptnote.md',
    ],
    benchmarkIds: [],
    sourceDocumentation: [
      'docs/empericalformulaconceptnote.md',
    ],
  }),
  basis({
    methodId: 'EMPIRICAL_BEAM_CONTACT_V1',
    implementation: 'src/workspace/engineering-loads/empirical-beam-contact-runtime.js',
    classification: 'PLANAR_BEAM_CONTACT_SCREENING',
    governingBasis: [
      'resolved pipe section states and planar frame-member stiffness',
      'segmented planar elbow compilation',
      'weight and thermal initial-strain load assembly',
      'unilateral rest active-set contact solution',
      'member-action and internal-extrema recovery',
      'joint action balance and planar force/moment equilibrium',
    ],
    basisIds: [
      'resolveSectionStates',
      'compileEmpiricalMember',
      'compileSegmentedPlanarElbow',
      'assemblePlanarSystem',
      'solvePlanarRestContact',
      'recoverMemberActions',
      'evaluatePlanarEquilibrium',
    ],
    authoritativeInputs: [
      'shared-piping-model/v1',
      'piping-port-topology-graph/v1',
      'support-attachment-model/v1',
      'restraint-capability-model/v1',
      'model-load primitive set',
      'SJSON empirical adapter request',
      'qualified locked empirical beam/contact runtime profile',
      'explicit case configurations',
    ],
    applicability: {
      included: [
        'qualified planar UX/UY/RZ beam/contact domain',
        'planar vertical rest contact',
        'separate weight and thermal ownership by configured case',
      ],
      excluded: [
        'unqualified nonplanar response',
        'friction',
        'unsupported restraint directions or contact rules',
        'general 3D flexibility/code-stress substitution',
      ],
    },
    qualificationEvidence: [
      'scripts/empirical-beam-contact-runtime-check.mjs',
      'scripts/empirical-operating-reaction-check.mjs',
      'scripts/authorized-empirical-beam-contact-execution-check.mjs',
    ],
    benchmarkIds: [],
    sourceDocumentation: [
      'docs/LINE_STOP_EMPIRICAL_CONCEPT.md',
    ],
  }),
  basis({
    methodId: 'EMPIRICAL_RESTRAINT_NETWORK_V1',
    implementation: 'src/workspace/engineering-loads/empirical-restraint-network-runtime.js',
    classification: 'SCALAR_THERMAL_RESTRAINT_NETWORK_SCREENING',
    governingBasis: [
      'directional straight-member compliance',
      'projected free thermal movement',
      'global scalar compatibility/stiffness assembly',
      'restricted bilateral finite-gap active-set handling',
      'restraint reaction recovery and force closure',
    ],
    basisIds: Object.values(EMPIRICAL_RESTRAINT_NETWORK_FORMULA_IDS),
    authoritativeInputs: [
      'shared-piping-model/v1',
      'piping-port-topology-graph/v1',
      'support-attachment-model/v1',
      'restraint-capability-model/v1',
      'SJSON empirical adapter request',
      'qualified locked restraint-network profile',
      'explicit analysis direction and temperature case configuration',
    ],
    applicability: {
      included: [
        'one translational analysis direction',
        'terminal-anchor restricted network',
        'at most one finite gap and one finite stiffness in the qualified profile domain',
      ],
      excluded: [
        'friction',
        'branches',
        'closed loops',
        'independent per-restraint superposition',
        'unqualified topology or profile domain',
      ],
    },
    qualificationEvidence: [
      'scripts/empirical-restraint-network-check.mjs',
    ],
    benchmarkIds: [],
    sourceDocumentation: [
      'docs/LINE_STOP_EMPIRICAL_CONCEPT.md',
    ],
  }),
  basis({
    methodId: 'EMPIRICAL_RESTRAINT_NETWORK_V2',
    implementation: 'src/workspace/engineering-loads/empirical-coupled-restraint-network-runtime.js',
    classification: 'COUPLED_SCALAR_GRAPH_THERMAL_SCREENING',
    governingBasis: [
      'directional member compliance and projected free thermal movement',
      'single coupled scalar graph stiffness system',
      'shared branch-junction displacement compatibility',
      'closed-cycle compatibility in the same global system',
      'rigid restraint enforcement, reaction recovery and force closure',
    ],
    basisIds: Object.values(EMPIRICAL_COUPLED_RESTRAINT_NETWORK_FORMULA_IDS),
    authoritativeInputs: [
      'shared-piping-model/v1',
      'piping-port-topology-graph/v1',
      'support-attachment-model/v1',
      'restraint-capability-model/v1',
      'SJSON empirical adapter request',
      'qualified locked coupled restraint-network profile',
      'explicit analysis direction and temperature case configuration',
    ],
    applicability: {
      included: [
        'one translational direction on a coupled graph',
        'qualified branches and closed loops',
        'rigid anchor/restraint domain with two-port components',
      ],
      excluded: [
        'friction',
        'finite gaps',
        'finite support stiffness',
        'unqualified node degree or cycle count',
        'general 3D flexibility/code-stress substitution',
      ],
    },
    qualificationEvidence: [
      'scripts/empirical-coupled-restraint-network-check.mjs',
    ],
    benchmarkIds: [],
    sourceDocumentation: [
      'docs/LINE_STOP_EMPIRICAL_CONCEPT.md',
    ],
  }),
]);

export function createEmpiricalMethodBasisRegister() {
  const registrations = new Map(EMPIRICAL_METHOD_REGISTRY.methods.map((row) => [
    row.methodId,
    row,
  ]));
  const methods = BASIS_DRAFTS.map((draft) => {
    const registration = registrations.get(draft.methodId);
    if (!registration) {
      fail(
        'EMPIRICAL_METHOD_BASIS_REGISTRATION_MISSING',
        `Method ${draft.methodId} has basis evidence but is absent from the method registry.`,
      );
    }
    const payload = {
      ...structuredClone(draft),
      runtimeStatus: registration.runtimeStatus,
      qualificationStatus: registration.qualificationStatus,
      resultClasses: [...registration.resultClasses],
      qualifiedDofs: [...registration.qualifiedDofs],
    };
    return freezeDeep({
      ...payload,
      basisHash: semanticHash(payload),
    });
  });
  const draft = {
    schema: EMPIRICAL_METHOD_BASIS_REGISTER_SCHEMA,
    methods,
  };
  return requireEmpiricalMethodBasisRegister(freezeDeep({
    ...draft,
    semanticHash: semanticHash(draft),
  }));
}

export function requireEmpiricalMethodBasisRegister(value) {
  if (!value || typeof value !== 'object') {
    fail('EMPIRICAL_METHOD_BASIS_REGISTER_INVALID', 'Method-basis register must be an object.');
  }
  if (value.schema !== EMPIRICAL_METHOD_BASIS_REGISTER_SCHEMA) {
    fail('EMPIRICAL_METHOD_BASIS_REGISTER_SCHEMA_INVALID', 'Unexpected method-basis register schema.');
  }
  if (!Array.isArray(value.methods)) {
    fail('EMPIRICAL_METHOD_BASIS_REGISTER_METHODS_INVALID', 'Method-basis rows must be an array.');
  }

  const registeredIds = EMPIRICAL_METHOD_REGISTRY.methods
    .filter((row) => row.runtimeStatus === 'REGISTERED')
    .map((row) => row.methodId)
    .sort();
  const basisIds = value.methods.map((row) => row?.methodId).sort();
  if (JSON.stringify(basisIds) !== JSON.stringify(registeredIds)) {
    fail(
      'EMPIRICAL_METHOD_BASIS_COVERAGE_INCOMPLETE',
      'Every registered empirical method must have exactly one method-basis row.',
    );
  }

  value.methods.forEach((row) => {
    requireBasisRow(row);
    const { basisHash, ...payload } = row;
    if (basisHash !== semanticHash(payload)) {
      fail(
        'EMPIRICAL_METHOD_BASIS_HASH_MISMATCH',
        `Method-basis hash mismatch for ${row.methodId}.`,
      );
    }
  });

  const { semanticHash: suppliedHash, ...projection } = value;
  if (suppliedHash !== semanticHash(projection)) {
    fail(
      'EMPIRICAL_METHOD_BASIS_REGISTER_HASH_MISMATCH',
      'Method-basis register semantic hash mismatch.',
    );
  }
  return freezeDeep(value);
}

export const EMPIRICAL_METHOD_BASIS_REGISTER = createEmpiricalMethodBasisRegister();

function basis(value) {
  return freezeDeep({
    ...value,
    benchmarkIds: [...value.benchmarkIds],
    governingBasis: [...value.governingBasis],
    basisIds: [...value.basisIds],
    authoritativeInputs: [...value.authoritativeInputs],
    applicability: {
      included: [...value.applicability.included],
      excluded: [...value.applicability.excluded],
    },
    qualificationEvidence: [...value.qualificationEvidence],
    sourceDocumentation: [...value.sourceDocumentation],
  });
}

function requireBasisRow(row) {
  const arrays = [
    'governingBasis',
    'basisIds',
    'authoritativeInputs',
    'qualificationEvidence',
    'benchmarkIds',
    'sourceDocumentation',
    'resultClasses',
    'qualifiedDofs',
  ];
  if (!row || typeof row !== 'object'
    || typeof row.methodId !== 'string' || row.methodId.length === 0
    || typeof row.implementation !== 'string' || row.implementation.length === 0
    || typeof row.classification !== 'string' || row.classification.length === 0
    || typeof row.runtimeStatus !== 'string' || row.runtimeStatus.length === 0
    || typeof row.qualificationStatus !== 'string' || row.qualificationStatus.length === 0
    || !row.applicability || typeof row.applicability !== 'object'
    || !Array.isArray(row.applicability.included) || row.applicability.included.length === 0
    || !Array.isArray(row.applicability.excluded) || row.applicability.excluded.length === 0
    || arrays.some((key) => !Array.isArray(row[key]))
    || row.governingBasis.length === 0
    || row.basisIds.length === 0
    || row.authoritativeInputs.length === 0
    || row.qualificationEvidence.length === 0
    || row.sourceDocumentation.length === 0) {
    fail(
      'EMPIRICAL_METHOD_BASIS_ROW_INVALID',
      `Method-basis row ${row?.methodId || '<missing>'} is incomplete.`,
    );
  }
}

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

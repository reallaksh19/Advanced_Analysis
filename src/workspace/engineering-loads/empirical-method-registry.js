import { deepFreeze } from '../../core/shared-piping-model/index.js';

export const EMPIRICAL_METHOD_REGISTRY_SCHEMA = 'empirical-method-registry/v1';

const METHODS = Object.freeze([
  method({
    methodId: 'CHAINAGE_TRIBUTARY_SPAN_V2',
    purpose: 'BASIC_VERTICAL_DISTRIBUTION',
    runtimeStatus: 'REGISTERED',
    qualificationStatus: 'QUALIFIED_EXISTING',
    resultClasses: ['VERTICAL_SCREENING_RESULT'],
    qualifiedDofs: ['VERTICAL_SCALAR'],
  }),
  method({
    methodId: 'CHAINAGE_TRIBUTARY_SPAN_V3_COG',
    purpose: 'COG_AWARE_VERTICAL_DISTRIBUTION',
    runtimeStatus: 'REGISTERED',
    qualificationStatus: 'QUALIFIED_EXISTING',
    resultClasses: ['VERTICAL_SCREENING_RESULT'],
    qualifiedDofs: ['VERTICAL_SCALAR'],
  }),
  method({
    methodId: 'EMPIRICAL_BEAM_CONTACT_V1',
    purpose: 'PLANAR_VERTICAL_BEAM_CONTACT_ACTIONS',
    runtimeStatus: 'REGISTERED',
    qualificationStatus: 'QUALIFIED_RESTRICTED_DOMAIN',
    resultClasses: ['VERTICAL_SCREENING_RESULT'],
    qualifiedDofs: ['UX', 'UY', 'RZ'],
  }),
  method({
    methodId: 'EMPIRICAL_RESTRAINT_NETWORK_V1',
    purpose: 'GUIDE_LINE_STOP_THERMAL_SCREENING',
    runtimeStatus: 'NOT_REGISTERED',
    qualificationStatus: 'FUTURE_RESTRICTED_DOMAIN',
    resultClasses: ['THERMAL_LINE_STOP_SCREENING_RESULT'],
    qualifiedDofs: ['ONE_TRANSLATIONAL_DIRECTION_FUTURE'],
  }),
]);

export const EMPIRICAL_METHOD_REGISTRY = deepFreeze({
  schema: EMPIRICAL_METHOD_REGISTRY_SCHEMA,
  methods: METHODS,
});

export function getEmpiricalMethodRegistration(methodId) {
  return METHODS.find((row) => row.methodId === methodId) || null;
}

export function requireRegisteredEmpiricalMethod(methodId) {
  const registration = getEmpiricalMethodRegistration(methodId);
  if (!registration || registration.runtimeStatus !== 'REGISTERED') {
    const error = new Error(`Empirical method ${methodId} is not registered.`);
    error.code = 'EMPIRICAL_METHOD_NOT_REGISTERED';
    error.details = deepFreeze({ methodId, registration });
    throw error;
  }
  return registration;
}

function method(input) {
  return deepFreeze({
    methodId: input.methodId,
    purpose: input.purpose,
    runtimeStatus: input.runtimeStatus,
    qualificationStatus: input.qualificationStatus,
    resultClasses: [...input.resultClasses],
    qualifiedDofs: [...input.qualifiedDofs],
  });
}

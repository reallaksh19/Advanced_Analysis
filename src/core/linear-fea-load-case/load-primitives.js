import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { canonicalVector3, norm, requireOrthonormalBasis } from '../shared-analysis-contract/vector3.js';
import { FORCE_FIELDS, MOMENT_FIELDS } from '../attachment-load-contract/constants.js';
import { LINEAR_FEA_UNITS } from '../linear-fea-contract/units.js';
import { CONSTRAINT_DOFS } from '../linear-fea-contract/model-schema.js';
import {
  DISTRIBUTED_LOAD_BASES,
  DISTRIBUTED_LOAD_VARIATIONS,
  DISTRIBUTED_WEIGHT_COMPONENTS,
  EQUIVALENT_STATIC_CLASSES,
  GRAVITY_MASS_SOURCES,
  LOAD_BASIS_KINDS,
  LOAD_PRIMITIVE_KINDS,
  LOAD_PRIMITIVE_SCHEMA,
  LOAD_SIGN_CONVENTIONS,
  PRESSURE_BASES,
  PRESSURE_EFFECT_FLAGS,
  REPRESENTABLE_LOAD_SIGN_CONVENTION,
  UNIFORM_TEMPERATURE_THERMAL_STRAIN_PROFILE,
  compareAscii,
  fail,
  requireArray,
  requireBoolean,
  requireExactKeys,
  requireFinite,
  requireHash,
  requireIdentity,
  requireMember,
  requireNotCodeCategoryTag,
  requirePositive,
  requireRecord,
  requireSourceEvidence,
  requireSourceIdentity,
} from './load-case-contract.js';
import {
  requireBoundElement,
  requireBoundMaterialState,
  requireBoundNode,
  requirePrescribedSlot,
} from './load-case-model-reference.js';
import { requireDeclaredValue } from '../shared-analysis-contract/declared-value.js';

const PRIMITIVE_CODE = 'LOAD_CASE_PRIMITIVE_INVALID';

const COMMON_INPUT_KEYS = Object.freeze(['schema', 'primitiveId', 'kind', 'sourceEvidence']);

/**
 * Author-supplied shape of each primitive. `limitations` and `semanticHash` are
 * absent by construction: a disclosure this package derives may not be written
 * by the author, and an identity may not be asserted by the record it names.
 */
export const PRIMITIVE_INPUT_KEYS = Object.freeze({
  GRAVITY: Object.freeze([...COMMON_INPUT_KEYS, 'direction', 'basis', 'includedMassSources']),
  DISTRIBUTED_WEIGHT: Object.freeze([
    ...COMMON_INPUT_KEYS,
    'elementId',
    'weightComponent',
    'massPerUnitLength',
    'densityEvidence',
    'geometryEvidence',
  ]),
  PRESSURE: Object.freeze([
    ...COMMON_INPUT_KEYS,
    'elementId',
    'pressure',
    'pressureBasis',
    'authorizedEffects',
  ]),
  TEMPERATURE: Object.freeze([
    ...COMMON_INPUT_KEYS,
    'elementId',
    'operatingTemperature',
    'installationTemperature',
    'stiffnessEvaluationMaterialStateId',
    'thermalStrainProfileId',
  ]),
  NODAL_FORCE_MOMENT: Object.freeze([
    ...COMMON_INPUT_KEYS,
    'nodeId',
    'basis',
    'force',
    'moment',
    'units',
    'signConvention',
  ]),
  DISTRIBUTED_LOAD: Object.freeze([
    ...COMMON_INPUT_KEYS,
    'elementId',
    'basis',
    'variation',
    'startIntensity',
    'endIntensity',
    'units',
  ]),
  EQUIVALENT_STATIC: Object.freeze([
    ...COMMON_INPUT_KEYS,
    'elementId',
    'equivalentClass',
    'direction',
    'coefficient',
    'projectedArea',
    'geometryEvidence',
    'combinationClassId',
  ]),
  PRESCRIBED_MOVEMENT: Object.freeze([
    ...COMMON_INPUT_KEYS,
    'prescribedSlotId',
    'nodeId',
    'dof',
    'value',
  ]),
});

export const PRIMITIVE_RECORD_KEYS = Object.freeze(
  Object.fromEntries(
    LOAD_PRIMITIVE_KINDS.map((kind) => {
      const extra = kind === 'GRAVITY' ? ['accelerationMagnitude'] : [];
      return [kind, Object.freeze([...PRIMITIVE_INPUT_KEYS[kind], ...extra, 'limitations', 'semanticHash'])];
    }),
  ),
);

export const UNIFORM_TEMPERATURE_LIMITATION_CODE =
  'LOAD_CASE_LIMITATION_UNIFORM_TEMPERATURE_APPROXIMATION';
export const EQUIVALENT_STATIC_LIMITATION_CODE =
  'LOAD_CASE_LIMITATION_EQUIVALENT_STATIC_NO_DYNAMIC_AMPLIFICATION';
export const PRESSURE_EFFECT_LIMITATION_CODES = Object.freeze({
  codeStress: 'LOAD_CASE_LIMITATION_PRESSURE_EFFECT_CODE_STRESS',
  pressureStiffening: 'LOAD_CASE_LIMITATION_PRESSURE_EFFECT_PRESSURE_STIFFENING',
  axialThrust: 'LOAD_CASE_LIMITATION_PRESSURE_EFFECT_AXIAL_THRUST',
  bourdon: 'LOAD_CASE_LIMITATION_PRESSURE_EFFECT_BOURDON',
});

function limitation(code, disclosure, details = {}) {
  return {
    code,
    severity: 'WARNING',
    scope: 'LOAD_CASE',
    stiffnessRelevant: false,
    details: { disclosure, ...details },
  };
}

function byCode(left, right) {
  return compareAscii(left.code, right.code);
}

/**
 * Accept a declared direction as written. A direction that is not a unit vector
 * within the declared tolerance is rejected, never rescaled: renormalising here
 * would silently change the magnitude the author declared elsewhere.
 */
function requireUnitDirection(value, tolerance, field) {
  const vector = canonicalVector3(value, field);
  if (!(Math.abs(norm(vector) - 1) <= tolerance)) {
    fail(
      `${field} must be a unit direction within the declared directionUnitTolerance; it is never renormalised here.`,
      'LOAD_CASE_DIRECTION_NOT_UNIT',
    );
  }
  return { x: vector.x, y: vector.y, z: vector.z };
}

function requireComponents(value, fields, field) {
  requireExactKeys(value, fields, field, PRIMITIVE_CODE);
  const result = {};
  for (const key of fields) result[key] = requireFinite(value[key], `${field}.${key}`, PRIMITIVE_CODE);
  return result;
}

function requireUnitsSubset(value, fields, field) {
  requireExactKeys(value, fields, field, PRIMITIVE_CODE);
  for (const key of fields) {
    if (value[key] !== LINEAR_FEA_UNITS[key]) {
      fail(
        `${field}.${key} is ${String(value[key])}; the load-case contract works in ${LINEAR_FEA_UNITS[key]} and converts nothing.`,
        'LOAD_CASE_UNIT_MISMATCH',
      );
    }
  }
  return Object.fromEntries(fields.map((key) => [key, LINEAR_FEA_UNITS[key]]));
}

function requireLoadBasis(value, tolerance, field) {
  requireRecord(value, field, PRIMITIVE_CODE);
  requireMember(value.kind, LOAD_BASIS_KINDS, `${field}.kind`, PRIMITIVE_CODE);
  if (value.kind === 'GLOBAL') {
    requireExactKeys(value, ['kind'], field, PRIMITIVE_CODE);
    return { kind: 'GLOBAL' };
  }
  requireExactKeys(value, ['kind', 'e1', 'e2', 'e3'], field, PRIMITIVE_CODE);
  const basis = {
    e1: canonicalVector3(value.e1, `${field}.e1`),
    e2: canonicalVector3(value.e2, `${field}.e2`),
    e3: canonicalVector3(value.e3, `${field}.e3`),
  };
  requireOrthonormalBasis(basis, tolerance, field);
  return {
    kind: 'DECLARED_LOCAL',
    e1: { ...basis.e1 },
    e2: { ...basis.e2 },
    e3: { ...basis.e3 },
  };
}

/**
 * Seal one physical load primitive into an immutable, independently
 * hash-bound record (section 7.2).
 *
 * The primitive is validated, bound to entities the mechanical model actually
 * declares, and given the approximation disclosures its kind carries. Nothing
 * is converted into an equivalent nodal vector, an element thermal strain or a
 * stiffness contribution — every one of those is owned by the element
 * formulation package and would be a second numerical authority here.
 *
 * @param {object} input Author-supplied primitive — see `PRIMITIVE_INPUT_KEYS`.
 * @param {{profile:object, modelReference:object}} context Accepted profile and model reference.
 * @returns {Readonly<object>} `fea-linear-load-primitive/v1`.
 */
export function sealLoadPrimitive(input, context) {
  requireRecord(input, 'primitive', PRIMITIVE_CODE);
  const kind = requireMember(input.kind, LOAD_PRIMITIVE_KINDS, 'primitive.kind', PRIMITIVE_CODE);
  const field = `primitive[${String(input.primitiveId)}]`;
  requireExactKeys(input, PRIMITIVE_INPUT_KEYS[kind], field, PRIMITIVE_CODE);
  if (input.schema !== LOAD_PRIMITIVE_SCHEMA) {
    fail(`${field}.schema must be ${LOAD_PRIMITIVE_SCHEMA}.`, PRIMITIVE_CODE);
  }
  const primitiveId = requireIdentity(input.primitiveId, `${field}.primitiveId`, PRIMITIVE_CODE);
  const sourceEvidence = requireSourceEvidence(input.sourceEvidence, `${field}.sourceEvidence`, PRIMITIVE_CODE);
  const base = { schema: LOAD_PRIMITIVE_SCHEMA, primitiveId, kind, sourceEvidence };
  const built = BUILDERS[kind](input, context, field);
  const draft = {
    ...base,
    ...built.payload,
    limitations: [...built.limitations].sort(byCode),
    semanticHash: '',
  };
  draft.semanticHash = computePrimitiveSemanticHash(draft);
  return requireLoadPrimitive(draft);
}

const BUILDERS = Object.freeze({
  GRAVITY: buildGravity,
  DISTRIBUTED_WEIGHT: buildDistributedWeight,
  PRESSURE: buildPressure,
  TEMPERATURE: buildTemperature,
  NODAL_FORCE_MOMENT: buildNodalForceMoment,
  DISTRIBUTED_LOAD: buildDistributedLoad,
  EQUIVALENT_STATIC: buildEquivalentStatic,
  PRESCRIBED_MOVEMENT: buildPrescribedMovement,
});

/**
 * Gravity carries its direction, the acceleration magnitude it is evaluated at
 * and the mass sources it is authorised to include. The magnitude comes from
 * the declared profile, never from this file: a gravitational acceleration
 * written into the source would be exactly the hidden numerical policy section
 * 13.1 prohibits, and a primitive that tries to supply its own is rejected as
 * an unexpected field.
 */
function buildGravity(input, context, field) {
  const direction = requireUnitDirection(
    input.direction,
    context.profile.directionUnitTolerance.value,
    `${field}.direction`,
  );
  requireMember(input.basis, ['GLOBAL'], `${field}.basis`, PRIMITIVE_CODE);
  requireArray(input.includedMassSources, `${field}.includedMassSources`, PRIMITIVE_CODE);
  if (input.includedMassSources.length === 0) {
    fail(
      `${field}.includedMassSources must name every mass source this gravity case includes.`,
      'LOAD_CASE_GRAVITY_MASS_SOURCES_NOT_DECLARED',
    );
  }
  const sources = input.includedMassSources.map((source, index) =>
    requireMember(source, GRAVITY_MASS_SOURCES, `${field}.includedMassSources[${index}]`, PRIMITIVE_CODE));
  const unique = new Set(sources);
  if (unique.size !== sources.length) {
    fail(`${field}.includedMassSources repeats a mass source.`, PRIMITIVE_CODE);
  }
  return {
    payload: {
      direction,
      basis: 'GLOBAL',
      includedMassSources: [...sources].sort(compareAscii),
      accelerationMagnitude: {
        value: context.profile.gravitationalAcceleration.value,
        source: context.profile.gravitationalAcceleration.source,
      },
    },
    limitations: [],
  };
}

/**
 * Pipe, contents and insulation weight arrive as a declared distributed mass
 * per unit length with the density state and geometry state it came from. The
 * mass is not multiplied by gravity here and not turned into a force: that
 * conversion belongs to the element formulation, which owns the consistent
 * equivalent nodal vector.
 */
function buildDistributedWeight(input, context, field) {
  return {
    payload: {
      elementId: requireBoundElement(context.modelReference, input.elementId, `${field}.elementId`),
      weightComponent: requireMember(
        input.weightComponent,
        DISTRIBUTED_WEIGHT_COMPONENTS,
        `${field}.weightComponent`,
        PRIMITIVE_CODE,
      ),
      massPerUnitLength: requirePositive(
        input.massPerUnitLength,
        `${field}.massPerUnitLength`,
        PRIMITIVE_CODE,
      ),
      densityEvidence: requireSourceEvidence(input.densityEvidence, `${field}.densityEvidence`, PRIMITIVE_CODE),
      geometryEvidence: requireSourceEvidence(input.geometryEvidence, `${field}.geometryEvidence`, PRIMITIVE_CODE),
    },
    limitations: [],
  };
}

function buildPressure(input, context, field) {
  const pressureBasis = requireMember(input.pressureBasis, PRESSURE_BASES, `${field}.pressureBasis`, PRIMITIVE_CODE);
  const pressure = requireFinite(input.pressure, `${field}.pressure`, PRIMITIVE_CODE);
  if (pressureBasis === 'ABSOLUTE' && !(pressure >= 0)) {
    fail(`${field}.pressure is declared absolute and must not be negative.`, 'LOAD_CASE_PRESSURE_STATE_INVALID');
  }
  requireExactKeys(
    input.authorizedEffects,
    PRESSURE_EFFECT_FLAGS,
    `${field}.authorizedEffects`,
    'LOAD_CASE_PRESSURE_EFFECT_NOT_DECLARED',
  );
  const effects = {};
  const limitations = [];
  for (const flag of PRESSURE_EFFECT_FLAGS) {
    effects[flag] = requireBoolean(
      input.authorizedEffects[flag],
      `${field}.authorizedEffects.${flag}`,
      'LOAD_CASE_PRESSURE_EFFECT_NOT_DECLARED',
    );
    if (effects[flag]) {
      limitations.push(limitation(
        PRESSURE_EFFECT_LIMITATION_CODES[flag],
        'A pressure effect is authorised by this load case; the consuming formulation must prove it implements the effect before applying it, and authorisation alone never applies it.',
        { effect: flag },
      ));
    }
  }
  return {
    payload: {
      elementId: requireBoundElement(context.modelReference, input.elementId, `${field}.elementId`),
      pressure,
      pressureBasis,
      authorizedEffects: effects,
    },
    limitations,
  };
}

/**
 * The temperature state retains the operating temperature, the installation
 * reference and the material state the stiffness was evaluated at, as three
 * separate authorities (section 4.1). No temperature difference is formed here
 * and no strain is computed: section 5.4 places element thermal strain in the
 * element formulation, and the approximation under which it may use
 * `alpha * deltaT` is disclosed on this record.
 */
function buildTemperature(input, context, field) {
  const thermalStrainProfileId = requireSourceIdentity(
    input.thermalStrainProfileId,
    `${field}.thermalStrainProfileId`,
    PRIMITIVE_CODE,
  );
  if (thermalStrainProfileId !== context.profile.thermalStrainApproximation) {
    fail(
      `${field}.thermalStrainProfileId does not match the declared profile thermal-strain approximation.`,
      'LOAD_CASE_THERMAL_PROFILE_MISMATCH',
    );
  }
  return {
    payload: {
      elementId: requireBoundElement(context.modelReference, input.elementId, `${field}.elementId`),
      operatingTemperature: requirePositive(
        input.operatingTemperature,
        `${field}.operatingTemperature`,
        'LOAD_CASE_TEMPERATURE_STATE_INVALID',
      ),
      installationTemperature: requirePositive(
        input.installationTemperature,
        `${field}.installationTemperature`,
        'LOAD_CASE_TEMPERATURE_STATE_INVALID',
      ),
      stiffnessEvaluationMaterialStateId: requireBoundMaterialState(
        context.modelReference,
        input.stiffnessEvaluationMaterialStateId,
        `${field}.stiffnessEvaluationMaterialStateId`,
      ),
      thermalStrainProfileId,
    },
    limitations: [limitation(
      UNIFORM_TEMPERATURE_LIMITATION_CODE,
      'Thermal strain is represented by a uniform temperature change under the declared approximation profile; no gradient or stratification is modelled and temperature-dependent expansion-coefficient integration is deferred to the thermal-load compiler.',
      { approximationProfileId: UNIFORM_TEMPERATURE_THERMAL_STRAIN_PROFILE },
    )],
  };
}

/**
 * A nodal force/moment resultant, in the global frame or in a declared local
 * basis, following the `attachment-load-contract` shape: components, a basis
 * used exactly as supplied, and a sign convention written down rather than
 * assumed. Only the applied-to-structure sense is representable; a reaction
 * resultant must be reversed deliberately by its owner.
 */
function buildNodalForceMoment(input, context, field) {
  const signConvention = requireMember(
    input.signConvention,
    LOAD_SIGN_CONVENTIONS,
    `${field}.signConvention`,
    PRIMITIVE_CODE,
  );
  if (signConvention !== REPRESENTABLE_LOAD_SIGN_CONVENTION) {
    fail(
      `${field}.signConvention is ${signConvention}; a load case carries loads applied to the structure, and the opposite sense must be reversed deliberately by its owner rather than flipped here.`,
      'LOAD_CASE_SIGN_CONVENTION_NOT_REPRESENTABLE',
    );
  }
  return {
    payload: {
      nodeId: requireBoundNode(context.modelReference, input.nodeId, `${field}.nodeId`),
      basis: requireLoadBasis(input.basis, context.profile.directionUnitTolerance.value, `${field}.basis`),
      force: requireComponents(input.force, FORCE_FIELDS, `${field}.force`),
      moment: requireComponents(input.moment, MOMENT_FIELDS, `${field}.moment`),
      units: requireUnitsSubset(input.units, ['force', 'moment', 'length'], `${field}.units`),
      signConvention,
    },
    limitations: [],
  };
}

/**
 * A uniform or linearly varying distributed load, declared as a shape, a basis
 * and end intensities. The consistent equivalent nodal vector is not formed
 * here — section 3.4 assigns it to the element formulation, and forming it in
 * two places is how equivalent loads stop agreeing.
 */
function buildDistributedLoad(input, context, field) {
  const variation = requireMember(
    input.variation,
    DISTRIBUTED_LOAD_VARIATIONS,
    `${field}.variation`,
    PRIMITIVE_CODE,
  );
  const startIntensity = requireComponents(input.startIntensity, FORCE_FIELDS, `${field}.startIntensity`);
  const endIntensity = requireComponents(input.endIntensity, FORCE_FIELDS, `${field}.endIntensity`);
  if (variation === 'UNIFORM') {
    for (const key of FORCE_FIELDS) {
      if (startIntensity[key] !== endIntensity[key]) {
        fail(
          `${field} declares a uniform variation with unequal end intensities; the variation and the intensities must agree.`,
          'LOAD_CASE_DISTRIBUTED_VARIATION_MISMATCH',
        );
      }
    }
  }
  return {
    payload: {
      elementId: requireBoundElement(context.modelReference, input.elementId, `${field}.elementId`),
      basis: requireMember(input.basis, DISTRIBUTED_LOAD_BASES, `${field}.basis`, PRIMITIVE_CODE),
      variation,
      startIntensity,
      endIntensity,
      units: requireUnitsSubset(input.units, ['distributedForce', 'length'], `${field}.units`),
    },
    limitations: [],
  };
}

/**
 * An equivalent static wind or seismic load: direction, project coefficient,
 * projected area and the project combination-class tag a later code package
 * will map to a category. The tag may not be a B31.3 category itself, and the
 * absence of dynamic amplification is disclosed on the record.
 */
function buildEquivalentStatic(input, context, field) {
  const coefficient = requireDeclaredValue(input, 'coefficient', { exclusiveMinimum: 0 });
  return {
    payload: {
      elementId: requireBoundElement(context.modelReference, input.elementId, `${field}.elementId`),
      equivalentClass: requireMember(
        input.equivalentClass,
        EQUIVALENT_STATIC_CLASSES,
        `${field}.equivalentClass`,
        PRIMITIVE_CODE,
      ),
      direction: requireUnitDirection(
        input.direction,
        context.profile.directionUnitTolerance.value,
        `${field}.direction`,
      ),
      coefficient: { value: coefficient.value, source: coefficient.source },
      projectedArea: requirePositive(input.projectedArea, `${field}.projectedArea`, PRIMITIVE_CODE),
      geometryEvidence: requireSourceEvidence(input.geometryEvidence, `${field}.geometryEvidence`, PRIMITIVE_CODE),
      combinationClassId: requireNotCodeCategoryTag(
        requireSourceIdentity(input.combinationClassId, `${field}.combinationClassId`, PRIMITIVE_CODE),
        `${field}.combinationClassId`,
      ),
    },
    limitations: [limitation(
      EQUIVALENT_STATIC_LIMITATION_CODE,
      'Wind and seismic effects are represented as equivalent static loads; there is no dynamic amplification beyond the declared project coefficient.',
    )],
  };
}

/**
 * A case-specific prescribed movement, bound by name to a slot the mechanical
 * model already declares. The node and DOF are the slot's, so a value cannot be
 * attached to a DOF the model never opened, and supplying a value never alters
 * stiffness identity (section 7.1).
 */
function buildPrescribedMovement(input, context, field) {
  const slot = requirePrescribedSlot(context.modelReference, input.prescribedSlotId, `${field}.prescribedSlotId`);
  const nodeId = requireBoundNode(context.modelReference, input.nodeId, `${field}.nodeId`);
  const dof = requireMember(input.dof, CONSTRAINT_DOFS, `${field}.dof`, PRIMITIVE_CODE);
  if (slot.nodeId !== nodeId || slot.dof !== dof) {
    fail(
      `${field} binds prescribed slot ${slot.slotId}, which the mechanical model declares at ${slot.nodeId}:${slot.dof}.`,
      'LOAD_CASE_PRESCRIBED_SLOT_MISMATCH',
    );
  }
  return {
    payload: {
      prescribedSlotId: slot.slotId,
      nodeId,
      dof,
      value: requireFinite(input.value, `${field}.value`, PRIMITIVE_CODE),
    },
    limitations: [],
  };
}

export function primitiveSemanticProjection(primitive) {
  const projection = {};
  for (const key of PRIMITIVE_RECORD_KEYS[primitive.kind]) {
    if (key === 'semanticHash') continue;
    projection[key] = key === 'limitations'
      ? [...primitive.limitations].sort(byCode)
      : primitive[key];
  }
  return projection;
}

export function computePrimitiveSemanticHash(primitive) {
  return semanticHash(primitiveSemanticProjection(primitive));
}

export function requireLoadPrimitive(primitive) {
  requireRecord(primitive, 'primitive', PRIMITIVE_CODE);
  const kind = requireMember(primitive.kind, LOAD_PRIMITIVE_KINDS, 'primitive.kind', PRIMITIVE_CODE);
  const field = `primitive[${String(primitive.primitiveId)}]`;
  requireExactKeys(primitive, PRIMITIVE_RECORD_KEYS[kind], field, PRIMITIVE_CODE);
  requireArray(primitive.limitations, `${field}.limitations`, PRIMITIVE_CODE);
  primitive.limitations.forEach((entry, index) => {
    if (entry.stiffnessRelevant !== false) {
      fail(
        `${field}.limitations[${index}] declares a stiffness-relevant limitation; a physical load case never alters stiffness identity.`,
        'LOAD_CASE_LIMITATION_STIFFNESS_RELEVANT_PROHIBITED',
      );
    }
  });
  requireHash(primitive.semanticHash, `${field}.semanticHash`, PRIMITIVE_CODE);
  if (primitive.semanticHash !== computePrimitiveSemanticHash(primitive)) {
    fail(`${field}.semanticHash is stale.`, 'LOAD_CASE_HASH_MISMATCH');
  }
  return deepFreeze({ ...primitive, limitations: [...primitive.limitations].sort(byCode) });
}

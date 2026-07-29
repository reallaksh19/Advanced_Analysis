import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import {
  CANONICAL_ID_ORDER_ID,
  CANONICAL_NODE_ID_GRAMMAR_ID,
  CANONICAL_ORDERING_CONVENTION_SCHEMA,
  requireCanonicalNodeId,
} from './identifiers.js';

export const LINEAR_FEA_CONVENTIONS_SCHEMA =
  'fea-linear-conventions/v1';

export const ELEMENT_VECTOR_LAYOUT_SCHEMA =
  'fea-linear-element-vector-layout/v1';

export const TRANSFORMATION_CONVENTION_SCHEMA =
  'fea-linear-transformation/v1';

export const END_ACTION_CONVENTION_SCHEMA =
  'fea-linear-end-action/v1';

export const NUMERIC_NORMALIZATION_CONVENTION_SCHEMA =
  'fea-linear-numeric-normalization/v1';

export const DOF_ORDER = Object.freeze([
  'UX', 'UY', 'UZ', 'RX', 'RY', 'RZ',
]);

export const ELEMENT_END_ORDER = Object.freeze(['I', 'J']);

export const LOCAL_RESULT_ORDER = Object.freeze([
  'FX', 'FY', 'FZ', 'MX', 'MY', 'MZ',
]);

export const ELEMENT_DOF_ORDER = Object.freeze([
  'I:UX', 'I:UY', 'I:UZ',
  'I:RX', 'I:RY', 'I:RZ',
  'J:UX', 'J:UY', 'J:UZ',
  'J:RX', 'J:RY', 'J:RZ',
]);

export const VECTOR_ORIENTATION_ID =
  'COLUMN_VECTOR_V1';

export const ELEMENT_MATRIX_STORAGE_ID =
  'ROW_MAJOR_12X12_V1';

export const ELEMENT_VECTOR_LAYOUT_ID =
  'I_SIX_DOF_THEN_J_SIX_DOF_V1';

export const TRANSFORMATION_CONVENTION_ID =
  'D_LOCAL_EQ_T_D_GLOBAL_V1';

export const ELEMENT_END_ACTION_CONVENTION_ID =
  'FRAME_END_ACTION_ON_ELEMENT_V1';

export const REACTION_CONVENTION_ID =
  'SUPPORT_ACTION_ON_STRUCTURE_R_EQ_KU_MINUS_F_V1';

export const PRESCRIBED_DISPLACEMENT_CONVENTION_ID =
  'PRESCRIBED_VALUE_IS_STRUCTURAL_DOF_IN_U_V1';

export const THERMAL_STRAIN_CONVENTION_ID =
  'POSITIVE_DELTA_T_PRODUCES_POSITIVE_INITIAL_EXTENSION_V1';

export const NUMERIC_NORMALIZATION_ID =
  'FINITE_IEEE754_NEGATIVE_ZERO_NORMALIZED_V1';

export const END_ACTION_CONVENTION = Object.freeze({
  conventionId: ELEMENT_END_ACTION_CONVENTION_ID,
  actionSource: 'CONNECTED_JOINT',
  actionTarget: 'ELEMENT_END',
  componentBasis: 'ELEMENT_LOCAL_AXES',
  recoveryShape:
    'K_D_MINUS_EQUIVALENT_LOAD_MINUS_INITIAL_STRAIN_LOAD',
  oppositeAction:
    'ELEMENT_ACTION_ON_JOINT_IS_NEGATIVE_OF_REPORTED_END_ACTION',
});

export const LINEAR_FEA_CONVENTIONS = Object.freeze({
  schema: LINEAR_FEA_CONVENTIONS_SCHEMA,
  elementVectorLayoutSchema: ELEMENT_VECTOR_LAYOUT_SCHEMA,
  transformationSchema: TRANSFORMATION_CONVENTION_SCHEMA,
  endActionSchema: END_ACTION_CONVENTION_SCHEMA,
  canonicalOrderingSchema: CANONICAL_ORDERING_CONVENTION_SCHEMA,
  numericNormalizationSchema: NUMERIC_NORMALIZATION_CONVENTION_SCHEMA,

  dofOrder: DOF_ORDER,
  elementEndOrder: ELEMENT_END_ORDER,
  localResultOrder: LOCAL_RESULT_ORDER,
  elementDofOrder: ELEMENT_DOF_ORDER,

  vectorOrientation: VECTOR_ORIENTATION_ID,
  elementMatrixStorage: ELEMENT_MATRIX_STORAGE_ID,
  elementVectorLayout: ELEMENT_VECTOR_LAYOUT_ID,
  transformationConvention: TRANSFORMATION_CONVENTION_ID,

  displacementTransformation: 'd_local = T d_global',
  stiffnessTransformation: 'K_global = transpose(T) K_local T',
  forceTransformation: 'q_global = transpose(T) q_local',

  elementEndActionConvention: ELEMENT_END_ACTION_CONVENTION_ID,
  endActionConvention: END_ACTION_CONVENTION,
  reactionConvention: REACTION_CONVENTION_ID,
  reactionMeaning: 'SUPPORT_ACTION_ON_STRUCTURE',
  reactionEquation: 'R = K U - F',
  prescribedDisplacementConvention: PRESCRIBED_DISPLACEMENT_CONVENTION_ID,
  thermalStrainConvention: THERMAL_STRAIN_CONVENTION_ID,

  canonicalNodeIdGrammar: CANONICAL_NODE_ID_GRAMMAR_ID,
  canonicalIdOrder: CANONICAL_ID_ORDER_ID,
  numericNormalization: NUMERIC_NORMALIZATION_ID,
});

function contractError(message, code) {
  return new SharedAnalysisContractError(message, code);
}

function requireMember(value, expected, field, code) {
  const index = expected.indexOf(value);
  if (index === -1) {
    throw contractError(`${field} is invalid.`, code);
  }
  return index;
}

function requireExactKeys(candidate, expected, field) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw contractError(`${field} must be a record.`, 'INVALID_CONVENTION_RECORD');
  }

  for (const key of Object.keys(expected)) {
    if (!Object.hasOwn(candidate, key)) {
      throw contractError(
        `${field} is missing ${key}.`,
        'MISSING_LINEAR_FEA_CONVENTION',
      );
    }
  }

  for (const key of Object.keys(candidate)) {
    if (!Object.hasOwn(expected, key)) {
      throw contractError(
        `${field} contains unexpected field ${key}.`,
        'UNEXPECTED_LINEAR_FEA_CONVENTION',
      );
    }
  }
}

function requireExactOrder(candidate, expected, field) {
  if (!Array.isArray(candidate)) {
    throw contractError(
      `${field} must be an array.`,
      'INVALID_ORDER_FIELD',
    );
  }

  if (candidate.length !== expected.length) {
    throw contractError(
      `${field} has an invalid length.`,
      'INVALID_ORDER_FIELD',
    );
  }

  expected.forEach((value, index) => {
    if (candidate[index] !== value) {
      throw contractError(
        `${field}[${index}] must be ${value}.`,
        'INVALID_ORDER_FIELD',
      );
    }
  });

  return expected;
}

function requireEndActionConvention(candidate) {
  requireExactKeys(candidate, END_ACTION_CONVENTION, 'endActionConvention');
  for (const [key, expected] of Object.entries(END_ACTION_CONVENTION)) {
    if (candidate[key] !== expected) {
      throw contractError(
        `endActionConvention.${key} must be ${expected}.`,
        'INVALID_END_ACTION_CONVENTION',
      );
    }
  }
  return END_ACTION_CONVENTION;
}

export function dofIndex(dof) {
  return requireMember(dof, DOF_ORDER, 'DOF', 'UNSUPPORTED_DOF');
}

export function endIndex(end) {
  return requireMember(
    end,
    ELEMENT_END_ORDER,
    'Element end',
    'UNSUPPORTED_ELEMENT_END',
  );
}

export function elementDofIndex(end, dof) {
  return endIndex(end) * DOF_ORDER.length + dofIndex(dof);
}

export function elementMatrixIndex(row, column) {
  for (const [value, field] of [[row, 'row'], [column, 'column']]) {
    if (!Number.isInteger(value) || value < 0 || value >= ELEMENT_DOF_ORDER.length) {
      throw contractError(
        `Element matrix ${field} must be an integer from 0 to 11.`,
        'INVALID_ELEMENT_MATRIX_INDEX',
      );
    }
  }
  return row * ELEMENT_DOF_ORDER.length + column;
}

export function globalDofIdentity(nodeId, dof) {
  return `${requireCanonicalNodeId(nodeId)}:${DOF_ORDER[dofIndex(dof)]}`;
}

export function normalizeLinearFeaNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw contractError(
      'Linear FEA numeric value must be a finite IEEE-754 number.',
      'INVALID_LINEAR_FEA_NUMBER',
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

export function requireLinearFeaConventions(candidate) {
  requireExactKeys(candidate, LINEAR_FEA_CONVENTIONS, 'Linear FEA conventions');

  requireExactOrder(candidate.dofOrder, DOF_ORDER, 'dofOrder');
  requireExactOrder(candidate.elementEndOrder, ELEMENT_END_ORDER, 'elementEndOrder');
  requireExactOrder(candidate.localResultOrder, LOCAL_RESULT_ORDER, 'localResultOrder');
  requireExactOrder(candidate.elementDofOrder, ELEMENT_DOF_ORDER, 'elementDofOrder');
  requireEndActionConvention(candidate.endActionConvention);

  for (const [key, expected] of Object.entries(LINEAR_FEA_CONVENTIONS)) {
    if (Array.isArray(expected) || key === 'endActionConvention') continue;
    if (candidate[key] !== expected) {
      throw contractError(
        `Linear FEA convention ${key} must be ${expected}.`,
        'INVALID_LINEAR_FEA_CONVENTION',
      );
    }
  }

  return LINEAR_FEA_CONVENTIONS;
}

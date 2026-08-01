/** Product-level components layered above retained analytical stage calculations. */
import {
  compileLafeaLoadFoundation,
  createLafeaLoadFoundationHandoff,
} from '../core/local-load-foundation/index.js';
import {
  createLocalAttachmentScreeningAssessment,
  createLocalAttachmentScreeningHandoff,
} from '../core/local-attachment-screening/index.js';
import { LAFEA_TECHNICAL_COMPONENT_IDS as IDS } from './lafea-stage-composition-bindings.js';

const COMPONENTS = Object.freeze({
  [IDS.productAdapter.foundation]: createFoundationProductEvidence,
  [IDS.productAdapter.screening]: createScreeningProductEvidence,
});

export function requireLafeaProductComponent(componentId) {
  const component = COMPONENTS[componentId];
  if (typeof component !== 'function') {
    throw new TypeError(`No LAFEA product component is registered for ${componentId}.`);
  }
  return component;
}

export function lafeaProductComponentRegistered(componentId) {
  return typeof COMPONENTS[componentId] === 'function';
}

function createFoundationProductEvidence(options) {
  const foundationResult = compileLafeaLoadFoundation(options?.foundation);
  const handoffs = normalizeHandoffRequests(options?.handoffs).map((request) =>
    createLafeaLoadFoundationHandoff({ ...request, foundationResult }));
  return deepFreeze({
    stageId: 'LAFEA.1',
    productState: foundationResult.qualification.state,
    evidence: foundationResult,
    handoffs,
  });
}

function createScreeningProductEvidence(options) {
  const screeningResult = options?.screeningResult;
  const assessment = createLocalAttachmentScreeningAssessment({
    screeningResult,
    assessmentIdentity: options?.assessmentIdentity,
    assessmentProfileId: options?.assessmentProfileId,
    governingQuantity: options?.governingQuantity,
    applicabilityRecords: options?.applicabilityRecords,
  });
  const requests = normalizeHandoffRequests(options?.handoffs);
  if (assessment.state !== 'ESCALATE' && requests.length) {
    throw productError('LAFEA_SCREENING_HANDOFF_WITHOUT_ESCALATION');
  }
  const handoffs = requests.map((request) =>
    createLocalAttachmentScreeningHandoff({
      ...request,
      assessment,
      screeningResult,
    }));
  return deepFreeze({
    stageId: 'LAFEA.2',
    productState: assessment.state,
    evidence: assessment,
    handoffs,
  });
}

function normalizeHandoffRequests(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw productError('LAFEA_PRODUCT_HANDOFFS_INVALID');
  return value.map((row) => structuredClone(row));
}

function productError(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

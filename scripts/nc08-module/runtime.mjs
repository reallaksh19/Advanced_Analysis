import { semanticHash } from '../../src/core/nonlinear-shell-contact/contracts.js';
import { AUTHORITY_REQUEST, CASE_ID, MODULE_VERSION, REQUEST_SCHEMA, RESPONSE_SCHEMA } from './config.mjs';

const INPUT_KEYS = ['diameter','thickness','length','elasticModulus','poissonRatio','pressure','loadedDent','residualDent','maxPeeq','plasticPointFraction'];
const REQUEST_KEYS = ['schema','caseId','profile','input','requestedAuthority','receiptChain'];
const MPA_TO_KSI = 0.14503773773020923;
const M_TO_IN = 39.37007874015748;

export function executeSyntheticReferenceModule(request) {
  assertPlain(request, 'request');
  exactKeys(request, REQUEST_KEYS, 'request');
  if (request.schema !== REQUEST_SCHEMA) throw new TypeError('SCHEMA_MISMATCH');
  if (request.caseId !== CASE_ID) throw new TypeError('CASE_ID_UNQUALIFIED');
  if (request.requestedAuthority !== AUTHORITY_REQUEST) throw new TypeError('AUTHORITY_ESCALATION_REJECTED');
  const canonical = canonicalize(request.profile, request.input);
  const chainHash = validateReceiptChain(request.receiptChain);
  const metrics = Object.freeze({
    depthRatio: canonical.loadedDent / canonical.diameter,
    permanentFraction: canonical.residualDent / canonical.loadedDent,
    pressureElasticRatio: canonical.pressure * canonical.diameter / (2 * canonical.thickness * canonical.elasticModulus),
    diameterToThickness: canonical.diameter / canonical.thickness,
    lengthToDiameter: canonical.length / canonical.diameter,
    maxPeeq: canonical.maxPeeq,
    plasticPointFraction: canonical.plasticPointFraction,
  });
  const payload = {
    schema: RESPONSE_SCHEMA,
    moduleVersion: MODULE_VERSION,
    caseId: CASE_ID,
    status: 'ENGINEERING_REVIEW_REQUIRED',
    metrics,
    receiptChainHash: chainHash,
    authority: {
      syntheticReferenceEvaluation: true,
      realAssetDecisionAuthorized: false,
      codeAssessmentQualified: false,
      externalCodeComplianceQualified: false,
      fitnessForServiceQualified: false,
      remainingStrengthQualified: false,
      failurePressureQualified: false,
      automaticAcceptanceAuthorized: false,
      autonomousDispositionAuthorized: false,
      productionExecutionAuthorized: false,
    },
  };
  return Object.freeze({ ...payload, responseHash: semanticHash(payload) });
}

export function canonicalize(profile, input) {
  assertPlain(input, 'input');
  exactKeys(input, INPUT_KEYS, 'input');
  const value = structuredClone(input);
  for (const key of INPUT_KEYS) if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) throw new TypeError(`NONFINITE_INPUT:${key}`);
  if (profile === 'MM_MPA') for (const key of ['diameter','thickness','length','loadedDent','residualDent']) value[key] /= 1000;
  else if (profile === 'IN_KSI') {
    for (const key of ['diameter','thickness','length','loadedDent','residualDent']) value[key] /= M_TO_IN;
    for (const key of ['elasticModulus','pressure']) value[key] /= MPA_TO_KSI;
  } else if (profile !== 'M_MPA') throw new TypeError('PROFILE_UNSUPPORTED');
  if (value.diameter <= 0 || value.thickness <= 0 || value.length <= 0 || value.elasticModulus <= 0 || value.pressure < 0 || value.loadedDent <= 0 || value.residualDent < 0 || value.residualDent > value.loadedDent) throw new TypeError('INPUT_OUT_OF_DOMAIN');
  const reference = { diameterToThickness:40, lengthToDiameter:2, pressureElasticRatio:10*2/(2*0.05*210000), poissonRatio:0.3 };
  const actual = { diameterToThickness:value.diameter/value.thickness, lengthToDiameter:value.length/value.diameter, pressureElasticRatio:value.pressure*value.diameter/(2*value.thickness*value.elasticModulus), poissonRatio:value.poissonRatio };
  for (const key of Object.keys(reference)) if (relative(actual[key], reference[key]) > 1e-12) throw new TypeError(`OUTSIDE_SYNTHETIC_REFERENCE_CELL:${key}`);
  return Object.freeze(value);
}
function validateReceiptChain(value) {
  assertPlain(value, 'receiptChain');
  const keys = ['nc05ReportHash','nc06ReportHash','nc07ReportHash','caseRecordHash','nc07ArtifactDigest','upstreamBindingHash'];
  exactKeys(value, keys, 'receiptChain');
  for (const key of keys) if (!/^sha256:[0-9a-f]{64}$/u.test(value[key])) throw new TypeError(`RECEIPT_HASH_INVALID:${key}`);
  return semanticHash(value);
}
function assertPlain(value, path) { if (!value || typeof value !== 'object' || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new TypeError(`${path.toUpperCase()}_PLAIN_DATA_REQUIRED`); }
function exactKeys(value, keys, path) { const actual=Object.keys(value).sort(); const expected=[...keys].sort(); if (actual.length!==expected.length || actual.some((key,index)=>key!==expected[index])) throw new TypeError(`${path.toUpperCase()}_FIELDS_INVALID`); }
function relative(a,b) { return Math.abs(a-b)/Math.max(Math.abs(a),Math.abs(b),1e-30); }

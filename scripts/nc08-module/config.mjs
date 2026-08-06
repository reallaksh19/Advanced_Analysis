import { deepFreeze, semanticHash } from '../../src/core/nonlinear-shell-contact/contracts.js';

export const MODULE_VERSION = '0.8.0-synthetic-reference.1';
export const BUILD_ID = 'NC08-SYNTHETIC-REFERENCE-MODULE-001';
export const REQUEST_SCHEMA = 'lafea-nc08-synthetic-module-request/v1';
export const RESPONSE_SCHEMA = 'lafea-nc08-synthetic-module-response/v1';
export const CASE_ID = 'SYNTH-NC07-DENT-001';
export const AUTHORITY_REQUEST = 'SYNTHETIC_REFERENCE_EVALUATION_ONLY';
export const CANONICAL_INPUT = deepFreeze({
  diameter: 2,
  thickness: 0.05,
  length: 4,
  elasticModulus: 210000,
  poissonRatio: 0.3,
  pressure: 10,
  loadedDent: 0.0144227215,
  residualDent: 0.004102019,
  maxPeeq: 0.002097147,
  plasticPointFraction: 0.0763888888888889,
});
const MPA_TO_KSI = 0.14503773773020923;
const M_TO_IN = 39.37007874015748;
export const REFERENCE_REQUESTS = deepFreeze([
  { id: 'REF-SI', profile: 'M_MPA', input: { ...CANONICAL_INPUT } },
  { id: 'REF-MM', profile: 'MM_MPA', input: { ...CANONICAL_INPUT, diameter: 2000, thickness: 50, length: 4000, loadedDent: 14.4227215, residualDent: 4.102019 } },
  { id: 'REF-IN-KSI', profile: 'IN_KSI', input: { ...CANONICAL_INPUT, diameter: 2*M_TO_IN, thickness: 0.05*M_TO_IN, length: 4*M_TO_IN, loadedDent: 0.0144227215*M_TO_IN, residualDent: 0.004102019*M_TO_IN, elasticModulus: 210000*MPA_TO_KSI, pressure: 10*MPA_TO_KSI } },
  { id: 'REF-SI-REPLAY', profile: 'M_MPA', input: { ...CANONICAL_INPUT } },
  { id: 'REF-RECONSTRUCT', profile: 'M_MPA', input: { ...CANONICAL_INPUT } },
]);
export const API_SCHEMA = deepFreeze({
  requestSchema: REQUEST_SCHEMA,
  responseSchema: RESPONSE_SCHEMA,
  requestRequired: ['schema','caseId','profile','input','requestedAuthority','receiptChain'],
  responseRequired: ['schema','moduleVersion','caseId','status','metrics','receiptChainHash','authority','responseHash'],
  unknownFieldsRejected: true,
  plainDataOnly: true,
});
export const MIGRATION_MANIFEST = deepFreeze({
  from: [],
  to: REQUEST_SCHEMA,
  breakingChangePolicy: 'NO_IMPLICIT_MIGRATION',
  compatibilityMode: 'EXACT_SCHEMA_ONLY',
});
export const RUNTIME_PROFILE = deepFreeze({
  nodeMajor: 22,
  networkEnabled: false,
  runtimeExtensionEnabled: false,
  dynamicCodeEnabled: false,
  filesystemWriteEnabled: false,
  environmentAuthorityInputsEnabled: false,
});
export const DEPENDENCY_LOCK = deepFreeze({
  schema: 'lafea-nc08-dependency-lock/v1',
  packageManager: 'NONE',
  runtime: 'node:22',
  externalDependencies: [],
});
export const CONFIG_HASH = semanticHash({ MODULE_VERSION, BUILD_ID, REQUEST_SCHEMA, RESPONSE_SCHEMA, CASE_ID, API_SCHEMA, MIGRATION_MANIFEST, RUNTIME_PROFILE, DEPENDENCY_LOCK });

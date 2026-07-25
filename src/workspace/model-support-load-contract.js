import { freezeDeep } from './dataset-utils.js';
import { MODEL_SUPPORT_LOAD_READINESS_SCHEMA } from './model-support-load-readiness.js';

export const MODEL_SUPPORT_LOAD_READINESS_TOPIC = 'modelSupportLoad:readinessChanged';

export function createModelSupportLoadReadinessEvent(readiness, error = '') {
  if (readiness !== null && readiness?.schema !== MODEL_SUPPORT_LOAD_READINESS_SCHEMA) {
    throw new TypeError(`Model support-load readiness must be ${MODEL_SUPPORT_LOAD_READINESS_SCHEMA}.`);
  }
  return freezeDeep({ readiness, error: String(error || '') });
}

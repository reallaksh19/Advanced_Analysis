import {
  sealLinearPipingQualifiedApplicationResult as sealBaseApplicationResult,
} from './application-result.js';
import { requireLinearPipingB31Application } from './public-api.js';

export function sealLinearPipingQualifiedApplicationResult(input) {
  requireLinearPipingB31Application(input?.b31Application);
  return sealBaseApplicationResult(input);
}

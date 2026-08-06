import {
  validateTopologyEditCommandEffect as validateLegacyCommandEffect,
} from './topology-edit-command-effect-validator.js';
import {
  validatePipeSegmentCandidateEffect,
} from './topology-edit-pipe-segment-effect.js';

export function validateTopologyEditCommandEffect(candidate) {
  return candidate.commandType === 'INSERT_PIPE_SEGMENT'
    ? validatePipeSegmentCandidateEffect(candidate)
    : validateLegacyCommandEffect(candidate);
}

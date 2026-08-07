import {
  validateTopologyEditCommandEffect as validateLegacyCommandEffect,
} from './topology-edit-command-effect-validator.js';
import {
  validateTopologyEditEngineeringCommandEffect,
} from './topology-edit-engineering-edit-effect.js';
import {
  validatePipeSegmentCandidateEffect,
} from './topology-edit-pipe-segment-effect.js';

const ENGINEERING_COMMANDS = new Set([
  'REPLACE_INLINE_COMPONENT',
  'UPDATE_JUNCTION_BRANCH_RELATION',
]);

export function validateTopologyEditCommandEffect(candidate) {
  if (candidate.commandType === 'INSERT_PIPE_SEGMENT') {
    return validatePipeSegmentCandidateEffect(candidate);
  }
  if (ENGINEERING_COMMANDS.has(candidate.commandType)) {
    return validateTopologyEditEngineeringCommandEffect(candidate);
  }
  return validateLegacyCommandEffect(candidate);
}

import { deepFreeze } from '../../core/shared-piping-model/index.js';
import {
  assertCanonicalTopologyHash,
  canonicalTopologyStateHash,
  finalizeCanonicalTopology,
} from './topology-edit-canonical-state.js';
import { assertResolvedTopologyEditCommand } from './topology-edit-command-resolver.js';
import {
  applyResolvedTopologyEditCommand as applyLegacyCommand,
} from './topology-edit-pure-reducer.js';
import { applyPipeSegmentCommand } from './topology-edit-pipe-segment-reducer.js';
import {
  applyTopologyEditInlineReplacement,
} from './topology-edit-inline-component-replacement.js';
import {
  applyTopologyEditJunctionRelation,
} from './topology-edit-junction-relation-command.js';

const EXTENDED_REDUCERS = Object.freeze({
  INSERT_PIPE_SEGMENT: applyPipeSegmentCommand,
  REPLACE_INLINE_COMPONENT: applyTopologyEditInlineReplacement,
  UPDATE_JUNCTION_BRANCH_RELATION: applyTopologyEditJunctionRelation,
});

export function applyResolvedTopologyEditCommand(canonicalTopology, commandInput) {
  assertCanonicalTopologyHash(canonicalTopology);
  const command = assertResolvedTopologyEditCommand(commandInput);
  const reducer = EXTENDED_REDUCERS[command.commandType];
  if (!reducer) return applyLegacyCommand(canonicalTopology, command);
  if (command.basis.priorDraftHash !== canonicalTopologyStateHash(canonicalTopology)) {
    throw new Error(`TopologyEditPureReducerDispatch: ${command.commandType} command is stale.`);
  }
  const topology = JSON.parse(JSON.stringify(canonicalTopology));
  return finalizeCanonicalTopology(reducer(topology, command));
}

export function replayResolvedTopologyEditCommands(baseCanonicalTopology, commands = []) {
  const base = deepFreeze(JSON.parse(JSON.stringify(baseCanonicalTopology)));
  return commands.reduce((topology, command) => (
    applyResolvedTopologyEditCommand(topology, command)
  ), base);
}

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

export function applyResolvedTopologyEditCommand(canonicalTopology, commandInput) {
  assertCanonicalTopologyHash(canonicalTopology);
  const command = assertResolvedTopologyEditCommand(commandInput);
  if (command.commandType !== 'INSERT_PIPE_SEGMENT') {
    return applyLegacyCommand(canonicalTopology, command);
  }
  if (command.basis.priorDraftHash !== canonicalTopologyStateHash(canonicalTopology)) {
    throw new Error('TopologyEditPureReducerDispatch: pipe command is stale.');
  }
  const topology = JSON.parse(JSON.stringify(canonicalTopology));
  return finalizeCanonicalTopology(applyPipeSegmentCommand(topology, command));
}

export function replayResolvedTopologyEditCommands(baseCanonicalTopology, commands = []) {
  const base = deepFreeze(JSON.parse(JSON.stringify(baseCanonicalTopology)));
  return commands.reduce((topology, command) => (
    applyResolvedTopologyEditCommand(topology, command)
  ), base);
}

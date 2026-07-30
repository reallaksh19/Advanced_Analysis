/**
 * LFEA SVG Command Gateway Binding
 * Binds EngineeringSvgCommandGateway to LFEA source revision validation.
 */
import { createEngineeringSvgCommandGateway } from './core/engineering-svg-command-gateway.js';

export function createLfeaSvgCommandGateway({ getRevision, executeCommand }) {
  return createEngineeringSvgCommandGateway({
    getCurrentRevision: getRevision,
    execute: executeCommand,
  });
}

import { LINEAR_FEA_UNITS } from '../linear-fea-contract/units.js';
import { compileLinearPipingInterfaceSet as compileBase } from './interface-set.js';
import {
  computeInterfaceRecoveryEvidenceHash,
  computeInterfaceRecoverySemanticHash,
  recoverLinearPipingInterfaceLoads as recoverBase,
  requireLinearPipingInterfaceRecovery,
} from './recovery.js';
import { failInterface } from './contracts.js';

export function compileLinearPipingInterfaceSet(input) {
  for (const [index, definition] of (input?.definitions ?? []).entries()) {
    requireFinitePoint(definition?.basis?.origin, `definitions[${index}].basis.origin`);
    requireFinitePoint(definition?.referencePointGlobal, `definitions[${index}].referencePointGlobal`);
    requireFinitePoint(
      definition?.leverReferenceToNodeLocal,
      `definitions[${index}].leverReferenceToNodeLocal`,
    );
  }
  return compileBase(input);
}

export function recoverLinearPipingInterfaceLoads(input) {
  const base = recoverBase(input);
  const draft = {
    ...base,
    units: Object.freeze({
      force: LINEAR_FEA_UNITS.force,
      moment: LINEAR_FEA_UNITS.moment,
      length: LINEAR_FEA_UNITS.length,
    }),
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = computeInterfaceRecoverySemanticHash(draft);
  draft.evidenceHash = computeInterfaceRecoveryEvidenceHash(draft);
  return requireLinearPipingInterfaceRecovery(draft);
}

function requireFinitePoint(point, field) {
  if (!point || typeof point !== 'object' || Array.isArray(point)) {
    failInterface(`${field} must be a point record.`, 'PIPING_INTERFACE_POINT_INVALID');
  }
  for (const component of ['x', 'y', 'z']) {
    if (!Number.isFinite(point[component])) {
      failInterface(`${field}.${component} must be finite.`, 'PIPING_INTERFACE_POINT_INVALID');
    }
  }
}

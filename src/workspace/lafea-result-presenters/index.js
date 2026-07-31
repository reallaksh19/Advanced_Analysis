/**
 * Single dispatch boundary for retained LAFEA presenter contracts.
 *
 * Stage-to-presenter and stage-to-unit ownership is declared by the governed
 * stage registry. LAFEA.6 has no qualified result contract or presenter and
 * fails closed at this boundary.
 */
import { requireLafeaStageRegistryEntry } from '../lafea-stage-registry.js';
import { presentAttachmentScreening } from './attachment-screening.js';
import { presentLocalContinuum } from './local-continuum.js';
import { presentLocalShell } from './local-shell.js';
import { presentLocalStress } from './local-stress.js';
import { presentTrunnionFootprint } from './trunnion-footprint.js';

const PRESENTERS_BY_ROLE = Object.freeze({
  ATTACHMENT_FOUNDATION_EVIDENCE: presentLocalStress,
  PIPE_SECTION_SCREENING_EVIDENCE: presentAttachmentScreening,
  CONTINUUM_RESULT_EVIDENCE: presentLocalContinuum,
  SHELL_RESULT_EVIDENCE: presentLocalShell,
  TRUNNION_FOOTPRINT_EVIDENCE: presentTrunnionFootprint,
});

const UNIT_RESOLVERS_BY_ROLE = Object.freeze({
  DOCUMENT_UNITS: (documentValue) => documentValue?.units,
  FOUNDATION_CANONICAL_UNITS: (documentValue) => documentValue?.sourceEvidence
    ?.foundationModel?.units?.canonical,
  SHELL_TEMPLATE_UNITS: (documentValue) => documentValue?.shellTemplate?.units,
});

export function presentLafeaResult(stageId, result, units) {
  const entry = requireLafeaStageRegistryEntry(stageId);
  if (!entry.resultContractRole || entry.presenterRole === 'UNSUPPORTED_STAGE_DIAGNOSTIC') {
    throw unsupportedStagePresenterError(entry);
  }
  const presenter = PRESENTERS_BY_ROLE[entry.presenterRole];
  if (!presenter) {
    throw new TypeError(`No LAFEA presenter is registered for role ${entry.presenterRole}.`);
  }
  return presenter(result, units);
}

export function resolveLafeaUnits(stageId, documentValue) {
  const entry = requireLafeaStageRegistryEntry(stageId);
  if (!entry.unitSourceRole) throw unsupportedStagePresenterError(entry);
  const resolver = UNIT_RESOLVERS_BY_ROLE[entry.unitSourceRole];
  if (!resolver) {
    throw new TypeError(`No LAFEA unit resolver is registered for role ${entry.unitSourceRole}.`);
  }
  const units = resolver(documentValue);
  if (!units || typeof units !== 'object') {
    throw new TypeError(`${entry.stageId} source document has no explicit units.`);
  }
  return Object.freeze({
    length: units.length,
    force: units.force,
    moment: units.moment,
    stress: units.stress ?? units.pressure ?? units.modulus,
    rotation: units.rotation,
  });
}

function unsupportedStagePresenterError(entry) {
  const error = new TypeError(`${entry.stageId} has no qualified result presenter.`);
  error.code = 'UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED';
  return error;
}

import { derivePressureStressContributionFromCustody } from '../linear-piping-code-application/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { inputXmlB31Failure as fail } from './inputxml-linear-b31-error.js';
import { compareAscii, isInputXmlB31RangeCategory } from './inputxml-linear-b31-definition.js';

export function resolveInputXmlB31Pressure(
  category,
  derived,
  sectionResolution,
  elementId,
) {
  if (isInputXmlB31RangeCategory(category)) return {
    contribution: null,
    custodyIds: [],
  };
  const rows = derived.pressureCustody.filter((row) => row.elementId === elementId);
  if (rows.some((row) => row.candidateId !== null)) fail(
    'Envelope pressure custody cannot supply a single B31 equilibrium check.',
    'INPUTXML_B31_ENVELOPE_NOT_EQUILIBRIUM',
  );
  if (rows.length === 0) return {
    contribution: {
      value: 0,
      source: `INPUTXML-NO-PRESSURE:${derived.semanticHash}:${elementId}`,
    },
    custodyIds: [],
  };
  const contributions = rows.map((row) => {
    if (typeof row.factor !== 'number' || !Number.isFinite(row.factor)) fail(
      `Pressure custody ${row.custodyId} factor is invalid.`,
      'INPUTXML_B31_PRESSURE_CUSTODY_INVALID',
    );
    const resolved = derivePressureStressContributionFromCustody({
      pressureCustody: row,
      sectionResolution,
    });
    return {
      custodyId: row.custodyId,
      factor: row.factor,
      primitiveSemanticHash: row.primitiveSemanticHash,
      value: resolved.value,
      source: resolved.source,
    };
  }).sort((left, right) => compareAscii(left.custodyId, right.custodyId));
  const value = contributions.reduce(
    (sum, row) => sum + row.factor * row.value,
    0,
  );
  if (!Number.isFinite(value)) fail(
    'Combined InputXML pressure stress is non-finite.',
    'INPUTXML_B31_NONFINITE',
  );
  return {
    contribution: {
      value,
      source: `INPUTXML-DERIVED-PRESSURE:${semanticHash(contributions)}`,
    },
    custodyIds: contributions.map((row) => row.custodyId),
  };
}

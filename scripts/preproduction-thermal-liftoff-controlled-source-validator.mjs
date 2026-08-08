import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../src/core/shared-piping-model/immutable.js';
import { requireControlledThermalLiftoffSourceQualification } from './preproduction-thermal-liftoff-controlled-source-adapter.mjs';

/**
 * Independent receipt re-derivation for the qualification-only source adapter.
 * This deliberately does more than verify the outer semantic hash: the source
 * rows must agree with the accepted PR #938 displacement/stiffness children and
 * the summary must be arithmetically current.
 */
export function requireControlledThermalLiftoffSourceQualificationIndependently(value) {
  const accepted = requireControlledThermalLiftoffSourceQualification(value);
  const displacementBySite = uniqueIndex(accepted.displacements, 'supportSiteId');
  const stiffnessBySite = uniqueIndex(accepted.stiffnessEntries, 'supportSiteId');
  const rowSites = [];

  for (const row of accepted.sourceRows) {
    const { semanticHash: rowHash, ...rowMaterial } = row;
    if (rowHash !== semanticHash(rowMaterial)) throw coded('TL_CONTROLLED_SOURCE_ROW_HASH_MISMATCH');
    if (rowSites.includes(row.supportSiteId)) throw coded('TL_CONTROLLED_SOURCE_ROW_DUPLICATE');
    rowSites.push(row.supportSiteId);
    const displacement = displacementBySite.get(row.supportSiteId);
    const stiffness = stiffnessBySite.get(row.supportSiteId);
    if (!displacement || !stiffness) throw coded('TL_CONTROLLED_SOURCE_ROW_CHILD_MISSING');
    if (row.displacementSemanticHash !== displacement.semanticHash
        || row.stiffnessSemanticHash !== stiffness.semanticHash
        || row.effectiveVerticalStiffnessNPerM !== stiffness.data.effectiveVerticalStiffnessNPerM) {
      throw coded('TL_CONTROLLED_SOURCE_ROW_CHILD_MISMATCH');
    }
  }

  const expectedSites = [...displacementBySite.keys()].sort(ascii);
  if (JSON.stringify(expectedSites) !== JSON.stringify([...stiffnessBySite.keys()].sort(ascii))
      || JSON.stringify(expectedSites) !== JSON.stringify([...rowSites].sort(ascii))) {
    throw coded('TL_CONTROLLED_SOURCE_COVERAGE_MISMATCH');
  }
  const expectedSummary = {
    supportCount: accepted.sourceRows.length,
    qualifiedDisplacementCount: accepted.displacements.length,
    qualifiedLocalStiffnessCount: accepted.stiffnessEntries.filter((row) => row.tl03LocalStiffnessEligible).length,
  };
  if (semanticHash(accepted.summary) !== semanticHash(expectedSummary)) {
    throw coded('TL_CONTROLLED_SOURCE_SUMMARY_MISMATCH');
  }
  if (accepted.prerequisiteAuthority.contactAuthoritySemanticHash !== accepted.contactAuthoritySemanticHash
      || accepted.prerequisiteAuthority.reactionToleranceSemanticHash !== accepted.reactionToleranceSemanticHash) {
    throw coded('TL_CONTROLLED_SOURCE_PREREQUISITE_BINDING_MISMATCH');
  }
  if (accepted.prerequisiteBridge.sourcePrerequisiteAuthoritySemanticHash !== accepted.prerequisiteAuthority.semanticHash) {
    throw coded('TL_CONTROLLED_SOURCE_BRIDGE_BINDING_MISMATCH');
  }
  return deepFreeze(structuredClone(accepted));
}

function uniqueIndex(rows, key) {
  const map = new Map();
  for (const row of rows) {
    if (map.has(row[key])) throw coded('TL_CONTROLLED_SOURCE_CHILD_DUPLICATE');
    map.set(row[key], row);
  }
  return map;
}

function ascii(a, b) {
  return String(a).localeCompare(String(b), 'en', { numeric: false, sensitivity: 'variant' });
}

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

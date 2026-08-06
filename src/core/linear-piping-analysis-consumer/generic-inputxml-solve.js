import { conditionGeometry } from '../centerline-beam-fea/index.js';
import { DEFAULT_RESTRAINT_TYPE_CODE_MAP } from '../geometry/adapters/inputxml-restraint-type-mutation.js';
import { parseInputXmlToCanonicalGeometry } from './inputxml-source-binding.js';
import {
  INPUTXML_LENGTH_UNIT_REGISTRY_ID,
  LINEAR_PIPING_INPUTXML_UNIT_PROFILE_SCHEMA,
  sealLinearPipingInputXmlUnitProfile,
} from './inputxml-unit-contract.js';
import { normalizeLinearPipingInputXmlGeometry } from './inputxml-unit-normalization.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import {
  DEFAULT_INSTALLATION_TEMPERATURE,
  GRAVITY,
  materialAuthority,
  modelEntries,
  physicalSectionAuthorities,
} from './generic-inputxml-solve-authorities.js';
import { compileModel, constraintDeclarations } from './generic-inputxml-solve-model.js';
import { analyse, nodalResult } from './generic-inputxml-solve-case.js';

export { GRAVITY, DEFAULT_INSTALLATION_TEMPERATURE };

export const GENERIC_INPUTXML_SOLVE_SCHEMA = 'fea-generic-inputxml-solve/v1';

/**
 * Thermal expansion coefficient (1/K) for materials this project has real,
 * citable values for, keyed by the numeric MATERIAL_NUM CAESAR InputXML
 * exports declare (not the MATERIAL_NAME string — that varies in spelling
 * across exports, e.g. "A106 Grade B", while MATERIAL_NUM is the stable
 * CAESAR material database code). Both entries below are confirmed against
 * this project's own benchmark InputXML files and their existing solves:
 * 106 (A106 Grade B) appears in BM1 and BM2; 360 (A334 Grade 6) appears in
 * BM3, which already uses this same 1.17e-5 figure. Do not extend this
 * table with a guessed code/value for an unlisted material — an unresolved
 * material disables the thermal (OPE) case for that model and is
 * disclosed, not silently defaulted.
 */
export const DEFAULT_THERMAL_EXPANSION_COEFFICIENT_BY_MATERIAL = Object.freeze({
  106: 1.17e-5,
  360: 1.17e-5,
});

const CONDITIONING_PROFILE = Object.freeze({
  spanSeedingLimit: { value: 1000, source: 'IXA generic solve preserves one analysis span per source PIPINGELEMENT.' },
  bendSeedingSegments: { value: 4, source: 'IXA generic solve does not condition bends into fitted curvature.' },
  bendLengthErrorLimit: { value: 0.01, source: 'IXA generic solve inherited InputXML conditioning disclosure.' },
});

/**
 * Generic self-weight (+ pressure, + thermal if a citable material alpha is
 * available) solve for any real InputXML -- not tied to a specific
 * benchmark. Reuses the same production compile/solve/recovery modules
 * BM1/BM2/BM3's own fixtures use; genericizes their per-benchmark ID
 * prefixes and hardcoded thermal-expansion constant into a small, explicit,
 * disclosed material table (see DEFAULT_THERMAL_EXPANSION_COEFFICIENT_BY_MATERIAL).
 *
 * Restraint mechanics here are a real, disclosed simplification versus the
 * true unilateral complementarity mechanics PR #698 built specifically for
 * BM2: +Y/+Z-style unilateral restraints are linearized to a full fixed
 * constraint in their declared direction. This is what BM2's own first
 * solve (M027, before M031) also did, and is named explicitly in the
 * returned report's limitations.
 *
 * Throws only for genuinely invalid input (bad XML, missing units). A real
 * mechanism/rank-deficient system throws from the underlying solver with
 * its own diagnostic (named free DOF) -- that is not caught or hidden here.
 */
export function solveInputXmlGeneric(xmlText, options) {
  if (typeof xmlText !== 'string' || xmlText.trim().length === 0) {
    throw new TypeError('solveInputXmlGeneric requires non-empty InputXML text.');
  }
  const opts = options ?? {};
  const modelId = opts.modelId ?? 'IXA';
  const restraintTypeCodeMap = { ...DEFAULT_RESTRAINT_TYPE_CODE_MAP, ...(opts.restraintTypeCodeMap ?? {}) };
  const source = {
    sourceId: `${modelId}-SOURCE`,
    sourceRevision: semanticHash({ content: xmlText }),
    semanticHash: semanticHash({ content: xmlText }),
  };
  const parsedGeometry = parseInputXmlToCanonicalGeometry(xmlText, {
    unit: opts.unit,
    source: modelId,
    fileName: opts.fileName ?? null,
    restraintTypeCodeMap,
    bendRadiusTolerance: opts.bendRadiusTolerance ?? 1e-6,
  });
  if (!parsedGeometry.valid) {
    const error = new Error('Geometry ingestion reported fatal diagnostics; solve refused.');
    error.code = 'GENERIC_SOLVE_GEOMETRY_INVALID';
    error.diagnostics = parsedGeometry.diagnostics.filter((row) => row.severity === 'error');
    throw error;
  }
  const sourceUnit = parsedGeometry.summary.inputXmlLengthUnit;
  const unitProfile = sealLinearPipingInputXmlUnitProfile({
    schema: LINEAR_PIPING_INPUTXML_UNIT_PROFILE_SCHEMA,
    profileId: 'IXA-GENERIC-SOLVE-UNIT-R1',
    registryId: INPUTXML_LENGTH_UNIT_REGISTRY_ID,
    allowedSourceUnits: [sourceUnit],
    sourceEvidence: {
      authority: 'CAESAR-II-INPUTXML-UNITS-BLOCK',
      documentId: opts.fileName ?? modelId,
      revision: source.sourceRevision,
      sourceSemanticHash: source.semanticHash,
    },
    semanticHash: '',
  });
  const geometry = normalizeLinearPipingInputXmlGeometry(parsedGeometry, unitProfile).geometry;

  const materialNames = [...new Set(geometry.segments.map((segment) => segment.meta.materialNumber).filter(Boolean))];
  const resolvedAlphaMaterial = materialNames.find((name) => name in DEFAULT_THERMAL_EXPANSION_COEFFICIENT_BY_MATERIAL) ?? null;
  const thermalExpansionCoefficient = resolvedAlphaMaterial
    ? DEFAULT_THERMAL_EXPANSION_COEFFICIENT_BY_MATERIAL[resolvedAlphaMaterial]
    : null;
  const thermalAvailable = thermalExpansionCoefficient !== null && materialNames.length <= 1;

  const material = materialAuthority(geometry, source, modelId, thermalExpansionCoefficient);
  const physicalSections = physicalSectionAuthorities(geometry, source, modelId);
  const entries = modelEntries(geometry, physicalSections, modelId, thermalExpansionCoefficient);
  const { declarations: constraints, unresolvedRestraintNodes } = constraintDeclarations(geometry, modelId);
  const conditioned = conditionGeometry(geometry, [], CONDITIONING_PROFILE);
  const compilation = compileModel({ modelId, source, conditioned, geometry, material, entries, constraints });

  const sustained = analyse({ modelId, geometry, entries, material, compilation, label: 'SUS', thermal: false, thermalExpansionCoefficient });
  let operating = null;
  if (thermalAvailable) {
    operating = analyse({ modelId, geometry, entries, material, compilation, label: 'OPE', thermal: true, thermalExpansionCoefficient });
  }

  const limitations = [
    { code: 'GENERIC_SOLVE_BEND_CHORD_STIFFNESS_ONLY', cause: 'Each PIPINGELEMENT is retained as one straight frame chord; CAESAR internal bend stations and B31 bend flexibility are not applied. Matches BM1/BM2/BM3\'s own documented pre-refinement solves.' },
    { code: 'GENERIC_SOLVE_UNILATERAL_RESTRAINT_LINEARIZED', cause: '+Y/+Z-style unilateral (one-directional) restraints are linearized to a full fixed constraint rather than solved as true gap/complementarity contacts.' },
    { code: 'GENERIC_SOLVE_CODE_STRESS_NOT_COMPUTED', cause: 'This solve reports displacement and restraint-reaction resultants only; B31 code stress evaluation is not run here.' },
  ];
  if (!thermalAvailable) {
    limitations.push({
      code: 'GENERIC_SOLVE_THERMAL_CASE_UNAVAILABLE',
      cause: materialNames.length > 1
        ? `Multiple distinct materials declared (${materialNames.join(', ')}); a single-alpha thermal case is not attempted.`
        : materialNames.length === 0
          ? 'No MATERIAL_NAME resolved from this file; thermal expansion coefficient cannot be looked up.'
          : `Material "${materialNames[0]}" has no citable thermal expansion coefficient in this project's default table; only the sustained (weight + pressure) case is solved.`,
    });
  }
  if (unresolvedRestraintNodes.length > 0) {
    limitations.push({
      code: 'GENERIC_SOLVE_UNRESOLVED_RESTRAINT_OMITTED',
      cause: `${unresolvedRestraintNodes.length} restraint(s) remain UNKNOWN after classification and are omitted from the model rather than guessed: ${unresolvedRestraintNodes.map((row) => `node ${row.nodeId} (type ${row.sourceTypeCode}→${row.typeCode})`).join('; ')}.`,
    });
  }

  return Object.freeze({
    schema: GENERIC_INPUTXML_SOLVE_SCHEMA,
    modelId,
    sourceSemanticHash: source.semanticHash,
    thermalCaseAvailable: thermalAvailable,
    thermalExpansionCoefficient,
    thermalMaterial: resolvedAlphaMaterial,
    limitations: Object.freeze(limitations),
    nodes: geometry.nodes.map((node) => ({
      sourceNodeId: node.id,
      restraint: node.restraint,
      position: { x: node.x, y: node.y, z: node.z },
      sustained: nodalResult(sustained, `${modelId}.N${node.id}`),
      operating: operating ? nodalResult(operating, `${modelId}.N${node.id}`) : null,
    })),
    elements: entries.map((entry) => ({
      sourceElementId: entry.sourceSegment.id,
      fromNode: entry.sourceSegment.startNodeId,
      toNode: entry.sourceSegment.endNodeId,
      bendTagged: entry.sourceSegment.meta.bendDeclaredRadius != null,
      rigid: entry.rigidAuthority !== null,
    })),
  });
}

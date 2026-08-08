import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord, stringValue } from '../src/core/shared-piping-model/immutable.js';
import { requirePhysicalLoadCase } from '../src/core/linear-fea-load-case/index.js';
import { requireSolverExecution } from '../src/core/linear-fea-solver/index.js';
import { requirePreproductionSupportContactAuthority } from '../src/workspace/engineering-loads/preproduction-support-contact-authority.js';
import {
  createPreproductionThermalLiftoffApplicabilityBinding,
  createPreproductionThermalLiftoffStiffnessEvidence,
  requirePreproductionThermalLiftoffStiffnessEvidence,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-mechanics-authority.js';

export const PREPRODUCTION_TL_CONTROLLED_INFLUENCE_SCHEMA =
  'engineering-preproduction-thermal-liftoff-controlled-influence-qualification/v1';

const FRAME_MATERIAL = { basis: 'GLOBAL_XYZ_Z_UP', verticalUnitVector: { x: 0, y: 0, z: 1 } };
const FRAME = deepFreeze({ ...FRAME_MATERIAL, semanticHash: semanticHash(FRAME_MATERIAL) });

/**
 * Qualification-only TL-02 influence producer.
 *
 * It validates already-sealed linear-FEA zero/unit-force probe pairs and
 * derives the complete reduced vertical flexibility operator. It never runs
 * the source solver and is intentionally kept under scripts/ so ordinary TL
 * runtime has no LFEA dependency.
 */
export function buildControlledThermalLiftoffInfluenceQualification(input) {
  exact(input, ['contactAuthority', 'supportMappings', 'probePairs', 'source', 'benchmarkReference'], 'controlled influence input');
  const contact = requirePreproductionSupportContactAuthority(input.contactAuthority);
  if (contact.status !== 'READY_FOR_PREPRODUCTION_CONTACT_AUTHORITY') throw coded('TL_INFLUENCE_CONTACT_AUTHORITY_BLOCKED');
  const source = sourceIdentity(input.source);
  if (source.sourceKind !== 'SOURCE_SOLVER') throw coded('TL_INFLUENCE_SOURCE_KIND_INVALID');
  const benchmarkReference = benchmark(input.benchmarkReference);

  const rows = contact.rows
    .filter((row) => row.tl03Status === 'READY_FOR_TL03_CONTACT_INTAKE')
    .sort((a, b) => a.routeChainageMm - b.routeChainageMm || ascii(a.supportSiteId, b.supportSiteId));
  if (rows.length < 2) throw coded('TL_INFLUENCE_COUPLED_SITE_COUNT_INSUFFICIENT');
  const rowBySite = uniqueIndex(rows, 'supportSiteId', 'contact rows');
  const mappings = indexedList(input.supportMappings, supportMapping, 'support mappings');
  const probes = indexedList(input.probePairs, probePair, 'probe pairs');
  exactCoverage(rowBySite, mappings, 'TL_INFLUENCE_MAPPING_COVERAGE_MISMATCH');
  exactCoverage(rowBySite, probes, 'TL_INFLUENCE_PROBE_COVERAGE_MISMATCH');

  const nodeIds = rows.map((row) => mappings.get(row.supportSiteId).nodeId);
  if (new Set(nodeIds).size !== nodeIds.length) throw coded('TL_INFLUENCE_NODE_MAPPING_AMBIGUOUS');
  const ordering = rows.map((row) => row.supportSiteId);
  const firstProbe = probes.get(ordering[0]);
  const baseline = sourceState(firstProbe.zeroState, `zeroState:${ordering[0]}`);
  const columns = [];

  for (const supportSiteId of ordering) {
    const mapping = mappings.get(supportSiteId);
    const probe = probes.get(supportSiteId);
    const zero = sourceState(probe.zeroState, `zeroState:${supportSiteId}`);
    const forced = sourceState(probe.forcedState, `forcedState:${supportSiteId}`);
    sameStiffnessState(baseline, zero, 'TL_INFLUENCE_STIFFNESS_STATE_MISMATCH');
    sameStiffnessState(baseline, forced, 'TL_INFLUENCE_STIFFNESS_STATE_MISMATCH');
    const zeroPrimitive = verticalForceProbe(zero.loadCase, mapping.nodeId, true);
    const forcedPrimitive = verticalForceProbe(forced.loadCase, mapping.nodeId, false);
    const deltaForceN = forcedPrimitive.force.fz - zeroPrimitive.force.fz;
    if (!(deltaForceN > 0)) throw coded('TL_INFLUENCE_PROBE_FORCE_INVALID');
    const valuesMPerN = ordering.map((rowSiteId) => {
      const nodeId = mappings.get(rowSiteId).nodeId;
      return (displacement(forced.execution, nodeId, 'UZ') - displacement(zero.execution, nodeId, 'UZ')) / deltaForceN;
    });
    columns.push(deepFreeze({
      supportSiteId,
      nodeId: mapping.nodeId,
      probeForceN: deltaForceN,
      zeroLoadCaseSemanticHash: zero.loadCase.semanticHash,
      forcedLoadCaseSemanticHash: forced.loadCase.semanticHash,
      zeroExecutionSemanticHash: zero.execution.semanticHash,
      forcedExecutionSemanticHash: forced.execution.semanticHash,
      valuesMPerN,
      semanticHash: semanticHash({
        supportSiteId,
        nodeId: mapping.nodeId,
        probeForceN: deltaForceN,
        zeroLoadCaseSemanticHash: zero.loadCase.semanticHash,
        forcedLoadCaseSemanticHash: forced.loadCase.semanticHash,
        zeroExecutionSemanticHash: zero.execution.semanticHash,
        forcedExecutionSemanticHash: forced.execution.semanticHash,
        valuesMPerN,
      }),
    }));
  }

  const matrix = ordering.map((_, rowIndex) => columns.map((column) => finite(column.valuesMPerN[rowIndex], `matrix[${rowIndex}]`)));
  matrix.forEach((row, index) => {
    if (!(row[index] > 0)) throw coded('TL_INFLUENCE_DIAGONAL_NONPOSITIVE');
  });
  const firstRow = rows[0];
  const applicability = createPreproductionThermalLiftoffApplicabilityBinding({
    applicabilityId: `TL02-CONTROLLED-INFLUENCE:${contact.semanticHash}`,
    supportSiteId: firstRow.supportSiteId,
    classId: 'TL-B',
    templateId: 'CONTROLLED_LFEA_UNIT_FORCE_REDUCED_VERTICAL_FLEXIBILITY_V1',
    templateRevision: source.sourceRevision,
    contactAuthoritySemanticHash: contact.semanticHash,
    contactRowSemanticHash: firstRow.semanticHash,
    geometrySemanticHash: baseline.execution.mechanicalModelSemanticHash,
    supportCapabilitySemanticHash: semanticHash({
      contactAuthoritySemanticHash: contact.semanticHash,
      supportRows: rows.map((row) => ({ supportSiteId: row.supportSiteId, semanticHash: row.semanticHash })),
    }),
    linePropertySemanticHash: baseline.execution.stiffnessStateHash,
    coordinateFrameSemanticHash: FRAME.semanticHash,
    source,
  });
  const matrixEvidence = createPreproductionThermalLiftoffStiffnessEvidence({
    entryId: `TL02-CONTROLLED-FLEX:${contact.semanticHash}`,
    supportSiteId: firstRow.supportSiteId,
    representation: 'REDUCED_VERTICAL_FLEXIBILITY_MATRIX_EVIDENCE',
    data: { kind: 'MATRIX', values: matrix },
    units: 'M_PER_N',
    ordering,
    source,
    benchmarkReference,
    applicability,
    qualification: 'QUALIFIED',
  });
  if (matrixEvidence.qualification !== 'QUALIFIED') throw coded('TL_INFLUENCE_MATRIX_EVIDENCE_UNQUALIFIED');

  let maxReciprocityResidualMPerN = 0;
  for (let i = 0; i < matrix.length; i += 1) {
    for (let j = i + 1; j < matrix.length; j += 1) {
      maxReciprocityResidualMPerN = Math.max(maxReciprocityResidualMPerN, Math.abs(matrix[i][j] - matrix[j][i]));
    }
  }
  const material = {
    schema: PREPRODUCTION_TL_CONTROLLED_INFLUENCE_SCHEMA,
    status: 'QUALIFIED_CONTROLLED_SOURCE_INFLUENCE',
    contactAuthoritySemanticHash: contact.semanticHash,
    mechanicalModelSemanticHash: baseline.execution.mechanicalModelSemanticHash,
    stiffnessStateHash: baseline.execution.stiffnessStateHash,
    solverProfileSemanticHash: baseline.execution.solverProfileSemanticHash,
    coordinateFrame: FRAME,
    ordering,
    sourceColumns: columns,
    matrixEvidence,
    summary: {
      supportCount: ordering.length,
      probePairCount: columns.length,
      offDiagonalCouplingPresent: matrix.some((row, i) => row.some((value, j) => i !== j && value !== 0)),
      maxReciprocityResidualMPerN,
    },
    policy: {
      qualificationOnly: true,
      sourceSolverExecutedByAdapter: false,
      srcRuntimeDependencyCreated: false,
      localScalarStiffnessInferredFromMatrix: false,
      matrixEvidenceAutomaticallyPromotedToProduction: false,
      localScreenExecutionPerformed: false,
      activeSetRedistributionPerformed: false,
      productionCalculationConsumptionEnabled: false,
      productionMethodRegistrationPermitted: false,
      finalHotReactionPublicationPermitted: false,
    },
  };
  return requireControlledThermalLiftoffInfluenceQualification(freezeHash(material));
}

export function requireControlledThermalLiftoffInfluenceQualification(value) {
  if (value?.schema !== PREPRODUCTION_TL_CONTROLLED_INFLUENCE_SCHEMA) throw coded('TL_CONTROLLED_INFLUENCE_SCHEMA_INVALID');
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) throw coded('TL_CONTROLLED_INFLUENCE_HASH_MISMATCH');
  requirePreproductionThermalLiftoffStiffnessEvidence(value.matrixEvidence);
  if (value.matrixEvidence.semanticHash !== value.matrixEvidence.semanticHash || value.matrixEvidence.representation !== 'REDUCED_VERTICAL_FLEXIBILITY_MATRIX_EVIDENCE') {
    throw coded('TL_CONTROLLED_INFLUENCE_MATRIX_INVALID');
  }
  const p = value.policy || {};
  if (p.qualificationOnly !== true
      || p.sourceSolverExecutedByAdapter !== false
      || p.srcRuntimeDependencyCreated !== false
      || p.localScalarStiffnessInferredFromMatrix !== false
      || p.matrixEvidenceAutomaticallyPromotedToProduction !== false
      || p.localScreenExecutionPerformed !== false
      || p.activeSetRedistributionPerformed !== false
      || p.productionCalculationConsumptionEnabled !== false
      || p.productionMethodRegistrationPermitted !== false
      || p.finalHotReactionPublicationPermitted !== false) {
    throw coded('TL_CONTROLLED_INFLUENCE_POLICY_INVALID');
  }
  return deepFreeze(structuredClone(value));
}

function sourceState(value, label) {
  exact(value, ['loadCase', 'execution'], label);
  const loadCase = requirePhysicalLoadCase(value.loadCase);
  const execution = requireSolverExecution(value.execution);
  if (execution.status !== 'QUALIFIED') throw coded('TL_INFLUENCE_EXECUTION_NOT_QUALIFIED');
  if (execution.physicalLoadCaseHash !== loadCase.physicalLoadCaseHash) throw coded('TL_INFLUENCE_LOAD_CASE_BINDING_MISMATCH');
  if (execution.modelIdentity !== loadCase.modelReference.modelIdentity
      || execution.mechanicalModelSemanticHash !== loadCase.modelReference.mechanicalModelSemanticHash
      || execution.stiffnessStateHash !== loadCase.modelReference.stiffnessStateHash) {
    throw coded('TL_INFLUENCE_MODEL_BINDING_MISMATCH');
  }
  return deepFreeze({ loadCase, execution });
}

function sameStiffnessState(a, b, code) {
  if (a.execution.modelIdentity !== b.execution.modelIdentity
      || String(a.execution.modelRevision) !== String(b.execution.modelRevision)
      || a.execution.mechanicalModelSemanticHash !== b.execution.mechanicalModelSemanticHash
      || a.execution.stiffnessStateHash !== b.execution.stiffnessStateHash
      || a.execution.solverProfileSemanticHash !== b.execution.solverProfileSemanticHash) throw coded(code);
}

function verticalForceProbe(loadCase, nodeId, zeroRequired) {
  if (loadCase.loadCaseClass !== 'APPLIED_MECHANICAL' || loadCase.primitives.length !== 1) throw coded('TL_INFLUENCE_PROBE_LOAD_CASE_INVALID');
  const primitive = loadCase.primitives[0];
  if (primitive.kind !== 'NODAL_FORCE_MOMENT' || primitive.nodeId !== nodeId || primitive.basis?.kind !== 'GLOBAL') {
    throw coded('TL_INFLUENCE_PROBE_PRIMITIVE_INVALID');
  }
  if (primitive.force.fx !== 0 || primitive.force.fy !== 0 || primitive.moment.mx !== 0 || primitive.moment.my !== 0 || primitive.moment.mz !== 0) {
    throw coded('TL_INFLUENCE_PROBE_COMPONENT_INVALID');
  }
  if (zeroRequired ? primitive.force.fz !== 0 : !(primitive.force.fz > 0)) throw coded('TL_INFLUENCE_PROBE_FORCE_INVALID');
  if (primitive.signConvention !== 'APPLIED_TO_STRUCTURE') throw coded('TL_INFLUENCE_PROBE_SIGN_INVALID');
  return primitive;
}

function displacement(execution, nodeId, dof) {
  const matches = execution.displacement.filter((entry) => entry.nodeId === nodeId && entry.dof === dof);
  if (matches.length !== 1 || !Number.isFinite(matches[0].value)) throw coded('TL_INFLUENCE_DISPLACEMENT_MISSING');
  return matches[0].value;
}

function supportMapping(value) {
  exact(value, ['supportSiteId', 'nodeId'], 'support mapping');
  return deepFreeze({ supportSiteId: text(value.supportSiteId, 'supportSiteId'), nodeId: text(value.nodeId, 'nodeId') });
}

function probePair(value) {
  exact(value, ['supportSiteId', 'zeroState', 'forcedState'], 'probe pair');
  return deepFreeze({ supportSiteId: text(value.supportSiteId, 'supportSiteId'), zeroState: value.zeroState, forcedState: value.forcedState });
}

function indexedList(values, normalizer, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array.`);
  const map = new Map();
  for (const value of values) {
    const row = normalizer(value);
    if (map.has(row.supportSiteId)) throw coded('TL_INFLUENCE_SITE_DUPLICATE');
    map.set(row.supportSiteId, row);
  }
  return map;
}

function uniqueIndex(values, key, label) {
  const map = new Map();
  for (const value of values) {
    if (map.has(value[key])) throw new TypeError(`${label} contains duplicate ${value[key]}.`);
    map.set(value[key], value);
  }
  return map;
}

function exactCoverage(expected, actual, code) {
  const a = [...expected.keys()].sort(ascii);
  const b = [...actual.keys()].sort(ascii);
  if (JSON.stringify(a) !== JSON.stringify(b)) throw coded(code);
}

function sourceIdentity(value) {
  exact(value, ['sourceId', 'sourceRevision', 'sourceSemanticHash', 'sourceKind'], 'source');
  return deepFreeze({
    sourceId: text(value.sourceId, 'sourceId'),
    sourceRevision: text(value.sourceRevision, 'sourceRevision'),
    sourceSemanticHash: hash(value.sourceSemanticHash, 'sourceSemanticHash'),
    sourceKind: text(value.sourceKind, 'sourceKind'),
  });
}

function benchmark(value) {
  exact(value, ['benchmarkId', 'benchmarkRevision', 'benchmarkSemanticHash'], 'benchmark');
  return deepFreeze({
    benchmarkId: text(value.benchmarkId, 'benchmarkId'),
    benchmarkRevision: text(value.benchmarkRevision, 'benchmarkRevision'),
    benchmarkSemanticHash: hash(value.benchmarkSemanticHash, 'benchmarkSemanticHash'),
  });
}

function freezeHash(material) { return deepFreeze({ ...material, semanticHash: semanticHash(material) }); }
function exact(value, keys, label) { if (!isPlainRecord(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new TypeError(`${label} contains unexpected or missing keys.`); }
function text(value, label) { const s = stringValue(value); if (!s) throw new TypeError(`${label} must be non-empty.`); return s; }
function hash(value, label) { if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) throw new TypeError(`${label} must be an FNV hash.`); return value; }
function finite(value, label) { if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`); return value; }
function ascii(a, b) { return String(a).localeCompare(String(b), 'en', { numeric: false, sensitivity: 'variant' }); }
function coded(code) { const error = new Error(code); error.code = code; return error; }

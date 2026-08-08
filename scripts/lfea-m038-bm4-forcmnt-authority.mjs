const EXPECTED_NODE_IDS = Object.freeze([
  '20120', '20330', '20340', '20500', '20690', '20700',
  '21430', '21590', '21600', '21720', '22250', '22350',
]);

export const BM4_M038_FORCMNT_NODE_IDS = EXPECTED_NODE_IDS;

export const BM4_M038_FORCMNT_AUTHORITY = Object.freeze({
  schema: 'm038-bm4-forcmnt-authority/v1',
  benchmark: 'BM4',
  accdbSource: '3e5c5e20d9e8741faa08be4360cb7f79498f87b6:benchmarks/LFEA/BM4/BM4 accdb.zip',
  inputTable: 'INPUT_FORCMNT',
  outputCaseEvidence: Object.freeze({
    sustained: 'CASE 19 (SUS) W+P1',
    operating: 'CASE 20 (OPE) W+T1+P1',
    expansion: 'CASE 21 (EXP) L21=L20-L19',
  }),
  membershipRule: 'BM4_INPUT_FORCMNT_IS_BASE_W_AND_THEREFORE_PRESENT_IDENTICALLY_IN_CASE_19_AND_CASE_20_V1',
  expansionRule: 'CASE_21_DERIVES_AS_CASE_20_MINUS_CASE_19_SO_IDENTICAL_FORCMNT_CANCELS_V1',
  expectedRealVectorRows: 12,
  expectedNodeIds: EXPECTED_NODE_IDS,
  evidenceBoundary: 'BM4_ONLY_DO_NOT_GENERALIZE_INPUTXML_FORCMNT_MEMBERSHIP_WITHOUT_CASE_AUTHORITY',
});

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function vectorComponents(vector) {
  return Object.freeze({
    fx: finiteOrNull(vector?.force?.fx),
    fy: finiteOrNull(vector?.force?.fy),
    fz: finiteOrNull(vector?.force?.fz),
    mx: finiteOrNull(vector?.moment?.mx),
    my: finiteOrNull(vector?.moment?.my),
    mz: finiteOrNull(vector?.moment?.mz),
  });
}

function hasRealComponent(components) {
  return Object.values(components).some((value) => value !== null);
}

function sameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Compile the BM4 InputXML FORCE/MOMENT evidence into explicit global nodal
 * load primitives. The vector values come from the existing InputXML parser;
 * only case membership comes from the independently queried BM4 ACCDB.
 *
 * This helper is deliberately benchmark-scoped. It must not become a generic
 * rule that every CAESAR InputXML FORCMNT belongs to W.
 */
export function bm4BaseWForcmntPrimitives({
  baseEntries,
  loadCaseId,
  nodeIdPrefix,
  sourceEvidence,
}) {
  if (!Array.isArray(baseEntries)) throw new TypeError('BM4 M038 FORCMNT compilation requires baseEntries.');
  if (typeof sourceEvidence !== 'function') throw new TypeError('BM4 M038 FORCMNT compilation requires sourceEvidence().');

  const rows = [];
  const seen = new Map();
  for (const entry of baseEntries) {
    const sourceSegment = entry?.sourceSegment ?? entry?.sourceEntry?.sourceSegment;
    for (const forceMoment of sourceSegment?.meta?.analysis?.forcesMoments ?? []) {
      const sourceNodeId = String(forceMoment?.nodeId ?? sourceSegment.endNodeId);
      for (const vector of forceMoment?.vectors ?? []) {
        const components = vectorComponents(vector);
        if (!hasRealComponent(components)) continue;
        const key = `${forceMoment?.forceMomentNumber ?? 'FM'}:${sourceNodeId}:${vector?.number ?? 'V'}`;
        const signature = JSON.stringify(components);
        if (seen.has(key)) {
          if (seen.get(key) !== signature) throw new Error(`BM4 M038 conflicting FORCMNT duplicate ${key}.`);
          continue;
        }
        seen.set(key, signature);
        rows.push(Object.freeze({
          sourceNodeId,
          forceMomentNumber: forceMoment?.forceMomentNumber ?? null,
          vectorNumber: vector?.number ?? null,
          components,
        }));
      }
    }
  }

  rows.sort((left, right) => left.sourceNodeId.localeCompare(right.sourceNodeId));
  const nodeIds = rows.map((row) => row.sourceNodeId);
  if (rows.length !== BM4_M038_FORCMNT_AUTHORITY.expectedRealVectorRows) {
    throw new Error(`BM4 M038 expected 12 real FORCMNT vectors; found ${rows.length}.`);
  }
  if (!sameStringArray(nodeIds, EXPECTED_NODE_IDS)) {
    throw new Error(`BM4 M038 FORCMNT node inventory drift: ${nodeIds.join(',')}.`);
  }

  return Object.freeze(rows.map((row) => Object.freeze({
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: `${loadCaseId}-FORCMNT-${row.sourceNodeId}-F${row.forceMomentNumber ?? 'X'}-V${row.vectorNumber ?? 'X'}`,
    kind: 'NODAL_FORCE_MOMENT',
    nodeId: `${nodeIdPrefix}${row.sourceNodeId}`,
    basis: Object.freeze({ kind: 'GLOBAL' }),
    force: Object.freeze({
      fx: row.components.fx ?? 0,
      fy: row.components.fy ?? 0,
      fz: row.components.fz ?? 0,
    }),
    moment: Object.freeze({
      mx: row.components.mx ?? 0,
      my: row.components.my ?? 0,
      mz: row.components.mz ?? 0,
    }),
    units: Object.freeze({ force: 'N', moment: 'N*m', length: 'm' }),
    signConvention: 'APPLIED_TO_STRUCTURE',
    sourceEvidence: sourceEvidence({
      sourceId: 'CAESAR-II-BM4-M038-FORCMNT-BASE-W',
      sourceRevision: `${BM4_M038_FORCMNT_AUTHORITY.accdbSource}:${BM4_M038_FORCMNT_AUTHORITY.membershipRule}:${row.sourceNodeId}:${row.vectorNumber}`,
      sourceNodeId: row.sourceNodeId,
      forceMomentNumber: row.forceMomentNumber,
      vectorNumber: row.vectorNumber,
      vector: row.components,
    }),
  })));
}

export function bm4ForcmntMechanicalSignature(primitives) {
  return Object.freeze(primitives
    .filter((row) => row.kind === 'NODAL_FORCE_MOMENT')
    .map((row) => Object.freeze({ nodeId: row.nodeId, vector: row.vector ?? null }))
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId)));
}

import { readFileSync } from 'node:fs';
import { findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import {
  buildAnvilVariableSpringCatalog,
  compileProgrammedVariableSpringHanger,
  selectProgrammedVariableSpringHanger,
} from '../src/core/linear-fea-variable-spring-hanger/index.js';
import {
  BM3_BASE_CASES,
  BM3_SOURCE_ID,
  CASE_KEYS,
  analyseBaseCase,
  buildBm3Authorities,
  buildReport,
  differenceCase,
  sourceEvidence,
} from './lfea-m028-bm3-fixtures.mjs';
import { BM3_OUTPUT_PATH, buildBm3CiiComparison } from './lfea-m028-bm3-comparison.mjs';

const DESIGN_WEIGHT_POLICY = Object.freeze({ temperatureField: null, thermal: false, formula: 'W' });
const DESIGN_TRAVEL_POLICY = Object.freeze({ temperatureField: 'operatingTemperature', thermal: true, formula: 'W+T1+P1+H_DESIGN' });

export function solveBm3WithProgrammedHangers({ compareLegacyOutput = false } = {}) {
  const sourceAuthorities = buildBm3Authorities({
    modelIdentity: 'BM3-M029-HANGER-SOURCE',
    modelRevision: 1,
  });
  const declarations = discoverProgrammedHangers(sourceAuthorities);
  const restrainedAuthorities = buildBm3Authorities({
    additionalConstraintDeclarations: declarations.map((row) => ({
      declarationId: `M029-${row.nodeId}-RESTRAINED-WEIGHT-UY`,
      kind: 'NODAL_RESTRAINT',
      nodeId: row.kernelNodeId,
      dof: 'UY',
      behavior: 'FIXED',
    })),
    modelIdentity: 'BM3-M029-HANGER-RESTRAINED-WEIGHT',
    modelRevision: 1,
  });
  const restrainedWeight = analyseBaseCase(
    restrainedAuthorities,
    'M029_RESTRAINED_WEIGHT',
    DESIGN_WEIGHT_POLICY,
    { description: 'M029 programmed-hanger restrained-weight design solve.' },
  );

  const requiredHotLoads = new Map(declarations.map((row) => {
    const reaction = restrainedWeight.execution.reactions.find(
      (entry) => entry.nodeId === row.kernelNodeId && entry.dof === 'UY',
    );
    if (!reaction || !(reaction.value > 0)) {
      throw new Error(`M029 restrained-weight solve did not produce a positive UY design load at node ${row.nodeId}.`);
    }
    return [row.nodeId, reaction.value];
  }));

  const travelAuthorities = buildBm3Authorities({
    modelIdentity: 'BM3-M029-HANGER-OPERATING-TRAVEL',
    modelRevision: 1,
  });
  const designHotLoadPrimitives = declarations.map((row) => nodalForcePrimitive({
    primitiveId: `M029-HANGER-${row.nodeId}-DESIGN-HOT-LOAD`,
    nodeId: row.kernelNodeId,
    fy: requiredHotLoads.get(row.nodeId),
    sourceRevision: `${row.nodeId}:${requiredHotLoads.get(row.nodeId)}`,
  }));
  const operatingTravel = analyseBaseCase(
    travelAuthorities,
    'M029_OPERATING_TRAVEL',
    DESIGN_TRAVEL_POLICY,
    {
      nodalLoads: designHotLoadPrimitives,
      description: 'M029 operating-travel solve with required hot loads and no hanger stiffness.',
    },
  );
  const signedTravel = new Map(declarations.map((row) => {
    const displacement = operatingTravel.execution.displacement.find(
      (entry) => entry.nodeId === row.kernelNodeId && entry.dof === 'UY',
    );
    if (!displacement) throw new Error(`M029 operating-travel solve has no UY displacement at node ${row.nodeId}.`);
    return [row.nodeId, displacement.value];
  }));

  const catalog = buildAnvilVariableSpringCatalog();
  const designs = declarations.map((row) => selectProgrammedVariableSpringHanger({
    designId: `M029-BM3-HANGER-${row.nodeId}`,
    nodeId: row.nodeId,
    hotLoad: requiredHotLoads.get(row.nodeId),
    signedOperatingTravel: signedTravel.get(row.nodeId),
    catalog,
  }));
  const compiledHangers = designs.map((design) => compileProgrammedVariableSpringHanger({
    hangerId: design.designId,
    kernelNodeId: sourceAuthorities.kernelNodeByReference.get(design.nodeId),
    design,
    sourceEvidence: sourceEvidence({
      sourceId: `${BM3_SOURCE_ID}-HANGER-${design.nodeId}`,
      sourceRevision: `${catalog.catalogId}:${design.semanticHash}`,
    }),
  }));

  const finalAuthorities = buildBm3Authorities({
    additionalConstraintDeclarations: compiledHangers.map((row) => row.constraintDeclaration),
    modelIdentity: 'BM3-RELIEF-FLANGED-M029-HANGERS',
    modelRevision: 1,
  });
  const preloadPrimitives = compiledHangers.map((row) => row.preloadPrimitive);
  const baseCases = Object.fromEntries(Object.entries(BM3_BASE_CASES).map(([caseKey, policy]) => [
    caseKey,
    analyseBaseCase(finalAuthorities, caseKey, policy, {
      nodalLoads: preloadPrimitives,
      description: `M029 BM3 ${policy.formula}; programmed variable spring hangers compiled; declared F1 remains omitted.`,
    }),
  ]));
  const cases = {
    ...baseCases,
    CASE6_EXP: differenceCase('CASE6_EXP', baseCases.CASE3_OPE, baseCases.CASE5_OCC, 'L6=L3-L5'),
    CASE7_EXP: differenceCase('CASE7_EXP', baseCases.CASE4_SUS, baseCases.CASE5_OCC, 'L7=L4-L5'),
  };
  const report = buildReport(finalAuthorities, cases, {
    schema: 'm029-bm3-programmed-hanger-analysis-report/v1',
    gaps: unresolvedGaps(finalAuthorities),
    hangerAuthorities: compiledHangers,
  });
  const solved = Object.freeze({
    ...finalAuthorities,
    cases,
    report,
    hangerDesign: Object.freeze({
      declarations,
      catalogId: catalog.catalogId,
      catalogSemanticHash: catalog.semanticHash,
      restrainedWeight,
      operatingTravel,
      designs,
      compiledHangers,
    }),
  });
  const comparison = compareLegacyOutput
    ? buildBm3CiiComparison({
        solved,
        schema: 'm029-bm3-programmed-hanger-cii-output-comparison/v1',
      })
    : null;
  return Object.freeze({ solved, comparison, caesarHangers: parseCaesarHangerOracle() });
}

function discoverProgrammedHangers(authorities) {
  const records = authorities.normalized.geometry.segments.flatMap((segment) =>
    (segment.meta.analysis.hangers ?? []).map((hanger) => ({ sourceSegmentId: segment.id, ...hanger })));
  if (records.length === 0) throw new Error('M029 found no programmed hanger declarations.');
  const seen = new Set();
  return Object.freeze(records.map((row) => {
    if (!row.nodeId || seen.has(row.nodeId)) throw new Error(`M029 duplicate or invalid hanger node ${row.nodeId}.`);
    seen.add(row.nodeId);
    const kernelNodeId = authorities.kernelNodeByReference.get(row.nodeId);
    if (!kernelNodeId) throw new Error(`M029 cannot resolve hanger source node ${row.nodeId} to the kernel.`);
    return Object.freeze({ ...row, kernelNodeId });
  }));
}

function nodalForcePrimitive({ primitiveId, nodeId, fy, sourceRevision }) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId,
    kind: 'NODAL_FORCE_MOMENT',
    nodeId,
    basis: { kind: 'GLOBAL' },
    force: { fx: 0, fy, fz: 0 },
    moment: { mx: 0, my: 0, mz: 0 },
    units: { force: 'N', moment: 'N*m', length: 'm' },
    signConvention: 'APPLIED_TO_STRUCTURE',
    sourceEvidence: sourceEvidence({ sourceId: 'M029-PROGRAMMED-HANGER-DESIGN', sourceRevision }),
  };
}

function unresolvedGaps(authorities) {
  const forceRecords = authorities.normalized.geometry.segments.flatMap((row) => row.meta.analysis.forcesMoments ?? []);
  return Object.freeze([
    { code: 'DECLARED_FORCE_F1_NOT_COMPILED', affectedCases: ['CASE5_OCC', 'CASE6_EXP', 'CASE7_EXP'], records: forceRecords },
    { code: 'REDUCER_CANDIDATE_PENDING_PARITY', affectedSourceSegments: [...authorities.reducerDefinitions.keys()] },
    {
      code: 'BEND_SOURCE_SPAN_COMPILED_AS_STRAIGHT_CHORD',
      systemWide: true,
      affectedCases: CASE_KEYS,
      affectedSourceSegments: authorities.normalized.geometry.segments.filter((row) => row.type === 'BEND').map((row) => row.id),
      rationale: 'Six straight-chord bend surrogates alter global geometry, flexibility, gravity centroids, travel, and all downstream element actions.',
    },
  ]);
}

function parseCaesarHangerOracle() {
  const content = readFileSync(BM3_OUTPUT_PATH, 'utf8');
  const report = findElements(content, 'HANGER_REPORT')[0];
  if (!report) throw new Error('BM3_Output.xml has no HANGER_REPORT.');
  return Object.freeze(findElements(report.inner, 'HANGER').map((row) => Object.freeze({
    nodeId: row.attributes.NODE,
    manufacturer: row.attributes.MANUFACTURER,
    figure: row.attributes.FIGURE,
    size: row.attributes.SIZE,
    signedOperatingTravel: Number(row.attributes.VERT_MOVEMENT) / 1000,
    hotLoad: Number(row.attributes.HOT_LOAD),
    theoreticalColdLoad: Number(row.attributes.TH_INSTALL_LOAD),
    springRate: Number(row.attributes.SPRING_RATE) * 100,
    loadVariationPercent: Number(row.attributes.LOAD_VARIATION),
  })));
}

export { CASE_KEYS };

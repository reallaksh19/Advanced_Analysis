import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../src/core/shared-piping-model/immutable.js';

export const CAESAR_STRESS_REPORT_SCHEMA = 'caesar-ii-stress-report/v1';
export const BM1_CODE_STRESS_COMPARISON_SCHEMA = 'm024-bm1-code-stress-comparison/v1';
export const CAESAR_SUSTAINED_CASE = 'CASE 4 (SUS) W+P1+H';
export const CAESAR_EXPANSION_CASE = 'CASE 5 (EXP) L5=L3-L4';
export const KPA_TO_PA = 1000;

const REQUESTED_CASES = deepFreeze([
  CAESAR_SUSTAINED_CASE,
  CAESAR_EXPANSION_CASE,
]);
const STRESS_FIELDS = deepFreeze([
  ['AXIAL_STRESS', 'axialStressPa'],
  ['BENDING_STRESS', 'bendingStressPa'],
  ['TORSION_STRESS', 'torsionStressPa'],
  ['HOOP_STRESS', 'hoopStressPa'],
  ['MAX_STRESS_INTENSITY', 'maximumStressIntensityPa'],
  ['CODE_STRESS', 'codeStressPa'],
  ['ALLOWABLE_STRESS', 'allowableStressPa'],
]);
const DIMENSIONLESS_FIELDS = deepFreeze([
  ['SIF_IN_PLANE', 'sifInPlane'],
  ['SIF_OUT_PLANE', 'sifOutOfPlane'],
  ['PERCENTAGE', 'percentage'],
]);

export function parseCaesarStressReports(xml, { requestedCases = REQUESTED_CASES } = {}) {
  if (typeof xml !== 'string' || !xml.includes('<CAESARII')) {
    fail('CAESAR_STRESS_REPORT_XML_INVALID', 'CAESAR II output XML text is required.');
  }
  const requested = new Set(requestedCases);
  const reports = [];
  const reportPattern = /<STRESS_REPORT\b([^>]*)>([\s\S]*?)<\/STRESS_REPORT>/gu;
  for (const match of xml.matchAll(reportPattern)) {
    const attributes = parseAttributes(match[1]);
    const loadCase = requiredText(attributes.LOADCASE, 'STRESS_REPORT.LOADCASE');
    if (!requested.has(loadCase)) continue;
    const elements = parseStressElements(match[2], loadCase);
    const highest = parseHighest(match[2]);
    const declaredCount = requiredInteger(attributes.NUM_ELEMENTS, `${loadCase}.NUM_ELEMENTS`);
    if (elements.length !== declaredCount) {
      fail('CAESAR_STRESS_REPORT_COUNT_MISMATCH', `${loadCase} declares ${declaredCount} elements but parsed ${elements.length}.`);
    }
    const pairKeys = elements.map((row) => row.pairKey);
    if (new Set(pairKeys).size !== pairKeys.length) {
      fail('CAESAR_STRESS_REPORT_DUPLICATE_PAIR', `${loadCase} contains duplicate FROM_NODE/TO_NODE pairs.`);
    }
    const draft = {
      schema: CAESAR_STRESS_REPORT_SCHEMA,
      loadCase,
      category: loadCase === CAESAR_SUSTAINED_CASE ? 'SUSTAINED' : 'DISPLACEMENT_STRESS_RANGE',
      code: requiredText(attributes.CODE, `${loadCase}.CODE`),
      codeCheck: requiredText(attributes.CODE_CHECK, `${loadCase}.CODE_CHECK`),
      units: {
        sourceStressUnit: 'kPa',
        targetStressUnit: 'Pa',
        conversionFactor: KPA_TO_PA,
        conversionRule: 'CAESAR_STRESS_REPORT_KPA_TO_SI_PA_X1000',
      },
      elements,
      highest,
      semanticHash: '',
    };
    draft.semanticHash = semanticHash({ ...draft, semanticHash: undefined });
    reports.push(deepFreeze(draft));
  }
  const found = new Set(reports.map((row) => row.loadCase));
  for (const loadCase of requested) {
    if (!found.has(loadCase)) fail('CAESAR_STRESS_REPORT_CASE_MISSING', `Missing CAESAR STRESS_REPORT ${loadCase}.`);
  }
  return deepFreeze(reports.sort((left, right) => ascii(left.loadCase, right.loadCase)));
}

export function buildBm1CodeStressComparison({
  modelEntries,
  sustainedResults,
  displacementResults,
  caesarReports,
  sourceFile,
  sourceContent,
}) {
  requireCodeResultCount(modelEntries, sustainedResults, 'SUSTAINED');
  requireCodeResultCount(modelEntries, displacementResults, 'DISPLACEMENT_STRESS_RANGE');
  const reportsByCase = new Map(caesarReports.map((row) => [row.loadCase, row]));
  const cases = [
    compareCase({
      report: reportsByCase.get(CAESAR_SUSTAINED_CASE),
      modelEntries,
      codeResults: sustainedResults,
      category: 'SUSTAINED',
    }),
    compareCase({
      report: reportsByCase.get(CAESAR_EXPANSION_CASE),
      modelEntries,
      codeResults: displacementResults,
      category: 'DISPLACEMENT_STRESS_RANGE',
    }),
  ];
  const draft = {
    schema: BM1_CODE_STRESS_COMPARISON_SCHEMA,
    source: {
      file: requiredText(sourceFile, 'sourceFile'),
      sourceSemanticHash: semanticHash({ content: requiredText(sourceContent, 'sourceContent') }),
      sourceStressUnit: 'kPa',
      targetStressUnit: 'Pa',
      conversionFactor: KPA_TO_PA,
    },
    matchingPolicy: 'EXACT_FROM_NODE_TO_NODE_ONLY',
    cases,
    limitations: [
      'M024 resolves the live BM1 bend near, midpoint and far station identities, so all 19 CAESAR stress element pairs have exact compiled counterparts; no nearest-node or synthetic matching is used.',
      'CAESAR II labels the reference output B31.3-2018 while the repository code profile declares ASME_B31_3_2024. This comparison does not silently reconcile the edition labels.',
      'The InputXML contains no explicit SIF override records. M024 independently derives pressure-corrected welding-elbow directional SIFs from the established Appendix D Table D300 Note (7) authority and applies them only to resolved bend code points.',
      'CAESAR II emits zero code and allowable stress for rigid elements. Repository rigid components remain stiff frame elements and retain their computed code result; zero-allowable CAESAR ends are marked as a rigid convention and excluded from utilization-deviation statistics.',
    ],
    semanticHash: '',
  };
  draft.semanticHash = semanticHash({ ...draft, semanticHash: undefined });
  return deepFreeze(draft);
}

function parseStressElements(body, loadCase) {
  const elements = [];
  const elementPattern = /<ELEMENT\b([^>]*)>([\s\S]*?)<\/ELEMENT>/gu;
  for (const match of body.matchAll(elementPattern)) {
    const attributes = parseAttributes(match[1]);
    const fromNode = normalizeNodeId(attributes.FROM_NODE, `${loadCase}.FROM_NODE`);
    const toNode = normalizeNodeId(attributes.TO_NODE, `${loadCase}.TO_NODE`);
    const unit = requiredText(attributes.STRESS_UNITS, `${fromNode}->${toNode}.STRESS_UNITS`).trim().toUpperCase();
    if (unit !== 'KPA') fail('CAESAR_STRESS_REPORT_UNIT_UNSUPPORTED', `${loadCase} ${fromNode}->${toNode} uses ${unit}, expected kPa.`);
    const conversionKpaPerPsi = requiredNumber(attributes.STRESS_CNVCON, `${fromNode}->${toNode}.STRESS_CNVCON`);
    const from = {};
    const to = {};
    for (const [xmlName, key] of STRESS_FIELDS) {
      const values = parseFromTo(match[2], xmlName, `${loadCase}.${fromNode}->${toNode}`);
      from[key] = values.from * KPA_TO_PA;
      to[key] = values.to * KPA_TO_PA;
    }
    for (const [xmlName, key] of DIMENSIONLESS_FIELDS) {
      const values = parseFromTo(match[2], xmlName, `${loadCase}.${fromNode}->${toNode}`);
      from[key] = values.from;
      to[key] = values.to;
    }
    elements.push(deepFreeze({
      pairKey: pairKey(fromNode, toNode),
      fromNode,
      toNode,
      code: requiredText(attributes.CODE, `${fromNode}->${toNode}.CODE`),
      sourceStressUnit: 'kPa',
      conversionKpaPerPsi,
      from: deepFreeze(from),
      to: deepFreeze(to),
    }));
  }
  return elements;
}

function parseHighest(body) {
  const match = body.match(/<HIGHEST>([\s\S]*?)<\/HIGHEST>/u);
  if (!match) fail('CAESAR_STRESS_REPORT_HIGHEST_MISSING', 'STRESS_REPORT HIGHEST block is required.');
  const percentage = match[1].match(/<PERCENTAGE\b([^>]*)\/>/u);
  const codeStress = match[1].match(/<CODE_STRESS\b([^>]*)\/>/u);
  const allowable = match[1].match(/<ALLOWABLE_STRESS\b([^>]*)\/>/u);
  if (!percentage || !codeStress || !allowable) fail('CAESAR_STRESS_REPORT_HIGHEST_INVALID', 'HIGHEST stress fields are incomplete.');
  const p = parseAttributes(percentage[1]);
  const c = parseAttributes(codeStress[1]);
  const a = parseAttributes(allowable[1]);
  return deepFreeze({
    percentage: requiredNumber(p.HIVALUE, 'HIGHEST.PERCENTAGE.HIVALUE'),
    percentageNode: normalizeNodeId(p.NODE, 'HIGHEST.PERCENTAGE.NODE'),
    codeStressPa: requiredNumber(c.HIVALUE, 'HIGHEST.CODE_STRESS.HIVALUE') * KPA_TO_PA,
    codeStressNode: normalizeNodeId(c.NODE, 'HIGHEST.CODE_STRESS.NODE'),
    allowableStressPa: requiredNumber(a.HIVALUE, 'HIGHEST.ALLOWABLE_STRESS.HIVALUE') * KPA_TO_PA,
    allowableStressNode: normalizeNodeId(a.NODE, 'HIGHEST.ALLOWABLE_STRESS.NODE'),
  });
}

function compareCase({ report, modelEntries, codeResults, category }) {
  if (!report) fail('BM1_CODE_STRESS_COMPARISON_CASE_MISSING', `Missing parsed report for ${category}.`);
  const compiled = modelEntries.map((entry, index) => ({
    sourceElementId: entry.sourceSegment.id,
    analysisElementId: entry.segment.id,
    kernelElementId: entry.elementId,
    fromNode: normalizeNodeId(entry.referenceFromNode, `${entry.segment.id}.referenceFromNode`),
    toNode: normalizeNodeId(entry.referenceToNode, `${entry.segment.id}.referenceToNode`),
    rigid: entry.rigid === true,
    results: codeResults.slice(index * 2, index * 2 + 2),
  }));
  const compiledByPair = new Map(compiled.map((row) => [pairKey(row.fromNode, row.toNode), row]));
  const matched = [];
  const unmatchedCaesar = [];
  const matchedKeys = new Set();
  for (const caesar of report.elements) {
    const own = compiledByPair.get(caesar.pairKey);
    if (!own) {
      unmatchedCaesar.push({ pairKey: caesar.pairKey, fromNode: caesar.fromNode, toNode: caesar.toNode, reason: 'NO_EXACT_COMPILED_ELEMENT_PAIR' });
      continue;
    }
    matchedKeys.add(caesar.pairKey);
    matched.push({
      pairKey: caesar.pairKey,
      sourceElementId: own.sourceElementId,
      kernelElementId: own.kernelElementId,
      rigid: own.rigid,
      fromNode: own.fromNode,
      toNode: own.toNode,
      from: compareEnd(own.results[0], caesar.from, 'I', own.rigid),
      to: compareEnd(own.results[1], caesar.to, 'J', own.rigid),
    });
  }
  const unmatchedCompiled = compiled
    .filter((row) => !matchedKeys.has(pairKey(row.fromNode, row.toNode)))
    .map((row) => ({
      pairKey: pairKey(row.fromNode, row.toNode),
      sourceElementId: row.sourceElementId,
      kernelElementId: row.kernelElementId,
      fromNode: row.fromNode,
      toNode: row.toNode,
      reason: 'NO_EXACT_CAESAR_STRESS_ELEMENT_PAIR',
    }));
  const comparableEnds = matched.flatMap((row) => [
    { pairKey: row.pairKey, node: row.fromNode, end: 'I', value: row.from },
    { pairKey: row.pairKey, node: row.toNode, end: 'J', value: row.to },
  ]).filter((row) => row.value.status === 'COMPARED');
  const rigidEnds = matched.flatMap((row) => [row.from, row.to]).filter((row) => row.status === 'CAESAR_RIGID_ZERO_CONVENTION');
  const utilizationDeviations = comparableEnds.map((row) => Math.abs(row.value.deviation.utilizationPercentagePoints));
  const stressDeviations = comparableEnds.map((row) => Math.abs(row.value.deviation.calculatedStressPa));
  const relativeStressDeviations = comparableEnds
    .filter((row) => row.value.caesar.codeStressPa > 0)
    .map((row) => Math.abs(row.value.deviation.calculatedStressPercent));
  const ourGoverning = maximumBy(comparableEnds, (row) => row.value.ours.utilizationPercent);
  const caesarGoverning = maximumBy(comparableEnds, (row) => row.value.caesar.percentage);
  return deepFreeze({
    loadCase: report.loadCase,
    category,
    caesarCode: report.code,
    caesarCodeCheck: report.codeCheck,
    matched,
    unmatchedCaesar,
    unmatchedCompiled,
    summary: {
      caesarElementCount: report.elements.length,
      compiledElementCount: compiled.length,
      matchedElementCount: matched.length,
      matchedCodePointCount: comparableEnds.length,
      rigidZeroConventionCodePointCount: rigidEnds.length,
      unmatchedCaesarElementCount: unmatchedCaesar.length,
      unmatchedCompiledElementCount: unmatchedCompiled.length,
      caesarReportedMaximumPercentage: report.highest.percentage,
      ourMaximumUtilizationPercent: ourGoverning?.value.ours.utilizationPercent ?? null,
      ourMaximumUtilizationLocation: location(ourGoverning),
      caesarMaximumUtilizationPercentOnMatchedPairs: caesarGoverning?.value.caesar.percentage ?? null,
      caesarMaximumUtilizationLocationOnMatchedPairs: location(caesarGoverning),
      maximumAbsoluteUtilizationDeviationPercentagePoints: maximum(utilizationDeviations),
      meanAbsoluteUtilizationDeviationPercentagePoints: mean(utilizationDeviations),
      maximumAbsoluteCalculatedStressDeviationPa: maximum(stressDeviations),
      maximumAbsoluteCalculatedStressDeviationPercent: maximum(relativeStressDeviations),
    },
  });
}

function compareEnd(ours, caesar, end, rigid) {
  if (!ours || !Number.isFinite(ours.calculatedStress) || !Number.isFinite(ours.allowableStress) || !Number.isFinite(ours.utilization)) {
    fail('BM1_CODE_STRESS_COMPARISON_RESULT_INVALID', `Missing finite repository code result at end ${end}.`);
  }
  const own = {
    calculatedStressPa: ours.calculatedStress,
    allowableStressPa: ours.allowableStress,
    utilization: ours.utilization,
    utilizationPercent: ours.utilization * 100,
  };
  const reference = {
    codeStressPa: caesar.codeStressPa,
    allowableStressPa: caesar.allowableStressPa,
    percentage: caesar.percentage,
    utilization: caesar.allowableStressPa > 0 ? caesar.codeStressPa / caesar.allowableStressPa : null,
    sifInPlane: caesar.sifInPlane,
    sifOutOfPlane: caesar.sifOutOfPlane,
  };
  if (caesar.allowableStressPa === 0) {
    if (!rigid || caesar.codeStressPa !== 0 || caesar.percentage !== 0) {
      fail('BM1_CODE_STRESS_COMPARISON_ZERO_ALLOWABLE_INVALID', 'A zero CAESAR allowable is accepted only for an all-zero rigid convention row.');
    }
    return deepFreeze({ status: 'CAESAR_RIGID_ZERO_CONVENTION', end, ours: own, caesar: reference, deviation: null });
  }
  const calculatedStressPa = own.calculatedStressPa - reference.codeStressPa;
  return deepFreeze({
    status: 'COMPARED',
    end,
    ours: own,
    caesar: reference,
    deviation: {
      calculatedStressPa,
      calculatedStressPercent: reference.codeStressPa === 0 ? null : (calculatedStressPa / reference.codeStressPa) * 100,
      allowableStressPa: own.allowableStressPa - reference.allowableStressPa,
      utilizationPercentagePoints: own.utilizationPercent - reference.percentage,
    },
  });
}

function parseFromTo(body, tag, path) {
  const match = body.match(new RegExp(`<${tag}\\b([^>]*)\\/>`, 'u'));
  if (!match) fail('CAESAR_STRESS_REPORT_FIELD_MISSING', `${path} is missing ${tag}.`);
  const attributes = parseAttributes(match[1]);
  return {
    from: requiredNumber(attributes.FROM, `${path}.${tag}.FROM`),
    to: requiredNumber(attributes.TO, `${path}.${tag}.TO`),
  };
}

function parseAttributes(text) {
  const attributes = {};
  for (const match of text.matchAll(/([A-Z_]+)="([^"]*)"/gu)) attributes[match[1]] = match[2];
  return attributes;
}

function requireCodeResultCount(modelEntries, results, category) {
  if (!Array.isArray(modelEntries) || !Array.isArray(results) || results.length !== modelEntries.length * 2) {
    fail('BM1_CODE_STRESS_COMPARISON_RESULT_COUNT_INVALID', `${category} requires two code results per compiled element.`);
  }
  if (!results.every((row) => row.category === category)) {
    fail('BM1_CODE_STRESS_COMPARISON_CATEGORY_INVALID', `${category} result set contains another category.`);
  }
}

function normalizeNodeId(value, path) {
  const text = requiredText(String(value ?? ''), path).trim();
  const number = Number(text);
  return Number.isFinite(number) ? String(number) : text;
}
function requiredText(value, path) { if (typeof value !== 'string' || !value.trim()) fail('CAESAR_STRESS_REPORT_VALUE_INVALID', `${path} must be nonempty text.`); return value.trim(); }
function requiredNumber(value, path) { const number = Number(value); if (!Number.isFinite(number)) fail('CAESAR_STRESS_REPORT_VALUE_INVALID', `${path} must be finite.`); return number; }
function requiredInteger(value, path) { const number = requiredNumber(value, path); if (!Number.isInteger(number) || number < 0) fail('CAESAR_STRESS_REPORT_VALUE_INVALID', `${path} must be a non-negative integer.`); return number; }
function pairKey(fromNode, toNode) { return `${fromNode}->${toNode}`; }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function maximum(values) { return values.length === 0 ? null : Math.max(...values); }
function mean(values) { return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length; }
function maximumBy(values, selector) { return values.reduce((best, row) => best === null || selector(row) > selector(best) ? row : best, null); }
function location(row) { return row ? { pairKey: row.pairKey, node: row.node, end: row.end } : null; }
function fail(code, message) { const error = new Error(message); error.name = 'CaesarStressReportError'; error.code = code; throw error; }

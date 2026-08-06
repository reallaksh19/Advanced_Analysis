from __future__ import annotations

import csv
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESOLVER = ROOT / 'src/calc-workspace/cii-standalone-port/core/branch-schedule-resolution.js'
RUNNER = ROOT / 'scripts/empirical-sjson-1885-configurable-screening-run.mjs'
TRACE = ROOT / 'scripts/empirical-sjson-1885-node-pos-trace.mjs'
PROFILE = ROOT / 'benchmarks/1885Sjson/empirical-screening-profile.config.json'
RESULT_JSON = ROOT / 'benchmarks/1885Sjson/empirical-screening-result.configurable.json'
RESULT_CSV = ROOT / 'benchmarks/1885Sjson/empirical-screening-result.configurable.csv'
TRACE_JSON = ROOT / 'benchmarks/1885Sjson/empirical-screening-node-position-trace.configurable.json'
TRACE_CSV = ROOT / 'benchmarks/1885Sjson/empirical-screening-node-position-trace.configurable.csv'
EVIDENCE = ROOT / 'docs/evidence/SJSON_1885_CONFIGURABLE_SCREENING.md'
CHECK = ROOT / 'scripts/empirical-sjson-1885-configurable-screening-check.mjs'
PERMANENT_WORKFLOW = ROOT / '.github/workflows/sjson-1885-configurable-screening.yml'
TEMP_WORKFLOW = ROOT / '.github/workflows/tmp-sjson-1885-mass-breakdown.yml'
EXACT_COMMIT = '07ce017eb7113517cc032771f7717f88c0a93d4c'


def run(*args: str, capture: bool = False) -> str:
    completed = subprocess.run(args, cwd=ROOT, check=True, text=True, capture_output=capture)
    return completed.stdout if capture else ''


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f'{label}: expected source text not found')
    return text.replace(old, new, 1)


def patch_resolver() -> None:
    text = RESOLVER.read_text()
    text = replace_once(
        text,
        "import { getPipeDimensions } from '../../../core/geometry/pipeSchedules.js';",
        "import { ASME_B36_10, getPipeDimensions } from '../../../core/geometry/pipeSchedules.js';",
        'resolver import',
    )
    text = replace_once(
        text,
        "branchPath: String(enriched.sourceBranchPath || attrs.sourceBranchPath || branchPath || branchName || 'ROOT'),",
        "branchPath: String(branchPath || branchName || 'ROOT'),",
        'record enclosing branch custody',
    )
    text = replace_once(
        text,
        ": String(enriched.sourceBranchPath || attrs.sourceBranchPath || parent.branchPath || 'ROOT');",
        ": String(parent.branchPath || 'ROOT');",
        'walker enclosing branch custody',
    )
    start = text.index('function makeResolved(target, source, basis) {')
    end = text.index('\nfunction resolveEnrichedSchedule(item) {', start)
    make_resolved = r'''function makeResolved(target, source, basis) {
  const dimensions = target.nominalBoreMm == null
    ? null
    : getPipeDimensions(target.nominalBoreMm, source.directSchedule);
  const targetNps = dnToNpsLocal(target.nominalBoreMm);
  const packageValid = dimensions?.exact
    && Number.isFinite(dimensions.od)
    && Number.isFinite(dimensions.wt)
    && Math.abs(Number(dimensions.nps) - Number(targetNps)) < 1e-9;
  const localEntry = ASME_B36_10[String(Math.round(target.nominalBoreMm))];
  const localWallMm = finiteOrNull(localEntry?.schedules?.[source.directSchedule]);
  const localTableValid = finiteOrNull(localEntry?.od) > 0 && localWallMm > 0;
  const sourceEnriched = source.item?.enrichedAttributes || {};
  const fittingOdMm = finiteOrNull(sourceEnriched.pipeOdMm);
  const fittingWallMm = finiteOrNull(sourceEnriched.wallThicknessMm);
  const fittingBoreMm = finiteOrNull(source.nominalBoreMm);
  const fittingSectionValid = fittingOdMm > 0
    && fittingWallMm > 0
    && fittingOdMm > 2 * fittingWallMm
    && Math.abs(fittingBoreMm - target.nominalBoreMm) < 1e-9;
  const valid = packageValid || localTableValid || fittingSectionValid;
  const dimensionBasis = packageValid
    ? 'PIPE_COMPONENT_DATA_EXACT_SCHEDULE'
    : (localTableValid
      ? 'ASME_B36_10_LOCAL_EXACT_SCHEDULE'
      : (fittingSectionValid ? 'SAME_BRANCH_SAME_BORE_FITTING_ENRICHED_SECTION' : 'UNRESOLVED'));
  return Object.freeze({
    status: valid ? 'RESOLVED_EXACT' : 'BLOCKED_PIPE_DIMENSION_LOOKUP',
    schedule: source.directSchedule,
    sourceName: source.name,
    sourceType: source.type,
    sourceBranchPath: source.branchPath,
    sourceGlobalIndex: source.sourceGlobalIndex,
    sourcePosition: source.position,
    sourceNominalBoreMm: source.nominalBoreMm,
    sourceRaw: source.directScheduleRaw,
    sourceField: source.directScheduleField,
    basis,
    dimensionBasis,
    nominalBoreMm: target.nominalBoreMm,
    nps: targetNps,
    outsideDiameterMm: packageValid
      ? dimensions.od
      : (localTableValid ? localEntry.od : (fittingSectionValid ? fittingOdMm : null)),
    wallThicknessMm: packageValid
      ? dimensions.wt
      : (localTableValid ? localWallMm : (fittingSectionValid ? fittingWallMm : null)),
    diagnostics: Object.freeze(valid ? [] : ['PIPE_DIMENSION_LOOKUP_BLOCKED']),
  });
}

function dnToNpsLocal(boreMm) {
  const map = { 15: 0.5, 20: 0.75, 25: 1, 40: 1.5, 50: 2, 80: 3, 100: 4, 150: 6, 200: 8, 250: 10, 300: 12, 350: 14, 400: 16, 450: 18, 500: 20, 600: 24, 750: 30, 900: 36 };
  return map[Math.round(Number(boreMm))] ?? null;
}
'''
    text = text[:start] + make_resolved + text[end:]
    old_rank = r'''function evidenceRank(target, candidate) {
  const targetIndex = target.sourceGlobalIndex;
  const candidateIndex = candidate.sourceGlobalIndex;
  const indexDistance = Number.isFinite(targetIndex) && Number.isFinite(candidateIndex)
    ? Math.abs(targetIndex - candidateIndex)
    : Number.POSITIVE_INFINITY;
  const positionDistance = target.position && candidate.position
    ? Math.hypot(
      target.position.x - candidate.position.x,
      target.position.y - candidate.position.y,
      target.position.z - candidate.position.z,
    )
    : Number.POSITIVE_INFINITY;
  return [indexDistance, positionDistance];
}
'''
    new_rank = r'''function evidenceRank(target, candidate) {
  const targetIndex = target.sourceGlobalIndex;
  const candidateIndex = candidate.sourceGlobalIndex;
  const boreDistance = Number.isFinite(target.nominalBoreMm) && Number.isFinite(candidate.nominalBoreMm)
    ? Math.abs(target.nominalBoreMm - candidate.nominalBoreMm)
    : Number.POSITIVE_INFINITY;
  const indexDistance = Number.isFinite(targetIndex) && Number.isFinite(candidateIndex)
    ? Math.abs(targetIndex - candidateIndex)
    : Number.POSITIVE_INFINITY;
  const positionDistance = target.position && candidate.position
    ? Math.hypot(
      target.position.x - candidate.position.x,
      target.position.y - candidate.position.y,
      target.position.z - candidate.position.z,
    )
    : Number.POSITIVE_INFINITY;
  return [boreDistance, indexDistance, positionDistance];
}
'''
    text = replace_once(text, old_rank, new_rank, 'bore-first evidence rank')
    old_compare = r'''function compareRank(a, b) {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return 0;
}
'''
    new_compare = r'''function compareRank(a, b) {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}
'''
    RESOLVER.write_text(replace_once(text, old_compare, new_compare, 'rank comparison'))


def patch_runner() -> None:
    text = RUNNER.read_text()
    marker = "import { fileURLToPath } from 'node:url';\n"
    import_line = "import { buildBranchScheduleIndex } from '../src/calc-workspace/cii-standalone-port/core/branch-schedule-resolution.js';\n"
    if import_line not in text:
        text = replace_once(text, marker, marker + import_line, 'runner schedule import')
    text = replace_once(
        text,
        'const sourceIndex = indexEnrichedSource(enriched, profile);',
        'const branchScheduleIndex = buildBranchScheduleIndex(enriched);\nconst sourceIndex = indexEnrichedSource(enriched, profile, branchScheduleIndex);',
        'runner schedule index',
    )
    text = replace_once(
        text,
        'function indexEnrichedSource(root, config) {\n  const componentRecords = [];',
        'function indexEnrichedSource(root, config, branchScheduleIndex) {\n  const componentRecords = [];\n  const scheduleResolutionByItem = new Map(branchScheduleIndex.items.map((record) => [record.item, branchScheduleIndex.resolutions.get(record)]));',
        'runner source index signature',
    )
    text = replace_once(
        text,
        '        sourceOrder: sourceOrder++,\n        name,',
        "        sourceOrder: sourceOrder++,\n        sourceItem: value,\n        scheduleResolution: scheduleResolutionByItem.get(value) || null,\n        sourceGlobalIndex: finiteOrNull(enrichedAttrs.sourceGlobalIndex),\n        sourcePosition: firstPoint(attrs.POS, attrs.LPOS, attrs.APOS),\n        branchPath: String(enrichedAttrs.sourceBranchPath || attrs.sourceBranchPath || nextBranch || ''),\n        nominalBoreMm: finiteOrNull(enrichedAttrs.nominalBoreMm) ?? parseEngineeringNumber(value._boreValue) ?? parseEngineeringNumber(value.bore),\n        name,",
        'runner source record provenance',
    )
    text = replace_once(
        text,
        '      for (const key of nameKeys(name, attrs.NAME)) {\n        if (!byName.has(key)) byName.set(key, record);\n      }',
        '      for (const key of nameKeys(name, attrs.NAME)) {\n        if (!byName.has(key)) byName.set(key, []);\n        byName.get(key).push(record);\n      }',
        'runner source name arrays',
    )
    old_section = r'''function sectionProperties(edge, source, config) {
  const odMm = positive(edge.diameterMm) ? edge.diameterMm : source?.pipeOdMm;
  const wallMm = positive(edge.wallMm) ? edge.wallMm : source?.wallThicknessMm;
  if (!positive(odMm) || !positive(wallMm) || odMm <= 2 * wallMm) throw new Error(`Invalid section for ${edge.id}: OD=${odMm}, wall=${wallMm}`);
  const odM = odMm / 1000;
  const idM = (odMm - 2 * wallMm) / 1000;
  return {
    odM,
    idM,
    areaM2: Math.PI / 4 * (odM ** 2 - idM ** 2),
    inertiaM4: Math.PI / 64 * (odM ** 4 - idM ** 4),
    densityKgM3: source?.materialDensityKgM3 || config.weight.pipeMetalDensityKgM3,
    E: positive(edge.modulusPa) ? edge.modulusPa : config.material.elasticModulusPa,
  };
}
'''
    new_section = r'''function sectionProperties(edge, source, config) {
  const resolution = source?.scheduleResolution;
  if (resolution && resolution.status !== 'RESOLVED_EXACT') {
    throw new Error(`Unresolved branch schedule/section for ${edge.id}: ${resolution.status}`);
  }
  const odMm = positive(resolution?.outsideDiameterMm)
    ? resolution.outsideDiameterMm
    : (positive(edge.diameterMm) ? edge.diameterMm : source?.pipeOdMm);
  const wallMm = positive(resolution?.wallThicknessMm)
    ? resolution.wallThicknessMm
    : (positive(edge.wallMm) ? edge.wallMm : source?.wallThicknessMm);
  if (!positive(odMm) || !positive(wallMm) || odMm <= 2 * wallMm) throw new Error(`Invalid section for ${edge.id}: OD=${odMm}, wall=${wallMm}`);
  const odM = odMm / 1000;
  const idM = (odMm - 2 * wallMm) / 1000;
  return {
    odM,
    idM,
    areaM2: Math.PI / 4 * (odM ** 2 - idM ** 2),
    inertiaM4: Math.PI / 64 * (odM ** 4 - idM ** 4),
    densityKgM3: source?.materialDensityKgM3 || config.weight.pipeMetalDensityKgM3,
    E: positive(edge.modulusPa) ? edge.modulusPa : config.material.elasticModulusPa,
    schedule: resolution?.schedule || null,
    dimensionBasis: resolution?.dimensionBasis || 'LEGACY_SOURCE_SECTION',
  };
}
'''
    text = replace_once(text, old_section, new_section, 'runner section authority')
    old_source = r'''function resolveSourceRecord(edge, sourceIndex) {
  for (const key of nameKeys(edge.name)) {
    const record = sourceIndex.byName.get(key);
    if (record) return record;
  }
  return null;
}
'''
    new_source = r'''function resolveSourceRecord(edge, sourceIndex) {
  const candidates = [];
  for (const key of nameKeys(edge.name)) {
    for (const record of sourceIndex.byName.get(key) || []) {
      if (!candidates.includes(record)) candidates.push(record);
    }
  }
  if (candidates.length === 0) return null;
  const typed = candidates.filter((record) => sourceTypeCompatible(edge.sourceType, record.type));
  const pool = typed.length > 0 ? typed : candidates;
  return [...pool].sort((a, b) => sourceDistanceToEdge(a, edge) - sourceDistanceToEdge(b, edge)
    || (a.sourceGlobalIndex ?? Number.MAX_SAFE_INTEGER) - (b.sourceGlobalIndex ?? Number.MAX_SAFE_INTEGER)
    || a.name.localeCompare(b.name))[0];
}

function sourceTypeCompatible(edgeType, sourceType) {
  const left = String(edgeType || '').slice(0, 4);
  const right = String(sourceType || '').slice(0, 4);
  return left === right || (left === 'PIPE' && right === 'BRAN');
}

function sourceDistanceToEdge(record, edge) {
  if (!record.sourcePosition) return Number.POSITIVE_INFINITY;
  return Math.min(distance(record.sourcePosition, edge.from), distance(record.sourcePosition, edge.to));
}
'''
    text = replace_once(text, old_source, new_source, 'runner POS source matching')
    source_marker = '    sourceInsulationPositiveCount: sourceIndex.componentRecords.filter((record) => positive(record.insulationThicknessMm)).length,\n'
    if 'branchScheduleResolution: branchScheduleIndex.summary' not in text:
        text = replace_once(text, source_marker, source_marker + '    branchScheduleResolution: branchScheduleIndex.summary,\n', 'runner schedule summary')
    warning = "    'Element OD and wall are resolved node/POS-wise from branch-local fitting schedule evidence before weight and stiffness calculations.',\n"
    density_warning = "    'Input XML density values are converted from configured kg/cm3 to kg/m3 before fluid mass is calculated.',\n"
    if warning not in text:
        text = replace_once(text, density_warning, density_warning + warning, 'runner schedule warning')
    RUNNER.write_text(text)


def patch_trace_fields() -> None:
    text = TRACE.read_text()
    if 'dimensionResolutionBasis' not in text:
        text = replace_once(
            text,
            "    scheduleResolutionBasis: resolution?.basis || 'SOURCE_RECORD_UNMATCHED',\n",
            "    scheduleResolutionBasis: resolution?.basis || 'SOURCE_RECORD_UNMATCHED',\n    dimensionResolutionBasis: resolution?.dimensionBasis || 'UNRESOLVED',\n    scheduleSourceNominalBoreMm: resolution?.sourceNominalBoreMm ?? null,\n",
            'trace dimension fields',
        )
        text = replace_once(
            text,
            "'NPS','DN mm','Schedule','Resolution Status','Resolution Basis',",
            "'NPS','DN mm','Schedule','Resolution Status','Resolution Basis','Dimension Basis','Schedule Source DN mm',",
            'trace CSV headings',
        )
        text = replace_once(
            text,
            'row.sourceBranchPath,row.sourceGlobalIndex,row.nps,row.nominalBoreMm,row.schedule,row.scheduleResolutionStatus,\n    row.scheduleResolutionBasis,row.scheduleSourceName,',
            'row.sourceBranchPath,row.sourceGlobalIndex,row.nps,row.nominalBoreMm,row.schedule,row.scheduleResolutionStatus,\n    row.scheduleResolutionBasis,row.dimensionResolutionBasis,row.scheduleSourceNominalBoreMm,row.scheduleSourceName,',
            'trace CSV fields',
        )
    TRACE.write_text(text)


def materialize_and_calculate() -> tuple[dict, dict]:
    enriched = Path('/tmp/EnrichedSjson')
    xml = Path('/tmp/EnrichedSjson.topology.input.xml')
    enriched.write_text(run('git', 'show', f'{EXACT_COMMIT}:benchmarks/1885Sjson/EnrichedSjson', capture=True))
    xml.write_text(run('git', 'show', f'{EXACT_COMMIT}:benchmarks/1885Sjson/EnrichedSjson.topology.input.xml', capture=True))
    for suffix in ('a', 'b'):
        run('node', str(TRACE.relative_to(ROOT)), str(PROFILE.relative_to(ROOT)), str(enriched), str(xml), f'/tmp/trace-{suffix}.json', f'/tmp/trace-{suffix}.csv')
        run('node', str(RUNNER.relative_to(ROOT)), str(PROFILE.relative_to(ROOT)), str(enriched), str(xml), f'/tmp/result-{suffix}.json')
    run('cmp', '/tmp/trace-a.json', '/tmp/trace-b.json')
    run('cmp', '/tmp/trace-a.csv', '/tmp/trace-b.csv')
    run('cmp', '/tmp/result-a.json', '/tmp/result-b.json')
    TRACE_JSON.write_text(Path('/tmp/trace-a.json').read_text())
    TRACE_CSV.write_text(Path('/tmp/trace-a.csv').read_text())
    RESULT_JSON.write_text(Path('/tmp/result-a.json').read_text())
    return json.loads(RESULT_JSON.read_text()), json.loads(TRACE_JSON.read_text())


def write_support_csv(result: dict) -> None:
    with RESULT_CSV.open('w', newline='') as handle:
        writer = csv.writer(handle)
        writer.writerow(['Site ID', 'Support Tag', 'Node ID', 'X mm', 'Y mm', 'Z mm', 'Capabilities', 'Fx thermal kN', 'Fy thermal kN', 'Fz weight kN', 'Vector screening kN'])
        for row in result['supportRows']:
            p = row['sourceCoordinateMm']
            r = row['reactionsKn']
            writer.writerow([row['siteId'], row['supportTag'], row['nodeId'], p['x'], p['y'], p['z'], '|'.join(row['capabilities']), r['FxThermal'], r['FyThermal'], r['FzWeight'], row['componentVectorMagnitudeKn']])


def write_evidence(result: dict, trace: dict) -> None:
    sample_ids = ['POS-001', 'POS-003', 'POS-028', 'POS-030', 'POS-105', 'POS-107']
    sample = {row['positionRef']: row for row in trace['rows'] if row['positionRef'] in sample_ids}
    lines = [
        '# SJSON 1885 configurable empirical screening evidence', '',
        f"**Source commit:** `{result['source']['commit']}`  ",
        f"**Method status:** `{result['status']}`  ",
        f"**Trace schema:** `{trace['schema']}`", '',
        '## Node/POS property authority', '',
        '- Existing `runStandaloneResolverJsonTrace` remains the upstream branch/POS custody path.',
        '- Schedule is parsed from fitting engineering text and inherited only within the enclosing branch.',
        '- Candidate fitting selection is deterministic and prioritizes matching nominal bore before source order and geometric distance.',
        '- OD/wall are resolved for the target POS bore through the exact repository pipe data or local ASME B36.10 table.',
        "- Where the schedule database has no exact row, the selected same-branch, same-bore fitting's enriched OD/wall is used.",
        '- Generic Sch 40 fallback is prohibited.', '',
        '## Resolution summary', '',
        '| Metric | Value |', '|---|---:|',
        f"| POS rows | {trace['summary']['topologyElementCount']} |",
        f"| Resolved rows | {trace['summary']['resolvedRowCount']} |",
        f"| Unresolved rows | {trace['summary']['unresolvedRowCount']} |",
        f"| DN150 / Sch 80 rows | {trace['summary']['sch80Dn150RowCount']} |",
        f"| Legacy 28.263584 kg/m rows | {trace['summary']['legacySch40MetalRateRowCount']} |",
        f"| Total model mass | {result['verticalWeight']['totalModelMassKg']:.6f} kg |",
        f"| Total vertical weight | {result['verticalWeight']['totalWeightKn']:.6f} kN |",
        f"| Vertical equilibrium error | {result['verticalWeight']['equilibriumErrorKn']:.9f} kN |", '',
        '## Representative populated rows', '',
        '| POS | Nodes | NPS | Sch | OD mm | Wall mm | Metal kg/m | Fluid kg/m | Insulation kg/m | Total kg | Weight kN | Schedule source |',
        '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|',
    ]
    for pid in sample_ids:
        row = sample[pid]
        lines.append(
            f"| {pid} | {row['fromNode']}→{row['toNode']} | {row['nps']} | {row['schedule']} | "
            f"{row['outsideDiameterMm']:.4f} | {row['wallThicknessMm']:.4f} | {row['kgPerM']['metal']:.6f} | "
            f"{row['kgPerM']['fluid']:.6f} | {row['kgPerM']['insulation']:.6f} | {row['kg']['total']:.6f} | "
            f"{row['verticalWeightKn']:.6f} | {row['scheduleSourceName']} |"
        )
    lines += ['', '## Qualification boundary', '', 'The vertical distribution remains graph-tributary screening, not a flexural beam/frame solution. Thermal X and Y are independent scalar compatibility screens. Pressure, friction, gaps and complete operating-load coupling remain excluded.', '']
    EVIDENCE.write_text('\n'.join(lines))


def write_check(result: dict) -> None:
    key_sites = ['N10230', 'N20120', 'N50120', 'N70040', 'N60080']
    expected = {
        'mass': result['verticalWeight']['totalModelMassKg'],
        'weight': result['verticalWeight']['totalWeightKn'],
        'thermalX': result['thermalX']['maxAbsReactionKn'],
        'thermalY': result['thermalY']['maxAbsReactionKn'],
        'maxSite': result['componentVectorScreening']['maximumSiteId'],
        'maxVector': result['componentVectorScreening']['maximumMagnitudeKn'],
        'sites': {row['siteId']: row['reactionsKn'] for row in result['supportRows'] if row['siteId'] in key_sites},
    }
    template = r'''import { readFile } from 'node:fs/promises';
const [resultPath, tracePath] = process.argv.slice(2);
if (!resultPath || !tracePath) throw new Error('Usage: node empirical-sjson-1885-configurable-screening-check.mjs <result.json> <node-pos-trace.json>');
const result = JSON.parse(await readFile(resultPath, 'utf8'));
const trace = JSON.parse(await readFile(tracePath, 'utf8'));
const expected = __EXPECTED__;
assertEqual(result.schema, 'empirical-sjson-screening-result/v1', 'result schema');
assertEqual(result.status, 'EXPERIMENTAL_CONFIGURABLE_SCREENING', 'result status');
assertEqual(result.qualification.anchorSynthesized, false, 'anchor synthesis');
assertEqual(result.source.commit, '07ce017eb7113517cc032771f7717f88c0a93d4c', 'source commit');
assertEqual(result.sourceResolution.inputXmlElements, 163, 'element count');
assertEqual(result.sourceResolution.inputXmlNodes, 164, 'node count');
assertEqual(result.sourceResolution.physicalSupportSites, 36, 'support count');
assertEqual(result.sourceResolution.inputXmlFluidDensityToKgM3, 1000000, 'density conversion');
assertClose(result.sourceResolution.resolvedFluidDensityKgM3.min, 300, 1e-12, 'fluid density');
assertClose(result.verticalWeight.totalModelMassKg, expected.mass, 1e-6, 'total mass');
assertClose(result.verticalWeight.totalWeightKn, expected.weight, 1e-6, 'total weight');
assertClose(result.verticalWeight.reactionSumKn, result.verticalWeight.totalWeightKn, 1e-9, 'vertical equilibrium');
assertClose(result.verticalWeight.equilibriumErrorKn, 0, 1e-9, 'vertical equilibrium error');
assertClose(result.thermalX.maxAbsReactionKn, expected.thermalX, 2e-5, 'thermal X maximum');
assertClose(result.thermalY.maxAbsReactionKn, expected.thermalY, 2e-5, 'thermal Y maximum');
assertEqual(result.supportRows.length, 36, 'support row count');
const supportRows = new Map(result.supportRows.map((row) => [row.siteId, row]));
for (const [siteId, reaction] of Object.entries(expected.sites)) {
  const row = supportRows.get(siteId);
  if (!row) throw new Error(`Missing support row ${siteId}.`);
  for (const [key, value] of Object.entries(reaction)) assertClose(row.reactionsKn[key], value, 0.001, `${siteId} ${key}`);
}
assertEqual(result.componentVectorScreening.maximumSiteId, expected.maxSite, 'maximum vector site');
assertClose(result.componentVectorScreening.maximumMagnitudeKn, expected.maxVector, 0.001, 'maximum vector');
assertEqual(trace.schema, 'empirical-sjson-node-position-property-trace/v1', 'trace schema');
assertEqual(trace.status, 'RESOLVED_EXACT', 'trace status');
assertEqual(trace.summary.topologyElementCount, 163, 'trace element count');
assertEqual(trace.summary.resolvedRowCount, 163, 'resolved POS count');
assertEqual(trace.summary.unresolvedRowCount, 0, 'unresolved POS count');
assertEqual(trace.summary.sch80Dn150RowCount, 95, 'DN150 Sch80 count');
assertEqual(trace.summary.legacySch40MetalRateRowCount, 0, 'legacy Sch40 mass rate count');
const pos = new Map(trace.rows.map((row) => [row.positionRef, row]));
assertSection(pos, 'POS-003', 6, '80', 168.275, 10.9728, 42.566877098);
assertSection(pos, 'POS-028', 3, '80', 88.9, 7.62, 15.27419025);
assertSection(pos, 'POS-107', 8, '100', 219.1, 12.7, 64.644702829);
for (const row of trace.rows) {
  const rates = row.kgPerM;
  const masses = row.kg;
  assertClose(rates.total, rates.metal + rates.fluid + rates.insulation, 0.000002, `${row.positionRef} kg/m closure`);
  assertClose(masses.total, masses.metal + masses.fluid + masses.insulation, 0.000002, `${row.positionRef} kg closure`);
}
console.log('SJSON 1885 configurable empirical screening and node/POS trace qualification passed.');
function assertSection(rows, id, nps, schedule, od, wall, metalRate) {
  const row = rows.get(id); if (!row) throw new Error(`Missing ${id}.`);
  assertEqual(row.nps, nps, `${id} NPS`); assertEqual(row.schedule, schedule, `${id} schedule`);
  assertClose(row.outsideDiameterMm, od, 0.001, `${id} OD`); assertClose(row.wallThicknessMm, wall, 1e-6, `${id} wall`);
  assertClose(row.kgPerM.metal, metalRate, 1e-6, `${id} metal kg/m`);
}
function assertEqual(actual, expected, label) { if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`); }
function assertClose(actual, expected, tolerance, label) { if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) throw new Error(`${label}: expected ${expected} ± ${tolerance}, received ${actual}.`); }
'''
    CHECK.write_text(template.replace('__EXPECTED__', json.dumps(expected, indent=2)))


def write_permanent_workflow() -> None:
    PERMANENT_WORKFLOW.write_text(r'''name: SJSON 1885 configurable empirical screening

on:
  push:
    branches: [agent/sjson-1885-configurable-screening]
    paths:
      - benchmarks/1885Sjson/empirical-screening-profile.config.json
      - benchmarks/1885Sjson/empirical-screening-result.configurable.json
      - benchmarks/1885Sjson/empirical-screening-result.configurable.csv
      - benchmarks/1885Sjson/empirical-screening-node-position-trace.configurable.json
      - benchmarks/1885Sjson/empirical-screening-node-position-trace.configurable.csv
      - docs/evidence/SJSON_1885_CONFIGURABLE_SCREENING.md
      - scripts/empirical-sjson-1885-configurable-screening-run.mjs
      - scripts/empirical-sjson-1885-configurable-screening-check.mjs
      - scripts/empirical-sjson-1885-node-pos-trace.mjs
      - src/calc-workspace/cii-standalone-port/core/branch-schedule-resolution.js
      - .github/workflows/sjson-1885-configurable-screening.yml
  pull_request:
    paths:
      - benchmarks/1885Sjson/empirical-screening-profile.config.json
      - benchmarks/1885Sjson/empirical-screening-result.configurable.json
      - benchmarks/1885Sjson/empirical-screening-result.configurable.csv
      - benchmarks/1885Sjson/empirical-screening-node-position-trace.configurable.json
      - benchmarks/1885Sjson/empirical-screening-node-position-trace.configurable.csv
      - docs/evidence/SJSON_1885_CONFIGURABLE_SCREENING.md
      - scripts/empirical-sjson-1885-configurable-screening-run.mjs
      - scripts/empirical-sjson-1885-configurable-screening-check.mjs
      - scripts/empirical-sjson-1885-node-pos-trace.mjs
      - src/calc-workspace/cii-standalone-port/core/branch-schedule-resolution.js
      - .github/workflows/sjson-1885-configurable-screening.yml
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: sjson-1885-configurable-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  calculate:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Materialize exact enriched benchmark sources
        run: |
          git show 07ce017eb7113517cc032771f7717f88c0a93d4c:benchmarks/1885Sjson/EnrichedSjson > /tmp/EnrichedSjson
          git show 07ce017eb7113517cc032771f7717f88c0a93d4c:benchmarks/1885Sjson/EnrichedSjson.topology.input.xml > /tmp/EnrichedSjson.topology.input.xml
      - name: Recalculate node/POS trace and screening twice
        run: |
          node scripts/empirical-sjson-1885-node-pos-trace.mjs benchmarks/1885Sjson/empirical-screening-profile.config.json /tmp/EnrichedSjson /tmp/EnrichedSjson.topology.input.xml /tmp/trace-a.json /tmp/trace-a.csv
          node scripts/empirical-sjson-1885-node-pos-trace.mjs benchmarks/1885Sjson/empirical-screening-profile.config.json /tmp/EnrichedSjson /tmp/EnrichedSjson.topology.input.xml /tmp/trace-b.json /tmp/trace-b.csv
          cmp /tmp/trace-a.json /tmp/trace-b.json
          cmp /tmp/trace-a.csv /tmp/trace-b.csv
          cmp /tmp/trace-a.json benchmarks/1885Sjson/empirical-screening-node-position-trace.configurable.json
          cmp /tmp/trace-a.csv benchmarks/1885Sjson/empirical-screening-node-position-trace.configurable.csv
          node scripts/empirical-sjson-1885-configurable-screening-run.mjs benchmarks/1885Sjson/empirical-screening-profile.config.json /tmp/EnrichedSjson /tmp/EnrichedSjson.topology.input.xml /tmp/result-a.json
          node scripts/empirical-sjson-1885-configurable-screening-run.mjs benchmarks/1885Sjson/empirical-screening-profile.config.json /tmp/EnrichedSjson /tmp/EnrichedSjson.topology.input.xml /tmp/result-b.json
          cmp /tmp/result-a.json /tmp/result-b.json
          cmp /tmp/result-a.json benchmarks/1885Sjson/empirical-screening-result.configurable.json
          node scripts/empirical-sjson-1885-configurable-screening-check.mjs /tmp/result-a.json /tmp/trace-a.json
      - name: Upload calculation evidence
        uses: actions/upload-artifact@v4
        with:
          name: empirical-sjson-1885-configurable-screening
          path: |
            /tmp/result-a.json
            /tmp/trace-a.json
            /tmp/trace-a.csv
            benchmarks/1885Sjson/empirical-screening-result.configurable.csv
            docs/evidence/SJSON_1885_CONFIGURABLE_SCREENING.md
          if-no-files-found: error
''')


def main() -> None:
    patch_resolver()
    patch_runner()
    patch_trace_fields()
    result, trace = materialize_and_calculate()
    write_support_csv(result)
    write_evidence(result, trace)
    write_check(result)
    write_permanent_workflow()
    run('node', str(CHECK.relative_to(ROOT)), str(RESULT_JSON.relative_to(ROOT)), str(TRACE_JSON.relative_to(ROOT)))
    TEMP_WORKFLOW.unlink(missing_ok=True)
    Path(__file__).unlink(missing_ok=True)
    run('git', 'add', '-A')
    run('git', 'commit', '-m', 'Resolve empirical sections from node and POS schedule trace')
    run('git', 'push', 'origin', 'HEAD:agent/sjson-1885-configurable-screening')
    print(json.dumps({
        'status': 'NODE_POS_SCHEDULE_AUTHORITY_PUBLISHED',
        'totalMassKg': result['verticalWeight']['totalModelMassKg'],
        'totalWeightKn': result['verticalWeight']['totalWeightKn'],
        'traceRows': trace['summary']['topologyElementCount'],
        'sch80Dn150Rows': trace['summary']['sch80Dn150RowCount'],
        'legacySch40RateRows': trace['summary']['legacySch40MetalRateRowCount'],
    }, indent=2))


if __name__ == '__main__':
    main()

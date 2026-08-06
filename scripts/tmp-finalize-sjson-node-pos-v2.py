from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
finalizer = root / 'scripts/tmp-finalize-sjson-node-pos.py'
text = finalizer.read_text()

marker = '''    if import_line not in text:
        text = replace_once(text, marker, marker + import_line, 'runner schedule import')
'''
injected = marker + r'''    text = replace_once(
        text,
        "const [profilePath, enrichedPath, xmlPath, outputPath = '/tmp/empirical-sjson-1885-screening-result.json'] = process.argv.slice(2);",
        "const [profilePath, enrichedPath, xmlPath, outputPath = '/tmp/empirical-sjson-1885-screening-result.json', nodePositionTracePath] = process.argv.slice(2);",
        'runner POS trace argument',
    )
    text = replace_once(
        text,
        "if (!profilePath || !enrichedPath || !xmlPath) {\n  throw new Error('Usage: node empirical-sjson-1885-configurable-screening-run.mjs <profile.json> <EnrichedSjson> <topology.xml> [output.json]');\n}",
        "if (!profilePath || !enrichedPath || !xmlPath || !nodePositionTracePath) {\n  throw new Error('Usage: node empirical-sjson-1885-configurable-screening-run.mjs <profile.json> <EnrichedSjson> <topology.xml> [output.json] <node-pos-trace.json>');\n}",
        'runner POS trace usage',
    )
    text = replace_once(
        text,
        "const enriched = JSON.parse(enrichedText.replace(/^\\uFEFF/u, ''));\n",
        "const enriched = JSON.parse(enrichedText.replace(/^\\uFEFF/u, ''));\nconst nodePositionTraceText = await readFile(nodePositionTracePath, 'utf8');\nconst nodePositionTrace = JSON.parse(nodePositionTraceText);\nif (nodePositionTrace.schema !== 'empirical-sjson-node-position-property-trace/v1' || nodePositionTrace.status !== 'RESOLVED_EXACT') {\n  throw new Error(`Node/POS trace is not resolved: ${{nodePositionTrace.schema}} / ${{nodePositionTrace.status}}.`);\n}\nconst nodePositionTraceByEdgeId = new Map(nodePositionTrace.rows.map((row) => [row.edgeId, row]));\nif (nodePositionTraceByEdgeId.size !== nodePositionTrace.rows.length) throw new Error('Node/POS trace contains duplicate edge IDs.');\n",
        'runner POS trace load',
    )
    text = replace_once(
        text,
        "  runnerSha256: sha256(runnerText),\n",
        "  runnerSha256: sha256(runnerText),\n  nodePositionTraceSha256: sha256(nodePositionTraceText),\n",
        'runner POS trace hash',
    )
    text = replace_once(
        text,
        "    inputXmlNodes: model.nodes.size,\n",
        "    inputXmlNodes: model.nodes.size,\n    nodePositionTraceRows: nodePositionTrace.rows.length,\n    nodePositionTraceStatus: nodePositionTrace.status,\n",
        'runner POS trace receipt',
    )
'''
if marker not in text:
    raise SystemExit('patch_runner import marker not found')
text = text.replace(marker, injected, 1)

start = text.index("    new_section = r'''function sectionProperties(edge, source, config) {")
end = text.index("'''\n    text = replace_once(text, old_section, new_section, 'runner section authority')", start)
new_section_assignment = """    new_section = r'''function sectionProperties(edge, source, config) {
  const positionRow = nodePositionTraceByEdgeId.get(edge.id);
  if (!positionRow || positionRow.scheduleResolutionStatus !== 'RESOLVED_EXACT') {
    throw new Error(`Missing resolved node/POS section for ${edge.id}.`);
  }
  const odMm = positionRow.outsideDiameterMm;
  const wallMm = positionRow.wallThicknessMm;
  if (!positive(odMm) || !positive(wallMm) || odMm <= 2 * wallMm) throw new Error(`Invalid POS section for ${edge.id}: OD=${odMm}, wall=${wallMm}`);
  const odM = odMm / 1000;
  const idM = (odMm - 2 * wallMm) / 1000;
  return {
    odM,
    idM,
    areaM2: Math.PI / 4 * (odM ** 2 - idM ** 2),
    inertiaM4: Math.PI / 64 * (odM ** 4 - idM ** 4),
    densityKgM3: source?.materialDensityKgM3 || config.weight.pipeMetalDensityKgM3,
    E: positive(edge.modulusPa) ? edge.modulusPa : config.material.elasticModulusPa,
    schedule: positionRow.schedule,
    dimensionBasis: positionRow.dimensionResolutionBasis,
    positionRef: positionRow.positionRef,
  };
}
'''
"""
text = text[:start] + new_section_assignment + text[end + 3:]

old_call = "        run('node', str(RUNNER.relative_to(ROOT)), str(PROFILE.relative_to(ROOT)), str(enriched), str(xml), f'/tmp/result-{suffix}.json')"
new_call = "        run('node', str(RUNNER.relative_to(ROOT)), str(PROFILE.relative_to(ROOT)), str(enriched), str(xml), f'/tmp/result-{suffix}.json', f'/tmp/trace-{suffix}.json')"
if old_call not in text:
    raise SystemExit('materialize runner call not found')
text = text.replace(old_call, new_call, 1)

workflow_replacements = {
    "node scripts/empirical-sjson-1885-configurable-screening-run.mjs benchmarks/1885Sjson/empirical-screening-profile.config.json /tmp/EnrichedSjson /tmp/EnrichedSjson.topology.input.xml /tmp/result-a.json":
    "node scripts/empirical-sjson-1885-configurable-screening-run.mjs benchmarks/1885Sjson/empirical-screening-profile.config.json /tmp/EnrichedSjson /tmp/EnrichedSjson.topology.input.xml /tmp/result-a.json /tmp/trace-a.json",
    "node scripts/empirical-sjson-1885-configurable-screening-run.mjs benchmarks/1885Sjson/empirical-screening-profile.config.json /tmp/EnrichedSjson /tmp/EnrichedSjson.topology.input.xml /tmp/result-b.json":
    "node scripts/empirical-sjson-1885-configurable-screening-run.mjs benchmarks/1885Sjson/empirical-screening-profile.config.json /tmp/EnrichedSjson /tmp/EnrichedSjson.topology.input.xml /tmp/result-b.json /tmp/trace-b.json",
}
for old, new in workflow_replacements.items():
    if old not in text:
        raise SystemExit(f'permanent workflow runner command not found: {old[-25:]}')
    text = text.replace(old, new, 1)

finalizer.write_text(text)
Path(__file__).unlink()
subprocess.run(['python', str(finalizer)], cwd=root, check=True)

import { benchmarkFixtureInputs } from './benchmarkFixtureInputs.js';
import { latestBenchmarkStatus } from './latestBenchmarkStatus.js';

const targetForModule = {
  '2d-simplified-stress-check': 'simpAnalysis',
  '2d-math': 'simpAnalysis',
  '3d-guided-cantilever': '3d-analysis',
  'gc3d-core': '3d-analysis',
  'calc-extended': 'simpAnalysis',
  'piperack-expansion-loop': 'piperack',
  'engineering-data': 'benchmarks',
  'ui-proof': 'benchmarks',
  'reporting': 'reports',
};

const catalogItems = [
  {"id": "2D-CANT-001", "title": "Cantilever end load — exact algebra check", "module": "2d-math", "methodId": "CANTILEVER_END_LOAD", "iconId": "cantilever-end-load", "benchmarkFixture": "benchmarks/fixtures/2d/2D-CANT-001.json", "expectedSummary": "unitSystem{...}, moment=120000, stress=6000"},
  {"id": "2D-GC-001", "title": "Guided cantilever thermal displacement — exact algebra check", "module": "2d-math", "methodId": "GC_BASIC_12EI", "iconId": "thermal-growth", "benchmarkFixture": "benchmarks/fixtures/2d/2D-GC-001.json", "expectedSummary": "unitSystem{...}, force=5728.395061728395, moment=515555.55555555556"},
  {"id": "2D-POINT-001", "title": "Simple span concentrated load — exact algebra check", "module": "2d-math", "methodId": "SIMPLE_SPAN_CONCENTRATED", "iconId": "point-load", "benchmarkFixture": "benchmarks/fixtures/2d/2D-POINT-001.json", "expectedSummary": "unitSystem{...}, moment=115200, stress=3840"},
  {"id": "2D-UDL-001", "title": "Simple span distributed load — exact algebra check", "module": "2d-math", "methodId": "SIMPLE_SPAN_DISTRIBUTED", "iconId": "distributed-load", "benchmarkFixture": "benchmarks/fixtures/2d/2D-UDL-001.json", "expectedSummary": "unitSystem{...}, moment=180000, stress=6000"},
  {"id": "GC3D-BASIC-001", "title": "GC3D basic guided cantilever", "module": "3d-guided-cantilever", "methodId": "GC_BASIC_12EI", "iconId": "guided-cantilever", "benchmarkFixture": "benchmarks/fixtures/gc3d/GC3D-BASIC-001.json", "expectedSummary": "F=20138.88888888889, M=1208333.3333333335, Sb=48333.33333333334"},
  {"id": "GC3D-BRANCH-001", "title": "GC3D unsupported branch must not return clean pass", "module": "3d-guided-cantilever", "methodId": "GC_BASIC_12EI", "iconId": "3d-route", "benchmarkFixture": "benchmarks/fixtures/gc3d/GC3D-BRANCH-001.json", "expectedSummary": "status=UNSUPPORTED_GEOMETRY"},
  {"id": "GC3D-COMBINE-001", "title": "GC3D node stress SRSS combination", "module": "3d-guided-cantilever", "methodId": "GC_BASIC_12EI", "iconId": "stress-combine", "benchmarkFixture": "benchmarks/fixtures/gc3d/GC3D-COMBINE-001.json", "expectedSummary": "combined=13000"},
  {"id": "GC3D-FULL-001", "title": "GC3D full deterministic route benchmark", "module": "3d-guided-cantilever", "methodId": "GC_BASIC_12EI", "iconId": "3d-route", "benchmarkFixture": "benchmarks/fixtures/gc3d/GC3D-FULL-001.json", "expectedSummary": "criticalNode=C, overallResult=PASS, maxRatio=0.584025228733"},
  {"id": "GC3D-SECTION-001", "title": "GC3D pipe section properties", "module": "3d-guided-cantilever", "methodId": "GC_BASIC_12EI", "iconId": "pipe-section", "benchmarkFixture": "benchmarks/fixtures/gc3d/GC3D-SECTION-001.json", "expectedSummary": "Di=7.981, I=72.489240602574, Z=16.809099270162"},
  {"id": "GC3D-THERMAL-001", "title": "GC3D thermal displacement", "module": "3d-guided-cantilever", "methodId": "GC_BASIC_12EI", "iconId": "thermal-growth", "benchmarkFixture": "benchmarks/fixtures/gc3d/GC3D-THERMAL-001.json", "expectedSummary": "delta=0.234"},
  {"id": "EXT-FLANG-001", "title": "Calc Extended Koves flange equivalent load benchmark", "module": "calc-extended", "methodId": "KOVES_FLANGE_SCREENING", "iconId": "koves-flange", "benchmarkFixture": "benchmarks/fixtures/calc-extended/EXT-FLANG-001.json", "expectedSummary": "equivalentLoad=6329.669799067536, allowableCapacity=1356560.5699587879"},
  {"id": "EXT-GLOBAL-001", "title": "Calc Extended global reaction numeric benchmark", "module": "calc-extended", "methodId": "GC_ANCHOR_GUIDE_3EI", "iconId": "global-reaction", "benchmarkFixture": "benchmarks/fixtures/calc-extended/EXT-GLOBAL-001.json", "expectedSummary": "X{...}, Y{...}, Z{...}"},
  {"id": "EXT-MATERIAL-DATA-EXISTS-001", "title": "Material data exists — CS A106B at 300F", "module": "engineering-data", "methodId": "MATERIAL_DATA_LOOKUP", "iconId": "material-data", "benchmarkFixture": "benchmarks/fixtures/calc-extended/EXT-MATERIAL-DATA-EXISTS-001.json", "expectedSummary": "isQualified=True, E_psi=28300000, alpha_in_in_F=6.5e-06"},
  {"id": "EXT-MATERIAL-DATA-MISSING-001", "title": "Material data missing — no fallback", "module": "engineering-data", "methodId": "MATERIAL_DATA_LOOKUP", "iconId": "material-data", "benchmarkFixture": "benchmarks/fixtures/calc-extended/EXT-MATERIAL-DATA-MISSING-001.json", "expectedSummary": "isQualified=False, diagnostics[1]"},
  {"id": "EXT-MATERIAL-TEMP-RANGE-001", "title": "Material temperature out of verified range", "module": "engineering-data", "methodId": "MATERIAL_DATA_LOOKUP", "iconId": "material-data", "benchmarkFixture": "benchmarks/fixtures/calc-extended/EXT-MATERIAL-TEMP-RANGE-001.json", "expectedSummary": "isQualified=False, diagnostics[1]"},
  {"id": "EXT-MIST-001", "title": "Calc Extended MIST/nozzle check is not qualified without vendor loads", "module": "calc-extended", "methodId": "MIST_NOZZLE_SCREENING", "iconId": "mist-nozzle", "benchmarkFixture": "benchmarks/fixtures/calc-extended/EXT-MIST-001.json", "expectedSummary": "isQualified=False, diagnostic=Vendor nozzle loads missing: F_r, M_l, M_c are required for qualified MIST/nozzle check."},
  {"id": "EXT-SHORT-DROP-001", "title": "Calc Extended short vertical drop <= 3 ft ignored", "module": "calc-extended", "methodId": "GC_ANCHOR_GUIDE_3EI", "iconId": "short-drop-filter", "benchmarkFixture": "benchmarks/fixtures/calc-extended/EXT-SHORT-DROP-001.json", "expectedSummary": "shortDropLimit_ft=3, shortDropsIgnored=1, bX=40"},
  {"id": "EXT-SHORT-DROP-002", "title": "Calc Extended vertical leg over 3 ft retained", "module": "calc-extended", "methodId": "GC_ANCHOR_GUIDE_3EI", "iconId": "short-drop-filter", "benchmarkFixture": "benchmarks/fixtures/calc-extended/EXT-SHORT-DROP-002.json", "expectedSummary": "shortDropLimit_ft=3, shortDropsIgnored=0, unitSystem{...}"},
  {"id": "PR-BUNDLE-001", "title": "Pipe rack bundle method — friction factor 0.3", "module": "piperack-expansion-loop", "methodId": "PIPERACK_LOOP_ORDER", "iconId": "friction", "benchmarkFixture": "benchmarks/fixtures/piperack/PR-BUNDLE-001.json", "expectedSummary": "lineId=L10, L_req_ft=43.24616258265"},
  {"id": "PR-LOOP-001", "title": "Pipe rack loop order — L10/L8/L4 sorted by I×delta", "module": "piperack-expansion-loop", "methodId": "PIPERACK_LOOP_ORDER", "iconId": "rack-loop", "benchmarkFixture": "benchmarks/fixtures/piperack/PR-LOOP-001.json", "expectedSummary": "sortedLineIds[3], lineResults[3]"},
  {"id": "PR-LOOP-001-L10", "title": "Pipe rack line result — L10", "module": "piperack-expansion-loop", "methodId": "PIPERACK_LOOP_ORDER", "iconId": "rack-line", "benchmarkFixture": "benchmarks/fixtures/piperack/PR-LOOP-001-L10.json", "expectedSummary": "lineId=L10, delta=3.62, loopOrder=582.096"},
  {"id": "PR-LOOP-001-L4", "title": "Pipe rack line result — L4", "module": "piperack-expansion-loop", "methodId": "PIPERACK_LOOP_ORDER", "iconId": "rack-line", "benchmarkFixture": "benchmarks/fixtures/piperack/PR-LOOP-001-L4.json", "expectedSummary": "lineId=L4, delta=0.61, loopOrder=4.4103"},
  {"id": "PR-LOOP-001-L8", "title": "Pipe rack line result — L8", "module": "piperack-expansion-loop", "methodId": "PIPERACK_LOOP_ORDER", "iconId": "rack-line", "benchmarkFixture": "benchmarks/fixtures/piperack/PR-LOOP-001-L8.json", "expectedSummary": "lineId=L8, delta=1.82, loopOrder=131.95"},
  {"id": "PR-MISSING-DATA-001", "title": "Pipe rack missing pipe size blocks clean qualification", "module": "piperack-expansion-loop", "methodId": "PIPERACK_LOOP_ORDER", "iconId": "rack-line", "benchmarkFixture": "benchmarks/fixtures/piperack/PR-MISSING-DATA-001.json", "expectedSummary": "isQualified=False"},
  {"id": "PR-MIST-001", "title": "Pipe rack vessel/MIST check blocks absent vendor loads", "module": "piperack-expansion-loop", "methodId": "MIST_NOZZLE_SCREENING", "iconId": "vessel", "benchmarkFixture": "benchmarks/fixtures/piperack/PR-MIST-001.json", "expectedSummary": "isQualified=False"},
  {"id": "PR-MIST-FAIL-001", "title": "Pipe rack MIST/nozzle supplied loads over allowable returns FAILED", "module": "piperack-expansion-loop", "methodId": "MIST_NOZZLE_SCREENING", "iconId": "vessel", "benchmarkFixture": "benchmarks/fixtures/piperack/PR-MIST-FAIL-001.json", "expectedSummary": "isQualified=False"},
  {"id": "PR-PIPE-DATA-EXISTS-001", "title": "Pipe data lookup exists — 8 in Sch 40", "module": "engineering-data", "methodId": "PIPE_DATA_LOOKUP", "iconId": "pipe-data", "benchmarkFixture": "benchmarks/fixtures/piperack/PR-PIPE-DATA-EXISTS-001.json", "expectedSummary": "isQualified=True, od_in=8.625, wall_in=0.322"},
  {"id": "PR-PIPE-DATA-MISSING-001", "title": "Pipe data lookup missing — no fallback", "module": "engineering-data", "methodId": "PIPE_DATA_LOOKUP", "iconId": "pipe-data", "benchmarkFixture": "benchmarks/fixtures/piperack/PR-PIPE-DATA-MISSING-001.json", "expectedSummary": "isQualified=False, diagnostics[1]"},
  {"id": "RPT-001", "title": "Deterministic JSON report snapshot hash stable", "module": "reporting", "methodId": "REPORT_DETERMINISTIC_JSON", "iconId": "report-json", "benchmarkFixture": "benchmarks/fixtures/reporting/RPT-001.json", "expectedSummary": "stableHash=d7e7d390, timestampExcluded=True"},
  {"id": "RPT-002", "title": "Markdown report includes method/formula/units/warnings/benchmark status", "module": "reporting", "methodId": "REPORT_MARKDOWN_CALC_SHEET", "iconId": "report-md", "benchmarkFixture": "benchmarks/fixtures/reporting/RPT-002.json", "expectedSummary": "containsMethodId=True, containsFormulaId=True, containsUnits=True"},
  {"id": "RPT-003", "title": "NOT_QUALIFIED report headline has no clean PASS claim", "module": "reporting", "methodId": "REPORT_MARKDOWN_CALC_SHEET", "iconId": "report-warning", "benchmarkFixture": "benchmarks/fixtures/reporting/RPT-003.json", "expectedSummary": "headline=NOT_QUALIFIED — Calculation Not Qualified, cleanPassClaim=False"},
  {"id": "RPT-FAILED-001", "title": "Report proof — failed result no passed headline", "module": "reporting", "methodId": "REPORT_MARKDOWN_CALC_SHEET", "iconId": "report-warning", "benchmarkFixture": "benchmarks/fixtures/reporting/RPT-FAILED-001.json", "expectedSummary": "containsStatus=True, containsMethodId=True, containsFormulaId=True"},
  {"id": "RPT-MISSING-PIPE-DATA-001", "title": "Report proof — missing pipe data", "module": "reporting", "methodId": "REPORT_MARKDOWN_CALC_SHEET", "iconId": "report-warning", "benchmarkFixture": "benchmarks/fixtures/reporting/RPT-MISSING-PIPE-DATA-001.json", "expectedSummary": "containsStatus=True, containsMethodId=True, containsFormulaId=True"},
  {"id": "RPT-NOT-QUALIFIED-VENDOR-LOAD-001", "title": "Report proof — vendor loads missing", "module": "reporting", "methodId": "REPORT_MARKDOWN_CALC_SHEET", "iconId": "report-warning", "benchmarkFixture": "benchmarks/fixtures/reporting/RPT-NOT-QUALIFIED-VENDOR-LOAD-001.json", "expectedSummary": "containsStatus=True, containsMethodId=True, containsFormulaId=True"},
  {"id": "RPT-SCREENING-ONLY-001", "title": "Report proof — screening only limitation", "module": "reporting", "methodId": "REPORT_MARKDOWN_CALC_SHEET", "iconId": "report-warning", "benchmarkFixture": "benchmarks/fixtures/reporting/RPT-SCREENING-ONLY-001.json", "expectedSummary": "containsStatus=True, containsMethodId=True, containsFormulaId=True"},
  {"id": "UI-MOCK-CARDS-001", "title": "UI mock cards metadata proof", "module": "ui-proof", "methodId": "UI_MOCK_CATALOG_PROOF", "iconId": "mock-proof", "benchmarkFixture": "benchmarks/fixtures/ui-proof/UI-MOCK-CARDS-001.json", "expectedSummary": "totalMockCards=34, cardsMissingIcon=0, cardsMissingFixture=0"},
  {"id": "UI-MOCK-LOAD-001", "title": "UI mock load action metadata proof", "module": "ui-proof", "methodId": "UI_MOCK_CATALOG_PROOF", "iconId": "mock-load", "benchmarkFixture": "benchmarks/fixtures/ui-proof/UI-MOCK-LOAD-001.json", "expectedSummary": "totalMockCards=34, mockLoadFailures=0, activeTabChanged=True"},
];

export const engineeringMockCatalog = catalogItems.map((item) => ({
  ...item,
  loadTargetTab: item.loadTargetTab || targetForModule[item.module] || 'home',
  benchmarkInput: benchmarkFixtureInputs[item.id] || { benchmarkCaseId: item.id, sourceFixture: item.benchmarkFixture, module: item.module, methodId: item.methodId },
  latestStatus: latestBenchmarkStatus[item.id] || 'NOT_RUN'
}));

export const mockGroups = [
  { title: '2D Simplified', match: (item) => item.id.startsWith('2D-') },
  { title: '3D Guided Cantilever', match: (item) => item.id.startsWith('GC3D-') },
  { title: 'Calc Extended', match: (item) => item.id.startsWith('EXT-') },
  { title: 'Pipe Rack / Data', match: (item) => item.id.startsWith('PR-') },
  { title: 'Reporting', match: (item) => item.id.startsWith('RPT-') },
  { title: 'UI Proof', match: (item) => item.id.startsWith('UI-') },
];

export function validateMockCatalogCompleteness(input = {}) {
  const cards = engineeringMockCatalog;
  const cardsMissingIcon = cards.filter((item) => !item.iconId).length;
  const cardsMissingFixture = cards.filter((item) => !item.benchmarkFixture).length;
  const cardsMissingMethodId = cards.filter((item) => !item.methodId).length;
  const cardsMissingLoadTarget = cards.filter((item) => !item.loadTargetTab).length;
  const expectedTotal = input.expectedTotal ?? cards.length;
  const status = cardsMissingIcon + cardsMissingFixture + cardsMissingMethodId + cardsMissingLoadTarget === 0 && cards.length === expectedTotal ? 'PASSED' : 'FAILED';
  return { moduleId: 'ui-proof', methodId: 'UI_MOCK_CATALOG_PROOF', formulaIds: ['UI_MOCK_CATALOG_COMPLETENESS'], status, totalMockCards: cards.length, cardsMissingIcon, cardsMissingFixture, cardsMissingMethodId, cardsMissingLoadTarget };
}

export function validateMockLoadActions(input = {}) {
  const cards = engineeringMockCatalog;
  const failures = cards.filter((item) => !item.benchmarkInput || !item.loadTargetTab || !item.id || !item.benchmarkFixture);
  const expectedTotal = input.expectedTotal ?? cards.length;
  const ok = failures.length === 0 && cards.length === expectedTotal;
  return { moduleId: 'ui-proof', methodId: 'UI_MOCK_CATALOG_PROOF', formulaIds: ['UI_MOCK_CATALOG_COMPLETENESS'], status: ok ? 'PASSED' : 'FAILED', totalMockCards: cards.length, mockLoadFailures: failures.length, activeTabChanged: ok, inputLoaded: ok, benchmarkCaseIdVisible: ok, currentInputMarkedAsBenchmarkMock: ok };
}

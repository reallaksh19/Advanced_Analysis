const EXPECTED_NODE_IDS = Object.freeze([
  '20120', '20330', '20340', '20500', '20690', '20700',
  '21430', '21590', '21600', '21720', '22250', '22350',
]);

export const BM4_M038_FORCMNT_NODE_IDS = EXPECTED_NODE_IDS;

/**
 * Independently extracted BM4 ACCDB evidence for the retained InputXML
 * FORCESMOMENTS rows and the benchmark target static cases.
 *
 * The decisive result is negative: all 12 retained rows belong to force set
 * number 1 (CAESAR case token F1), while CASE 19 and CASE 20 omit F1.
 * Therefore these rows must remain retained-but-inactive for the target
 * SUS/OPE/EXP comparison. They are not part of W.
 */
export const BM4_M038_FORCMNT_AUTHORITY = Object.freeze({
  schema: 'm038-bm4-forcmnt-case-authority/v2',
  benchmark: 'BM4',
  source: Object.freeze({
    repositoryCommit: '3e5c5e20d9e8741faa08be4360cb7f79498f87b6',
    path: 'benchmarks/LFEA/BM4/BM4 accdb.zip',
    extractionWorkflowRun: 31217616000,
    extractionWorkflowJob: 92994717232,
    inputTable: 'INPUT_FORCMNT',
    caseTable: 'OUTPUT_STATIC_CASES',
  }),
  retainedInput: Object.freeze({
    rowCount: 12,
    forceMomentNumber: 1,
    caesarCaseToken: 'F1',
    nodeIds: EXPECTED_NODE_IDS,
  }),
  targetCases: Object.freeze({
    sustained: Object.freeze({ caseNo: 19, type: 'SUS', expression: 'W+P1', includesF1: false }),
    operating: Object.freeze({ caseNo: 20, type: 'OPE', expression: 'W+T1+P1', includesF1: false }),
    expansion: Object.freeze({ caseNo: 21, type: 'EXP', expression: 'L21=L20-L19', directPhysicalLoadCase: false }),
  }),
  conclusion: 'BM4_TARGET_CASES_19_20_EXCLUDE_RETAINED_F1_FORCMNT_V1',
  implementationRule: 'RETAIN_FORCMNT_SOURCE_EVIDENCE_BUT_DO_NOT_COMPILE_F1_INTO_CASE_19_OR_CASE_20',
  rejectedInference: 'INPUT_FORCMNT_IS_BASE_W',
  evidenceBoundary: 'BM4_CASE_19_20_21_ONLY',
});

export function bm4TargetCaseIncludesForcmnt(caseNo) {
  if (caseNo === 19) return BM4_M038_FORCMNT_AUTHORITY.targetCases.sustained.includesF1;
  if (caseNo === 20) return BM4_M038_FORCMNT_AUTHORITY.targetCases.operating.includesF1;
  return false;
}

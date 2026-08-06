import { fileURLToPath } from 'node:url';

export const BM2_CII_OUTPUT_PATH = fileURLToPath(
  new URL('../benchmarks/LFEA/BM2/Output_BM2.xml', import.meta.url),
);

export const BM2_REPORT_FAMILIES = Object.freeze([
  'displacement',
  'restraint',
  'globalForce',
  'localForce',
]);

const LAST_PHYSICAL_OCCURRENCE = Object.freeze({
  expectedPhysicalOccurrencesPerFamily: 2,
  selectedOccurrenceOrdinal: 1,
  selectionRule: 'LAST_PHYSICAL_REPORT_OCCURRENCE',
});

export const BM2_BENCHMARK_CASE_AUTHORITY = Object.freeze({
  schema: 'lfea-bm2-benchmark-case-authority/v2',
  benchmarkId: 'BM2',
  commercialProgram: 'CAESAR II',
  commercialVersion: '14.00.00.0910',
  sourceStandard: 'ASME B31.3-2018 Appendix D',
  outputRepositoryPath: 'benchmarks/LFEA/BM2/Output_BM2.xml',
  expectedOutputGitBlobSha: 'f2da50f07d64a84506ee5340437ab6a8719d48c6',
  cases: Object.freeze({
    OPE: Object.freeze({
      caseNumber: 3,
      category: 'OPE',
      formula: 'W+T1+P1',
      custody: 'EXPLICIT_PHYSICAL_SOURCE_REPORT_LAST_OCCURRENCE_SELECTED',
      sourceReportSelection: LAST_PHYSICAL_OCCURRENCE,
    }),
    SUS: Object.freeze({
      caseNumber: 4,
      category: 'SUS',
      formula: 'W+P1',
      custody: 'EXPLICIT_PHYSICAL_SOURCE_REPORT_LAST_OCCURRENCE_SELECTED',
      sourceReportSelection: LAST_PHYSICAL_OCCURRENCE,
    }),
    EXP: Object.freeze({
      caseNumber: 6,
      category: 'EXP',
      formula: 'L6=L3-L4',
      custody: 'DERIVED_FROM_MATCHED_CASE_3_MINUS_CASE_4_ROWS',
      leftCase: 'OPE',
      rightCase: 'SUS',
    }),
  }),
  omittedDiagnosticCases: Object.freeze([
    Object.freeze({ caseNumber: 1, category: 'OPE', formula: 'W+T1+P1' }),
    Object.freeze({ caseNumber: 2, category: 'SUS', formula: 'W+P1' }),
    Object.freeze({ caseNumber: 5, category: 'EXP', formula: 'L5=L1-L2' }),
  ]),
});

export const BM2_CASE_LABELS = Object.freeze(Object.keys(BM2_BENCHMARK_CASE_AUTHORITY.cases));
export const BM2_EXPLICIT_CASE_LABELS = Object.freeze(
  BM2_CASE_LABELS.filter((label) => (
    BM2_BENCHMARK_CASE_AUTHORITY.cases[label].sourceReportSelection != null
  )),
);

export function requireBm2CaseAuthority(label) {
  const authority = BM2_BENCHMARK_CASE_AUTHORITY.cases[label];
  if (!authority) throw new Error(`BM2 case authority is unavailable for ${label}.`);
  return authority;
}

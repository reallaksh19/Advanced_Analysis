import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  compileCodeResult,
  sealCodeProfile,
  sealEditionDataset,
  sealStressFactorSet,
} from '../src/core/linear-fea-b31-code-engine/index.js';
import { resolvePressureStressContribution } from '../src/core/linear-piping-code-application/pressure-stress-derivation.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../src/core/shared-piping-model/immutable.js';
import {
  buildBm1CodeStressComparison,
  parseCaesarStressReports,
} from './lfea-b3.17-caesar-stress-report.mjs';

export const BM1_CII_OUTPUT_PATH = fileURLToPath(
  new URL('../benchmarks/LFEA/BM1/BM1_CIIOutput.xml', import.meta.url),
);
export const PA_PER_PSI = 6894.757293168;
export const A106_GRADE_B_ALLOWABLE_PSI = 20000;
export const A106_GRADE_B_ALLOWABLE_PA = PA_PER_PSI * A106_GRADE_B_ALLOWABLE_PSI;
export const REFERENCE_TEMPERATURE = 293.15;
export const HOT_ALLOWABLE_TEMPERATURE = 393.15;

const A106_ALLOWABLE_SOURCE = Object.freeze({
  standard: 'ASME B31.3',
  edition: '2024',
  table: 'A-1',
  material: 'ASTM A106 Grade B seamless pipe',
  declaredBasicAllowableStressPsi: A106_GRADE_B_ALLOWABLE_PSI,
  conversion: '1 psi = 6894.757293168 Pa (exact SI conversion used by this repository authority)',
});

export function augmentBm1CodeStress(baseResult, suppliedCodeAuthorities = null) {
  requireBaseResult(baseResult);
  const codeAuthorities = suppliedCodeAuthorities ?? bm1CodeAuthorities(baseResult);
  const sustainedCode = sustainedStressResults(baseResult, codeAuthorities);
  const caesarContent = readFileSync(BM1_CII_OUTPUT_PATH, 'utf8');
  const caesarStressReports = parseCaesarStressReports(caesarContent);
  const caesarStressComparison = buildBm1CodeStressComparison({
    modelEntries: baseResult.modelEntries,
    sustainedResults: sustainedCode,
    displacementResults: baseResult.code,
    caesarReports: caesarStressReports,
    sourceFile: 'benchmarks/LFEA/BM1/BM1_CIIOutput.xml',
    sourceContent: caesarContent,
  });
  const report = augmentReport(baseResult.report, sustainedCode, caesarStressComparison, codeAuthorities);
  return deepFreeze({
    ...baseResult,
    codeAuthorities,
    sustainedCode,
    caesarContent,
    caesarStressReports,
    caesarStressComparison,
    report,
  });
}

export function bm1CodeAuthorities(baseResult) {
  const hot = baseResult.material.materialState.evaluationTemperature;
  if (hot !== HOT_ALLOWABLE_TEMPERATURE) {
    throw new Error(`M023 BM1 hot allowable authority requires ${HOT_ALLOWABLE_TEMPERATURE} K, received ${hot} K.`);
  }
  const profile = sealCodeProfile({
    schema: 'fea-b31-code-profile/v1',
    profileId: 'LINEAR-B31-CODE-PROFILE-R1',
    codeProfileId: 'M023-BM1-A106B-B31.3-CODE-STRESS',
    scope: 'METALLIC_PROCESS_PIPING_B31_3',
    editionStandard: 'ASME_B31_3_2024',
    flexibilitySource: 'ASME_B31J_2023',
    temperatureInterpolationPolicy: 'LINEAR_BRACKET_INTERPOLATION_V1',
    displacementRangeCombinationRuleId: 'DISPLACEMENT_RANGE_COLD_HOT_CYCLE_REDUCTION_LINEAR_V1',
    occasionalDurationFactors: [],
    liberalAllowableUse: false,
    liberalAllowableUpliftFactor: null,
    semanticHash: '',
  });
  const sourceIdentity = {
    standard: 'ASME_B31_3_2024',
    edition: '2024',
    sourceRevision: 'TABLE-A-1-ASTM-A106-GRADE-B-DECLARED-POINTS',
    sourceSemanticHash: semanticHash(A106_ALLOWABLE_SOURCE),
  };
  const editionDataset = sealEditionDataset({
    schema: 'fea-b31-edition-dataset/v1',
    datasetId: 'M023-ASME-B31.3-2024-A106B-20KSI-293K-393K',
    sourceIdentity,
    materialId: baseResult.material.materialState.materialId,
    allowablePoints: [
      {
        absoluteTemperature: REFERENCE_TEMPERATURE,
        allowableStress: {
          value: A106_GRADE_B_ALLOWABLE_PA,
          source: 'ASME B31.3-2024 Table A-1: ASTM A106 Grade B declared basic allowable stress 20.0 ksi at the 20 C reference point; exact psi-to-Pa conversion.',
        },
      },
      {
        absoluteTemperature: HOT_ALLOWABLE_TEMPERATURE,
        allowableStress: {
          value: A106_GRADE_B_ALLOWABLE_PA,
          source: 'ASME B31.3-2024 Table A-1: ASTM A106 Grade B declared basic allowable stress 20.0 ksi through the BM1 120 C hot point; exact psi-to-Pa conversion.',
        },
      },
    ],
    displacementRangeCoefficients: {
      coldWeight: { value: 1.25, source: 'ASME B31.3 Eq. (1a) cold allowable coefficient' },
      hotWeight: { value: 0.25, source: 'ASME B31.3 Eq. (1a) hot allowable coefficient' },
      cycleReductionFactor: { value: 1, source: 'BM1 CAESAR CASE 5 uses f=1; no cyclic reduction is declared for this benchmark' },
    },
    weldJointFactor: { value: 1, source: 'BM1 ASTM A106 Grade B seamless pipe joint-quality factor authority E=1.00' },
    semanticHash: '',
  });
  return deepFreeze({ profile, editionDataset, allowableAuthority: A106_ALLOWABLE_SOURCE });
}

export function sustainedStressResults(baseResult, codeAuthorities) {
  return baseResult.modelEntries.flatMap((entry) => ['I', 'J'].map((end) => {
    const recovered = baseResult.sustained.recovery.elementActions
      .find((row) => row.elementId === entry.elementId);
    if (!recovered) throw new Error(`Missing sustained recovery for ${entry.elementId}.`);
    const frame = frameForEntry(baseResult.sustained, entry);
    const pressureStressContribution = resolvePressureStressContribution({
      loadCase: baseResult.sustained.loadCase,
      frameElementRecord: frame,
      sectionResolution: entry.section,
      suppliedContribution: null,
    });
    return compileCodeResult({
      codeProfile: codeAuthorities.profile,
      editionDataset: codeAuthorities.editionDataset,
      stressFactorSet: unityStressFactors(entry.segment.id),
      category: 'SUSTAINED',
      codePointId: `${entry.segment.id}.${end}`,
      componentId: entry.segment.id,
      combinationId: 'BM1-SUSTAINED-W-P1-H',
      frameElementRecord: frame,
      sectionResolution: entry.section,
      materialResolution: baseResult.material,
      localAction: recovered.local[end],
      pressureStressContribution,
      coldTemperature: null,
      sustainedStress: null,
      occasionalCategoryId: null,
    });
  }));
}

function frameForEntry(analysis, entry) {
  if (!entry.component) {
    const frame = analysis.frameElements.find((row) => row.elementId === entry.elementId);
    if (!frame) throw new Error(`Missing frame element ${entry.elementId}.`);
    return frame;
  }
  const component = analysis.pipingComponents.find(
    (row) => row.componentId === entry.component.componentId,
  );
  const frame = component?.elements[0]?.frameElement;
  if (!frame) throw new Error(`Missing rigid-component frame element ${entry.elementId}.`);
  return frame;
}

function unityStressFactors(componentId) {
  const source = 'M023 BM1 InputXML contains no active SIF records; declared unity factor retained for comparison disclosure';
  const directional = () => ({
    axial: { value: 1, source },
    torsional: { value: 1, source },
    inPlaneBending: { value: 1, source },
    outOfPlaneBending: { value: 1, source },
  });
  return sealStressFactorSet({
    schema: 'fea-b31-stress-factor-set/v1',
    factorSetId: `${componentId}.M023.UNITY`,
    componentId,
    sourceIdentity: {
      standard: 'M023_INPUTXML',
      edition: '01',
      ruleId: 'NO-ACTIVE-SIF-UNITY',
      sourceRevision: 'BM1-LIVE',
      sourceSemanticHash: semanticHash({ componentId, source }),
    },
    applicability: {
      status: 'WITHIN_RANGE',
      ruleId: 'NO-ACTIVE-SIF',
      evaluatedBy: 'M023-BM1-CAESAR-STRESS-COMPARISON',
    },
    momentDirectionMapping: { inPlaneField: 'my', outOfPlaneField: 'mz' },
    sustainedIndices: directional(),
    occasionalIndices: directional(),
    displacementSifs: directional(),
    userOverride: null,
    semanticHash: '',
  });
}

function augmentReport(report, sustainedCode, comparison, codeAuthorities) {
  const limitations = report.limitations
    .filter((entry) => !entry.includes('ALLOWABLESTRESS values') && !entry.includes('screening allowable'));
  limitations.push(
    'M023 uses two declared ASTM A106 Grade B ASME B31.3-2024 Table A-1 points: 20,000 psi at 293.15 K and 393.15 K, converted to Pa with the exact SI psi conversion.',
    'M023 evaluates SUSTAINED at every compiled code point from the sustained recovery and derives P*Do/(4t) through the existing sealed PRESSURE-primitive code-application authority.',
    ...comparison.limitations,
  );
  return deepFreeze({
    ...report,
    schema: 'm023-bm1-inputxml-code-stress-report/v1',
    codeAuthority: {
      codeProfileSemanticHash: codeAuthorities.profile.semanticHash,
      editionDatasetSemanticHash: codeAuthorities.editionDataset.semanticHash,
      declaredAllowableStressPa: A106_GRADE_B_ALLOWABLE_PA,
      referenceTemperatureK: REFERENCE_TEMPERATURE,
      hotTemperatureK: HOT_ALLOWABLE_TEMPERATURE,
    },
    limitations: [...new Set(limitations)],
    elements: report.elements.map((element, index) => ({
      ...element,
      sustainedStress: sustainedCode.slice(index * 2, index * 2 + 2),
    })),
    caesarStressComparison: comparison,
  });
}

function requireBaseResult(value) {
  if (!value || !Array.isArray(value.modelEntries) || !value.sustained || !value.operating
      || !Array.isArray(value.code) || !value.report) {
    throw new TypeError('M023 requires the completed M020 BM1 solve result.');
  }
  if (value.code.length !== value.modelEntries.length * 2
      || !value.code.every((row) => row.category === 'DISPLACEMENT_STRESS_RANGE')) {
    throw new Error('M023 requires the existing two-ended M020 displacement stress result set.');
  }
}

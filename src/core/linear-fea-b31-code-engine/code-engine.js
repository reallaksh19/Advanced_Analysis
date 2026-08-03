import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { requireDeclaredValue } from '../shared-analysis-contract/declared-value.js';
import { requireFrameElement } from '../linear-fea-frame-element/index.js';
import { requirePipeSectionResolution } from '../linear-fea-section/index.js';
import { requireMaterialResolutionResult } from '../linear-fea-material/index.js';
import { requireLocalAction, sectionMechanicalProperties, extractResultants, combineStressTerms } from './stress-terms.js';
import { requireImplementedCategory, sustainedOrOccasionalAllowable, displacementRangeAllowable } from './categories.js';
import {
  CODE_LIMITATION_KEYS,
  CODE_RESULT_KEYS,
  CODE_RESULT_SCHEMA,
  CODE_RESULT_STATUSES,
  DISPLACEMENT_STRESS_RANGE,
  EXPANSION_RANGE_ENVELOPE,
  FACTOR_KEYS,
  OCCASIONAL,
  RESULTANT_KEYS,
  STATUS_CONDITIONAL,
  STATUS_QUALIFIED,
  STRESS_COMBINATION_METHOD,
  STRESS_TERM_KEYS,
  SUSTAINED,
  fail,
  requireArray,
  requireCodeProfile,
  requireEditionDataset,
  requireExactKeys,
  requireFactorApplicability,
  requireFinite,
  requireHash,
  requireIdentity,
  requireMember,
  requireStressFactorSet,
  requireText,
  requireTraceableDeclaredValue,
} from './code-engine-contract.js';

/**
 * LFEA-B4.0 exit boundary: evaluate one B31.3 code point (sections 10, 10.6)
 * from a sealed `fea-b31-code-profile/v1`, a sealed `fea-b31-edition-dataset/v1`,
 * a sealed `fea-b31-stress-factor-set/v1`, a sealed B-3.1 frame element (for
 * section/material citation only) and a B-3.4 recovered local action, into a
 * sealed `lfea-b31-code-result/v1` record.
 *
 * This function computes no stiffness, resultant or flexibility factor: the
 * local action is exactly the recovered value B-3.4 already produced, and the
 * section/material are exactly the records B-2.2/B-2.3 already resolved and
 * B-3.1 already retained. It combines them under the generic, symbolically-
 * named `STRESS_COMBINATION_METHOD`, comparing against an allowable stress
 * built entirely from caller-declared edition-dataset/profile values.
 *
 * @param {object} args
 * @param {Readonly<object>} args.codeProfile Sealed `fea-b31-code-profile/v1`.
 * @param {Readonly<object>} args.editionDataset Sealed `fea-b31-edition-dataset/v1`.
 * @param {Readonly<object>} args.stressFactorSet Sealed `fea-b31-stress-factor-set/v1`.
 * @param {'SUSTAINED'|'OCCASIONAL'|'DISPLACEMENT_STRESS_RANGE'|'EXPANSION_RANGE_ENVELOPE'} args.category
 * @param {string} args.codePointId Canonical identity of the physical code point (section 9.1).
 * @param {string} args.componentId Canonical identity of the owning B-3.2 component; must match `stressFactorSet.componentId`.
 * @param {string} args.combinationId Canonical identity of the physical case (or case pair) this check is built from.
 * @param {Readonly<object>} args.frameElementRecord Sealed `fea-linear-frame-element/v1` for the element the code point resolves to.
 * @param {Readonly<object>} args.sectionResolution Sealed `fea-linear-pipe-section-resolution/v1` cited by `frameElementRecord.section` (for outer-diameter geometry only; area/inertia are read off the frame element's own retained section).
 * @param {Readonly<object>|null} args.sustainedSectionResolution Optional sealed nominal-less-allowances section used only for SUSTAINED stress terms.
 * @param {Readonly<object>} args.materialResolution Sealed `fea-linear-material-resolution/v1` cited by `frameElementRecord.material` (for material identity; evaluation temperature is read off the frame element's own retained material).
 * @param {{fx:number,fy:number,fz:number,mx:number,my:number,mz:number}} args.localAction B-3.4 recovered local action at this code point.
 * @param {{value:number, source:string}|null} args.pressureStressContribution Required (non-null) for SUSTAINED/OCCASIONAL; must be null for both range categories.
 * @param {{value:number, source:string}|null} args.coldTemperature Required for both range categories. For EXPANSION_RANGE_ENVELOPE it supplies only the Eq. (1b) `Sc` lookup and does not identify either CASE_RANGE endpoint.
 * @param {{value:number, source:string}|null} args.sustainedStress Required only for EXPANSION_RANGE_ENVELOPE as the Eq. (1b) `SL` term.
 * @param {string|null} args.occasionalCategoryId Required for OCCASIONAL, matching one `profile.occasionalDurationFactors` entry; must be null otherwise.
 * @returns {Readonly<object>} Sealed `lfea-b31-code-result/v1`.
 */
export function compileCodeResult({
  codeProfile,
  editionDataset,
  stressFactorSet,
  category,
  codePointId,
  componentId,
  combinationId,
  frameElementRecord,
  sectionResolution,
  sustainedSectionResolution = null,
  materialResolution,
  localAction,
  pressureStressContribution,
  coldTemperature,
  sustainedStress = null,
  occasionalCategoryId,
}) {
  const CODE = 'CODE_ENGINE_INVALID';
  requireImplementedCategory(category);

  const profile = requireCodeProfile(codeProfile);
  const dataset = requireEditionDataset(editionDataset);
  const factorSet = requireStressFactorSet(stressFactorSet);
  const element = requireFrameElement(frameElementRecord);
  const acceptedSection = requirePipeSectionResolution(sectionResolution);
  const acceptedMaterial = requireMaterialResolutionResult(materialResolution);
  const acceptedCodePointId = requireIdentity(codePointId, 'codePointId', CODE);
  const acceptedComponentId = requireIdentity(componentId, 'componentId', CODE);
  const acceptedCombinationId = requireText(combinationId, 'combinationId', CODE);
  requireLocalAction(localAction, 'localAction', CODE);

  if (factorSet.componentId !== acceptedComponentId) {
    fail(
      `stressFactorSet.componentId (${factorSet.componentId}) does not match the supplied componentId (${acceptedComponentId}); a code point is evaluated against the factor set declared for its own component, never a substitute.`,
      'CODE_ENGINE_COMPONENT_MISMATCH',
    );
  }
  if (acceptedSection.semanticHash !== element.section.resolutionSemanticHash) {
    fail(
      'sectionResolution.semanticHash does not match frameElementRecord.section.resolutionSemanticHash; section geometry must be cited from the exact resolution the element was compiled from, never a substitute.',
      'CODE_ENGINE_SECTION_MISMATCH',
    );
  }

  let acceptedSustainedSection = null;
  if (category !== SUSTAINED) {
    if (sustainedSectionResolution !== null) {
      fail(
        'sustainedSectionResolution must be null outside SUSTAINED; nominal-less-allowances properties are not authorised for this category.',
        'CODE_ENGINE_SUSTAINED_SECTION_OVERRIDE_CATEGORY_MISMATCH',
      );
    }
  } else if (sustainedSectionResolution !== null) {
    acceptedSustainedSection = requirePipeSectionResolution(sustainedSectionResolution);
    if (acceptedSustainedSection.dimensions.outerDiameter !== acceptedSection.dimensions.outerDiameter) {
      fail(
        'sustainedSectionResolution.dimensions.outerDiameter must exactly match the nominal section outer diameter; an allowance changes wall thickness only.',
        'CODE_ENGINE_SUSTAINED_SECTION_OVERRIDE_GEOMETRY_MISMATCH',
      );
    }
  }

  if (acceptedMaterial.materialState.materialStateId !== element.material.materialStateId) {
    fail(
      'materialResolution.materialState.materialStateId does not match frameElementRecord.material.materialStateId; material identity must be cited from the exact resolution the element was compiled from, never a substitute.',
      'CODE_ENGINE_MATERIAL_MISMATCH',
    );
  }
  if (dataset.materialId !== acceptedMaterial.materialState.materialId) {
    fail(
      `editionDataset.materialId (${dataset.materialId}) does not match the cited material resolution's own materialId (${acceptedMaterial.materialState.materialId}); allowable stresses are cited for the exact material a code point's section belongs to.`,
      'CODE_ENGINE_MATERIAL_MISMATCH',
    );
  }

  /*
   * Section 10.4: applicability is the B31J-derived factor set's own verdict
   * — OUTSIDE_RANGE blocks, USER_FACTOR_REQUIRED blocks unless an override
   * carrying reason/source/revision/approver is supplied. Reused directly
   * from B-3.2 rather than reimplemented (the shape and the rule are
   * identical: a declared applicability verdict plus an optional override).
   */
  const applicabilityEvidence = requireFactorApplicability(factorSet);

  /*
   * The hot/operating evaluation temperature is cited from the element's own
   * already-resolved material state. Both range categories also require one
   * caller-declared cold/reference temperature for the `Sc` allowable lookup.
   * For EXPANSION_RANGE_ENVELOPE that declaration is allowable evidence only:
   * it does not select, order, or otherwise affect the two CASE_RANGE actions.
   */
  const hotTemperature = element.material.evaluationTemperature;
  let acceptedColdTemperature = null;
  const isRangeCategory = category === DISPLACEMENT_STRESS_RANGE
    || category === EXPANSION_RANGE_ENVELOPE;
  if (isRangeCategory) {
    if (coldTemperature === null) {
      const code = category === EXPANSION_RANGE_ENVELOPE
        ? 'CODE_ENGINE_EXPANSION_RANGE_COLD_TEMPERATURE_REQUIRED'
        : 'CODE_ENGINE_DISPLACEMENT_RANGE_COLD_TEMPERATURE_REQUIRED';
      fail(`coldTemperature is required for ${category} to resolve the declared Sc allowable.`, code);
    }
    requireTraceableDeclaredValue(
      requireDeclaredValue({ coldTemperature }, 'coldTemperature', {}),
      'coldTemperature',
      'CODE_ENGINE_SOURCE_NOT_TRACEABLE',
    );
    acceptedColdTemperature = coldTemperature.value;
  } else if (coldTemperature !== null) {
    fail('coldTemperature must be null outside range categories.', CODE);
  }

  let acceptedSustainedStress = null;
  if (category === EXPANSION_RANGE_ENVELOPE) {
    if (sustainedStress === null) {
      fail(
        'sustainedStress is required for EXPANSION_RANGE_ENVELOPE as the ASME B31.3-2006 para. 302.3.5(d) Eq. (1b) SL term.',
        'CODE_ENGINE_EXPANSION_RANGE_SUSTAINED_STRESS_REQUIRED',
      );
    }
    requireTraceableDeclaredValue(
      requireDeclaredValue({ sustainedStress }, 'sustainedStress', { minimum: 0 }),
      'sustainedStress',
      'CODE_ENGINE_SOURCE_NOT_TRACEABLE',
    );
    acceptedSustainedStress = sustainedStress.value;
  } else if (sustainedStress !== null) {
    fail(
      'sustainedStress must be null outside EXPANSION_RANGE_ENVELOPE.',
      'CODE_ENGINE_EXPANSION_RANGE_SUSTAINED_STRESS_CATEGORY_MISMATCH',
    );
  }

  if (category === OCCASIONAL) {
    requireText(occasionalCategoryId, 'occasionalCategoryId', CODE);
  } else if (occasionalCategoryId !== null) {
    fail('occasionalCategoryId must be null outside OCCASIONAL.', CODE);
  }

  if (isRangeCategory) {
    if (pressureStressContribution !== null) {
      fail('pressureStressContribution must be null for range categories; a secondary-stress range excludes the sustained pressure/primary term.', CODE);
    }
  } else if (pressureStressContribution === null) {
    fail(`pressureStressContribution is required for ${category}.`, CODE);
  } else {
    requireTraceableDeclaredValue(
      requireDeclaredValue({ pressureStressContribution }, 'pressureStressContribution', {}),
      'pressureStressContribution',
      'CODE_ENGINE_SOURCE_NOT_TRACEABLE',
    );
  }

  const mechanicalProperties = acceptedSustainedSection === null
    ? sectionMechanicalProperties(element.section, acceptedSection)
    : sectionMechanicalProperties(acceptedSustainedSection.sectionState, acceptedSustainedSection);
  const resultants = extractResultants(localAction, factorSet.momentDirectionMapping);

  let declaredIndices;
  let allowableStress;
  let allowableLimitations;
  if (category === SUSTAINED || category === OCCASIONAL) {
    declaredIndices = category === SUSTAINED ? factorSet.sustainedIndices : factorSet.occasionalIndices;
    const resolved = sustainedOrOccasionalAllowable({
      category, profile, dataset, hotTemperature, occasionalCategoryId,
    });
    allowableStress = resolved.allowableStress;
    allowableLimitations = resolved.limitations;
  } else {
    declaredIndices = factorSet.displacementSifs;
    const resolved = displacementRangeAllowable({
      profile,
      dataset,
      hotTemperature,
      coldTemperature: acceptedColdTemperature,
      sustainedStress: acceptedSustainedStress,
    });
    allowableStress = resolved.allowableStress;
    allowableLimitations = resolved.limitations;
  }
  /* `factorSet.*Indices`/`displacementSifs` carry declared `{value, source}`
   * entries (section 10.4 traceability); unwrap to plain numbers once, here,
   * for the combination arithmetic and the record's own `factors` block. */
  const indices = {
    axial: declaredIndices.axial.value,
    torsional: declaredIndices.torsional.value,
    inPlaneBending: declaredIndices.inPlaneBending.value,
    outOfPlaneBending: declaredIndices.outOfPlaneBending.value,
  };

  const pressureValue = isRangeCategory ? 0 : pressureStressContribution.value;
  const { stressTerms, calculatedStress } = combineStressTerms(resultants, mechanicalProperties, indices, pressureValue);

  const factors = {
    axialIndex: indices.axial,
    torsionalIndex: indices.torsional,
    inPlaneSif: indices.inPlaneBending,
    outOfPlaneSif: indices.outOfPlaneBending,
    flexibilitySource: `${factorSet.sourceIdentity.standard}:${factorSet.sourceIdentity.edition}:${factorSet.sourceIdentity.ruleId}`,
  };

  const limitations = [...allowableLimitations];
  if (factorSet.userOverride !== null) {
    limitations.push({
      code: 'CODE_ENGINE_APPROXIMATION_USER_FACTOR_OVERRIDE',
      register: 'section-11',
      status: 'CONDITIONAL',
      disclosure: 'A user-supplied B31J factor override is in effect for this component rather than the edition-declared factor set applicability verdict.',
      details: { ...factorSet.userOverride },
    });
  }
  limitations.sort((left, right) => (left.code < right.code ? -1 : left.code > right.code ? 1 : 0));

  const status = limitations.some((entry) => entry.status === 'CONDITIONAL') || applicabilityEvidence.status !== 'WITHIN_RANGE'
    ? STATUS_CONDITIONAL
    : STATUS_QUALIFIED;

  /*
   * Section 15.5: changing the code edition/profile (or the edition dataset)
   * must invalidate a prior code result rather than silently reuse it.
   * `governingRuleId` folds a fragment of both semantic hashes into the
   * identity string it already carries, so it — and therefore the record's
   * own semanticHash — changes whenever the profile or dataset changes, even
   * if a caller reuses the same human-readable codeProfileId by mistake.
   */
  const governingRuleId = `${category}:${STRESS_COMBINATION_METHOD}:${profile.semanticHash.slice(8, 24)}:${dataset.semanticHash.slice(8, 24)}`;

  const draft = {
    schema: CODE_RESULT_SCHEMA,
    codeProfileId: profile.codeProfileId,
    codePointId: acceptedCodePointId,
    componentId: acceptedComponentId,
    combinationId: acceptedCombinationId,
    category,
    status,
    resultants,
    factors,
    stressTerms,
    calculatedStress,
    allowableStress,
    utilization: calculatedStress / allowableStress,
    governingRuleId,
    limitations,
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = computeCodeResultSemanticHash(draft);
  draft.evidenceHash = computeCodeResultEvidenceHash(draft);
  return requireCodeResult(draft);
}

export function codeResultSemanticProjection(record) {
  const projection = {};
  for (const key of CODE_RESULT_KEYS) {
    if (key === 'semanticHash' || key === 'evidenceHash') continue;
    projection[key] = record[key];
  }
  return projection;
}

export function computeCodeResultSemanticHash(record) {
  return semanticHash(codeResultSemanticProjection(record));
}

export function computeCodeResultEvidenceHash(record) {
  return semanticHash({ semanticHash: record.semanticHash, category: record.category, status: record.status });
}

function requireResultants(value, field) {
  requireExactKeys(value, RESULTANT_KEYS, field, 'CODE_ENGINE_INVALID');
  for (const key of RESULTANT_KEYS) requireFinite(value[key], `${field}.${key}`, 'CODE_ENGINE_INVALID');
}

function requireFactors(value, field) {
  requireExactKeys(value, FACTOR_KEYS, field, 'CODE_ENGINE_INVALID');
  for (const key of FACTOR_KEYS) {
    if (key === 'flexibilitySource') { requireText(value[key], `${field}.${key}`, 'CODE_ENGINE_INVALID'); continue; }
    requireFinite(value[key], `${field}.${key}`, 'CODE_ENGINE_INVALID');
  }
}

function requireStressTerms(value, field) {
  requireExactKeys(value, STRESS_TERM_KEYS, field, 'CODE_ENGINE_INVALID');
  for (const key of STRESS_TERM_KEYS) requireFinite(value[key], `${field}.${key}`, 'CODE_ENGINE_INVALID');
}

/**
 * Re-accept a sealed `lfea-b31-code-result/v1` record: exact keys, structural
 * completeness and a semantic hash that still matches the content.
 */
export function requireCodeResult(record) {
  const CODE = 'CODE_ENGINE_INVALID';
  requireExactKeys(record, CODE_RESULT_KEYS, 'codeResult', CODE);
  if (record.schema !== CODE_RESULT_SCHEMA) fail(`codeResult.schema must be ${CODE_RESULT_SCHEMA}.`, CODE);
  requireText(record.codeProfileId, 'codeResult.codeProfileId', CODE);
  requireIdentity(record.codePointId, 'codeResult.codePointId', CODE);
  requireIdentity(record.componentId, 'codeResult.componentId', CODE);
  requireText(record.combinationId, 'codeResult.combinationId', CODE);
  requireMember(
    record.category,
    ['SUSTAINED', 'OCCASIONAL', 'DISPLACEMENT_STRESS_RANGE', 'EXPANSION_RANGE_ENVELOPE'],
    'codeResult.category',
    CODE,
  );
  requireMember(record.status, CODE_RESULT_STATUSES, 'codeResult.status', CODE);
  requireResultants(record.resultants, 'codeResult.resultants');
  requireFactors(record.factors, 'codeResult.factors');
  requireStressTerms(record.stressTerms, 'codeResult.stressTerms');
  requireFinite(record.calculatedStress, 'codeResult.calculatedStress', CODE);
  if (!(record.calculatedStress >= 0)) fail('codeResult.calculatedStress must be non-negative.', CODE);
  requireFinite(record.allowableStress, 'codeResult.allowableStress', CODE);
  if (!(record.allowableStress > 0)) fail('codeResult.allowableStress must be greater than zero.', CODE);
  requireFinite(record.utilization, 'codeResult.utilization', CODE);
  requireText(record.governingRuleId, 'codeResult.governingRuleId', CODE);
  requireArray(record.limitations, 'codeResult.limitations', CODE);
  record.limitations.forEach((entry, index) => {
    const field = `codeResult.limitations[${index}]`;
    requireExactKeys(entry, CODE_LIMITATION_KEYS, field, CODE);
    requireText(entry.code, `${field}.code`, CODE);
    requireMember(entry.status, ['ACCEPTED', 'CONDITIONAL', 'OUTSIDE_SCOPE', 'UNRESOLVED'], `${field}.status`, CODE);
  });
  if (Math.abs(record.utilization - record.calculatedStress / record.allowableStress) > 1e-12) {
    fail('codeResult.utilization is inconsistent with calculatedStress/allowableStress.', CODE);
  }
  requireHash(record.semanticHash, 'codeResult.semanticHash', CODE);
  requireHash(record.evidenceHash, 'codeResult.evidenceHash', CODE);
  if (record.semanticHash !== computeCodeResultSemanticHash(record)) fail('codeResult.semanticHash is stale.', 'CODE_ENGINE_HASH_MISMATCH');
  if (record.evidenceHash !== computeCodeResultEvidenceHash(record)) fail('codeResult.evidenceHash is stale.', 'CODE_ENGINE_HASH_MISMATCH');
  return deepFreeze({ ...record });
}

import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { requireMaterialResolutionResult } from '../linear-fea-material/index.js';
import { requirePipeSectionResolution } from '../linear-fea-section/index.js';
import { verifyFrameLocalAxes } from '../centerline-beam-fea/local-axis-validation.js';
import { requireLoadPrimitive } from '../linear-fea-load-case/load-primitives.js';
import {
  DOF_ORDER,
  ELEMENT_END_ORDER,
  ELEMENT_MATRIX_STORAGE_ID,
  ELEMENT_VECTOR_LAYOUT_ID,
  THERMAL_STRAIN_CONVENTION_ID,
  TRANSFORMATION_CONVENTION_ID,
  elementDofIndex,
} from '../linear-fea-contract/conventions.js';
import {
  FRAME_ELEMENT_INPUT_KEYS,
  FRAME_ELEMENT_LIMITATION_KEYS,
  FRAME_ELEMENT_RECORD_KEYS,
  FRAME_ELEMENT_SCHEMA,
  FRAME_ELEMENT_SUPPORTED_LOAD_KINDS,
  NO_SHEAR_DEFORMATION_LIMITATION_CODE,
  RIGID_OFFSET_LIMITATION_CODE,
  STATIC_CONDENSATION_RULE,
  STRAIGHT_BEAM_LIMITATION_CODE,
  TIMOSHENKO_FORMULATION,
  UNIFORM_TEMPERATURE_LIMITATION_CODE,
  compareAscii,
  fail,
  requireArray,
  requireExactKeys,
  requireFinite,
  requireFrameElementProfile,
  requireHash,
  requireIdentity,
  requireMember,
  requirePositive,
  requireRecord,
  resolveFrameElementPolicies,
} from './frame-element-contract.js';
import {
  applyOffsetToLoad,
  applyOffsetToStiffness,
  cleanVector,
  condenseEndConditions,
  frameLocalStiffness,
  frameOffsetMatrix,
  frameTransformationMatrix,
  transformLoadToGlobal,
  transformStiffnessToGlobal,
  zeroVector12,
} from './frame-element-stiffness.js';
import {
  distributedLoadLocalVector,
  thermalInitialStrainVector,
} from './frame-element-loads.js';

const INPUT_CODE = 'FRAME_ELEMENT_INPUT_INVALID';

function limitation(code, stiffnessRelevant, disclosure, details = {}) {
  return {
    code,
    severity: 'INFO',
    scope: 'ELEMENT',
    stiffnessRelevant,
    details: { disclosure, ...details },
  };
}

function byCode(left, right) {
  return compareAscii(left.code, right.code);
}

function requireEndDof(entry, field) {
  requireMember(entry.end, ELEMENT_END_ORDER, `${field}.end`, 'FRAME_ELEMENT_RELEASE_INVALID');
  requireMember(entry.dof, DOF_ORDER, `${field}.dof`, 'FRAME_ELEMENT_RELEASE_INVALID');
  return `${entry.end}:${entry.dof}`;
}

/**
 * Accept explicit end releases and partial-release end springs (section 5.3).
 * Every entry names a local DOF at end I or J. The same DOF released twice,
 * sprung twice, or both released and sprung is a conflicting definition and
 * blocks; a spring must carry a positive finite stiffness — zero or negative
 * would be a release or an instability wearing a spring's name.
 */
function requireEndConditions(releases, endSprings) {
  requireArray(releases, 'releases', 'FRAME_ELEMENT_RELEASE_INVALID');
  requireArray(endSprings, 'endSprings', 'FRAME_ELEMENT_RELEASE_INVALID');
  const seen = new Set();
  const acceptedReleases = releases.map((entry, position) => {
    const field = `releases[${position}]`;
    requireExactKeys(entry, ['end', 'dof'], field, 'FRAME_ELEMENT_RELEASE_INVALID');
    const key = requireEndDof(entry, field);
    if (seen.has(key)) {
      fail(`${field} declares ${key} more than once.`, 'FRAME_ELEMENT_RELEASE_CONFLICT');
    }
    seen.add(key);
    return { end: entry.end, dof: entry.dof };
  });
  const acceptedSprings = endSprings.map((entry, position) => {
    const field = `endSprings[${position}]`;
    requireExactKeys(entry, ['end', 'dof', 'stiffness'], field, 'FRAME_ELEMENT_RELEASE_INVALID');
    const key = requireEndDof(entry, field);
    if (seen.has(key)) {
      fail(
        `${field} declares ${key}, which is already released or sprung; a DOF has exactly one end condition.`,
        'FRAME_ELEMENT_RELEASE_CONFLICT',
      );
    }
    seen.add(key);
    const stiffness = requireFinite(entry.stiffness, `${field}.stiffness`, 'FRAME_ELEMENT_SPRING_STIFFNESS_INVALID');
    if (!(stiffness > 0)) {
      fail(
        `${field}.stiffness must be a positive finite spring rate; a partial release is a spring, not a zero.`,
        'FRAME_ELEMENT_SPRING_STIFFNESS_INVALID',
      );
    }
    return { end: entry.end, dof: entry.dof, stiffness };
  });
  for (const end of ELEMENT_END_ORDER) {
    const releasedAtEnd = acceptedReleases.filter((entry) => entry.end === end).length;
    if (releasedAtEnd === DOF_ORDER.length) {
      fail(
        `All six local DOFs are released at end ${end}; the element would carry nothing to that joint, which is a mechanism and blocks.`,
        'FRAME_ELEMENT_RELEASE_MECHANISM',
      );
    }
  }
  const order = (entry) => elementDofIndex(entry.end, entry.dof);
  acceptedReleases.sort((left, right) => order(left) - order(right));
  acceptedSprings.sort((left, right) => order(left) - order(right));
  return { releases: acceptedReleases, springs: acceptedSprings };
}

function requireOffsets(rigidOffsets) {
  if (rigidOffsets === null) return { I: null, J: null };
  requireExactKeys(rigidOffsets, ['I', 'J'], 'rigidOffsets', 'FRAME_ELEMENT_OFFSET_INVALID');
  const accepted = {};
  for (const end of ELEMENT_END_ORDER) {
    const value = rigidOffsets[end];
    if (value === null) {
      accepted[end] = null;
      continue;
    }
    requireExactKeys(value, ['x', 'y', 'z'], `rigidOffsets.${end}`, 'FRAME_ELEMENT_OFFSET_INVALID');
    accepted[end] = ['x', 'y', 'z'].map((component) =>
      requireFinite(value[component], `rigidOffsets.${end}.${component}`, 'FRAME_ELEMENT_OFFSET_INVALID'));
  }
  return accepted;
}

function requireElementPrimitive(primitive, elementId, field) {
  const accepted = requireLoadPrimitive(primitive);
  if (accepted.elementId !== elementId) {
    fail(
      `${field} is declared for element ${accepted.elementId}, not ${elementId}.`,
      'FRAME_ELEMENT_PRIMITIVE_ELEMENT_MISMATCH',
    );
  }
  return accepted;
}

/**
 * Compile one straight 3D frame element into an immutable
 * `fea-linear-frame-element/v1` record (sections 5.1-5.4).
 *
 * The element consumes each upstream authority through that authority's own
 * validator — B-2.2 material state, B-2.3 section state, B-2.4 local axes,
 * B-3.0 load primitives — and re-derives none of them. It returns local and
 * global matrices and vectors plus evidence; it holds no DOF map, no global
 * index and no assembled system, which are B-3.3's.
 *
 * @param {object} input See `FRAME_ELEMENT_INPUT_KEYS`.
 * @returns {Readonly<object>} Sealed `fea-linear-frame-element/v1` record.
 */
export function compileFrameElement(input) {
  requireExactKeys(input, FRAME_ELEMENT_INPUT_KEYS, 'frameElementInput', INPUT_CODE);
  const elementId = requireIdentity(input.elementId, 'frameElementInput.elementId', INPUT_CODE);
  const profile = requireFrameElementProfile(input.profile);
  const policies = resolveFrameElementPolicies(profile);
  const material = requireMaterialResolutionResult(input.material);
  const section = requirePipeSectionResolution(input.section);
  requireExactKeys(input.localAxes, ['result', 'profile'], 'frameElementInput.localAxes', INPUT_CODE);
  const axisResult = verifyFrameLocalAxes(input.localAxes.result, input.localAxes.profile);
  const length = requirePositive(
    axisResult.elementDirection.length,
    'localAxes.result.elementDirection.length',
    'FRAME_ELEMENT_LENGTH_INVALID',
  );

  const materialState = material.materialState;
  const sectionState = section.sectionState;
  const shearDeformation = profile.shearDeformation;

  const { matrix: baseLocal, phiXY, phiXZ } = frameLocalStiffness({
    elasticModulus: materialState.elasticModulus,
    shearModulus: materialState.shearModulus,
    area: sectionState.area,
    secondMomentY: sectionState.secondMomentY,
    secondMomentZ: sectionState.secondMomentZ,
    polarMoment: sectionState.polarMoment,
    length,
    shearDeformation,
    shearCorrectionFactorY: policies.shearCorrection?.y.value,
    shearCorrectionFactorZ: policies.shearCorrection?.z.value,
  });

  requireArray(input.distributedLoads, 'frameElementInput.distributedLoads', INPUT_CODE);
  const distributedLoads = input.distributedLoads
    .map((primitive, position) => {
      const accepted = requireElementPrimitive(
        primitive,
        elementId,
        `frameElementInput.distributedLoads[${position}]`,
      );
      requireMember(
        accepted.kind,
        FRAME_ELEMENT_SUPPORTED_LOAD_KINDS,
        `frameElementInput.distributedLoads[${position}].kind`,
        'FRAME_ELEMENT_PRIMITIVE_UNSUPPORTED',
      );
      return accepted;
    })
    .sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));
  for (let position = 1; position < distributedLoads.length; position += 1) {
    if (distributedLoads[position].primitiveId === distributedLoads[position - 1].primitiveId) {
      fail(
        `frameElementInput.distributedLoads declares ${distributedLoads[position].primitiveId} more than once.`,
        'FRAME_ELEMENT_PRIMITIVE_AMBIGUOUS',
      );
    }
  }

  let equivalentLocal = zeroVector12();
  for (const primitive of distributedLoads) {
    const vector = distributedLoadLocalVector({
      primitive,
      axes: axisResult.axes,
      length,
      phiXY,
      phiXZ,
    });
    equivalentLocal = cleanVector(equivalentLocal.map((value, dof) => value + vector[dof]));
  }

  let thermal = null;
  let initialStrainLocal = zeroVector12();
  if (input.temperature !== null) {
    const temperature = requireElementPrimitive(input.temperature, elementId, 'frameElementInput.temperature');
    if (temperature.kind !== 'TEMPERATURE') {
      fail('frameElementInput.temperature must be a TEMPERATURE primitive.', 'FRAME_ELEMENT_PRIMITIVE_UNSUPPORTED');
    }
    if (temperature.stiffnessEvaluationMaterialStateId !== materialState.materialStateId) {
      fail(
        `frameElementInput.temperature was declared against material state ${temperature.stiffnessEvaluationMaterialStateId}, not ${materialState.materialStateId}.`,
        'FRAME_ELEMENT_MATERIAL_STATE_MISMATCH',
      );
    }
    if (temperature.thermalStrainProfileId !== profile.thermalStrainApproximation) {
      fail(
        'frameElementInput.temperature names a thermal-strain approximation the formulation profile does not declare.',
        'FRAME_ELEMENT_THERMAL_PROFILE_MISMATCH',
      );
    }
    const temperatureDifference = requireFinite(
      temperature.operatingTemperature - temperature.installationTemperature,
      'temperatureDifference',
      INPUT_CODE,
    );
    const axialStrain = requireFinite(
      materialState.thermalExpansionCoefficient * temperatureDifference,
      'axialStrain',
      INPUT_CODE,
    );
    initialStrainLocal = thermalInitialStrainVector({
      elasticModulus: materialState.elasticModulus,
      area: sectionState.area,
      axialStrain,
    });
    thermal = {
      primitiveId: temperature.primitiveId,
      primitiveSemanticHash: temperature.semanticHash,
      operatingTemperature: temperature.operatingTemperature,
      installationTemperature: temperature.installationTemperature,
      temperatureDifference,
      expansionCoefficient: materialState.thermalExpansionCoefficient,
      axialStrain,
      freeExtension: requireFinite(axialStrain * length, 'freeExtension', INPUT_CODE),
      approximationProfileId: profile.thermalStrainApproximation,
      strainConvention: THERMAL_STRAIN_CONVENTION_ID,
    };
  }

  const endConditions = requireEndConditions(input.releases, input.endSprings);
  const condensationEntries = [
    ...endConditions.releases.map((entry) => ({ index: elementDofIndex(entry.end, entry.dof), stiffness: 0 })),
    ...endConditions.springs.map((entry) => ({ index: elementDofIndex(entry.end, entry.dof), stiffness: entry.stiffness })),
  ].sort((left, right) => left.index - right.index);
  const condensed = condenseEndConditions(
    baseLocal,
    [equivalentLocal, initialStrainLocal],
    condensationEntries,
    policies.releaseSingularityTolerance.value,
  );

  const transformation = frameTransformationMatrix(axisResult.axes);
  const offsets = requireOffsets(input.rigidOffsets);
  const hasOffsets = offsets.I !== null || offsets.J !== null;
  const offsetMatrix = hasOffsets ? frameOffsetMatrix(offsets) : null;

  let globalStiffness = transformStiffnessToGlobal(condensed.matrix, transformation);
  let equivalentGlobal = transformLoadToGlobal(condensed.vectors[0], transformation);
  let initialStrainGlobal = transformLoadToGlobal(condensed.vectors[1], transformation);
  if (offsetMatrix !== null) {
    globalStiffness = applyOffsetToStiffness(globalStiffness, offsetMatrix);
    equivalentGlobal = applyOffsetToLoad(equivalentGlobal, offsetMatrix);
    initialStrainGlobal = applyOffsetToLoad(initialStrainGlobal, offsetMatrix);
  }

  const limitations = [
    limitation(
      STRAIGHT_BEAM_LIMITATION_CODE,
      true,
      'The pipe wall is represented as a straight prismatic frame member; ovalization and local shell effects are not represented except through separately qualified flexibility/SIF factors.',
      { formulationId: profile.straightPipeFormulation },
    ),
    ...section.limitations,
  ];
  if (!shearDeformation) {
    limitations.push(limitation(
      NO_SHEAR_DEFORMATION_LIMITATION_CODE,
      true,
      'The declared Euler-Bernoulli formulation carries no transverse shear deformation; deep members under this profile understate deflection.',
      { formulationId: profile.straightPipeFormulation },
    ));
  }
  if (thermal !== null) {
    limitations.push(limitation(
      UNIFORM_TEMPERATURE_LIMITATION_CODE,
      false,
      'Thermal strain uses a uniform alpha * deltaT under the declared approximation profile; no gradient or stratification is modelled and temperature-dependent expansion-coefficient integration is deferred to the thermal-load compiler.',
      { approximationProfileId: profile.thermalStrainApproximation },
    ));
  }
  if (hasOffsets) {
    limitations.push(limitation(
      RIGID_OFFSET_LIMITATION_CODE,
      true,
      'End offsets are kinematically rigid: offset flexibility is not represented, and forces and displacements are transferred with moment-arm consistency.',
      {},
    ));
  }

  const draft = {
    schema: FRAME_ELEMENT_SCHEMA,
    elementId,
    formulationId: profile.straightPipeFormulation,
    shearDeformation,
    releaseRule: STATIC_CONDENSATION_RULE,
    profileSemanticHash: profile.semanticHash,
    shearCorrection: profile.straightPipeFormulation === TIMOSHENKO_FORMULATION
      ? {
        y: { value: policies.shearCorrection.y.value, source: policies.shearCorrection.y.source },
        z: { value: policies.shearCorrection.z.value, source: policies.shearCorrection.z.source },
      }
      : null,
    material: {
      materialStateId: materialState.materialStateId,
      elasticModulus: materialState.elasticModulus,
      shearModulus: materialState.shearModulus,
      thermalExpansionCoefficient: materialState.thermalExpansionCoefficient,
      evaluationTemperature: materialState.evaluationTemperature,
      resolutionSemanticHash: material.semanticHash,
    },
    section: {
      sectionStateId: sectionState.sectionStateId,
      area: sectionState.area,
      secondMomentY: sectionState.secondMomentY,
      secondMomentZ: sectionState.secondMomentZ,
      polarMoment: sectionState.polarMoment,
      resolutionSemanticHash: section.semanticHash,
    },
    geometry: { length },
    localAxes: {
      profileId: axisResult.profileId,
      profileSemanticHash: axisResult.profileSemanticHash,
      resultSemanticHash: axisResult.semanticHash,
      axes: {
        x: [...axisResult.axes.x],
        y: [...axisResult.axes.y],
        z: [...axisResult.axes.z],
      },
    },
    transformation: {
      conventionId: TRANSFORMATION_CONVENTION_ID,
      storage: ELEMENT_MATRIX_STORAGE_ID,
      vectorLayout: ELEMENT_VECTOR_LAYOUT_ID,
      matrix: transformation,
    },
    localStiffness: condensed.matrix,
    globalStiffness,
    equivalentLoadVector: { local: condensed.vectors[0], global: equivalentGlobal },
    initialStrainLoadVector: { local: condensed.vectors[1], global: initialStrainGlobal },
    appliedLoads: distributedLoads.map((primitive) => ({
      primitiveId: primitive.primitiveId,
      kind: primitive.kind,
      semanticHash: primitive.semanticHash,
    })),
    thermal,
    endConditions: {
      method: STATIC_CONDENSATION_RULE,
      releases: endConditions.releases,
      springs: endConditions.springs,
      condensedDofs: condensed.condensedDofs,
    },
    rigidOffsets: { I: offsets.I, J: offsets.J },
    limitations: limitations.sort(byCode),
    semanticHash: '',
  };
  draft.semanticHash = computeFrameElementSemanticHash(draft);
  return requireFrameElement(draft);
}

export function frameElementSemanticProjection(record) {
  const projection = {};
  for (const key of FRAME_ELEMENT_RECORD_KEYS) {
    if (key === 'semanticHash') continue;
    projection[key] = record[key];
  }
  return projection;
}

export function computeFrameElementSemanticHash(record) {
  return semanticHash(frameElementSemanticProjection(record));
}

function requireNumberArray(value, expectedLength, field) {
  requireArray(value, field, INPUT_CODE);
  if (value.length !== expectedLength) {
    fail(`${field} must carry exactly ${expectedLength} entries.`, INPUT_CODE);
  }
  value.forEach((entry, position) => requireFinite(entry, `${field}[${position}]`, INPUT_CODE));
  return value;
}

/**
 * Re-accept a sealed `fea-linear-frame-element/v1` record: exact keys, finite
 * row-major matrices and vectors in the frozen layout, and a semantic hash
 * that still matches the content. Mechanics are not re-derived here — the
 * record is evidence, and evidence is verified against its own identity.
 */
export function requireFrameElement(record) {
  requireExactKeys(record, FRAME_ELEMENT_RECORD_KEYS, 'frameElement', INPUT_CODE);
  if (record.schema !== FRAME_ELEMENT_SCHEMA) {
    fail(`frameElement.schema must be ${FRAME_ELEMENT_SCHEMA}.`, INPUT_CODE);
  }
  requireIdentity(record.elementId, 'frameElement.elementId', INPUT_CODE);
  if (record.releaseRule !== STATIC_CONDENSATION_RULE) {
    fail(`frameElement.releaseRule must be ${STATIC_CONDENSATION_RULE}.`, INPUT_CODE);
  }
  if (record.transformation?.conventionId !== TRANSFORMATION_CONVENTION_ID
    || record.transformation?.storage !== ELEMENT_MATRIX_STORAGE_ID
    || record.transformation?.vectorLayout !== ELEMENT_VECTOR_LAYOUT_ID) {
    fail('frameElement.transformation must cite the frozen B-2.0 conventions.', INPUT_CODE);
  }
  requireNumberArray(record.transformation.matrix, 144, 'frameElement.transformation.matrix');
  requireNumberArray(record.localStiffness, 144, 'frameElement.localStiffness');
  requireNumberArray(record.globalStiffness, 144, 'frameElement.globalStiffness');
  for (const key of ['equivalentLoadVector', 'initialStrainLoadVector']) {
    requireExactKeys(record[key], ['local', 'global'], `frameElement.${key}`, INPUT_CODE);
    requireNumberArray(record[key].local, 12, `frameElement.${key}.local`);
    requireNumberArray(record[key].global, 12, `frameElement.${key}.global`);
  }
  requireArray(record.limitations, 'frameElement.limitations', INPUT_CODE);
  record.limitations.forEach((entry, position) => {
    requireExactKeys(
      entry,
      FRAME_ELEMENT_LIMITATION_KEYS,
      `frameElement.limitations[${position}]`,
      INPUT_CODE,
    );
  });
  requireHash(record.semanticHash, 'frameElement.semanticHash', INPUT_CODE);
  if (record.semanticHash !== computeFrameElementSemanticHash(record)) {
    fail('frameElement.semanticHash is stale.', 'FRAME_ELEMENT_HASH_MISMATCH');
  }
  return deepFreeze({
    ...frameElementSemanticProjection(record),
    semanticHash: record.semanticHash,
  });
}

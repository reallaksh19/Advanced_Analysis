import {
  compilePhysicalLoadCase,
  modelReferenceFromCompilation,
} from '../linear-fea-load-case/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import {
  INPUTXML_LINEAR_PHYSICAL_CASE_PREPARATION_SCHEMA,
  sealInputXmlLinearPhysicalCasePreparation,
} from './inputxml-linear-physical-cases-contract.js';
import {
  inputXmlLinearPhysicalLoadCaseProfile,
  resolveInputXmlGravityDirection,
} from './inputxml-linear-physical-profile.js';
import { requireInputXmlLinearSolvePreparation } from './inputxml-linear-solve-preparation-contract.js';
import { requireInputXmlLinearStructuralPreparation } from './inputxml-linear-structural-preparation-contract.js';

export function compileInputXmlLinearPhysicalCases(
  sourcePreparation,
  structuralPreparation,
  options = {},
) {
  const prepared = requireInputXmlLinearSolvePreparation(sourcePreparation);
  const structural = requireInputXmlLinearStructuralPreparation(structuralPreparation, prepared);
  if (prepared.analysisProfileId !== structural.analysisProfileId) {
    throw new TypeError('InputXML authority and structural preparation profiles must match.');
  }
  const gravityDirection = resolveInputXmlGravityDirection(options.gravityDirection);
  const loadCaseProfile = inputXmlLinearPhysicalLoadCaseProfile();
  const modelReference = modelReferenceFromCompilation(structural.compilation);
  const sourceLoadBySegment = new Map(prepared.loadBindings
    .map((row) => [row.segmentId, row]));
  const primitives = {
    gravity: [],
    pressure: [],
    thermal: [],
  };
  const ledger = [];

  for (const segmentBinding of [...structural.segmentBindings]
    .sort((left, right) => compareAscii(left.segmentId, right.segmentId))) {
    const sourceLoad = sourceLoadBySegment.get(segmentBinding.segmentId) ?? null;
    if (sourceLoad === null) {
      throw physicalError(
        'INPUTXML_PHYSICAL_LOAD_BINDING_MISSING',
        `Segment ${segmentBinding.segmentId} has no retained load authority.`,
        { segmentId: segmentBinding.segmentId },
      );
    }
    const gravity = gravityPrimitive(segmentBinding, sourceLoad.gravity, gravityDirection, prepared);
    primitives.gravity.push(gravity);
    ledger.push(loadLedgerRow({
      ledgerId: `IXLOAD:GRAVITY:${safe(segmentBinding.segmentId)}`,
      sourceKind: sourceLoad.gravity.sourceAuthority === 'RIGID_ELEMENT_AUTHORITY'
        ? 'RIGID_TOTAL_WEIGHT'
        : 'PHYSICAL_LINE_WEIGHT',
      sourceFeatureId: sourceLoad.sourceFeatureId,
      segmentId: segmentBinding.segmentId,
      elementId: segmentBinding.elementId,
      disposition: 'COMPILED',
      primitiveIds: [gravity.primitiveId],
      limitationCode: null,
      evidence: {
        authoritySemanticHash: sourceLoad.gravity.semanticHash,
        sourceAuthority: sourceLoad.gravity.sourceAuthority,
        lineForcePerLength: sourceLoad.gravity.lineForcePerLength,
        componentWeightsPerLength: sourceLoad.gravity.componentWeightsPerLength,
        gravityDirection,
      },
    }));

    if (sourceLoad.pressure.active) {
      const pressure = pressurePrimitive(segmentBinding, sourceLoad.pressure, prepared);
      primitives.pressure.push(pressure);
      ledger.push(loadLedgerRow({
        ledgerId: `IXLOAD:PRESSURE:${safe(segmentBinding.segmentId)}`,
        sourceKind: 'PRESSURE',
        sourceFeatureId: sourceLoad.sourceFeatureId,
        segmentId: segmentBinding.segmentId,
        elementId: segmentBinding.elementId,
        disposition: 'COMPILED_WITH_DECLARED_LIMITATION',
        primitiveIds: [pressure.primitiveId],
        limitationCode: 'GENERIC_APPROX_PRESSURE_CODE_ONLY',
        evidence: {
          authoritySemanticHash: sourceLoad.pressure.semanticHash,
          pressure: sourceLoad.pressure.pressure,
          pressureBasis: sourceLoad.pressure.pressureBasis,
          authorizedEffects: sourceLoad.pressure.authorizedEffects,
        },
      }));
    } else {
      ledger.push(loadLedgerRow({
        ledgerId: `IXLOAD:PRESSURE:${safe(segmentBinding.segmentId)}`,
        sourceKind: 'PRESSURE',
        sourceFeatureId: sourceLoad.sourceFeatureId,
        segmentId: segmentBinding.segmentId,
        elementId: segmentBinding.elementId,
        disposition: 'INACTIVE',
        primitiveIds: [],
        limitationCode: null,
        evidence: { authoritySemanticHash: sourceLoad.pressure.semanticHash, active: false },
      }));
    }

    if (sourceLoad.thermal.status === 'RESOLVED') {
      const thermal = thermalPrimitive(segmentBinding, sourceLoad.thermal, prepared);
      primitives.thermal.push(thermal);
      ledger.push(loadLedgerRow({
        ledgerId: `IXLOAD:THERMAL:${safe(segmentBinding.segmentId)}`,
        sourceKind: 'UNIFORM_TEMPERATURE',
        sourceFeatureId: sourceLoad.sourceFeatureId,
        segmentId: segmentBinding.segmentId,
        elementId: segmentBinding.elementId,
        disposition: 'COMPILED',
        primitiveIds: [thermal.primitiveId],
        limitationCode: null,
        evidence: {
          authoritySemanticHash: sourceLoad.thermal.semanticHash,
          operatingTemperature: sourceLoad.thermal.operatingTemperature,
          installationTemperature: sourceLoad.thermal.installationTemperature,
          deltaTemperature: sourceLoad.thermal.deltaTemperature,
          coefficientPerKelvin: sourceLoad.thermal.coefficientPerKelvin,
          thermalStrain: sourceLoad.thermal.thermalStrain,
        },
      }));
    } else {
      const disposition = sourceLoad.thermal.status === 'UNRESOLVED' ? 'BLOCKED' : 'INACTIVE';
      ledger.push(loadLedgerRow({
        ledgerId: `IXLOAD:THERMAL:${safe(segmentBinding.segmentId)}`,
        sourceKind: 'UNIFORM_TEMPERATURE',
        sourceFeatureId: sourceLoad.sourceFeatureId,
        segmentId: segmentBinding.segmentId,
        elementId: segmentBinding.elementId,
        disposition,
        primitiveIds: [],
        limitationCode: disposition === 'BLOCKED'
          ? 'THERMAL_EXPANSION_AUTHORITY_UNRESOLVED'
          : null,
        evidence: {
          authoritySemanticHash: sourceLoad.thermal.semanticHash,
          status: sourceLoad.thermal.status,
          active: sourceLoad.thermal.active,
        },
      }));
    }
  }

  const cases = [];
  cases.push(caseRecord({
    structural,
    loadCaseProfile,
    modelReference,
    caseToken: 'W',
    caseRole: 'WEIGHT_BASE',
    primitives: primitives.gravity,
    loadCaseClass: 'WEIGHT',
    label: 'W',
    description: 'InputXML self-weight physical case.',
  }));
  if (primitives.pressure.length > 0) {
    cases.push(caseRecord({
      structural,
      loadCaseProfile,
      modelReference,
      caseToken: 'WP',
      caseRole: 'WEIGHT_PRESSURE',
      primitives: [...primitives.gravity, ...primitives.pressure],
      loadCaseClass: 'MIXED_PHYSICAL',
      label: 'W+P1',
      description: 'InputXML self-weight and pressure physical case.',
    }));
  }
  const thermalComplete = primitives.thermal.length === structural.segmentBindings.length;
  if (thermalComplete) {
    cases.push(caseRecord({
      structural,
      loadCaseProfile,
      modelReference,
      caseToken: 'WT',
      caseRole: 'WEIGHT_TEMPERATURE',
      primitives: [...primitives.gravity, ...primitives.thermal],
      loadCaseClass: 'MIXED_PHYSICAL',
      label: 'W+T1',
      description: 'InputXML self-weight and uniform-temperature physical case.',
    }));
    if (primitives.pressure.length > 0) {
      cases.push(caseRecord({
        structural,
        loadCaseProfile,
        modelReference,
        caseToken: 'WPT',
        caseRole: 'WEIGHT_PRESSURE_TEMPERATURE',
        primitives: [...primitives.gravity, ...primitives.pressure, ...primitives.thermal],
        loadCaseClass: 'MIXED_PHYSICAL',
        label: 'W+P1+T1',
        description: 'InputXML self-weight, pressure, and uniform-temperature physical case.',
      }));
    }
  }

  cases.sort((left, right) => compareAscii(left.caseId, right.caseId));
  const casesByPrimitive = indexPrimitiveCases(cases);
  const finalizedLedger = ledger.map((row) => Object.freeze({
    ...row,
    caseIds: Object.freeze(uniqueAscii(
      row.primitiveIds.flatMap((primitiveId) => casesByPrimitive.get(primitiveId) ?? []),
    )),
  })).sort((left, right) => compareAscii(left.ledgerId, right.ledgerId));
  const limitations = uniqueAscii([
    ...structural.limitations,
    ...finalizedLedger.map((row) => row.limitationCode),
    ...cases.flatMap((row) => row.loadCase.limitations.map((item) => item.code)),
  ]);

  return sealInputXmlLinearPhysicalCasePreparation({
    schema: INPUTXML_LINEAR_PHYSICAL_CASE_PREPARATION_SCHEMA,
    preparationId: `IXPHYS-${semanticHash({
      source: prepared.semanticHash,
      structure: structural.semanticHash,
      gravityDirection,
      cases: cases.map((row) => row.loadCase.semanticHash),
    })}`,
    analysisProfileId: prepared.analysisProfileId,
    sourcePreparationSemanticHash: prepared.semanticHash,
    sourcePreparationEvidenceHash: prepared.evidenceHash,
    structuralPreparationSemanticHash: structural.semanticHash,
    structuralPreparationEvidenceHash: structural.evidenceHash,
    loadCaseProfileSemanticHash: loadCaseProfile.semanticHash,
    sourcePreparation: prepared,
    structuralPreparation: structural,
    physicalCases: Object.freeze(cases),
    loadLedger: Object.freeze(finalizedLedger),
    limitations,
    summary: Object.freeze({
      physicalCaseCount: cases.length,
      loadLedgerCount: finalizedLedger.length,
      compiledPrimitiveCount: new Set(cases.flatMap((row) => row.primitiveIds)).size,
      pressurePrimitiveCount: primitives.pressure.length,
      thermalPrimitiveCount: primitives.thermal.length,
      thermalCoverageComplete: thermalComplete,
      sustainedCaseAvailable: true,
      operatingCaseAvailable: thermalComplete,
      physicalLoadCaseHashes: Object.freeze(cases.map((row) => row.loadCase.physicalLoadCaseHash)),
    }),
    executionBoundary: Object.freeze({
      loadPrimitivesCompiled: true,
      physicalCasesCompiled: true,
      stiffnessAssembled: false,
      factorizationCreated: false,
      solveAuthorized: false,
      reasonCodes: Object.freeze(['STIFFNESS_PREFLIGHT_DEFERRED']),
    }),
  });
}

function gravityPrimitive(binding, authority, direction, prepared) {
  const magnitude = authority.lineForcePerLength;
  const intensity = Object.freeze({
    fx: direction.x * magnitude,
    fy: direction.y * magnitude,
    fz: direction.z * magnitude,
  });
  return Object.freeze({
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: `${binding.elementId}-W`,
    kind: 'DISTRIBUTED_LOAD',
    sourceEvidence: sourceEvidence({
      sourceId: authority.sourceEvidence.sourceId,
      sourceRevision: prepared.semanticHash,
      authoritySemanticHash: authority.semanticHash,
      gravityDirection: direction,
    }),
    elementId: binding.elementId,
    basis: 'GLOBAL',
    variation: 'UNIFORM',
    startIntensity: intensity,
    endIntensity: intensity,
    units: { distributedForce: 'N/m', length: 'm' },
  });
}

function pressurePrimitive(binding, authority, prepared) {
  return Object.freeze({
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: `${binding.elementId}-P1`,
    kind: 'PRESSURE',
    sourceEvidence: sourceEvidence({
      sourceId: authority.sourceEvidence.sourceId,
      sourceRevision: prepared.semanticHash,
      authoritySemanticHash: authority.semanticHash,
    }),
    elementId: binding.elementId,
    pressure: authority.pressure,
    pressureBasis: authority.pressureBasis,
    authorizedEffects: authority.authorizedEffects,
  });
}

function thermalPrimitive(binding, authority, prepared) {
  return Object.freeze({
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: `${binding.elementId}-T1`,
    kind: 'TEMPERATURE',
    sourceEvidence: sourceEvidence({
      sourceId: authority.sourceEvidence.sourceId,
      sourceRevision: prepared.semanticHash,
      authoritySemanticHash: authority.semanticHash,
    }),
    elementId: binding.elementId,
    operatingTemperature: authority.operatingTemperature,
    installationTemperature: authority.installationTemperature,
    stiffnessEvaluationMaterialStateId: binding.materialStateId,
    thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
  });
}

function caseRecord({
  structural,
  loadCaseProfile,
  modelReference,
  caseToken,
  caseRole,
  primitives,
  loadCaseClass,
  label,
  description,
}) {
  const caseId = `${structural.modelId}-${caseToken}`;
  const loadCase = compilePhysicalLoadCase({
    loadCaseId: caseId,
    loadCaseClass,
    presentation: { label, description },
    modelReference,
    primitives,
    profile: loadCaseProfile,
  });
  return Object.freeze({
    caseId,
    caseRole,
    primitiveIds: Object.freeze(loadCase.primitives.map((row) => row.primitiveId)),
    loadCase,
  });
}

function loadLedgerRow(value) {
  return Object.freeze({
    ...value,
    primitiveIds: Object.freeze(value.primitiveIds),
    caseIds: Object.freeze([]),
    evidence: Object.freeze(value.evidence),
  });
}

function indexPrimitiveCases(cases) {
  const index = new Map();
  for (const row of cases) {
    for (const primitiveId of row.primitiveIds) {
      if (!index.has(primitiveId)) index.set(primitiveId, []);
      index.get(primitiveId).push(row.caseId);
    }
  }
  return index;
}

function sourceEvidence(value) {
  return Object.freeze({
    sourceId: String(value.sourceId),
    sourceRevision: String(value.sourceRevision),
    sourceSemanticHash: semanticHash(value),
  });
}

function physicalError(code, message, data) {
  const error = new Error(message);
  error.name = 'InputXmlLinearPhysicalCasePreparationError';
  error.code = code;
  error.data = data;
  return error;
}

function safe(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]/gu, '-');
}

function uniqueAscii(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort(compareAscii);
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

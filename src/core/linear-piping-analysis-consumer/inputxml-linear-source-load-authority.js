import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { INPUTXML_INSTALLATION_TEMPERATURE } from './inputxml-linear-preparation-profile.js';

export function compileInputXmlSourceLoadAuthorities(request) {
  const { sourceBundle, structuralPreparation, loadProfile } = request;
  const elementBySegment = new Map(
    structuralPreparation.sectionBindings.map((row) => [row.segmentId, row.elementId]),
  );
  const materialBySegment = new Map(
    structuralPreparation.materialBindings.map((row) => [row.segmentId, row]),
  );
  const pressure = pressureAuthorities(sourceBundle, elementBySegment, loadProfile);
  const temperature = temperatureAuthorities(
    sourceBundle,
    elementBySegment,
    materialBySegment,
  );
  const forceMoment = forceMomentAuthorities(sourceBundle, structuralPreparation.modelId);
  return Object.freeze({
    pressureBySet: pressure.bySet,
    temperatureBySet: temperature.bySet,
    forceMomentBySet: forceMoment.bySet,
    ledger: Object.freeze([
      ...pressure.ledger,
      ...temperature.ledger,
      ...forceMoment.ledger,
    ].sort((left, right) => compareAscii(left.ledgerId, right.ledgerId))),
  });
}

function pressureAuthorities(sourceBundle, elementBySegment, loadProfile) {
  const bySet = new Map();
  const ledger = [];
  for (const record of sourceBundle.sourceRecords.pressureSets) {
    const active = record.canonicalValue !== null
      && !record.sentinel?.matched
      && Math.abs(record.canonicalValue) > 1e-12;
    if (!active) {
      ledger.push(sourceLedger(record, 'PRESSURE', 'INACTIVE', [], null, { active: false }));
      continue;
    }
    if (loadProfile.pressurePolicy !== 'PRESSURE_RETAINED_FOR_CODE_STRESS_ONLY') {
      throw loadError(
        'INPUTXML_LOAD_PRESSURE_STRICT_EFFECTS_UNAVAILABLE',
        `Pressure feature ${record.sourceFeatureId} requires exact structural pressure effects.`,
      );
    }
    const elementId = elementBySegment.get(record.segmentId);
    if (!elementId) throw loadError(
      'INPUTXML_LOAD_PRESSURE_ELEMENT_BINDING_MISSING',
      `Pressure feature ${record.sourceFeatureId} has no prepared element binding.`,
    );
    const primitive = Object.freeze({
      schema: 'fea-linear-load-primitive/v1',
      primitiveId: `IXL-P-${safe(record.sourceFeatureId)}`,
      kind: 'PRESSURE',
      sourceEvidence: sourceEvidence(record),
      elementId,
      pressure: record.canonicalValue,
      pressureBasis: 'GAUGE',
      authorizedEffects: {
        codeStress: true,
        pressureStiffening: false,
        axialThrust: false,
        bourdon: false,
      },
    });
    addToSet(bySet, record.sourceSetId, primitive, record.sourceFeatureId);
    ledger.push(sourceLedger(
      record,
      'PRESSURE',
      'COMPILED_WITH_DECLARED_LIMITATION',
      [primitive.primitiveId],
      'GENERIC_APPROX_PRESSURE_CODE_ONLY',
      { pressure: record.canonicalValue, pressureBasis: 'GAUGE', elementId },
    ));
  }
  return { bySet: freezeSetMap(bySet), ledger };
}

function temperatureAuthorities(sourceBundle, elementBySegment, materialBySegment) {
  const bySet = new Map();
  const ledger = [];
  for (const record of sourceBundle.sourceRecords.temperatureSets) {
    const active = record.canonicalValue !== null && !record.sentinel?.matched;
    if (!active) {
      ledger.push(sourceLedger(record, 'TEMPERATURE', 'INACTIVE', [], null, { active: false }));
      continue;
    }
    const elementId = elementBySegment.get(record.segmentId);
    const material = materialBySegment.get(record.segmentId);
    if (!elementId || !material) throw loadError(
      'INPUTXML_LOAD_TEMPERATURE_BINDING_MISSING',
      `Temperature feature ${record.sourceFeatureId} has no prepared element/material binding.`,
    );
    if (material.thermalAuthority.status !== 'RESOLVED') {
      throw loadError(
        'INPUTXML_LOAD_TEMPERATURE_AUTHORITY_UNRESOLVED',
        `Temperature feature ${record.sourceFeatureId} has no resolved thermal-expansion authority.`,
      );
    }
    const primitive = Object.freeze({
      schema: 'fea-linear-load-primitive/v1',
      primitiveId: `IXL-T-${safe(record.sourceFeatureId)}`,
      kind: 'TEMPERATURE',
      sourceEvidence: sourceEvidence(record),
      elementId,
      operatingTemperature: record.canonicalValue,
      installationTemperature: INPUTXML_INSTALLATION_TEMPERATURE,
      stiffnessEvaluationMaterialStateId: material.materialStateId,
      thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
    });
    addToSet(bySet, record.sourceSetId, primitive, record.sourceFeatureId);
    ledger.push(sourceLedger(record, 'TEMPERATURE', 'COMPILED', [primitive.primitiveId], null, {
      operatingTemperature: record.canonicalValue,
      installationTemperature: INPUTXML_INSTALLATION_TEMPERATURE,
      elementId,
      materialStateId: material.materialStateId,
      thermalAuthoritySemanticHash: material.thermalAuthority.semanticHash,
    }));
  }
  return { bySet: freezeSetMap(bySet), ledger };
}

function forceMomentAuthorities(sourceBundle, modelId) {
  const bySet = new Map();
  const ledger = [];
  for (const record of sourceBundle.sourceRecords.forcesMoments) {
    if (!record.nodeId) throw loadError(
      'INPUTXML_LOAD_FORCE_MOMENT_NODE_MISSING',
      `Force/moment feature ${record.sourceFeatureId} has no node target.`,
    );
    record.vectors.forEach((vector, ordinal) => {
      const setNumber = vector.number ?? record.forceMomentNumber ?? ordinal + 1;
      const sourceSetId = `FM${setNumber}`;
      const force = components(vector.force, ['fx', 'fy', 'fz']);
      const moment = components(vector.moment, ['mx', 'my', 'mz']);
      const active = [...Object.values(force), ...Object.values(moment)]
        .some((value) => Math.abs(value) > 0);
      const ledgerRecord = {
        ...record,
        sourceSetId,
        sourceFeatureId: `${record.sourceFeatureId}:V${ordinal}`,
      };
      if (!active) {
        ledger.push(sourceLedger(ledgerRecord, 'NODAL_FORCE_MOMENT', 'INACTIVE', [], null, {
          vectorOrdinal: ordinal,
          vectorNumber: vector.number,
        }));
        return;
      }
      const primitive = Object.freeze({
        schema: 'fea-linear-load-primitive/v1',
        primitiveId: `IXL-FM-${safe(record.sourceFeatureId)}-V${ordinal}`,
        kind: 'NODAL_FORCE_MOMENT',
        sourceEvidence: sourceEvidence({ ...record, vectorOrdinal: ordinal, vector }),
        nodeId: `${modelId}.N${record.nodeId}`,
        basis: { kind: 'GLOBAL' },
        force,
        moment,
        units: { force: 'N', moment: 'N*m', length: 'm' },
        signConvention: 'APPLIED_TO_STRUCTURE',
      });
      addToSet(bySet, sourceSetId, primitive, record.sourceFeatureId);
      ledger.push(sourceLedger(ledgerRecord, 'NODAL_FORCE_MOMENT', 'COMPILED', [primitive.primitiveId], null, {
        vectorOrdinal: ordinal,
        vectorNumber: vector.number,
        nodeId: primitive.nodeId,
        force,
        moment,
      }));
    });
  }
  return { bySet: freezeSetMap(bySet), ledger };
}

function components(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, finite(value?.[key]?.canonicalValue)]));
}

function sourceLedger(record, sourceKind, disposition, primitiveIds, limitationCode, evidence) {
  return Object.freeze({
    ledgerId: `IXL:${sourceKind}:${safe(record.sourceFeatureId)}`,
    sourceKind,
    sourceFeatureId: record.sourceFeatureId,
    sourceSetId: record.sourceSetId ?? null,
    sourceElementIndex: record.sourceElementIndex,
    sourceRecordSemanticHash: semanticHash(record),
    segmentId: record.segmentId ?? null,
    elementId: null,
    disposition,
    primitiveIds: Object.freeze(primitiveIds),
    caseIds: Object.freeze([]),
    limitationCode,
    evidence: Object.freeze(evidence),
  });
}

function addToSet(map, sourceSetId, primitive, sourceFeatureId) {
  if (!map.has(sourceSetId)) map.set(sourceSetId, { primitives: [], sourceFeatureIds: [] });
  map.get(sourceSetId).primitives.push(primitive);
  map.get(sourceSetId).sourceFeatureIds.push(sourceFeatureId);
}

function freezeSetMap(map) {
  return new Map([...map.entries()].map(([key, value]) => [key, Object.freeze({
    primitives: Object.freeze([...value.primitives].sort((a, b) => compareAscii(a.primitiveId, b.primitiveId))),
    sourceFeatureIds: Object.freeze([...new Set(value.sourceFeatureIds)].sort(compareAscii)),
  })]));
}

function sourceEvidence(value) {
  return {
    sourceId: value.sourceFeatureId,
    sourceRevision: String(value.sourceSetId ?? value.sourceElementIndex ?? 'INPUTXML'),
    sourceSemanticHash: semanticHash(value),
  };
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function safe(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]/gu, '-');
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function loadError(code, message) {
  const error = new Error(message);
  error.name = 'InputXmlLinearLoadPreparationError';
  error.code = code;
  return error;
}

import { attributeValue } from './inputxml-tag-scanner.js';
import { convertInputXmlLengthToMetres, convertInputXmlScalar } from './inputxml-unit-system.js';
import { INPUTXML_SENTINELS } from './inputxml-feature-registry.js';
import { inputXmlSourceFeatureId } from './inputxml-source-bundle-contract.js';

export function elementFieldRecord({ edge, segment, field, definition, carry, unitSystem, diagnostics }) {
  const rawText = attributeValue(edge.attrs, ...definition.names);
  const explicit = rawText.length > 0;
  const parsedValue = definition.quantity === 'TEXT' ? (explicit ? rawText : null) : rawFiniteNumber(rawText);
  const sentinel = sentinelRecord(parsedValue);
  const explicitUsable = explicit && sentinel.kind !== 'UNSET' && parsedValue !== null;
  const carryKey = `FIELD:${field}`;
  if (explicitUsable) carry.set(carryKey, { sourceElementIndex: edge.index, rawText, parsedValue });
  const inheritedAuthority = definition.inherited && !explicitUsable ? carry.get(carryKey) ?? null : null;
  const declaration = Object.freeze({
    explicit,
    inherited: Boolean(inheritedAuthority),
    inheritedFromElementIndex: inheritedAuthority?.sourceElementIndex ?? null,
  });

  let effectiveValue = explicitUsable ? parsedValue : inheritedAuthority?.parsedValue ?? null;
  if (field === 'diameter') effectiveValue = segment?.diameter ?? effectiveValue;
  if (field === 'wallThickness') effectiveValue = segment?.thickness ?? effectiveValue;
  if (field === 'materialName') effectiveValue = segment?.material ?? effectiveValue;
  if (field === 'materialNumber') effectiveValue = segment?.meta?.materialNumber ?? effectiveValue;
  if (field === 'elasticModulus') effectiveValue = segment?.meta?.analysis?.elasticModulus ?? effectiveValue;
  if (field === 'poissonRatio') effectiveValue = segment?.meta?.analysis?.poissonRatio ?? effectiveValue;
  if (field === 'hydroPressure') effectiveValue = segment?.meta?.analysis?.hydroPressure ?? effectiveValue;
  if (field === 'fluidDensity') effectiveValue = segment?.meta?.analysis?.fluidDensity ?? effectiveValue;
  if (field === 'pipeDensity') effectiveValue = segment?.meta?.analysis?.pipeDensity ?? effectiveValue;
  if (field === 'insulationThickness') effectiveValue = segment?.meta?.analysis?.insulationThickness ?? effectiveValue;
  if (field === 'insulationDensity') effectiveValue = segment?.meta?.analysis?.insulationDensity ?? effectiveValue;
  if (field === 'corrosionAllowance') effectiveValue = segment?.meta?.analysis?.corrosionAllowance ?? effectiveValue;

  const geometryCanonicalFields = new Set([
    'elasticModulus', 'poissonRatio', 'hydroPressure', 'fluidDensity',
    'pipeDensity', 'insulationThickness', 'insulationDensity', 'corrosionAllowance',
  ]);
  const canonical = geometryCanonicalFields.has(field) && effectiveValue !== null
    ? {
      value: effectiveValue,
      unit: canonicalUnit(definition.quantity),
      evidence: Object.freeze({ source: 'CANONICAL_GEOMETRY_INGESTION' }),
    }
    : canonicalValue(definition.quantity, effectiveValue, unitSystem, diagnostics, edge.index, field);
  return Object.freeze({
    rawText: explicit ? rawText : null,
    parsedValue,
    sentinel,
    effectiveValue,
    canonicalValue: canonical.value,
    canonicalUnit: canonical.unit,
    conversionEvidence: canonical.evidence,
    declaration,
  });
}

export function directNumericValue(attributes, names, quantity, unitSystem, diagnostics, sourceElementIndex) {
  const rawText = attributeValue(attributes, ...names);
  const parsedValue = rawFiniteNumber(rawText);
  const sentinel = sentinelRecord(parsedValue);
  const effectiveValue = parsedValue === null || sentinel.matched ? 0 : parsedValue;
  const canonical = canonicalValue(quantity, effectiveValue, unitSystem, diagnostics, sourceElementIndex, names[0]);
  return Object.freeze({
    rawText: rawText || null,
    parsedValue,
    sentinel,
    effectiveValue,
    canonicalValue: canonical.value,
    canonicalUnit: canonical.unit,
    conversionEvidence: canonical.evidence,
    declaration: Object.freeze({ explicit: rawText.length > 0, inherited: false, inheritedFromElementIndex: null }),
  });
}

export function inheritedSetRecord({ edge, setNumber, attribute, sourceKind, quantity, declaration, carry, diagnostics }) {
  const rawText = attributeValue(edge.attrs, attribute);
  const parsedValue = rawFiniteNumber(rawText);
  const sentinel = sentinelRecord(parsedValue);
  const explicitUsable = rawText.length > 0 && parsedValue !== null && sentinel.kind !== 'UNSET';
  if (explicitUsable) carry.set(setNumber, { sourceElementIndex: edge.index, parsedValue, rawText });
  const inheritedAuthority = explicitUsable ? null : carry.get(setNumber) ?? null;
  const effectiveValue = explicitUsable ? parsedValue : inheritedAuthority?.parsedValue ?? null;
  if (effectiveValue === null && rawText.length === 0) return null;
  const converted = convertDeclaredValue(effectiveValue, declaration, quantity, diagnostics, edge.index, attribute);
  return Object.freeze({
    sourceFeatureId: inputXmlSourceFeatureId(sourceKind, edge.index, setNumber - 1),
    sourceElementIndex: edge.index,
    sourceElementNumber: edge.index + 1,
    sourcePath: `${elementSourcePath(edge.index)}/@${attribute}`,
    segmentId: `IX-S${edge.index + 1}`,
    sourceKind,
    sourceSetId: `${sourceKind === 'TEMPERATURE' ? 'T' : 'P'}${setNumber}`,
    setNumber,
    rawText: rawText || null,
    parsedValue,
    sentinel,
    canonicalValue: converted.value,
    canonicalUnit: converted.unit,
    conversionEvidence: converted.evidence,
    declaration: Object.freeze({
      explicit: rawText.length > 0,
      inherited: Boolean(inheritedAuthority),
      inheritedFromElementIndex: inheritedAuthority?.sourceElementIndex ?? null,
    }),
  });
}

function canonicalValue(quantity, value, unitSystem, diagnostics, sourceElementIndex, field) {
  if (value === null || value === undefined || typeof value === 'string') {
    return { value, unit: quantity === 'TEXT' ? null : canonicalUnit(quantity), evidence: null };
  }
  if (quantity === 'LENGTH') {
    try {
      return {
        value: convertInputXmlLengthToMetres(value, unitSystem.lengthUnit),
        unit: 'm',
        evidence: lengthConversionEvidence(unitSystem.lengthUnit),
      };
    } catch (error) {
      conversionDiagnostic(diagnostics, error, sourceElementIndex, field);
      return { value: null, unit: 'm', evidence: null };
    }
  }
  if (quantity === 'DIMENSIONLESS') return { value, unit: null, evidence: Object.freeze({ quantity: 'DIMENSIONLESS' }) };
  const declaration = unitDeclaration(quantity, unitSystem);
  return convertDeclaredValue(value, declaration, quantity, diagnostics, sourceElementIndex, field);
}

export function convertDeclaredValue(value, declaration, quantity, diagnostics, sourceElementIndex, field) {
  if (value === null || value === undefined) return { value: null, unit: canonicalUnit(quantity), evidence: null };
  try {
    return {
      value: convertInputXmlScalar(value, declaration, quantity),
      unit: canonicalUnit(quantity),
      evidence: declaration ? Object.freeze({
        quantity,
        tagName: declaration.tagName ?? null,
        label: declaration.label ?? null,
        factor: declaration.factor ?? null,
        scale: declaration.scale ?? null,
        kind: declaration.kind ?? null,
      }) : null,
    };
  } catch (error) {
    conversionDiagnostic(diagnostics, error, sourceElementIndex, field);
    return { value: null, unit: canonicalUnit(quantity), evidence: null };
  }
}

export function directOptionalLength(rawText, unitSystem, diagnostics, sourceElementIndex, field) {
  const parsedValue = rawFiniteNumber(rawText);
  const sentinel = sentinelRecord(parsedValue);
  const converted = parsedValue === null || sentinel.kind === 'UNSET'
    ? { value: null, unit: 'm', evidence: null }
    : canonicalValue('LENGTH', parsedValue, unitSystem, diagnostics, sourceElementIndex, field);
  return Object.freeze({
    rawText: rawText || null,
    parsedValue,
    sentinel,
    canonicalValue: converted.value,
    canonicalUnit: converted.unit,
    conversionEvidence: converted.evidence,
  });
}

export function dimensionlessValue(rawText) {
  const parsedValue = rawFiniteNumber(rawText);
  return Object.freeze({ rawText: rawText || null, parsedValue, sentinel: sentinelRecord(parsedValue) });
}

export function deferredTypeDependentValue(rawText) {
  const parsedValue = rawFiniteNumber(rawText);
  return Object.freeze({
    rawText: rawText || null,
    parsedValue,
    sentinel: sentinelRecord(parsedValue),
    canonicalValue: null,
    canonicalUnit: null,
    conversionEvidence: Object.freeze({ status: 'DEFERRED_TYPE_DEPENDENT' }),
  });
}

export function convertOptionalAttribute(attributes, name, declaration, quantity, diagnostics, sourceElementIndex) {
  const rawText = attributeValue(attributes, name);
  const parsed = rawFiniteNumber(rawText);
  const sentinel = sentinelRecord(parsed);
  if (parsed === null || sentinel.kind === 'UNSET') return Object.freeze({ rawText: rawText || null, parsedValue: parsed, sentinel, canonicalValue: null, canonicalUnit: canonicalUnit(quantity), conversionEvidence: null });
  const converted = convertDeclaredValue(parsed, declaration, quantity, diagnostics, sourceElementIndex, name);
  return Object.freeze({ rawText, parsedValue: parsed, sentinel, canonicalValue: converted.value, canonicalUnit: converted.unit, conversionEvidence: converted.evidence });
}

function unitDeclaration(quantity, unitSystem) {
  if (quantity === 'EMOD') return unitSystem.elasticModulus;
  if (quantity === 'PRESSURE') return unitSystem.pressure;
  if (quantity === 'TEMP') return unitSystem.temperature;
  if (quantity === 'PDENS') return unitSystem.pipeDensity;
  if (quantity === 'IDENS') return unitSystem.insulationDensity;
  if (quantity === 'FDENS') return unitSystem.fluidDensity;
  if (quantity === 'FORCE') return unitSystem.force;
  if (quantity === 'MOMENT-INPUT') return unitSystem.momentInput;
  return null;
}

function canonicalUnit(quantity) {
  if (quantity === 'LENGTH') return 'm';
  if (quantity === 'EMOD' || quantity === 'PRESSURE') return 'Pa';
  if (quantity === 'TEMP') return 'K';
  if (quantity === 'PDENS' || quantity === 'IDENS' || quantity === 'FDENS') return 'kg/m3';
  if (quantity === 'FORCE') return 'N';
  if (quantity === 'MOMENT-INPUT') return 'N*m';
  return null;
}

function lengthConversionEvidence(sourceUnit) {
  const ratio = {
    m: [1, 1],
    mm: [1, 1000],
    cm: [1, 100],
    in: [127, 5000],
    ft: [381, 1250],
  }[sourceUnit];
  return ratio ? Object.freeze({ quantity: 'LENGTH', sourceUnit, targetUnit: 'm', numerator: ratio[0], denominator: ratio[1] }) : null;
}

function conversionDiagnostic(diagnostics, error, sourceElementIndex, field) {
  diagnostics.push({
    severity: 'error',
    code: 'INPUTXML_UNIT_DECLARATION_REQUIRED',
    message: error instanceof Error ? error.message : String(error),
    data: { elementIndex: sourceElementIndex, field },
  });
}

export function sentinelRecord(value) {
  if (value === null) return Object.freeze({ matched: false, kind: null });
  if (Math.abs(value - INPUTXML_SENTINELS.DOUBLE_UNSET) < INPUTXML_SENTINELS.TOLERANCE) {
    return Object.freeze({ matched: true, kind: 'DOUBLE_UNSET' });
  }
  if (Math.abs(value - INPUTXML_SENTINELS.UNSET) < INPUTXML_SENTINELS.TOLERANCE) {
    return Object.freeze({ matched: true, kind: 'UNSET' });
  }
  return Object.freeze({ matched: false, kind: null });
}

export function nodeReferenceValue(rawText) {
  const text = String(rawText ?? '').trim();
  const parsedValue = rawFiniteNumber(text);
  const sentinel = sentinelRecord(parsedValue);
  const nodeId = !text || sentinel.matched ? null : cleanNodeId(text);
  return Object.freeze({
    rawText: text || null,
    parsedValue,
    sentinel,
    nodeId,
  });
}

export function rawFiniteNumber(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function cleanNodeId(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const numeric = Number(text);
  return Number.isFinite(numeric) ? String(numeric) : text;
}

function elementSourcePath(index) {
  return `PIPINGMODEL/PIPINGELEMENT[${index}]`;
}

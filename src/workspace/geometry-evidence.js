import { freezeDeep, isRecord, stringValue } from './dataset-utils.js';

export function extractGeometryEvidence(item) {
  const attributes = isRecord(item?.attributes) ? item.attributes : {};
  const sourceAttributes = isRecord(item?.sourceAttributes) ? item.sourceAttributes : {};
  const nativeParams = isRecord(item?.nativeParams) ? item.nativeParams : {};
  const ordered = resolvePointList([
    [item?.points, 'item.points'],
    [nativeParams.points, 'nativeParams.points'],
  ]);

  const startEvidence = resolvePoint([
    [item?.apos, 'item.apos'],
    [nativeParams.startPoint, 'nativeParams.startPoint'],
    [attributes.APOS, 'attributes.APOS'],
    [sourceAttributes.APOS, 'sourceAttributes.APOS'],
    [pointFromFields(attributes, 'APOS'), 'attributes.APOS_*'],
    [pointFromFields(sourceAttributes, 'APOS'), 'sourceAttributes.APOS_*'],
    [ordered[0]?.point, ordered[0]?.sourcePath],
  ]);
  let endEvidence = resolvePoint([
    [item?.lpos, 'item.lpos'],
    [nativeParams.endPoint, 'nativeParams.endPoint'],
    [attributes.LPOS, 'attributes.LPOS'],
    [sourceAttributes.LPOS, 'sourceAttributes.LPOS'],
    [pointFromFields(attributes, 'LPOS'), 'attributes.LPOS_*'],
    [pointFromFields(sourceAttributes, 'LPOS'), 'sourceAttributes.LPOS_*'],
    [ordered.at(-1)?.point, ordered.at(-1)?.sourcePath],
  ]);
  const deltaEvidence = resolvePoint([
    [item?.delta, 'item.delta'],
    [nativeParams.delta, 'nativeParams.delta'],
    [pointFromFields(attributes, 'DELTA'), 'attributes.DELTA_*'],
    [pointFromFields(sourceAttributes, 'DELTA'), 'sourceAttributes.DELTA_*'],
    [pointFromDeltaFields(attributes), 'attributes.DX/DY/DZ'],
    [pointFromDeltaFields(sourceAttributes), 'sourceAttributes.DX/DY/DZ'],
  ]);
  if (startEvidence && !endEvidence && deltaEvidence) {
    endEvidence = {
      point: addPoints(startEvidence.point, deltaEvidence.point),
      sourcePath: `${startEvidence.sourcePath}+${deltaEvidence.sourcePath}`,
    };
  }

  const explicitCenter = resolvePoint([
    [item?.centrePoint, 'item.centrePoint'],
    [item?.center, 'item.center'],
    [nativeParams.centrePoint, 'nativeParams.centrePoint'],
    [nativeParams.center, 'nativeParams.center'],
    [item?.coOrds, 'item.coOrds'],
    [item?.coords, 'item.coords'],
    [attributes.CENTER, 'attributes.CENTER'],
    [sourceAttributes.CENTER, 'sourceAttributes.CENTER'],
    [pointFromFields(attributes, 'CENTER'), 'attributes.CENTER_*'],
    [pointFromFields(sourceAttributes, 'CENTER'), 'sourceAttributes.CENTER_*'],
  ]);
  const derivedCenter = midpoint(startEvidence?.point, endEvidence?.point);
  const branchEvidence = uniqueEvidence([
    ...resolvePointList([[item?.branchPoints, 'item.branchPoints']]),
    ...resolvePointList([[nativeParams.branchPoints, 'nativeParams.branchPoints']]),
    ...[
      [item?.branch1Point, 'item.branch1Point'],
      [item?.branch2Point, 'item.branch2Point'],
      [item?.branch3Point, 'item.branch3Point'],
      [nativeParams.branch1Point, 'nativeParams.branch1Point'],
      [nativeParams.branch2Point, 'nativeParams.branch2Point'],
      [nativeParams.branch3Point, 'nativeParams.branch3Point'],
    ].map(([value, sourcePath]) => resolvePoint([[value, sourcePath]])).filter(Boolean),
  ]);
  const boreEvidence = resolveNumber([
    [item?.bore, 'item.bore'],
    [nativeParams.bore, 'nativeParams.bore'],
    [nativeParams.outerDiameter, 'nativeParams.outerDiameter'],
    [attributes.BORE, 'attributes.BORE'],
    [sourceAttributes.BORE, 'sourceAttributes.BORE'],
    [ordered.find((entry) => entry.boreMm)?.boreMm, ordered.find((entry) => entry.boreMm)?.sourcePath],
  ]);

  return freezeDeep({
    start: startEvidence?.point || null,
    end: endEvidence?.point || null,
    center: explicitCenter?.point || derivedCenter,
    points: ordered.map((entry) => entry.point),
    branchPoints: branchEvidence.map((entry) => entry.point),
    explicitCenter: Boolean(explicitCenter),
    boreMm: boreEvidence?.value || null,
    sources: {
      start: startEvidence?.sourcePath || '',
      end: endEvidence?.sourcePath || '',
      center: explicitCenter?.sourcePath || (derivedCenter ? 'derived.midpoint' : ''),
      branches: branchEvidence.map((entry) => entry.sourcePath),
      boreMm: boreEvidence?.sourcePath || '',
    },
  });
}

function resolvePoint(candidates) {
  for (const [value, sourcePath] of candidates) {
    const parsed = readPoint(value);
    if (parsed) return { point: parsed.point, sourcePath: sourcePath || '', boreMm: parsed.boreMm };
  }
  return null;
}

function resolvePointList(candidates) {
  for (const [value, sourcePath] of candidates) {
    if (!Array.isArray(value) || value.length === 0) continue;
    return value.map((entry, index) => {
      const parsed = readPoint(entry);
      return parsed ? {
        point: parsed.point,
        boreMm: parsed.boreMm,
        sourcePath: `${sourcePath}[${index}]`,
      } : null;
    }).filter(Boolean);
  }
  return [];
}

function readPoint(value) {
  if (!value) return null;
  if (Array.isArray(value)) return pointFromNumbers(value[0], value[1], value[2], value[3]);
  if (isRecord(value)) {
    return pointFromNumbers(
      value.x ?? value.X,
      value.y ?? value.Y,
      value.z ?? value.Z,
      value.bore ?? value.BORE ?? value.diameter,
    );
  }
  const parts = stringValue(value).match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  if (parts.length < 3) return null;
  return pointFromNumbers(parts[0], parts[1], parts[2], parts[3]);
}

function pointFromFields(record, prefix) {
  if (!isRecord(record)) return null;
  const parsed = pointFromNumbers(
    record[`${prefix}_X`] ?? record[`${prefix}X`] ?? record[`${prefix}.X`],
    record[`${prefix}_Y`] ?? record[`${prefix}Y`] ?? record[`${prefix}.Y`],
    record[`${prefix}_Z`] ?? record[`${prefix}Z`] ?? record[`${prefix}.Z`],
  );
  return parsed?.point || null;
}

function pointFromDeltaFields(record) {
  if (!isRecord(record)) return null;
  return pointFromNumbers(record.DX, record.DY, record.DZ)?.point || null;
}

function pointFromNumbers(xValue, yValue, zValue, boreValue) {
  const x = numberMaybe(xValue);
  const y = numberMaybe(yValue);
  const z = numberMaybe(zValue);
  if (x === null || y === null || z === null) return null;
  return {
    point: freezeDeep({ x, y, z }),
    boreMm: positiveNumberMaybe(boreValue),
  };
}

function resolveNumber(candidates) {
  for (const [value, sourcePath] of candidates) {
    const parsed = positiveNumberMaybe(value);
    if (parsed !== null) return { value: parsed, sourcePath: sourcePath || '' };
  }
  return null;
}

function numberMaybe(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;
  const match = stringValue(value).replace(/,/g, '').match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveNumberMaybe(value) {
  const parsed = numberMaybe(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function uniqueEvidence(entries) {
  const keys = new Set();
  return entries.filter((entry) => {
    if (!entry?.point) return false;
    const key = `${entry.point.x}|${entry.point.y}|${entry.point.z}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

function addPoints(a, b) {
  if (!a || !b) return null;
  return freezeDeep({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
}

function midpoint(a, b) {
  if (!a || !b) return null;
  return freezeDeep({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  });
}

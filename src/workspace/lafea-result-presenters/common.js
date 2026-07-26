/**
 * Shared contract helpers for LAFEA result presenters.
 *
 * Every row value is selected directly from retained result evidence. Callers
 * must supply explicit units; this module does not infer a unit from a number.
 */
export function presenterRow(
  label,
  value,
  unit,
  formulaId,
  sourcePath,
) {
  if (!['number', 'string'].includes(typeof value)) {
    throw new TypeError(`${sourcePath} is not a scalar presenter value.`);
  }
  if (typeof unit !== 'string' || !unit) {
    throw new TypeError(`Presenter unit is required for ${sourcePath}.`);
  }
  return Object.freeze({
    label,
    value,
    unit,
    formulaId: formulaId ?? null,
    sourcePath,
  });
}

export function presenterResult(result, sections, governing) {
  const value = {
    sections,
    governing: governing ?? null,
    limitations: [...(result.limitations ?? [])],
    formulaIds: [...(result.formulaTrace ?? [])],
  };
  validatePresenter(value);
  return deepFreeze(value);
}

export function validatePresenter(value) {
  if (!Array.isArray(value?.sections)) {
    throw new TypeError('Presenter sections are required.');
  }
  for (const section of value.sections) {
    if (typeof section.title !== 'string' || !Array.isArray(section.rows)) {
      throw new TypeError('Invalid presenter section.');
    }
    for (const row of section.rows) {
      if (!['number', 'string'].includes(typeof row.value)) {
        throw new TypeError(`Invalid presenter value at ${row.sourcePath}.`);
      }
      if (typeof row.unit !== 'string' || !row.unit) {
        throw new TypeError(`Missing presenter unit at ${row.sourcePath}.`);
      }
      if (typeof row.sourcePath !== 'string' || !row.sourcePath) {
        throw new TypeError('Presenter sourcePath is required.');
      }
    }
  }
  return true;
}

export function formulaId(record) {
  return Array.isArray(record?.formulaIds) && record.formulaIds.length
    ? record.formulaIds[0]
    : null;
}

export function requiredUnit(units, key) {
  const value = units?.[key];
  if (typeof value !== 'string' || !value) {
    throw new TypeError(`LAFEA presenter requires the ${key} unit.`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

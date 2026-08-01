import { TRACE_TABLE_FIELDS } from './xml-cii-table-trace-source.js';

export const REQUIRED_TRACE_TABLE_FIELD_NAMES = Object.freeze(
  TRACE_TABLE_FIELDS.map(({ id }) => id),
);

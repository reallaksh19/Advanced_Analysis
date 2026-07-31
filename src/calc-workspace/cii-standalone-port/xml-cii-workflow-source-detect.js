export const XML_OR_TXT_ACCEPT = '.xml,.txt,.json,.csv';

export function detectXmlCiiWorkflowSourceKind(fileName = '') {
  const name = String(fileName).toLowerCase();
  if (name.endsWith('.xml')) return 'xml';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.csv') || name.endsWith('.xlsx')) return 'table';
  return 'unknown';
}

export function maskedFileName(fileName = '') {
  return String(fileName || 'Unnamed File');
}

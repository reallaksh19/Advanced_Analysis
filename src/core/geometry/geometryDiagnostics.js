import { DIAGNOSTIC_SEVERITIES } from './geometrySchema.js';

export const createDiagnostic = (severity, code, message, data = {}) => {
  return {
    severity,
    code,
    message,
    data,
    timestamp: new Date().toISOString()
  };
};

export const addInfo = (diagnosticsArray, code, message, data = {}) => {
  diagnosticsArray.push(createDiagnostic(DIAGNOSTIC_SEVERITIES.INFO, code, message, data));
};

export const addWarning = (diagnosticsArray, code, message, data = {}) => {
  diagnosticsArray.push(createDiagnostic(DIAGNOSTIC_SEVERITIES.WARNING, code, message, data));
};

export const addError = (diagnosticsArray, code, message, data = {}) => {
  diagnosticsArray.push(createDiagnostic(DIAGNOSTIC_SEVERITIES.ERROR, code, message, data));
};

export const addFatal = (diagnosticsArray, code, message, data = {}) => {
  diagnosticsArray.push(createDiagnostic(DIAGNOSTIC_SEVERITIES.FATAL, code, message, data));
};

export const hasErrors = (diagnosticsArray) => {
  return diagnosticsArray.some(d => d.severity === DIAGNOSTIC_SEVERITIES.ERROR || d.severity === DIAGNOSTIC_SEVERITIES.FATAL);
};

export const filterBySeverity = (diagnosticsArray, severity) => {
  return diagnosticsArray.filter(d => d.severity === severity);
};

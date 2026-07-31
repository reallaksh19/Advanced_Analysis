export function validateSupportConfigJson(jsonStr = '{}') {
  try {
    JSON.parse(jsonStr);
    return { valid: true, error: null };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

export async function runXmlCii2019Workflow(job = {}) {
  return {
    success: true,
    ciiOutputText: '',
    diagnostics: []
  };
}

import ResultStatus from './resultStatus.js';

function addBlock(state, status, code, message) {
  state.status = status;
  state.isQualified = false;
  state.blockingReasons.push(message);
  state.diagnostics.push({ code, severity: 'ERROR', message });
}

/**
 * Evaluates whether a given engineering method is applicable to the supplied
 * geometry, inputs and data sources. Unsupported geometry, placeholder loads,
 * missing vendor loads, missing pipe/material data, and uncertified benchmarks
 * are explicitly blocked from clean PASS outputs.
 */
export function evaluateApplicability({ methodId, geometry, inputs = {}, dataSources = {}, benchmarkStatus }) {
  const state = {
    status: ResultStatus.PASSED,
    isQualified: true,
    diagnostics: [],
    blockingReasons: []
  };

  const segments = Array.isArray(geometry?.segments) ? geometry.segments : [];
  const components = Array.isArray(geometry?.components) ? geometry.components : [];
  const hasBranchGeometry =
    segments.some((seg) => seg.branch === true || seg.type === 'TEE' || seg.type === 'OLET') ||
    components.some((cmp) => ['TEE', 'OLET', 'BRANCH'].includes(String(cmp.type || '').toUpperCase()));

  if (hasBranchGeometry && ['CANTILEVER_END_LOAD', 'SIMPLE_SPAN_DISTRIBUTED', 'SIMPLE_SPAN_CONCENTRATED'].includes(methodId)) {
    addBlock(state, ResultStatus.UNSUPPORTED_GEOMETRY, 'UNSUPPORTED_BRANCH_GEOMETRY', 'Branch/tee/olet geometry is not supported by this single-line screening method.');
  }

  const usesPlaceholderLoad = inputs.placeholderLoad === true || inputs.loads?.some?.((load) => load.placeholder === true);
  if (usesPlaceholderLoad) {
    addBlock(state, ResultStatus.NOT_QUALIFIED, 'PLACEHOLDER_LOAD_USED', 'Placeholder load was used; result is not qualified for clean PASS/FAIL.');
  }

  const requiresVendorLoads = ['MIST_NOZZLE_SCREENING', 'KOVES_FLANGE_SCREENING'].includes(methodId) || inputs.requiresVendorLoads === true;
  const hasVendorLoads = Boolean(inputs.vendorLoads || dataSources.vendorLoads);
  if (requiresVendorLoads && !hasVendorLoads) {
    addBlock(state, ResultStatus.NOT_QUALIFIED, 'VENDOR_LOADS_MISSING', 'Vendor/nozzle allowable load data is missing.');
  }

  const requestedPipe = inputs.pipe || inputs.pipeKey || inputs.nps || inputs.schedule;
  if (requestedPipe && dataSources.pipeTable && !dataSources.pipeTable[requestedPipe]) {
    addBlock(state, ResultStatus.MISSING_DATA, 'PIPE_DATA_MISSING', `Pipe data is missing for requested pipe key: ${requestedPipe}.`);
  }

  const requestedMaterial = inputs.material || inputs.materialId;
  if (requestedMaterial && dataSources.materialTable && !dataSources.materialTable[requestedMaterial]) {
    addBlock(state, ResultStatus.MISSING_DATA, 'MATERIAL_DATA_MISSING', `Material data is missing for requested material: ${requestedMaterial}.`);
  }

  if (benchmarkStatus && benchmarkStatus !== ResultStatus.PASSED) {
    addBlock(state, ResultStatus.BENCHMARK_NOT_CERTIFIED, 'BENCHMARK_NOT_CERTIFIED', `Benchmark status is ${benchmarkStatus}; method is not certified.`);
  }

  return state;
}

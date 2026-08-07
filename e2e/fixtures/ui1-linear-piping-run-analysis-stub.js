const DISABLED = 'UI1_TEST_PIPING_RUN_ANALYSIS_DISABLED';

export const LINEAR_PIPING_WORKBENCH_RUN_REQUEST_SCHEMA =
  'linear-piping-workbench-run-request/v1';
export const LINEAR_PIPING_WORKBENCH_RUN_RESULT_SCHEMA =
  'linear-piping-workbench-run-result/v1';
export const LINEAR_PIPING_WORKBENCH_RUN_REQUEST_KEYS = Object.freeze([]);
export const LINEAR_PIPING_WORKBENCH_RUN_CASE_KEYS = Object.freeze([]);

export function runLinearPipingWorkbenchAnalysis() {
  throw disabledError();
}

export function requireLinearPipingWorkbenchRunRequest() {
  throw disabledError();
}

function disabledError() {
  const error = new Error(
    'UI-1 browser regression intentionally disables the unrelated locked-baseline piping runner.',
  );
  error.code = DISABLED;
  return error;
}

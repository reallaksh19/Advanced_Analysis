const HEAD_PATTERN = /^[0-9a-f]{40}$/u;
const WORKFLOW_KEYS = Object.freeze([
  'status', 'conclusion', 'steps', 'logsAvailable', 'artifactStatus',
]);
const STEP_KEYS = Object.freeze(['name', 'status', 'conclusion']);

export const PHASE6I_WORKFLOW_EVIDENCE_SCHEMA =
  'lfea-piping-phase6i-workflow-evidence/v1';
export const PHASE6I_CANDIDATE_BINDING_SCHEMA =
  'lfea-piping-phase6i-candidate-binding/v1';
export const PHASE6I_WORKFLOW_EVIDENCE_STATUS = 'ELIGIBLE_WORKFLOW_EVIDENCE';
export const SUPERSEDED_PHASE6I_HEADS = Object.freeze([
  '921491eaee42a89115c958797508686c551e19b6',
  'e76d2171015275836fe80e7d5e8b12d426eeb79e',
]);

export function requirePhase6IWorkflowEvidence(record) {
  requireExactKeys(record, WORKFLOW_KEYS, 'LFEA_PHASE6I_WORKFLOW_RECORD_INVALID');
  if (record.status !== 'completed') {
    fail('LFEA_PHASE6I_WORKFLOW_NOT_COMPLETED', { status: record.status });
  }
  if (!Array.isArray(record.steps) || record.steps.length === 0) {
    fail('LFEA_PHASE6I_WORKFLOW_STEPS_MISSING');
  }
  const steps = record.steps.map((step, index) => canonicalStep(step, index));
  if (record.conclusion !== 'success') {
    fail('LFEA_PHASE6I_WORKFLOW_NOT_SUCCESSFUL', { conclusion: record.conclusion });
  }
  const failedStep = steps.find((step) => (
    step.status !== 'completed' || step.conclusion !== 'success'
  ));
  if (failedStep) {
    fail('LFEA_PHASE6I_WORKFLOW_STEP_NOT_SUCCESSFUL', { step: failedStep });
  }
  if (record.logsAvailable !== true) {
    fail('LFEA_PHASE6I_WORKFLOW_LOGS_MISSING');
  }
  if (record.artifactStatus !== 'PRESENT') {
    fail('LFEA_PHASE6I_WORKFLOW_ARTIFACT_MISSING', {
      artifactStatus: record.artifactStatus,
    });
  }
  return Object.freeze({
    schema: PHASE6I_WORKFLOW_EVIDENCE_SCHEMA,
    status: PHASE6I_WORKFLOW_EVIDENCE_STATUS,
    stepCount: steps.length,
    logsAvailable: true,
    artifactStatus: 'PRESENT',
  });
}

export function requirePhase6ICandidateBinding({ expectedHead, artifactHeads }) {
  requireHead(expectedHead, 'LFEA_PHASE6I_CANDIDATE_HEAD_INVALID');
  if (SUPERSEDED_PHASE6I_HEADS.includes(expectedHead)) {
    fail('LFEA_PHASE6I_SUPERSEDED_HEAD', { expectedHead });
  }
  if (!Array.isArray(artifactHeads) || artifactHeads.length === 0) {
    fail('LFEA_PHASE6I_ARTIFACT_HEADS_MISSING');
  }
  const acceptedHeads = artifactHeads.map((head) => {
    requireHead(head, 'LFEA_PHASE6I_ARTIFACT_HEAD_INVALID');
    if (SUPERSEDED_PHASE6I_HEADS.includes(head)) {
      fail('LFEA_PHASE6I_SUPERSEDED_HEAD', { head });
    }
    if (head !== expectedHead) {
      fail('LFEA_PHASE6I_ARTIFACT_HEAD_MISMATCH', { expectedHead, head });
    }
    return head;
  });
  return Object.freeze({
    schema: PHASE6I_CANDIDATE_BINDING_SCHEMA,
    exactHead: expectedHead,
    artifactCount: acceptedHeads.length,
    status: 'SAME_HEAD_BOUND',
  });
}

function canonicalStep(value, index) {
  requireExactKeys(value, STEP_KEYS, 'LFEA_PHASE6I_WORKFLOW_STEP_INVALID');
  return Object.freeze({
    name: requireText(value.name, `steps[${index}].name`),
    status: requireText(value.status, `steps[${index}].status`),
    conclusion: requireText(value.conclusion, `steps[${index}].conclusion`),
  });
}

function requireHead(value, code) {
  if (typeof value !== 'string' || !HEAD_PATTERN.test(value)) fail(code, { value });
}

function requireExactKeys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort(compareAscii);
  const required = [...expected].sort(compareAscii);
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    fail(code, { actual, expected: required });
  }
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('LFEA_PHASE6I_TEXT_INVALID', { field, value });
  }
  return value;
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code, evidence = {}) {
  const error = new Error(code);
  error.code = code;
  error.evidence = evidence;
  throw error;
}

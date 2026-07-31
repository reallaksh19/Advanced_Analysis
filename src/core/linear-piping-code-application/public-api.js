import {
  compileLinearPipingB31Application as compileBaseB31Application,
  requireLinearPipingB31Application as requireBaseB31Application,
} from './b31-application.js';
import { failCodeApplication } from './contracts.js';

export function compileLinearPipingB31Application(input) {
  return requirePublicB31Application(compileBaseB31Application(input));
}

export function requireLinearPipingB31Application(record) {
  return requirePublicB31Application(requireBaseB31Application(record));
}

function requirePublicB31Application(application) {
  const blocked = application.results.find((entry) => entry.codeResult.status === 'BLOCKED');
  if (blocked) {
    failCodeApplication(
      `B31 application check ${blocked.checkId} is BLOCKED and cannot enter a sealed application result.`,
      'PIPING_B31_CODE_RESULT_BLOCKED',
      {
        checkId: blocked.checkId,
        codeResultSemanticHash: blocked.codeResult.semanticHash,
      },
    );
  }
  const expectedStatus = application.results.some(
    (entry) => entry.codeResult.status === 'CONDITIONAL',
  ) ? 'CONDITIONAL' : 'QUALIFIED';
  if (application.status !== expectedStatus) {
    failCodeApplication(
      'B31 application status does not match the retained code-result statuses.',
      'PIPING_B31_APPLICATION_STATUS_MISMATCH',
      { expectedStatus, actualStatus: application.status },
    );
  }
  return application;
}

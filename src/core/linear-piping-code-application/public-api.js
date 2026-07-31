import {
  compileLinearPipingB31Application as compileBaseB31Application,
  requireLinearPipingB31Application as requireBaseB31Application,
} from './b31-application.js';
import { failCodeApplication } from './contracts.js';

export function compileLinearPipingB31Application(input) {
  return requireNoBlockedCodeResult(compileBaseB31Application(input));
}

export function requireLinearPipingB31Application(record) {
  return requireNoBlockedCodeResult(requireBaseB31Application(record));
}

function requireNoBlockedCodeResult(application) {
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
  return application;
}

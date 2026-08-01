import path from 'node:path';
import process from 'node:process';

export const MANIFEST_RELATIVE_PATH = 'internal/exact-head-manifest.json';
export const BASELINE_RELATIVE_PATH = 'internal/audit-baseline.runtime.json';
export const BASELINE_STAGE_DIRECTORY = 'lfea-piping-evidence';
export const ARTIFACT_DEFINITIONS = Object.freeze({
  upstreamGateLog: Object.freeze({
    path: 'internal/upstream-gate.log',
    mediaType: 'text/plain',
  }),
  t0GateLog: Object.freeze({
    path: 'internal/t0-gate.log',
    mediaType: 'text/plain',
  }),
  sourceOrchestrationEvidence: Object.freeze({
    path: 'internal/source-orchestration.json',
    mediaType: 'application/json',
  }),
  interfaceEvidence: Object.freeze({
    path: 'internal/interface-evidence.json',
    mediaType: 'application/json',
  }),
  interfaceRecoveryEvidence: Object.freeze({
    path: 'internal/interface-recovery.json',
    mediaType: 'application/json',
  }),
  codeAndAllowableEvidence: Object.freeze({
    path: 'internal/code-and-allowable.json',
    mediaType: 'application/json',
  }),
  presentationExportEvidence: Object.freeze({
    path: 'internal/presentation-export.json',
    mediaType: 'application/json',
  }),
});

export function buildInternalEvidenceCommandPlan({ outputRoot }) {
  const baselineEmitPath = path.resolve(
    outputRoot,
    ...BASELINE_RELATIVE_PATH.split('/'),
  );
  return Object.freeze([
    command(
      'EXACT_HEAD_BASELINE',
      'upstreamGateLog',
      process.execPath,
      [
        'scripts/lfea-piping-a0-baseline-check.mjs',
        '--release',
        `--emit=${baselineEmitPath}`,
      ],
      {
        executable: 'node',
        args: [
          'scripts/lfea-piping-a0-baseline-check.mjs',
          '--release',
          '--emit=$EVIDENCE_ROOT/internal/audit-baseline.runtime.json',
        ],
      },
    ),
    command(
      'UPSTREAM_NUMERICAL_CHAIN',
      'upstreamGateLog',
      npmExecutable(),
      ['run', 'check:lfea-core'],
      { executable: 'npm' },
    ),
    command(
      'T0_APPLICATION_SEQUENCING',
      't0GateLog',
      process.execPath,
      ['scripts/linear-piping-analysis-consumer-check.mjs'],
      { executable: 'node' },
    ),
    command(
      'SOURCE_ORCHESTRATION',
      'sourceOrchestrationEvidence',
      process.execPath,
      ['scripts/linear-piping-source-orchestration-check.mjs'],
      { executable: 'node' },
    ),
    command(
      'INTERFACES',
      'interfaceEvidence',
      npmExecutable(),
      ['run', 'check:lfea-interfaces'],
      { executable: 'npm' },
    ),
    command(
      'INTERFACE_RECOVERY',
      'interfaceRecoveryEvidence',
      process.execPath,
      ['scripts/linear-piping-interface-check.mjs'],
      { executable: 'node' },
    ),
    command(
      'CODE_AND_ALLOWABLES',
      'codeAndAllowableEvidence',
      npmExecutable(),
      ['run', 'check:lfea-code-application'],
      { executable: 'npm' },
    ),
    command(
      'PRESENTATION_EXPORT',
      'presentationExportEvidence',
      npmExecutable(),
      ['run', 'check:lfea-presentation-export'],
      { executable: 'npm' },
    ),
    command(
      'FULL_REPOSITORY_GATE',
      'upstreamGateLog',
      npmExecutable(),
      ['run', 'gate'],
      { executable: 'npm' },
    ),
    Object.freeze({
      commandId: 'CLEAN_TREE',
      artifactRole: 'upstreamGateLog',
      kind: 'CLEAN_TREE',
      executable: null,
      args: Object.freeze([]),
      commandText: 'git diff --check && test -z "$(git status --porcelain)"',
    }),
  ]);
}

function command(commandId, artifactRole, executable, args, display = {}) {
  const displayExecutable = display.executable ?? normalizedExecutable(executable);
  const displayArgs = display.args ?? args;
  return Object.freeze({
    commandId,
    artifactRole,
    kind: 'PROCESS',
    executable,
    args: Object.freeze([...args]),
    commandText: formatCommand(displayExecutable, displayArgs),
  });
}

function normalizedExecutable(executable) {
  if (executable === process.execPath) return 'node';
  if (/npm(?:\.cmd)?$/u.test(executable)) return 'npm';
  return executable;
}

function formatCommand(executable, args) {
  return [executable, ...args].map((value) => (
    /\s/u.test(value) ? JSON.stringify(value) : value
  )).join(' ');
}

function npmExecutable() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

import {
  SCHEMAS,
  assertArray,
  assertExactKeys,
  assertFiniteNumber,
  assertId,
  assertString,
  clonePlain,
  sealWithHash,
  verifySealedHash,
} from './contracts.js';
import { OUTPUT_TYPES, SHELL_ELEMENT_PROFILE } from './canonical-model.js';

export const CALCULIX_FIELD20_NUMERIC_FORMAT = 'SCIENTIFIC_15_SIGNIFICANT_DIGITS_CCX_FIELD20_V1';

export const DEFAULT_DECK_PROFILE_INPUT = Object.freeze({
  schema: SCHEMAS.DECK_PROFILE,
  deckProfileId: 'CALCULIX_2_22_NC00_DECK_V2',
  solverId: 'CALCULIX_CCX_2_22_PROVISIONAL',
  elementMappings: [{
    canonicalElementProfile: SHELL_ELEMENT_PROFILE,
    solverElementIdentity: 'S4',
  }],
  ordering: {
    nodes: 'CODE_UNIT_ID',
    elements: 'CODE_UNIT_ID',
    surfaces: 'CODE_UNIT_ID',
    contactPairs: 'CODE_UNIT_ID',
    loadSteps: 'CANONICAL_SEQUENCE',
  },
  numericFormat: CALCULIX_FIELD20_NUMERIC_FORMAT,
  lineEndings: 'LF',
  fileNames: {
    input: 'model.inp',
    stdout: 'solver.stdout.txt',
    stderr: 'solver.stderr.txt',
  },
  outputRequests: [...OUTPUT_TYPES],
  solverControls: {
    nonlinearGeometry: true,
    shellMechanicsQualified: false,
    contactMechanicsQualified: false,
    maximumIterationsAuthority: 'CANONICAL_LOAD_STEP',
  },
  threadCount: 1,
});

export function createDeckProfile(input) {
  assertExactKeys(input, [
    'schema',
    'deckProfileId',
    'solverId',
    'elementMappings',
    'ordering',
    'numericFormat',
    'lineEndings',
    'fileNames',
    'outputRequests',
    'solverControls',
    'threadCount',
  ], 'deckProfileInput', ['deckProfileSemanticHash']);
  if (Object.hasOwn(input, 'deckProfileSemanticHash')) {
    throw new TypeError('deckProfileSemanticHash is computed internally.');
  }
  if (input.schema !== SCHEMAS.DECK_PROFILE) throw new TypeError('Unknown deck profile schema.');
  assertId(input.deckProfileId, 'deckProfileInput.deckProfileId');
  assertId(input.solverId, 'deckProfileInput.solverId');
  assertArray(input.elementMappings, 'deckProfileInput.elementMappings', { min: 1 });
  const elementMappings = input.elementMappings.map((mapping, index) => {
    const path = `deckProfileInput.elementMappings[${index}]`;
    assertExactKeys(mapping, ['canonicalElementProfile', 'solverElementIdentity'], path);
    if (mapping.canonicalElementProfile !== SHELL_ELEMENT_PROFILE) {
      throw new TypeError('Unsupported canonical shell element mapping.');
    }
    assertString(mapping.solverElementIdentity, `${path}.solverElementIdentity`);
    return clonePlain(mapping);
  });
  assertExactKeys(input.ordering, [
    'nodes',
    'elements',
    'surfaces',
    'contactPairs',
    'loadSteps',
  ], 'deckProfileInput.ordering');
  const expectedOrdering = DEFAULT_DECK_PROFILE_INPUT.ordering;
  Object.entries(expectedOrdering).forEach(([key, value]) => {
    if (input.ordering[key] !== value) throw new TypeError(`Unsupported ${key} ordering.`);
  });
  if (input.numericFormat !== CALCULIX_FIELD20_NUMERIC_FORMAT) {
    throw new TypeError('Unsupported numeric formatting profile.');
  }
  if (input.lineEndings !== 'LF') throw new TypeError('Deck line endings must be LF.');
  assertExactKeys(input.fileNames, ['input', 'stdout', 'stderr'], 'deckProfileInput.fileNames');
  Object.values(input.fileNames).forEach((value) => {
    assertString(value, 'deckProfileInput.fileNames value');
    if (value.includes('/') || value.includes('\\') || value.includes('..')) {
      throw new TypeError('Deck file names must be fixed base names.');
    }
  });
  assertArray(input.outputRequests, 'deckProfileInput.outputRequests');
  input.outputRequests.forEach((value, index) => {
    if (!OUTPUT_TYPES.includes(value)) {
      throw new TypeError(`deckProfileInput.outputRequests[${index}] is unsupported.`);
    }
  });
  assertExactKeys(input.solverControls, [
    'nonlinearGeometry',
    'shellMechanicsQualified',
    'contactMechanicsQualified',
    'maximumIterationsAuthority',
  ], 'deckProfileInput.solverControls');
  if (input.solverControls.nonlinearGeometry !== true
      || input.solverControls.shellMechanicsQualified !== false
      || input.solverControls.contactMechanicsQualified !== false
      || input.solverControls.maximumIterationsAuthority !== 'CANONICAL_LOAD_STEP') {
    throw new TypeError('NC-00 deck controls cannot claim qualified mechanics.');
  }
  assertFiniteNumber(
    input.threadCount,
    'deckProfileInput.threadCount',
    (v) => Number.isInteger(v) && v === 1,
    'single-thread integer',
  );
  return sealWithHash({
    schema: SCHEMAS.DECK_PROFILE,
    deckProfileId: input.deckProfileId,
    solverId: input.solverId,
    elementMappings,
    ordering: clonePlain(input.ordering),
    numericFormat: input.numericFormat,
    lineEndings: 'LF',
    fileNames: clonePlain(input.fileNames),
    outputRequests: [...new Set(input.outputRequests)].sort(),
    solverControls: clonePlain(input.solverControls),
    threadCount: 1,
  }, 'deckProfileSemanticHash');
}

export function validateDeckProfile(profile) {
  verifySealedHash(profile, 'deckProfileSemanticHash', 'deckProfile');
  const copy = clonePlain(profile);
  delete copy.deckProfileSemanticHash;
  const rebuilt = createDeckProfile(copy);
  if (rebuilt.deckProfileSemanticHash !== profile.deckProfileSemanticHash) {
    throw new TypeError('Deck profile semantics are not canonical.');
  }
  return true;
}

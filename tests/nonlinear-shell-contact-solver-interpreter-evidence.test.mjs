import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPECTED_INTERPRETER_PATH,
  mergeLibraryInput,
  parseElfInterpreter,
} from '../scripts/lafea-nc-solver-interpreter-evidence.mjs';

test('ELF interpreter parsing binds the exact governed loader path', () => {
  const input = `Elf file type is DYN\n      [Requesting program interpreter: ${EXPECTED_INTERPRETER_PATH}]\n`;
  assert.equal(parseElfInterpreter(input), EXPECTED_INTERPRETER_PATH);
});

test('ELF interpreter parsing rejects a different loader path', () => {
  assert.throws(
    () => parseElfInterpreter('[Requesting program interpreter: /tmp/ld-linux-x86-64.so.2]'),
    /must equal/,
  );
});

test('linked-library input gains one canonical interpreter entry without duplicates', () => {
  const prior = [
    { name: 'libc.so.6', version: 'runtime', path: 'libraries/libc.so.6' },
    { name: 'ld-linux-x86-64.so.2', version: 'old', path: 'libraries/ld-linux-x86-64.so.2' },
  ];
  const expected = { name: 'ld-linux-x86-64.so.2', version: 'libc6-2.39', path: 'libraries/ld-linux-x86-64.so.2' };
  const merged = mergeLibraryInput(prior, expected);
  assert.equal(merged.filter((entry) => entry.name === expected.name).length, 1);
  assert.deepEqual(merged.find((entry) => entry.name === expected.name), expected);
});

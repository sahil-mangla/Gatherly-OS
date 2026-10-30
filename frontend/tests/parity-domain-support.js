/**
 * @file parity-domain-support.js
 * @description Helpers for the cross-language parity suite (fixtures live in shared/parity).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURE_DIR = new URL('../../shared/parity/', import.meta.url);
const FLOAT_TOLERANCE = 0.01;

/** Fixture cases of shared/parity/<name>.json. */
export function loadCases(name) {
  return JSON.parse(readFileSync(new URL(`${name}.json`, FIXTURE_DIR), 'utf8')).cases;
}

/** Runs fn on a deep copy of the input; a thrown error becomes the fixture's error marker. */
export function outcome(fn, input) {
  try {
    return fn(structuredClone(input));
  } catch {
    return { error: true };
  }
}

const plain = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

function assertMapping(actual, expected, path) {
  assert.ok(actual && typeof actual === 'object' && !Array.isArray(actual), `${path}: not an object`);
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${path}: keys differ`);
  for (const [key, value] of Object.entries(expected)) compare(actual[key], value, `${path}.${key}`);
}

function assertSequence(actual, expected, path) {
  assert.ok(Array.isArray(actual), `${path}: not an array`);
  assert.equal(actual.length, expected.length, `${path}: length differs`);
  expected.forEach((value, index) => compare(actual[index], value, `${path}[${index}]`));
}

function compare(actual, expected, path) {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number', `${path}: not a number`);
    assert.ok(Math.abs(actual - expected) <= FLOAT_TOLERANCE, `${path}: ${actual} != ${expected}`);
  } else if (Array.isArray(expected)) {
    assertSequence(actual, expected, path);
  } else if (expected && typeof expected === 'object') {
    assertMapping(actual, expected, path);
  } else {
    assert.strictEqual(actual, expected, `${path}: ${actual} != ${expected}`);
  }
}

/** Deep-compare: numbers within 0.01, object key sets and array lengths exactly. */
export function assertParity(actual, expected) {
  compare(plain(actual), expected, '$');
}

/** Registers one node:test per fixture case, comparing adapter(input) with the expected value. */
export function runFixture(test, name, adapter) {
  for (const { name: label, input, expected } of loadCases(name)) {
    test(`${name}: ${label}`, () => assertParity(outcome(adapter, input), expected));
  }
}

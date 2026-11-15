import assert from 'node:assert/strict';
import { test } from 'node:test';
import { results } from '../games/rover/tests/rules.cases.js';

assert.ok(results.length > 0, 'rover rule cases were registered');
for (const [name, passed, error] of results) {
  test('Rover: ' + name, () => assert.ok(passed, error));
}

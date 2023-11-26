import test from 'node:test';
import assert from 'node:assert';

import { add } from '../src/index.js';

test('add', (t) => {
  assert.strictEqual(add(1, 2), 3);
});

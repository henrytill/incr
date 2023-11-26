import test from 'node:test';
import assert from 'node:assert';

import { Dependency, Leaf, Target } from '../src/index.js';

test('basic', () => {
  const y = new Leaf(2);
  const z = new Leaf(3);
  const x = new Target(0, [y, z], (a, b): number => a.value + b.value);

  assert.deepStrictEqual(x.children, [y, z]);
  assert.deepStrictEqual(y.parents, [x]);
  assert.deepStrictEqual(z.parents, [x]);

  assert.strictEqual(x.value, 0);
  x.update();
  assert.strictEqual(x.value, 5);

  y.value = 4;
  y.update();
  assert.strictEqual(x.value, 7);

  z.value = 5;
  z.update();
  assert.strictEqual(x.value, 9);
});

test('compound', () => {
  const z = new Leaf(3);
  const y = new Leaf(2);
  const x = new Target(0, [y, z], (a, b): number => a.value + b.value);
  const w = new Leaf('bar');
  const v = new Target('', [w, x], (a, b) => `foo${a.value}-${b.value}`);

  assert.deepStrictEqual(x.parents, [v]);
  assert.deepStrictEqual(v.children, [w, x]);
  x.update();
  assert.strictEqual(v.value, 'foobar-5');

  y.accept({
    visitLeaf: (l: Leaf<number>) => {
      l.value = 1;
    },
    visitTarget: (_t: Target<number>) => {
      return;
    },
  });
  v.build();
  assert.strictEqual(v.value, 'foobar-4');
});

import assert from 'node:assert';
import test from 'node:test';

import { DependencyVisitor, Leaf, Target } from '../src/index.js';

test('basic', () => {
  let count = 0;

  const y = new Leaf(2);
  const z = new Leaf(3);
  const x = new Target([y, z], function (this: any, a, b): number {
    count += 1;
    return a.value + b.value;
  }).build();

  assert.strictEqual(x.value, 5);
  assert.strictEqual(x.parents.length, 0);
  assert.deepStrictEqual(x.children, [y, z]);
  assert.deepStrictEqual(y.parents, [x]);
  assert.deepStrictEqual(z.parents, [x]);

  y.value = 4;
  assert.strictEqual(x.build().value, 7);

  z.value = 5;
  assert.strictEqual(x.build().value, 9);

  assert.strictEqual(count, 3);

  z.value = 5;
  assert.strictEqual(x.build().value, 9);

  assert.strictEqual(count, 3);
});

test('compound', () => {
  const z = new Leaf(3, 'z');
  const y = new Leaf(2, 'y');
  const x = new Target(
    [y, z],
    function (this: any, a, b): number {
      return a.value + b.value;
    },
    'x',
  ).build();
  const w = new Leaf('results', 'w');
  const v = new Target([w, x], (a, b) => `${a.value}: ${b.id} is ${b.value}`, 'v').build();

  assert.strictEqual(v.value, 'results: x is 5');
  assert.strictEqual(v.parents.length, 0);
  assert.deepStrictEqual(x.parents, [v]);
  assert.deepStrictEqual(w.parents, [v]);
  assert.deepStrictEqual(v.children, [w, x]);

  assert.strictEqual(v.id, 'v');
  assert.strictEqual(w.id, 'w');
  assert.strictEqual(x.id, 'x');
  assert.strictEqual(y.id, 'y');
  assert.strictEqual(z.id, 'z');

  const visitor: DependencyVisitor<number, number | undefined> = {
    leaf: (l: Leaf<number>) => {
      l.value += 1;
      return l.value;
    },
    target: (_: Target<number>) => {
      return undefined;
    },
  };
  const ret = y.accept(visitor);
  assert.strictEqual(ret, 3);
  assert.strictEqual(x.shouldRebuild, true);
  assert.strictEqual(v.shouldRebuild, true);
  assert.strictEqual(v.build().value, 'results: x is 6');

  w.value = 'hello';
  assert.strictEqual(x.shouldRebuild, false);
  assert.strictEqual(v.shouldRebuild, true);
  assert.strictEqual(v.build().value, 'hello: x is 6');
});

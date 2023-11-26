import test from 'node:test';
import assert from 'node:assert';

import { Dependency, ItemVisitor, Leaf, Target } from '../src/index.js';

test('basic', () => {
  const y: Leaf<number, number> = new Leaf(2);
  const z: Leaf<number, number> = new Leaf(3);
  const x: Target<number, number> = new Target(0, [y, z], (a, b) => a.value + b.value);

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
  const y: Leaf<number, number> = new Leaf(2);
  const z: Leaf<number, number> = new Leaf(3);
  const x: Target<number, number> = new Target(0, [y, z], (a, b) => a.value + b.value);
  const w: Target<number, number | string> = new Target(
    '',
    [x as Dependency<number, number | string>],
    (a) => `foo${a.value}`,
  );

  assert.deepStrictEqual(x.parents, [w]);
  assert.deepStrictEqual(w.children, [x]);
  x.update();
  assert.strictEqual(w.value, 'foo5');

  const visitor: ItemVisitor<number, number | string> = {
    visitLeaf: (l: Leaf<number, number>) => {
      l.value = 1;
    },
    visitTarget: (t: Target<number, number | string>) => {},
  };
  y.accept(visitor);
  w.build();
  assert.strictEqual(w.value, 'foo4');
});

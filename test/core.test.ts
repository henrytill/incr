import assert from 'node:assert';
import { describe, it } from 'node:test';

import { NodeVisitor, Cell, Computable, AutoCell } from '../src/core.js';

describe('Computable', () => {
  it('correctly computes', () => {
    let count = 0;

    const y = new Cell(2);
    const z = new Cell(3);
    const x = new Computable([y, z], function (this: any, a, b): number {
      count += 1;
      return a.value + b.value;
    }).compute();

    assert.strictEqual(x.value, 5);
    assert.strictEqual(x.parents.length, 0);
    assert.deepStrictEqual(x.children, [y, z]);
    assert.deepStrictEqual(y.parents, [x]);
    assert.deepStrictEqual(z.parents, [x]);

    y.value = 4;
    assert.strictEqual(x.compute().value, 7);

    z.value = 5;
    assert.strictEqual(x.compute().value, 9);

    assert.strictEqual(count, 3);

    z.value = 5;
    assert.strictEqual(x.compute().value, 9);

    assert.strictEqual(count, 3);
  });

  it('correctly computes a larger example', () => {
    const z = new Cell(3, 'z');
    const y = new Cell(2, 'y');
    const x = new Computable(
      [y, z],
      function (this: any, a, b): number {
        return a.value + b.value;
      },
      'x',
    ).compute();
    const w = new Cell('results', 'w');
    const v = new Computable([w, x], (a, b) => `${a.value}: ${b.key} is ${b.value}`, 'v').compute();

    assert.strictEqual(v.value, 'results: x is 5');
    assert.strictEqual(v.parents.length, 0);
    assert.deepStrictEqual(x.parents, [v]);
    assert.deepStrictEqual(w.parents, [v]);
    assert.deepStrictEqual(v.children, [w, x]);

    assert.strictEqual(v.key, 'v');
    assert.strictEqual(w.key, 'w');
    assert.strictEqual(x.key, 'x');
    assert.strictEqual(y.key, 'y');
    assert.strictEqual(z.key, 'z');

    const visitor: NodeVisitor<number, number | undefined> = {
      visitCell: (node: Cell<number>) => {
        node.value += 1;
        return node.value;
      },
      visitComputable: (_node: Computable<number>) => {
        return undefined;
      },
    };
    const ret = y.accept(visitor);
    assert.strictEqual(ret, 3);
    assert.strictEqual(x.shouldRebuild, true);
    assert.strictEqual(v.shouldRebuild, true);
    assert.strictEqual(v.compute().value, 'results: x is 6');

    w.value = 'hello';
    assert.strictEqual(x.shouldRebuild, false);
    assert.strictEqual(v.shouldRebuild, true);
    assert.strictEqual(v.compute().value, 'hello: x is 6');
  });

  it('works with AutoCell', () => {
    let count = 0;

    const z = new AutoCell(3);
    const y = new AutoCell(2);
    const x = new Computable([y, z], function (a, b): number {
      count += 1;
      return a.value + b.value;
    }).compute();
    const w = new AutoCell(4);
    const v = new Computable([w, x], (a, b) => a.value + b.value).compute();

    assert.strictEqual(v.value, 9);
    assert.strictEqual(count, 1);

    w.value = 5;

    assert.strictEqual(v.value, 10);
    assert.strictEqual(count, 1);
  });
});

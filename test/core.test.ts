import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NodeVisitor, Cell, Computable, AutoCell, AsyncComputable } from '../src/core.js';

describe('Computable', () => {
    it('correctly computes', () => {
        let count = 0;

        const y = new Cell(2);
        const z = new Cell(3);
        const x = new Computable([y, z], function (this: any, a, b): number {
            count += 1;
            return a.value + b.value;
        }).compute();

        assert.equal(x.value, 5);
        assert.equal(x.parents.length, 0);
        assert.deepEqual(x.children, [y, z]);
        assert.deepEqual(y.parents, [x]);
        assert.deepEqual(z.parents, [x]);

        y.value = 4;
        assert.equal(x.compute().value, 7);

        z.value = 5;
        assert.equal(x.compute().value, 9);

        assert.equal(count, 3);

        z.value = 5;
        assert.equal(x.compute().value, 9);

        assert.equal(count, 3);
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
        const v = new Computable(
            [w, x],
            (a, b) => `${a.value}: ${b.key} is ${b.value}`,
            'v',
        ).compute();

        assert.equal(v.value, 'results: x is 5');
        assert.equal(v.parents.length, 0);
        assert.deepEqual(x.parents, [v]);
        assert.deepEqual(w.parents, [v]);
        assert.deepEqual(v.children, [w, x]);

        assert.equal(v.key, 'v');
        assert.equal(w.key, 'w');
        assert.equal(x.key, 'x');
        assert.equal(y.key, 'y');
        assert.equal(z.key, 'z');

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
        assert.equal(ret, 3);
        assert.equal(x.shouldRebuild, true);
        assert.equal(v.shouldRebuild, true);
        assert.equal(v.compute().value, 'results: x is 6');

        w.value = 'hello';
        assert.equal(x.shouldRebuild, false);
        assert.equal(v.shouldRebuild, true);
        assert.equal(v.compute().value, 'hello: x is 6');
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

        assert.equal(v.value, 9);
        assert.equal(count, 1);

        w.value = 5;

        assert.equal(v.value, 10);
        assert.equal(count, 1);
    });
});

describe('AsyncComputable', () => {
    it('works with Cell', async () => {
        const z = new Cell(1);
        const y = new Cell(2);

        const x = new AsyncComputable([y, z], async (a, b) => {
            return a.value + b.value;
        });

        const w = new Cell(3);
        const v = new AsyncComputable([w, x], async (a, b) => {
            return a.value + (await b.value);
        });

        const u = new Cell(4);
        const t = new AsyncComputable([u, v], async (a, b) => {
            return a.value + (await b.value);
        });

        assert.equal(await t.compute().value, 10);

        z.value = 2;

        assert.equal(await t.compute().value, 11);
    });
});

import crypto from 'node:crypto';

import { ignore } from './common.js';

export type Node<A> = Cell<A> | Computable<A>;

export type NodeVisitor<A, B> = {
  visitCell(node: Cell<A>): B;
  visitComputable(node: Computable<A>): B;
};

export type ComputeFunction<A, B> = (...deps: Node<A>[]) => B | undefined;

/**
 * A leaf node in the tree.
 *
 * The value of a leaf node is set by the user.
 */
export class Cell<A> {
  protected _value: A;

  readonly key: string;

  parents: Computable<any>[] = [];

  constructor(value: A, key?: string) {
    this._value = value;
    this.key = key ?? crypto.randomUUID();
  }

  get value(): A {
    return this._value;
  }

  set value(value: A) {
    if (value === this._value) return;
    this._value = value;
    this.update();
  }

  addParents(...parents: Computable<any>[]): void {
    this.parents.push(...parents);
  }

  update(): void {
    for (const parent of this.parents) {
      parent.update();
    }
  }

  accept<B>(visitor: NodeVisitor<A, B>): B {
    return visitor.visitCell(this);
  }
}

/**
 * A branch node in the tree.
 *
 * The value of a branch node is computed by a compute function which takes the
 * node's children as input.
 */
export class Computable<A> {
  private _value?: A;

  readonly key: string;

  parents: Computable<any>[] = [];

  children: Node<any>[];

  builder: ComputeFunction<any, A>;

  shouldRebuild = true;

  constructor(children: Node<any>[], builder: ComputeFunction<any, A>, key?: string) {
    this.children = children;
    this.builder = builder;
    this.key = key ?? crypto.randomUUID();

    for (const child of this.children) {
      child.addParents(this);
    }
  }

  get value(): A | undefined {
    return this._value;
  }

  addParents(...parents: Computable<any>[]): void {
    this.parents.push(...parents);
  }

  addChildren(...children: Node<any>[]): void {
    this.children.push(...children);
  }

  compute(): Computable<A> {
    for (const child of this.children) {
      if (child instanceof Cell) continue;
      ignore(child.compute());
    }
    if (this.shouldRebuild) {
      this._value = this.builder(...this.children);
      this.shouldRebuild = false;
    }
    return this;
  }

  update(): void {
    this.shouldRebuild = true;
    for (const parent of this.parents) {
      parent.update();
    }
  }

  accept<B>(visitor: NodeVisitor<A, B>): B {
    return visitor.visitComputable(this);
  }
}

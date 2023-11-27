import crypto from 'node:crypto';

import { ignore } from './common.js';

export type Dependency<A> = Leaf<A> | Target<A>;

export type DependencyVisitor<A> = {
  visitLeaf(leaf: Leaf<A>): void;
  visitTarget(target: Target<A>): void;
};

export type Builder<A, B> = (...deps: Dependency<A>[]) => B | undefined;

/**
 * A leaf node in the dependency tree.
 *
 * The value of a leaf node is set by the user.
 */
export class Leaf<A> {
  private _value: A;

  readonly id: string;

  parents: Target<any>[];

  constructor(value: A, id?: string) {
    this._value = value;
    this.id = id ?? crypto.randomUUID();
    this.parents = [];
  }

  get value(): A {
    return this._value;
  }

  set value(value: A) {
    if (value === this._value) return;
    this._value = value;
    this.update();
  }

  addParent(target: Target<any>): void {
    this.parents.push(target);
  }

  update(): void {
    for (const parent of this.parents) {
      parent.update();
    }
  }

  accept(visitor: DependencyVisitor<A>): void {
    visitor.visitLeaf(this);
  }
}

/**
 * A target node in the dependency tree.
 *
 * The value of a target node is computed by a builder function which takes the
 * node's children as input.
 */
export class Target<A> {
  private _value?: A;

  readonly id: string;

  parents: Target<any>[];

  children: Dependency<any>[];

  builder: Builder<any, A>;

  shouldRebuild = true;

  constructor(children: Dependency<any>[], builder: Builder<any, A>, id?: string) {
    this.id = id ?? crypto.randomUUID();
    this.parents = [];
    this.children = children;
    this.builder = builder;

    for (const child of this.children) {
      child.addParent(this);
    }
  }

  get value(): A | undefined {
    return this._value;
  }

  addParent(target: Target<any>): void {
    this.parents.push(target);
  }

  addChild(...deps: Dependency<any>[]): void {
    this.children.push(...deps);
  }

  build(): Target<A> {
    for (const child of this.children) {
      if (child instanceof Leaf) continue;
      ignore(child.build());
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

  accept(visitor: DependencyVisitor<A>): void {
    visitor.visitTarget(this);
  }
}

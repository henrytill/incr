import * as crypto from 'node:crypto';

export type Dependency<A, B> = Target<A, B> | Leaf<A, B>;

export type Builder<A, B> = (...deps: Dependency<A, B>[]) => B;

export class Leaf<A, B> {
  readonly id: string;

  value: A;

  parents: Target<A, B>[];

  constructor(value: A) {
    this.id = crypto.randomUUID();
    this.value = value;
    this.parents = [];
  }

  dependencyOf(target: Target<A, B>): void {
    this.parents.push(target);
  }

  update(): void {
    for (const parent of this.parents) {
      parent.update();
    }
  }

  accept(visitor: ItemVisitor<A, B>): void {
    visitor.visitLeaf(this);
  }
}

export class Target<A, B> {
  readonly id: string;

  value: B;

  parents: Target<A, B>[];

  children: Dependency<A, B>[];

  builder: Builder<A, B>;

  constructor(value: B, deps: Dependency<A, B>[], builder: Builder<A, B>) {
    this.id = crypto.randomUUID();
    this.value = value;
    this.parents = [];
    this.children = deps;
    this.builder = builder;

    for (const c of this.children) {
      c.dependencyOf(this);
    }
  }

  dependencyOf(target: Target<A, B>): void {
    this.parents.push(target);
  }

  dependsOn(...deps: Dependency<A, B>[]): void {
    this.children.push(...deps);
  }

  build(): void {
    for (const child of this.children) {
      if (child instanceof Leaf) {
        continue;
      }
      child.build();
    }
    this.value = this.builder(...this.children);
  }

  update(): void {
    this.value = this.builder(...this.children);
    for (const parent of this.parents) {
      parent.update();
    }
  }

  accept(visitor: ItemVisitor<A, B>): void {
    visitor.visitTarget(this);
  }
}

export abstract class ItemVisitor<A, B> {
  abstract visitLeaf(leaf: Leaf<A, B>): void;

  abstract visitTarget(target: Target<A, B>): void;
}

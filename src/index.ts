import * as crypto from 'node:crypto';

export type Dependency<A> = Target<A> | Leaf<A>;

export type Builder<A, B> = (...deps: Dependency<A>[]) => B;

export class Leaf<A> {
  readonly id: string;

  value: A;

  parents: Target<any>[];

  constructor(value: A) {
    this.id = crypto.randomUUID();
    this.value = value;
    this.parents = [];
  }

  dependencyOf(target: Target<any>): void {
    this.parents.push(target);
  }

  update(): void {
    for (const parent of this.parents) {
      parent.update();
    }
  }

  accept(visitor: ItemVisitor<A>): void {
    visitor.visitLeaf(this);
  }
}

export class Target<A> {
  readonly id: string;

  value: A;

  parents: Target<any>[];

  children: Dependency<any>[];

  builder: Builder<any, A>;

  constructor(value: A, deps: Dependency<any>[], builder: Builder<any, A>) {
    this.id = crypto.randomUUID();
    this.value = value;
    this.parents = [];
    this.children = deps;
    this.builder = builder;

    for (const c of this.children) {
      c.dependencyOf(this);
    }
  }

  dependencyOf(target: Target<any>): void {
    this.parents.push(target);
  }

  dependsOn(...deps: Dependency<any>[]): void {
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

  accept(visitor: ItemVisitor<A>): void {
    visitor.visitTarget(this);
  }
}

export abstract class ItemVisitor<A> {
  abstract visitLeaf(leaf: Leaf<A>): void;

  abstract visitTarget(target: Target<A>): void;
}

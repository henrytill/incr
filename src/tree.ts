import crypto from 'node:crypto';

export type Node<A> = Leaf<A> | Target<A>;

export type Builder<A, B> = (...deps: Node<A>[]) => B | undefined;

/**
 * A leaf node in the dependency tree.
 *
 * The value of a leaf node is set by the user.
 */
export class Leaf<A> {
  readonly id: string;

  value: A;

  parents: Target<any>[];

  constructor(value: A, id?: string) {
    this.id = id ?? crypto.randomUUID();
    this.value = value;
    this.parents = [];
  }

  addParent(target: Target<any>): void {
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

/**
 * A target node in the dependency tree.
 *
 * The value of a target node is computed by a builder function which takes the
 * node's children as input.
 */
export class Target<A> {
  readonly id: string;

  value?: A;

  parents: Target<any>[];

  children: Node<any>[];

  builder: Builder<any, A>;

  constructor(children: Node<any>[], builder: Builder<any, A>, id?: string) {
    this.id = id ?? crypto.randomUUID();
    this.parents = [];
    this.children = children;
    this.builder = builder;

    for (const child of this.children) {
      child.addParent(this);
    }
  }

  addParent(target: Target<any>): void {
    this.parents.push(target);
  }

  addChild(...deps: Node<any>[]): void {
    this.children.push(...deps);
  }

  build(): void {
    for (const child of this.children) {
      if (child instanceof Leaf) continue;
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

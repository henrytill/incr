import assert from 'node:assert/strict';
import crypto from 'node:crypto';

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
  parents: Computable<any>[] = [];

  constructor(
    public value_: A,
    readonly key: string = crypto.randomUUID(),
  ) {}

  get value(): A {
    return this.value_;
  }

  set value(value: A) {
    if (value === this.value_) return;
    this.value_ = value;
    this.update();
  }

  update(): void {
    return doUpdate(this);
  }

  accept<B>(visitor: NodeVisitor<A, B>): B {
    return visitor.visitCell(this);
  }

  map<B>(f: (a: A) => B, key?: string): Computable<B> {
    const ret = new Computable([this], (a) => f(a.value), key);
    this.parents.push(ret);
    return ret;
  }

  roots(): Computable<any>[] {
    return findRoots(this);
  }
}

/**
 * A branch node in the tree.
 *
 * The value of a branch node is computed by a compute function which takes the
 * node's children as input.
 */
export class Computable<A> {
  value_?: A;
  parents: Computable<any>[] = [];
  shouldRebuild: boolean = true;

  constructor(
    public children: Node<any>[],
    readonly computeFunction: ComputeFunction<any, A>,
    readonly key: string = crypto.randomUUID(),
  ) {
    for (const child of this.children) {
      child.parents.push(this);
    }
  }

  get value(): A | undefined {
    return this.value_;
  }

  compute(): Computable<A> {
    return doCompute(this);
  }

  update(): void {
    return doUpdate(this);
  }

  accept<B>(visitor: NodeVisitor<A, B>): B {
    return visitor.visitComputable(this);
  }

  map<B>(f: (a: A | undefined) => B, key?: string): Computable<B> {
    const ret = new Computable([this], (a) => f(a.value), key);
    this.parents.push(ret);
    return ret;
  }

  roots(): Computable<any>[] {
    return findRoots(this);
  }
}

function doCompute(computable: Computable<any>): Computable<any> {
  if (!computable.shouldRebuild) return computable;

  const toCompute: Computable<any>[][] = [[computable]];
  const computed: Set<Node<any>> = new Set();

  const top = (): Computable<any>[] => toCompute[toCompute.length - 1];

  for (let nodes = top(); nodes.length > 0; nodes = top()) {
    const computableChildren = nodes.flatMap((node) =>
      node.children.filter((child) => child instanceof Computable && child.shouldRebuild),
    ) as Computable<any>[];
    toCompute.push(computableChildren);
  }

  while (toCompute.length > 0) {
    const nodes = toCompute.pop();
    assert.ok(nodes);
    if (nodes.length === 0) continue;
    for (const node of nodes) {
      if (computed.has(node)) continue;
      node.value_ = node.computeFunction(...node.children);
      node.shouldRebuild = false;
      computed.add(node);
    }
  }

  return computable;
}

function doUpdate(node: Node<any>): void {
  const toUpdate: Node<any>[] = [node];
  const updated: Set<Node<any>> = new Set();

  while (toUpdate.length > 0) {
    const node = toUpdate.pop();
    assert.ok(node);
    if (updated.has(node)) continue;
    if (node instanceof Computable) {
      node.shouldRebuild = true;
    }
    updated.add(node);
    const unvisited = node.parents.filter((parent) => !updated.has(parent));
    toUpdate.push(...unvisited);
  }
}

function findRoots(input: Node<any>): Computable<any>[] {
  if (input instanceof Cell && input.parents.length === 0) return [];

  const ret: Computable<any>[] = [];
  const stack: Node<any>[] = [input];
  const visited: Set<Node<any>> = new Set();

  while (stack.length > 0) {
    const node = stack.pop();
    assert.ok(node);
    if (visited.has(node)) continue;
    visited.add(node);
    if (node instanceof Computable && node.parents.length === 0) {
      ret.push(node);
      continue;
    }
    const unvisited = node.parents.filter((parent) => !visited.has(parent));
    stack.push(...unvisited);
  }

  return ret;
}

export class AutoCell<A> extends Cell<A> {
  override update(): void {
    return doAutoUpdate(this);
  }
}

function doAutoUpdate(node: Node<any>): void {
  const toUpdate: Node<any>[] = [node];
  const updated: Set<Node<any>> = new Set();

  while (toUpdate.length > 0) {
    const node = toUpdate.pop();
    assert.ok(node);
    if (updated.has(node)) continue;
    if (node instanceof Computable) {
      node.value_ = node.computeFunction(...node.children);
      node.shouldRebuild = false;
    }
    updated.add(node);
    const unvisited = node.parents.filter((parent) => !updated.has(parent));
    toUpdate.push(...unvisited);
  }
}

export class AsyncComputable<T> extends Computable<Promise<T>> {}

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
  _value: A;
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
  _value?: A;
  readonly key: string;
  parents: Computable<any>[] = [];
  children: Node<any>[];
  builder: ComputeFunction<any, A>;
  shouldRebuild: boolean = true;

  constructor(children: Node<any>[], builder: ComputeFunction<any, A>, key?: string) {
    this.children = children;
    this.builder = builder;
    this.key = key ?? crypto.randomUUID();
    for (const child of this.children) {
      child.parents.push(this);
    }
  }

  get value(): A | undefined {
    return this._value;
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

  while (top().length > 0) {
    const nodes = top();
    const computableChildren = nodes.flatMap((node) =>
      node.children.filter((child) => child instanceof Computable && child.shouldRebuild),
    ) as Computable<any>[];
    toCompute.push(computableChildren);
  }

  while (toCompute.length > 0) {
    const nodes = toCompute.pop();
    if (nodes === undefined) throw new Error('Invariant violated');
    if (nodes.length === 0) continue;
    for (const node of nodes) {
      if (computed.has(node)) continue;
      node._value = node.builder(...node.children);
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
    if (node === undefined) throw new Error('Invariant violated');
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
    if (node === undefined) throw new Error('Invariant violated');
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
    if (node === undefined) throw new Error('Invariant violated');
    if (updated.has(node)) continue;
    if (node instanceof Computable) {
      node._value = node.builder(...node.children);
      node.shouldRebuild = false;
    }
    updated.add(node);
    const unvisited = node.parents.filter((parent) => !updated.has(parent));
    toUpdate.push(...unvisited);
  }
}

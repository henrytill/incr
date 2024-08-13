// @ts-check

import assert from 'node:assert/strict';
import crypto from 'node:crypto';

/**
 * @template A
 * @typedef {Cell<A> | Computable<A>} Node<A>
 */

/**
 * @template A, B
 * @typedef {Object} NodeVisitor<A, B>
 * @property {(node: Cell<A>) => B} visitCell
 * @property {(node: Computable<A>) => B} visitComputable
 */

/**
 * @template A, B
 * @typedef {(...deps: Node<A>[]) => B | undefined} ComputeFunction<A, B>
 */

/**
 * A leaf node in the tree.
 *
 * The value of a leaf node is set by the user.
 *
 * @template A
 */
export class Cell {
  /** @type {A} */
  value_;

  /** @type {Computable<any>[]} */
  parents = [];

  /**
   * @readonly
   * @type {string}
   */
  key;

  /**
   * @param {A} value_
   * @param {string} [key]
   */
  constructor(value_, key = crypto.randomUUID()) {
    this.value_ = value_;
    this.key = key;
  }

  /** @returns {A} */
  get value() {
    return this.value_;
  }

  /** @param {A} value */
  set value(value) {
    if (value === this.value_) return;
    this.value_ = value;
    this.update();
  }

  /** @returns {void} */
  update() {
    return doUpdate(this);
  }

  /**
   * @template B
   * @param {NodeVisitor<A, B>} visitor
   * @returns {B}
   */
  accept(visitor) {
    return visitor.visitCell(this);
  }

  /**
   * @template B
   * @param {(a: A) => B} f
   * @param {string} [key]
   * @returns {Computable<B>}
   */
  map(f, key) {
    const ret = new Computable([this], (a) => f(a.value), key);
    this.parents.push(ret);
    return ret;
  }

  /** @returns {Computable<any>[]} */
  roots() {
    return findRoots(this);
  }
}

/**
 * A branch node in the tree.
 *
 * The value of a branch node is computed by a compute function which takes the
 * node's children as input.
 *
 * @template A
 */
export class Computable {
  /** @type {A | undefined} */
  value_;

  /** @type {Computable<any>[]} */
  parents = [];

  /** @type {boolean} */
  shouldRebuild = true;

  /**
   * @readonly
   * @type {Node<any>[]}
   */
  children;

  /**
   * @readonly
   * @type {ComputeFunction<any, A>}
   */
  computeFunction;

  /**
   * @readonly
   * @type {string}
   */
  key;

  /**
   * @param {Node<any>[]} children
   * @param {ComputeFunction<any, A>} computeFunction
   * @param {string} [key]
   */
  constructor(children, computeFunction, key = crypto.randomUUID()) {
    this.children = children;
    this.computeFunction = computeFunction;
    this.key = key;
    for (const child of this.children) {
      child.parents.push(this);
    }
  }

  /** @returns {A | undefined} */
  get value() {
    return this.value_;
  }

  /** @returns {Computable<A>} */
  compute() {
    return doCompute(this);
  }

  /** @returns {void} */
  update() {
    return doUpdate(this);
  }

  /**
   * @template B
   * @param {NodeVisitor<A, B>} visitor
   * @returns {B}
   */
  accept(visitor) {
    return visitor.visitComputable(this);
  }

  /**
   * @template B
   * @param {(a: A | undefined) => B} f
   * @param {string} [key]
   * @returns {Computable<B>}
   */
  map(f, key) {
    const ret = new Computable([this], (a) => f(a.value), key);
    this.parents.push(ret);
    return ret;
  }

  /** @returns {Computable<any>[]} */
  roots() {
    return findRoots(this);
  }
}

/**
 * @param {Node<any>} child
 * @returns {boolean}
 */
const isComputable = (child) => child instanceof Computable && child.shouldRebuild;

/**
 * @param {Computable<any>} computable
 * @returns {Computable<any>}
 */
const doCompute = (computable) => {
  if (!computable.shouldRebuild) return computable;

  const toCompute = [[computable]];
  /** @type {() => Computable<any>[]} */
  const top = () => toCompute[toCompute.length - 1];
  for (let level = top(); level.length > 0; level = top()) {
    const computableChildren = /** @type {Computable<any>[]} */ (
      level.flatMap((node) => node.children.filter(isComputable))
    );
    toCompute.push(computableChildren);
  }

  /** @type {Set<Computable<any>>} */
  const computed = new Set();

  while (toCompute.length > 0) {
    const level = toCompute.pop();
    assert.ok(level);
    if (level.length === 0) continue;
    for (const node of level) {
      if (computed.has(node)) continue;
      node.value_ = node.computeFunction(...node.children);
      node.shouldRebuild = false;
      computed.add(node);
    }
  }

  return computable;
};

/**
 * @param {Node<any>} node
 * @returns {void}
 */
const doUpdate = (node) => {
  const toUpdate = [node];
  /** @type {Set<Node<any>>} */
  const updated = new Set();

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
};

/**
 * @param {Node<any>} input
 * @returns {Computable<any>[]}
 */
const findRoots = (input) => {
  if (input instanceof Cell && input.parents.length === 0) return [];

  const stack = [input];
  /** @type {Set<Node<any>>} */
  const visited = new Set();
  /** @type {Computable<any>[]} */
  const ret = [];

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
};

/**
 * @template A
 * @extends {Cell<A>}
 */
export class AutoCell extends Cell {
  /**
   * @override
   * @returns {void}
   */
  update() {
    return doAutoUpdate(this);
  }
}

/**
 * @param {Node<any>} node
 * @returns {void}
 */
const doAutoUpdate = (node) => {
  const toUpdate = [node];
  /** @type {Set<Node<any>>} */
  const updated = new Set();

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
};

/**
 * @template T
 * @extends {Computable<Promise<T>>}
 */
export class AsyncComputable extends Computable {}

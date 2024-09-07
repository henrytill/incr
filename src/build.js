// @ts-check

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

import { Channel } from './channel.js';
import { AsyncComputable, AutoCell, Cell } from './core.js';

/** @typedef {import('node:crypto').BinaryLike} BinaryLike */

/** @typedef {import('node:fs').PathLike} PathLike */

/**
 * @template {string | Buffer} T
 * @typedef {import('node:fs/promises').FileChangeInfo<T>} FileChangeInfo<T>
 */

/** @typedef {string} HashDigest */

/**
 * @typedef {Object} Message
 * @property {PathLike} filename
 * @property {FileChangeInfo<string>} event
 */

/** @typedef {FileCell | Input | AutoInput | Target} BuildNode */

/** @extends {Cell<HashDigest>} */
export class FileCell extends Cell {
  /**
   * @private
   * @param {HashDigest} value
   * @param {string} [key]
   */
  constructor(value, key) {
    super(value, key);
  }

  /**
   * @param {PathLike} filename
   * @returns {Promise<FileCell>}
   */
  static async of(filename) {
    const value = await fs.readFile(filename).then(hash);
    const ret = new FileCell(value, filename.toString());
    return ret;
  }
}

/** @extends {Cell<HashDigest>} */
export class Input extends Cell {
  /**
   * @readonly
   * @type {Promise<void>}
   */
  watcher;

  /**
   * @readonly
   * @type {AbortController}
   */
  controller = new AbortController();

  /**
   * @readonly
   * @type {Channel<Message> | undefined}
   */
  notifications;

  /**
   * @private
   * @param {HashDigest} value
   * @param {string} [key]
   * @param {Channel<Message>} [notifications]
   */
  constructor(value, key, notifications) {
    super(value, key);
    this.watcher = watch(this, this.controller.signal);
    this.notifications = notifications;
  }

  /**
   * @param {PathLike} filename
   * @param {Channel<Message>} [notifications]
   * @returns {Promise<Input>}
   */
  static async of(filename, notifications) {
    const value = await fs.readFile(filename).then(hash);
    const ret = new Input(value, filename.toString(), notifications);
    return ret;
  }

  /**
   * @param {FileCell} file
   * @param {Channel<Message>} [notifications]
   * @returns {Input}
   */
  static from(file, notifications) {
    const ret = new Input(file.value, file.key, notifications);
    ret.parents = file.parents;
    for (const parent of ret.parents) {
      const i = parent.children.findIndex((child) => child === file);
      assert.notEqual(i, -1);
      parent.children[i] = ret;
    }
    file.parents = [];
    return ret;
  }

  /** @returns {Promise<void>} */
  async close() {
    this.controller.abort();
    await this.watcher;
  }
}

/** @extends {AutoCell<HashDigest>} */
export class AutoInput extends AutoCell {
  /**
   * @readonly
   * @type {Promise<void>}
   */
  watcher;

  /**
   * @readonly
   * @type {AbortController}
   */
  controller = new AbortController();

  /**
   * @readonly
   * @type {Channel<Message> | undefined}
   */
  notifications;

  /**
   * @private
   * @param {HashDigest} value
   * @param {string} [key]
   * @param {Channel<Message>} [notifications]
   */
  constructor(value, key, notifications) {
    super(value, key);
    this.watcher = watch(this, this.controller.signal);
    this.notifications = notifications;
  }

  /**
   * @param {PathLike} filename
   * @param {Channel<Message>} [notifications]
   * @returns {Promise<AutoInput>}
   */
  static async of(filename, notifications) {
    const value = await fs.readFile(filename).then(hash);
    const ret = new AutoInput(value, filename.toString(), notifications);
    return ret;
  }

  /**
   * @param {FileCell} file
   * @param {Channel<Message>} [notifications]
   * @returns {AutoInput}
   */
  static from(file, notifications) {
    const ret = new AutoInput(file.value, file.key, notifications);
    ret.parents = file.parents;
    for (const parent of ret.parents) {
      const i = parent.children.findIndex((child) => child === file);
      assert.notEqual(i, -1);
      parent.children[i] = ret;
    }
    file.parents = [];
    return ret;
  }

  /** @returns {Promise<void>} */
  async close() {
    this.controller.abort();
    await this.watcher;
  }
}

/** @extends {AsyncComputable<HashDigest>} */
export class Target extends AsyncComputable {}

/**
 * @param {BinaryLike} input
 * @returns {HashDigest}
 */
export const hash = (input) => {
  const hash = crypto.createHash('sha256');
  hash.update(input);
  return hash.digest('hex');
};

/**
 * Implements leading-edge debounce on an asynchronous event stream
 *
 * @template T
 * @param {AsyncIterable<T>} events
 * @param {number} delay
 * @returns {AsyncGenerator<T>}
 */
async function* debounce(events, delay) {
  let begin = Date.now() - delay; // allow first event to pass through
  for await (const event of events) {
    const now = Date.now();
    if (now - begin >= delay) {
      begin = now;
      yield event;
    }
  }
}

/**
 * @param {Input} input
 * @param {AbortSignal} signal
 * @returns {Promise<void>}
 */
const watch = async (input, signal) => {
  const filename = input.key;
  try {
    const watcher = fs.watch(filename, { signal });
    for await (const event of debounce(watcher, 1000)) {
      input.value = await fs.readFile(filename).then(hash);
      input.notifications?.send({ filename, event });
    }
  } catch (/** @type {any} */ err) {
    if (err.name === 'AbortError') {
      return;
    }
    throw err;
  }
};

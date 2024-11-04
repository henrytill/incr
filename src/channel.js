/**
 * @template T
 * @typedef {(value: T | PromiseLike<T>) => void} Resolve<T>
 */

/** @template T */
export class Channel {
  /**
   * @private
   * @type {T[]}
   */
  queue = [];

  /**
   * @private
   * @type {Resolve<T | undefined>[]}
   */
  resolveQueue = [];

  /**
   * @private
   * @type {boolean}
   */
  running = true;

  async *receive() {
    while (this.running || this.queue.length > 0 || this.resolveQueue.length > 0) {
      if (this.queue.length > 0) {
        yield this.queue.shift();
      } else {
        /** @type {Promise<T | undefined>} */
        const promise = new Promise((resolve) => this.resolveQueue.push(resolve));
        const value = await promise;
        yield value;
      }
    }
  }

  /**
   * @param {T} message
   * @returns {boolean}
   */
  send(message) {
    if (!this.running) return false;
    const resolve = this.resolveQueue.shift();
    if (resolve) {
      resolve(message);
    } else {
      this.queue.push(message);
    }
    return true;
  }

  close() {
    if (!this.running) return;
    this.running = false;
    while (this.resolveQueue.length > 0) {
      this.resolveQueue.shift()?.call(null, undefined);
    }
  }
}

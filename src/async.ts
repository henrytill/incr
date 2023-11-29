import { Cell, Computable } from './core.js';

export class AsyncCell<T> extends Cell<Promise<T>> {
  static resolve<T>(value: T, key?: string): AsyncCell<T> {
    return new AsyncCell(Promise.resolve(value), key);
  }

  override set value(value: Promise<T>) {
    this._value = Promise.all([this._value, value]).then(([curr, next]) => {
      if (curr !== next) this.update();
      return next;
    });
  }

  override get value(): Promise<T> {
    return super.value;
  }
}

export class AsyncComputable<T> extends Computable<Promise<T>> {}

export class AsyncAutoCell<T> extends Cell<Promise<T>> {
  static resolve<T>(value: T, key?: string): AsyncCell<T> {
    return new AsyncAutoCell(Promise.resolve(value), key);
  }

  override set value(value: Promise<T>) {
    this._value = Promise.all([this._value, value]).then(([curr, next]) => {
      if (curr === next) return next;
      this._value = Promise.resolve(next);
      this.update();
      const roots = this.roots(); // TODO: combine with update()
      console.debug('Rebuilding', roots.map((root) => root.key).join(', '));
      return Promise.all(roots.map((root) => root.compute().value)).then(() => this._value);
    });
  }

  override get value(): Promise<T> {
    return super.value;
  }
}

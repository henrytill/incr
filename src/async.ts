import { Cell, Computable } from './core.js';

export class AsyncCell<T> extends Cell<Promise<T>> {
  override set value(value: Promise<T>) {
    this._value = Promise.all([this._value, value]).then(([curr, next]) => {
      if (curr !== next) {
        this.update();
      }
      return next;
    });
  }

  override get value(): Promise<T> {
    return super.value;
  }
}

export class AsyncComputable<T> extends Computable<Promise<T>> {}

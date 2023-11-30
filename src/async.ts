import { Computable } from './core.js';

export class AsyncComputable<T> extends Computable<Promise<T>> {}

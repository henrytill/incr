import assert from 'node:assert/strict';
import crypto, { BinaryLike } from 'node:crypto';
import { PathLike } from 'node:fs';
import fs, { FileChangeInfo } from 'node:fs/promises';

import { Channel } from './channel.js';
import { AsyncComputable, AutoCell, Cell } from './core.js';

export type HashDigest = string;

export type Message = {
    filename: PathLike;
    event: FileChangeInfo<string>;
};

export type BuildNode = FileCell | Input | AutoInput | Target;

export class FileCell extends Cell<HashDigest> {
    private constructor(value: HashDigest, key: string) {
        super(value, key);
    }

    static async of(filename: PathLike): Promise<FileCell> {
        const value = await fs.readFile(filename).then(hash);
        const ret = new FileCell(value, filename.toString());
        return ret;
    }
}

export class Input extends Cell<HashDigest> {
    readonly watcher: Promise<void>;
    readonly controller = new AbortController();

    private constructor(
        value: HashDigest,
        key: string,
        readonly notifications?: Channel<Message>,
    ) {
        super(value, key);
        this.watcher = watch(this, this.controller.signal);
    }

    static async of(filename: PathLike, notifications?: Channel<Message>): Promise<Input> {
        const value = await fs.readFile(filename).then(hash);
        const ret = new Input(value, filename.toString(), notifications);
        return ret;
    }

    static from(file: FileCell, notifications?: Channel<Message>): Input {
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

    async close(): Promise<void> {
        this.controller.abort();
        await this.watcher;
    }
}

export class AutoInput extends AutoCell<HashDigest> {
    readonly watcher: Promise<void>;
    readonly controller = new AbortController();

    private constructor(
        value: HashDigest,
        key: string,
        readonly notifications?: Channel<Message>,
    ) {
        super(value, key);
        this.watcher = watch(this, this.controller.signal);
    }

    static async of(filename: PathLike, notifications?: Channel<Message>): Promise<AutoInput> {
        const value = await fs.readFile(filename).then(hash);
        const ret = new AutoInput(value, filename.toString(), notifications);
        return ret;
    }

    static from(file: FileCell, notifications?: Channel<Message>): AutoInput {
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

    async close(): Promise<void> {
        this.controller.abort();
        await this.watcher;
    }
}

export class Target extends AsyncComputable<HashDigest> {}

export function hash(input: BinaryLike): HashDigest {
    const hash = crypto.createHash('sha256');
    hash.update(input);
    return hash.digest('hex');
}

/** Implements leading-edge debounce on an asynchronous event stream. */
async function* debounce<T>(events: AsyncIterable<T>, delay: number): AsyncGenerator<T> {
    let begin = Date.now() - delay; // allow first event to pass through
    for await (const event of events) {
        const now = Date.now();
        if (now - begin >= delay) {
            begin = now;
            yield event;
        }
    }
}

async function watch(input: Input, signal: AbortSignal): Promise<void> {
    const filename = input.key;
    try {
        const watcher = fs.watch(filename, { signal });
        for await (const event of debounce(watcher, 1000)) {
            input.value = await fs.readFile(filename).then(hash);
            input.notifications?.send({ filename, event });
        }
    } catch (err: any) {
        if (err.name === 'AbortError') {
            return;
        }
        throw err;
    }
}

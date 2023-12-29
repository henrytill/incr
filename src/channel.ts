type Resolve<T> = (value: T | PromiseLike<T>) => void;

export class Channel<T> {
    private queue: T[] = [];
    private resolveQueue: Resolve<T | undefined>[] = [];
    private running: boolean = true;

    async *receive() {
        while (this.running || this.queue.length > 0 || this.resolveQueue.length > 0) {
            if (this.queue.length > 0) {
                yield this.queue.shift();
            } else {
                const promise = new Promise<T | undefined>((resolve) =>
                    this.resolveQueue.push(resolve),
                );
                const value = await promise;
                yield value;
            }
        }
    }

    send(message: T): boolean {
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

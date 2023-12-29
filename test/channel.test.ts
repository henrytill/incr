import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

import { Channel } from '../src/channel.js';

type Message = { tag: 'value'; value: string } | { tag: 'close' };

describe('Channel', () => {
    let channel: Channel<Message>;

    before(() => {
        channel = new Channel();
    });

    after(() => {
        channel.close();
    });

    it('should receive messages', async () => {
        const received: Message[] = [];

        const consumer = (async () => {
            for await (const message of channel.receive()) {
                switch (message?.tag) {
                    case 'close':
                        channel.close(); // eslint-disable-next-line no-fallthrough
                    case 'value':
                        received.push(message);
                        break;
                }
            }
        })();

        const sent: Message[] = [
            { tag: 'value', value: 'message 1' },
            { tag: 'value', value: 'message 2' },
            { tag: 'close' },
        ];

        for (const message of sent) {
            channel.send(message);
        }

        await consumer;

        assert.deepEqual(received, sent);
    });
});

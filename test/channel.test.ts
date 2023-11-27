import assert from 'node:assert';
import { describe, it, before, after } from 'node:test';

import { Channel } from '../src/channel.js';

type Message = {
  tag: 'value' | 'close';
  value?: string;
};

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
            channel.close();
            break;
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

    assert.deepStrictEqual(received, sent.slice(0, -1));
  });
});

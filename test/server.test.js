import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createServer } from '../server.js';

const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chat-')), 'messages.json');
let server;
let url;

before(async () => {
  server = createServer({ dataFile });
  await new Promise((resolve) => server.listen(0, resolve));
  url = `ws://localhost:${server.address().port}/ws`;
});

after(() => server.close());

// connect, join a room and resolve with the client plus its join history
function join(username, room) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const inbox = [];
    ws.on('message', (raw) => {
      const data = JSON.parse(raw);
      if (data.type === 'history') resolve({ ws, history: data.messages, inbox });
      else inbox.push(data);
    });
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', username, room })));
    ws.on('error', reject);
  });
}

const next = (client, type) =>
  new Promise((resolve) => {
    const check = setInterval(() => {
      const i = client.inbox.findIndex((d) => d.type === type);
      if (i !== -1) {
        clearInterval(check);
        resolve(client.inbox.splice(i, 1)[0]);
      }
    }, 5);
  });

test('messages are broadcast live to everyone in the room only', async () => {
  const alice = await join('alice', 'lobby');
  const bob = await join('bob', 'lobby');
  const carol = await join('carol', 'other');

  alice.ws.send(JSON.stringify({ type: 'message', text: 'hello' }));
  const [a, b] = await Promise.all([next(alice, 'message'), next(bob, 'message')]);
  assert.equal(a.message.text, 'hello');
  assert.equal(b.message.username, 'alice');

  await new Promise((r) => setTimeout(r, 50));
  assert.equal(carol.inbox.filter((d) => d.type === 'message').length, 0);
  [alice, bob, carol].forEach((c) => c.ws.close());
});

test('typing indicator goes to others, not the sender', async () => {
  const alice = await join('alice', 'typing');
  const bob = await join('bob', 'typing');

  alice.ws.send(JSON.stringify({ type: 'typing', typing: true }));
  const event = await next(bob, 'typing');
  assert.deepEqual(event, { type: 'typing', username: 'alice', typing: true });
  assert.equal(alice.inbox.filter((d) => d.type === 'typing').length, 0);
  [alice, bob].forEach((c) => c.ws.close());
});

test('last 50 messages are saved and returned on join', async () => {
  const alice = await join('alice', 'history');
  for (let i = 1; i <= 55; i++) {
    alice.ws.send(JSON.stringify({ type: 'message', text: `msg ${i}` }));
    await next(alice, 'message');
  }

  const dave = await join('dave', 'history');
  assert.equal(dave.history.length, 50);
  assert.equal(dave.history[0].text, 'msg 6');
  assert.equal(dave.history.at(-1).text, 'msg 55');

  // survives a restart
  const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  assert.equal(saved.history.length, 50);
  [alice, dave].forEach((c) => c.ws.close());
});

test('rejects joins without a username', async () => {
  const ws = new WebSocket(url);
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ type: 'join', username: '  ', room: 'lobby' }));
  const reply = await new Promise((r) => ws.once('message', (raw) => r(JSON.parse(raw))));
  assert.equal(reply.type, 'error');
  ws.close();
});

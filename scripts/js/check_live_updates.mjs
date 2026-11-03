/**
 * The wall's live stream must notice a silent socket and keep retrying.
 *
 * A graceful restart can leave the browser's connection open and quiet: no
 * error event, no close. The old client treated that as a healthy stream and
 * stopped polling. These checks drive that case with fake timers.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LiveUpdates, nextReconnectDelayMs } from '../../pi-server/static/projector/LiveUpdates.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const loaderSource = fs.readFileSync(
  path.join(here, '../../pi-server/static/projector/PlanetLoader.js'),
  'utf8',
);
assert.equal(
  loaderSource.includes('failures >= 5'),
  false,
  'the wall must not give up after a fixed number of stream errors',
);

class FakeEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    this.closed = false;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(
      type,
      list.filter((item) => item !== handler),
    );
  }

  emit(type, data = '') {
    for (const handler of this.listeners.get(type) || []) handler({ data });
  }

  close() {
    this.closed = true;
  }
}

function clock() {
  let now = 0;
  const timers = [];
  let nextId = 1;
  return {
    now: () => now,
    setTimeoutFn(fn, ms) {
      const id = nextId++;
      timers.push({ id, fn, at: now + ms, cleared: false, ran: false });
      return id;
    },
    clearTimeoutFn(id) {
      const timer = timers.find((item) => item.id === id);
      if (timer) timer.cleared = true;
    },
    advance(ms) {
      now += ms;
      for (let guard = 0; guard < 1000; guard += 1) {
        const due = timers
          .filter((timer) => !timer.cleared && !timer.ran && timer.at <= now)
          .sort((a, b) => a.at - b.at || a.id - b.id);
        if (due.length === 0) return;
        const timer = due[0];
        timer.ran = true;
        timer.fn();
      }
      throw new Error('timer loop did not settle');
    },
  };
}

function harness(heartbeatTimeoutMs = 6000) {
  FakeEventSource.instances = [];
  const time = clock();
  const planets = [];
  const calls = { live: 0, offline: 0 };
  const updates = new LiveUpdates({
    EventSourceImpl: FakeEventSource,
    setTimeoutFn: time.setTimeoutFn,
    clearTimeoutFn: time.clearTimeoutFn,
    heartbeatTimeoutMs,
    onPlanet: (data) => planets.push(data),
    onLive: () => {
      calls.live += 1;
    },
    onOffline: () => {
      calls.offline += 1;
    },
  });
  updates.start();
  return { updates, time, planets, calls };
}

function currentSource() {
  return FakeEventSource.instances.at(-1);
}

const backoff = [0, 1, 2, 3, 4, 5, 6].map((attempt) => nextReconnectDelayMs(attempt));
assert.deepEqual(backoff, [500, 1000, 2000, 4000, 5000, 5000, 5000]);

// A quiet socket, the graceful-restart failure: open, one heartbeat, then
// silence and no error. The wall must drop it and open another.
{
  const { time, calls } = harness();
  const first = currentSource();
  first.emit('heartbeat');
  assert.equal(calls.live, 1);
  assert.equal(first.closed, false);
  time.advance(5999);
  assert.equal(first.closed, false, 'a late-but-in-budget heartbeat must not drop the stream');
  time.advance(1);
  assert.equal(first.closed, true, 'silence past the heartbeat budget must close the socket');
  assert.equal(calls.offline, 1);
  time.advance(499);
  assert.equal(FakeEventSource.instances.length, 1);
  time.advance(1);
  assert.equal(FakeEventSource.instances.length, 2, 'the wall must open a replacement stream');
}

// Steady heartbeats keep the same socket.
{
  const { time } = harness();
  const first = currentSource();
  first.emit('heartbeat');
  for (let i = 0; i < 10; i += 1) {
    time.advance(2000);
    currentSource().emit('heartbeat');
  }
  assert.equal(FakeEventSource.instances.length, 1);
  assert.equal(first.closed, false);
}

// Errors back off, and they never stop. Eight failures is past the old cap of five.
{
  const { time, calls } = harness();
  const delays = [];
  for (let i = 0; i < 8; i += 1) {
    const before = FakeEventSource.instances.length;
    currentSource().emit('error');
    currentSource().emit('error');
    const started = time.now();
    time.advance(nextReconnectDelayMs(i));
    delays.push(time.now() - started);
    assert.equal(FakeEventSource.instances.length, before + 1);
  }
  assert.deepEqual(delays, [500, 1000, 2000, 4000, 5000, 5000, 5000, 5000]);
  assert.equal(calls.offline, 8);
  assert.equal(FakeEventSource.instances.length, 9);
}

// After the silent drop, the replacement stream delivers the new planet.
{
  const { time, planets, calls } = harness();
  currentSource().emit('heartbeat');
  const liveAfterFirst = calls.live;
  time.advance(6000);
  time.advance(500);
  const raw = JSON.stringify({ id: 'planet-after-restart', name: 'After Restart', has_planet: true });
  currentSource().emit('planet', raw);
  assert.deepEqual(planets, [raw]);
  assert.equal(calls.live, liveAfterFirst + 1);
  currentSource().emit('heartbeat');
  assert.equal(calls.live, liveAfterFirst + 1, 'later heartbeats must not look like a new connection');
}

// Stopping the wall must not leave a retry behind.
{
  const { updates, time } = harness();
  updates.stop();
  time.advance(60_000);
  assert.equal(FakeEventSource.instances.length, 1);
  assert.equal(currentSource().closed, true);
}

console.log('live update reconnect checks passed');

/**
 * Live projector stream.
 *
 * The wall stays open for hours and nobody is there to reload it. The server
 * can stop gracefully (the old process keeps the socket), be killed, or come
 * back a moment later. A socket that merely looks open is not a connection:
 * `open` fires when the response headers arrive, and then nothing else may
 * ever arrive. Heartbeats are the proof of life. When they stop, or the
 * stream errors, reconnect with backoff and do not stop trying.
 */

/** Server heartbeats every 2s. Three quiet intervals means the socket is dead. */
export const HEARTBEAT_TIMEOUT_MS = 6000;
export const RECONNECT_BASE_MS = 500;
export const RECONNECT_MAX_MS = 5000;

export function nextReconnectDelayMs(
  attempt,
  baseMs = RECONNECT_BASE_MS,
  maxMs = RECONNECT_MAX_MS,
) {
  const step = Math.min(Math.max(attempt, 0), 10);
  return Math.min(maxMs, baseMs * 2 ** step);
}

export class LiveUpdates {
  constructor({
    url = '/api/events',
    EventSourceImpl = globalThis.EventSource,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    heartbeatTimeoutMs = HEARTBEAT_TIMEOUT_MS,
    backoffBaseMs = RECONNECT_BASE_MS,
    backoffMaxMs = RECONNECT_MAX_MS,
    onPlanet = null,
    onPlanetRemoved = null,
    onBehavior = null,
    onLive = null,
    onOffline = null,
  } = {}) {
    this.url = url;
    this.EventSourceImpl = EventSourceImpl;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.heartbeatTimeoutMs = heartbeatTimeoutMs;
    this.backoffBaseMs = backoffBaseMs;
    this.backoffMaxMs = backoffMaxMs;
    this.onPlanet = onPlanet;
    this.onPlanetRemoved = onPlanetRemoved;
    this.onBehavior = onBehavior;
    this.onLive = onLive;
    this.onOffline = onOffline;
    this.source = null;
    this.handlers = null;
    this.attempt = 0;
    this.live = false;
    this.stopped = true;
    this.failing = false;
    this.retryTimer = null;
    this.watchdog = null;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.attempt = 0;
    this.live = false;
    this.failing = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.failing = true;
    this.clearRetry();
    this.closeSource();
  }

  connect() {
    if (this.stopped) return;
    this.closeSource();
    this.failing = false;
    let source;
    try {
      source = new this.EventSourceImpl(this.url);
    } catch (_error) {
      this.fail();
      return;
    }
    this.source = source;
    this.handlers = {
      heartbeat: () => this.noteActivity(),
      planet: (event) => {
        this.noteActivity();
        this.onPlanet?.(event.data);
      },
      'planet-removed': (event) => {
        this.noteActivity();
        this.onPlanetRemoved?.(event.data);
      },
      behavior: (event) => {
        this.noteActivity();
        this.onBehavior?.(event.data);
      },
      error: () => this.fail(),
    };
    for (const [type, handler] of Object.entries(this.handlers)) {
      source.addEventListener(type, handler);
    }
    // Arm before any frame. A shutdown can accept the socket, send nothing,
    // and never error. The watchdog is what gives that socket up.
    this.armWatchdog();
  }

  noteActivity() {
    this.attempt = 0;
    const becameLive = !this.live;
    this.live = true;
    this.armWatchdog();
    if (becameLive) this.onLive?.();
  }

  fail() {
    if (this.stopped || this.failing) return;
    this.failing = true;
    this.live = false;
    this.closeSource();
    this.onOffline?.();
    const delay = nextReconnectDelayMs(this.attempt, this.backoffBaseMs, this.backoffMaxMs);
    this.attempt += 1;
    this.retryTimer = this.setTimeoutFn(() => {
      this.failing = false;
      this.connect();
    }, delay);
  }

  armWatchdog() {
    this.clearWatchdog();
    this.watchdog = this.setTimeoutFn(() => this.fail(), this.heartbeatTimeoutMs);
  }

  clearWatchdog() {
    if (this.watchdog === null) return;
    this.clearTimeoutFn(this.watchdog);
    this.watchdog = null;
  }

  clearRetry() {
    if (this.retryTimer === null) return;
    this.clearTimeoutFn(this.retryTimer);
    this.retryTimer = null;
  }

  closeSource() {
    this.clearWatchdog();
    const source = this.source;
    const handlers = this.handlers;
    this.source = null;
    this.handlers = null;
    if (!source) return;
    // close() can emit error. Detach first so that cannot schedule a second reconnect.
    if (handlers && typeof source.removeEventListener === 'function') {
      for (const [type, handler] of Object.entries(handlers)) {
        source.removeEventListener(type, handler);
      }
    }
    source.close();
  }
}

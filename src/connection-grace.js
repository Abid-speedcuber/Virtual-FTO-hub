export const CONNECTION_GRACE_MS = 5000;
// The browser's offline signal is a hint. Keep the same attempt/average sequence
// during a short interruption, and use a monotonic deadline even in a throttled tab.
export class ConnectionGrace {
  constructor({
    online = () => navigator.onLine,
    now = () => performance.now(),
    schedule = (fn, ms) => setTimeout(fn, ms),
    cancel = (id) => clearTimeout(id),
    onExpired = () => {},
    onChange = () => {},
  } = {}) {
    Object.assign(this, { isOnline: online, now, schedule, cancel, onExpired, onChange });
    this.connected = null;
    this.since = null;
    this.expired = false;
    this.timer = null;
    this.waiters = new Set();
    this.expirationListeners = new Set();
  }
  offline() {
    if (this.since !== null) {
      this.check();
      return;
    }
    if (this.connected !== false) {
      this.connected = false;
      this.onChange(false);
    }
    this.since = this.now();
    this.expired = false;
    this.timer = this.schedule(() => this.expire(), CONNECTION_GRACE_MS);
  }
  check() {
    if (this.since !== null && this.now() - this.since >= CONNECTION_GRACE_MS) this.expire();
    return !this.expired;
  }
  expire() {
    if (this.expired) return;
    this.expired = true;
    this.cancel(this.timer);
    this.timer = null;
    this.onExpired();
    this.resolve(false);
    for (const reject of this.expirationListeners)
      reject(Error('Connection lost for five seconds'));
    this.expirationListeners.clear();
  }
  online() {
    const allowed = this.check();
    if (this.connected !== true) {
      this.connected = true;
      this.onChange(true);
    }
    this.cancel(this.timer);
    this.timer = null;
    this.since = null;
    this.expired = false;
    this.resolve(allowed);
    return allowed;
  }
  resolve(value) {
    for (const resolve of this.waiters) resolve(value);
    this.waiters.clear();
  }
  async run(fn) {
    let reject;
    const expired = new Promise((resolve, r) => {
      reject = r;
      this.expirationListeners.add(r);
    });
    try {
      return await Promise.race([Promise.resolve().then(fn), expired]);
    } finally {
      this.expirationListeners.delete(reject);
    }
  }
  wait() {
    if (this.isOnline()) return Promise.resolve(this.since === null ? true : this.online());
    this.offline();
    if (!this.check()) return Promise.resolve(false);
    return new Promise((resolve) => this.waiters.add(resolve));
  }
}
export const isConnectionError = (error) =>
  /failed to fetch|fetch failed|networkerror|network request failed|load failed|timed?\s*out|connection (?:lost|reset|refused)|offline/i.test(
    error?.message ?? '',
  );

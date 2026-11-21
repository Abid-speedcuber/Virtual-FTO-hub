// Replay only captured samples: no smoothing, extrapolation, or inferred gestures.
const TRAIL_MS = 500,
  RELEASE_MS = 300;
export class ReplayPointerTimeline {
  constructor(data) {
    this.events = data.events.filter(
      (e) => e.type === 'pointer' || ['reset-input', 'pause'].includes(e.type),
    );
    this.duration = data.duration;
    this.reset();
  }
  reset() {
    this.index = 0;
    this.at = -1;
    this.contacts = new Map();
  }
  frame(at) {
    if (at < this.at) this.reset();
    this.at = at;
    while (this.index < this.events.length && this.events[this.index].at <= at) {
      const e = this.events[this.index++];
      if (e.type !== 'pointer') {
        this.contacts.clear();
        continue;
      }
      if (e.edge === 'wheel') continue;
      const id = e.pointerId ?? 0;
      if (e.edge === 'pointerdown')
        this.contacts.set(id, {
          id,
          pointerType: e.pointerType ?? 'unknown',
          button: e.button ?? 0,
          points: [],
          released: null,
        });
      const contact = this.contacts.get(id);
      if (!contact || contact.released !== null) continue;
      contact.points.push({ x: e.x, y: e.y, at: e.at });
      if (e.edge === 'pointerup' || e.edge === 'pointercancel') contact.released = e.at;
    }
    const result = [];
    for (const [id, c] of this.contacts) {
      if (at < 0 || at >= this.duration || (c.released !== null && at - c.released >= RELEASE_MS)) {
        this.contacts.delete(id);
        continue;
      }
      // Keep the last actual location even during a stationary hold.
      while (c.points.length > 1 && c.points[1].at < at - TRAIL_MS) c.points.shift();
      result.push({ ...c, opacity: c.released === null ? 1 : 1 - (at - c.released) / RELEASE_MS });
    }
    return result;
  }
}
const svgNS = 'http://www.w3.org/2000/svg';
const element = (name, attrs = {}) => {
  const el = document.createElementNS(svgNS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
};
export class ReplayPointer {
  constructor(host, data) {
    this.host = host;
    this.timeline = new ReplayPointerTimeline(data);
    this.at = -1;
    this.svg = element('svg', { class: 'replay-pointer-overlay', 'aria-hidden': 'true' });
    host.append(this.svg);
    this.observer = new ResizeObserver(() => this.render(this.at));
    this.observer.observe(host);
  }
  render(at) {
    this.at = at;
    const width = this.host.clientWidth,
      height = this.host.clientHeight,
      nodes = [];
    for (const contact of this.timeline.frame(at)) {
      const group = element('g', {
        'data-pointer-id': contact.id,
        'data-pointer-type': contact.pointerType,
        'data-pressed': String(contact.released === null),
        opacity: contact.opacity,
      });
      const points = contact.points.filter(
          (p, i) => p.at >= at - TRAIL_MS || i === contact.points.length - 1,
        ),
        last = points.at(-1);
      const color = contact.pointerType === 'mouse' ? '#ffd58a' : '#85e9df';
      group.style.color = color;
      group.append(
        element('path', {
          d: points.map((p, i) => `${i ? 'L' : 'M'}${p.x * width} ${p.y * height}`).join(' '),
          class: 'replay-pointer-trail',
        }),
      );
      group.append(
        element('circle', {
          cx: last.x * width,
          cy: last.y * height,
          r: contact.pointerType === 'mouse' ? 9 : 15,
          class: 'replay-pointer-contact',
        }),
      );
      group.append(
        element('circle', {
          cx: last.x * width,
          cy: last.y * height,
          r: 3,
          class: 'replay-pointer-center',
        }),
      );
      nodes.push(group);
    }
    this.svg.replaceChildren(...nodes);
  }
  dispose() {
    this.observer.disconnect();
    this.svg.remove();
  }
}

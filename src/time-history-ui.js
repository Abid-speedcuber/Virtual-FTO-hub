import { averageWindow, resultText } from './solve-statistics.js';
import { formatTime } from './solve-timer.js';
const $ = (id) => document.getElementById(id);
const ROW_HEIGHT = 34,
  OVERSCAN = 6,
  SMALL_LIST = 100;
const views = new Map();
class HistoryView {
  constructor(list) {
    this.list = list;
    list.addEventListener('scroll', () => this.render(), { passive: true });
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(list);
    const dialog = list.closest('dialog');
    if (dialog)
      new MutationObserver(() => this.render()).observe(dialog, {
        attributes: true,
        attributeFilter: ['open'],
      });
  }
  update(data) {
    this.data = data;
    this.range = '';
    this.list.scrollTop = 0;
    this.render();
  }
  render() {
    if (!this.data || !this.list.getClientRects().length) return;
    const { session, openSingle, openAverage } = this.data,
      n = session.times.length;
    const start =
      n <= SMALL_LIST ? 0 : Math.max(0, Math.floor(this.list.scrollTop / ROW_HEIGHT) - OVERSCAN);
    const end =
      n <= SMALL_LIST
        ? n
        : Math.min(
            n,
            start + Math.ceil((this.list.clientHeight || 340) / ROW_HEIGHT) + 2 * OVERSCAN,
          );
    const key = `${start}:${end}`;
    if (key === this.range) return;
    this.range = key;
    const fragment = document.createDocumentFragment();
    const spacer = (height) => {
      const li = document.createElement('li');
      li.className = 'history-spacer';
      li.setAttribute('aria-hidden', 'true');
      li.style.height = `${height}px`;
      fragment.append(li);
    };
    if (start) spacer(start * ROW_HEIGHT);
    for (let offset = start; offset < end; offset++) {
      const index = n - 1 - offset,
        entry = session.times[index],
        item = document.createElement('li');
      item.dataset.resultIndex = String(index);
      item.setAttribute('aria-posinset', String(offset + 1));
      item.setAttribute('aria-setsize', String(n));
      const number = document.createElement('span'),
        time = document.createElement('time'),
        button = document.createElement('button');
      number.className = 'solve-number';
      number.textContent = String(session.completed - offset);
      button.className = 'stat-link';
      button.textContent = resultText(entry);
      button.setAttribute('aria-label', `Solve ${index + 1}: ${resultText(entry)}`);
      button.onclick = () => openSingle(index);
      time.append(button);
      if (entry.at) {
        time.dateTime = entry.at;
        time.title = new Date(entry.at).toLocaleString();
      }
      item.append(number, time);
      for (const count of [5, 12]) {
        const cell = document.createElement('span'),
          link = document.createElement('button'),
          average = averageWindow(session.times, count, index + 1);
        cell.className = 'time-average';
        link.className = 'stat-link';
        link.textContent = formatTime(average?.value ?? null);
        link.disabled = !average;
        link.setAttribute('aria-label', `ao${count} ending at solve ${session.completed - offset}`);
        link.onclick = () =>
          openAverage(average, `ao${count} · Solve ${session.completed - offset}`);
        cell.append(link);
        item.append(cell);
      }
      fragment.append(item);
    }
    if (end < n) spacer((n - end) * ROW_HEIGHT);
    this.list.replaceChildren(fragment);
    this.list.start = session.completed;
  }
}
export function renderTimeHistory(data) {
  const { size, session } = data;
  $('history-title').textContent = `${size} × ${size} FTO history`;
  for (const id of ['history-count', 'times-count'])
    $(id).textContent = String(session.times.length);
  for (const id of ['history-empty', 'times-empty']) $(id).hidden = session.times.length > 0;
  for (const id of ['solve-times', 'history-times']) {
    if (!views.has(id)) views.set(id, new HistoryView($(id)));
    views.get(id).update(data);
  }
}

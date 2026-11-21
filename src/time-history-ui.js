import { averageWindow, resultText } from './solve-statistics.js';
import { formatTime } from './solve-timer.js';
const $ = (id) => document.getElementById(id);

// Desktop and compact history share the same result and average rendering.
export function renderTimeHistory({ size, session, openSingle, openAverage }) {
  $('history-title').textContent = `${size} × ${size} FTO history`;
  $('history-count').textContent = String(session.times.length);
  $('history-empty').hidden = session.times.length > 0;
  $('times-count').textContent = String(session.times.length);
  $('times-empty').hidden = session.times.length > 0;
  const averages = session.times.map((_, i) =>
    [5, 12].map((count) => averageWindow(session.times, count, i + 1)),
  );
  for (const id of ['solve-times', 'history-times']) {
    const list = $(id);
    list.replaceChildren();
    list.start = session.completed;
    session.times.toReversed().forEach((entry, i) => {
      const item = document.createElement('li'),
        number = document.createElement('span'),
        time = document.createElement('time');
      number.className = 'solve-number';
      number.textContent = String(session.completed - i);
      const button = document.createElement('button');
      button.className = 'stat-link';
      button.textContent = resultText(entry);
      button.setAttribute('aria-label', `Solve ${session.times.length - i}: ${resultText(entry)}`);
      button.onclick = () => openSingle(session.times.length - 1 - i);
      time.append(button);
      if (entry.at) {
        time.dateTime = entry.at;
        time.title = new Date(entry.at).toLocaleString();
      }
      item.append(number, time);
      for (const [j, count] of [5, 12].entries()) {
        const cell = document.createElement('span'),
          average = averages[session.times.length - 1 - i][j],
          link = document.createElement('button');
        cell.className = 'time-average';
        link.className = 'stat-link';
        link.textContent = formatTime(average?.value ?? null);
        link.disabled = !average;
        link.setAttribute('aria-label', `ao${count} ending at solve ${session.completed - i}`);
        link.onclick = () => openAverage(average, `ao${count} · Solve ${session.completed - i}`);
        cell.append(link);
        item.append(cell);
      }
      list.append(item);
    });
    list.scrollTop = 0;
  }
}

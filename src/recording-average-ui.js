import { averageWindow, statisticsReport, resultText } from './solve-statistics.js';
import { formatTime } from './solve-timer.js';
import { downloadJSON } from './recording-ui.js';
const $ = (id) => document.getElementById(id);
export class AverageRecordingUI {
  constructor({ album, getSession, getSize, pause, play }) {
    Object.assign(this, { album, getSession, getSize, pause, play });
    this.version = 0;
    $('close-average-share').onclick = () => $('average-share-dialog').close();
    $('average-share-save').onclick = async () => {
      const group = this.group,
        version = this.version;
      if (!group) return;
      $('average-share-save').disabled = true;
      try {
        await album.saveGroup(group);
        if (version === this.version) {
          $('average-share-save').textContent = 'Saved to album';
          $('average-share-message').textContent =
            'This average and its recordings are saved on this device.';
        }
      } catch (error) {
        if (version === this.version) {
          $('average-share-message').textContent = error.message;
          $('average-share-save').disabled = false;
        }
      }
    };
    $('average-share-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(this.report);
        $('average-share-message').textContent = 'Report copied';
      } catch {
        $('average-share-output').value = this.report;
        $('average-share-output').hidden = false;
        $('average-share-output').focus();
        $('average-share-output').select();
      }
    };
    $('average-share-json').onclick = async () => {
      const group = this.group,
        version = this.version;
      if (!group) return;
      try {
        const data = await album.exportGroup(group);
        if (version === this.version)
          downloadJSON(data, `fto-${group.size}x${group.size}-ao${group.count}.ftoreplay.json`);
      } catch (error) {
        if (version === this.version) $('average-share-message').textContent = error.message;
      }
    };
  }
  open(members, size, { expanded = false } = {}) {
    this.pause();
    this.group = null;
    const version = ++this.version,
      count = members.length,
      window = averageWindow(members, count);
    this.report = statisticsReport(members, window);
    $('average-share-title').textContent = `Share ao${count} · ${size} × ${size}`;
    $('average-share-value').textContent = formatTime(window.value);
    $('average-share-date').textContent = members.at(-1)?.at
      ? new Date(members.at(-1).at).toLocaleString()
      : '';
    $('average-share-message').textContent = 'Checking recordings…';
    $('average-share-save').disabled = true;
    $('average-share-save').textContent = `Save ao${count} to album`;
    $('average-share-json').disabled = true;
    $('average-share-output').hidden = true;
    $('average-share-details').open = expanded;
    $('average-share-summary').textContent = `${count} solves`;
    $('average-share-solves').replaceChildren();
    if (!$('average-share-dialog').open) $('average-share-dialog').showModal();
    return version;
  }
  async shareCurrent(window) {
    const times = this.getSession().times.map((entry) => ({ ...entry })),
      size = this.getSize(),
      members = times.slice(window.start, window.end),
      version = this.open(members, size);
    try {
      const group = await this.album.prepareAverage(size, times, window);
      await this.ready(group, version);
    } catch (error) {
      if (version === this.version) $('average-share-message').textContent = error.message;
    }
  }
  async show(group) {
    const version = this.open(group.members, group.size, { expanded: true });
    await this.ready(group, version);
  }
  async ready(group, version) {
    const saved = (await this.album.listGroups()).some((g) => g.id === group.id);
    if (version !== this.version) return;
    this.group = group;
    $('average-share-save').disabled = saved;
    $('average-share-save').textContent = saved
      ? 'Saved to album'
      : `Save ao${group.count} to album`;
    $('average-share-json').disabled = false;
    $('average-share-message').textContent =
      'Saved averages keep their recordings on this device. Export JSON to share or back them up.';
    const excluded = new Set(averageWindow(group.members, group.count).excluded);
    for (const [index, member] of group.members.entries()) {
      const row = document.createElement('li'),
        time = document.createElement('span');
      time.textContent = `${index + 1}. ${excluded.has(index) ? '(' + resultText(member) + ')' : resultText(member)}`;
      row.append(time);
      if (member.id) {
        const play = document.createElement('button');
        play.textContent = 'Play';
        play.setAttribute('aria-label', `Play solve ${index + 1}`);
        play.onclick = async () => {
          try {
            this.play(await this.album.get(member.id));
          } catch (error) {
            $('average-share-message').textContent = error.message;
          }
        };
        row.append(play);
      } else {
        const note = document.createElement('small');
        note.textContent = 'No recording';
        row.append(note);
      }
      $('average-share-solves').append(row);
    }
  }
}

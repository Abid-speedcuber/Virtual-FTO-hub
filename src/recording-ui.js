import { AVERAGE_FORMAT } from './recording-average.js';
import { createShortLink, getCloudRecording } from './network.js';
import { validateRecording, withoutInspection } from './solve-recording.js';
import {
  recordingLink,
  recordingJSON,
  parseRecordingText,
  recordingPayload,
  decodeRecording,
  clearRecordingLink,
  recordingID,
} from './recording-codec.js';
import { icon } from './icons.js';
import { formatTime } from './solve-timer.js';
const result = (data) =>
  data.dnf ? `DNF (${formatTime(data.solveMs)})` : formatTime(data.solveMs);
const $ = (id) => document.getElementById(id);
export function downloadJSON(data, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })),
    link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export class RecordingUI {
  constructor({
    getSize,
    getRecordings,
    pause,
    play,
    current,
    album,
    pauseForShare,
    confirm,
    isReplaying = () => false,
  }) {
    Object.assign(this, {
      getSize,
      getRecordings,
      pause,
      play,
      current,
      album,
      pauseForShare,
      confirm,
      isReplaying,
    });
    this.shareVersion = 0;
    this.linkVersion = 0;
    this.albumStateVersion = 0;
    this.albumVersion = 0;
    this.importVersion = 0;
    this.importBusy = false;
    this.selecting = false;
    this.selectedRecordings = new Set();
    this.selectedGroups = new Set();
    this.bulkBusy = false;
    $('close-recording-link-toast').onclick = () => this.hideLinkToast();
    $('history-recordings').onclick = () => this.openAlbum();
    $('mobile-share-current').onclick = () => this.share(this.getRecordings().last, { home: true });
    $('history-share-pb').onclick = () => this.share(this.getRecordings().pb);
    $('home-replay-share').onclick = () => this.share(this.current?.());
    $('share-current').onclick = () =>
      this.share(this.current?.() ?? this.getRecordings().last, { home: true });
    $('share-pb').onclick = () => this.share(this.getRecordings().pb, { home: true });
    $('share-watch').innerHTML = icon('resume') + 'Watch solve';
    $('share-watch').onclick = () => {
      if (this.shareData) this.play(this.shareData);
    };
    $('close-share').onclick = () => $('share-dialog').close();
    $('share-link').onclick = () => this.copy(this.shareLink, 'Link copied');
    $('share-text').onclick = () => this.copy(this.shareText, 'Recording text copied');
    $('share-short').onclick = async () => {
      const data = this.shareData,
        version = this.shareVersion;
      if (!data || data.size !== 3) return;
      $('share-short').disabled = true;
      try {
        const link = await createShortLink(data);
        if (version !== this.shareVersion) return;
        await this.copy(link, 'Temporary link copied · expires in 30 days');
      } catch (error) {
        if (version === this.shareVersion) $('share-message').textContent = error.message;
      } finally {
        if (version === this.shareVersion) $('share-short').disabled = false;
      }
    };
    $('share-json').onclick = () => {
      if (this.shareData)
        downloadJSON(
          this.shareData,
          `fto-${this.shareData.size}x${this.shareData.size}-${Math.round(this.shareData.solveMs)}.ftoreplay.json`,
        );
    };
    $('share-album').onclick = async () => {
      if (!this.shareData || $('share-album').disabled || $('share-album').hidden) return;
      const data = this.shareData,
        version = this.shareVersion;
      $('share-album').disabled = true;
      try {
        const pb = this.getRecordings().pb,
          isPB = !!pb && (await recordingID(pb)) === (await recordingID(data));
        await this.album.add(data, { pb: isPB });
        if (version !== this.shareVersion) return;
        await this.refreshAlbumState();
        $('share-message').textContent = 'Saved to your recording album.';
      } catch (error) {
        if (version === this.shareVersion) {
          $('share-message').textContent = error.message;
          await this.refreshAlbumState();
        }
      }
    };
    this.album.addEventListener('change', () => {
      if ($('share-dialog').open && !$('share-album').hidden) this.refreshAlbumState();
    });
    window.addEventListener('focus', () => {
      if ($('share-dialog').open && !$('share-album').hidden) this.refreshAlbumState();
    });
    $('album').innerHTML = icon('video');
    $('album').onclick = () => this.openAlbum();
    $('close-album').onclick = () => $('album-dialog').close();
    $('album-import-recording').onclick = () => this.openImport();
    $('album-select').onclick = () => {
      this.selecting = true;
      this.updateSelection();
    };
    $('album-select-done').onclick = () => {
      this.selecting = false;
      this.selectedRecordings.clear();
      this.selectedGroups.clear();
      this.updateSelection();
    };
    $('album-select-all').onchange = () => {
      this.selectedGroups = new Set(
        $('album-select-all').checked ? this.albumGroups.map((group) => group.id) : [],
      );
      this.selectedRecordings = new Set(
        $('album-select-all').checked ? this.albumEntries.map((entry) => entry.id) : [],
      );
      this.updateSelection();
    };
    $('album-delete-selected').onclick = () => this.deleteSelected();
    $('close-paste').onclick = () => {
      this.cancelImport();
      $('paste-dialog').close();
    };
    $('paste-dialog').addEventListener('cancel', () => this.cancelImport());
    $('recording-paste-load').onclick = () => this.watchImported($('recording-paste').value);
    $('choose-recording-file').onclick = () => $('recording-import').click();
    $('recording-import').onchange = (event) => this.watchImported(event.target.files[0]);
    const drop = $('recording-drop');
    for (const type of ['dragenter', 'dragover'])
      drop.addEventListener(type, (event) => {
        event.preventDefault();
        drop.classList.add('drag-over');
      });
    for (const type of ['dragleave', 'drop'])
      drop.addEventListener(type, (event) => {
        event.preventDefault();
        drop.classList.remove('drag-over');
      });
    drop.addEventListener('drop', (event) => this.watchImported(event.dataTransfer.files[0]));
  }
  async share(original, { home = false } = {}) {
    if (!original) return;
    const version = ++this.shareVersion;
    try {
      this.shareData = withoutInspection(validateRecording(original));
      this.shareText = recordingJSON(this.shareData);
    } catch (error) {
      this.openImport();
      $('paste-message').textContent = error.message;
      return;
    }
    (this.pauseForShare ?? this.pause)();
    $('share-title').textContent =
      `Share ${this.shareData.size} × ${this.shareData.size} · ${result(this.shareData)}`;
    this.shareLink = null;
    $('share-link').hidden = this.shareData.size === 4;
    $('share-short').hidden = this.shareData.size !== 3;
    $('share-short').disabled = false;
    $('share-link').disabled = true;
    $('share-watch').hidden = !home || this.isReplaying();
    $('share-album').hidden = !home;
    $('share-album').disabled = true;
    $('share-album').textContent = 'Checking album…';
    delete $('share-album').dataset.saved;
    $('share-message').textContent = '';
    $('share-output').hidden = true;
    $('share-link-size').textContent = this.shareData.size === 4 ? '' : 'Preparing compact link…';
    $('share-dialog').showModal();
    if (home) this.refreshAlbumState();
    if (this.shareData.size === 4) return;
    try {
      const link = await recordingLink(this.shareData);
      if (version !== this.shareVersion) return;
      this.shareLink = link;
      $('share-link').disabled = false;
      $('share-link-size').textContent = `Link: ${link.length.toLocaleString()} characters`;
      $('share-link').title = $('share-link-size').textContent;
    } catch (error) {
      if (version === this.shareVersion) $('share-link-size').textContent = error.message;
    }
  }
  async refreshAlbumState() {
    const data = this.shareData,
      version = this.shareVersion,
      refresh = ++this.albumStateVersion;
    if (!data || $('share-album').hidden) return;
    try {
      const saved = await this.album.has(await recordingID(data));
      if (version !== this.shareVersion || refresh !== this.albumStateVersion) return;
      $('share-album').disabled = saved;
      $('share-album').dataset.saved = String(saved);
      $('share-album').textContent = saved ? 'Saved to album' : 'Save to album';
      if (!saved && $('share-message').textContent === 'Saved to your recording album.')
        $('share-message').textContent = '';
    } catch (error) {
      if (version === this.shareVersion && refresh === this.albumStateVersion) {
        $('share-album').disabled = true;
        $('share-album').textContent = 'Album unavailable';
        $('share-message').textContent = error.message;
      }
    }
  }
  async copy(text, message) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      $('share-message').textContent = message;
    } catch {
      $('share-output').value = text;
      $('share-output').hidden = false;
      $('share-output').focus();
      $('share-output').select();
      $('share-message').textContent = 'Select and copy the text below.';
    }
  }
  async openAlbum() {
    this.pause();
    this.selecting = false;
    this.selectedRecordings.clear();
    this.selectedGroups.clear();
    $('album-dialog').showModal();
    await this.renderAlbum();
  }
  async renderAlbum() {
    const version = ++this.albumVersion;
    $('album-message').textContent = 'Loading recordings…';
    $('album-list').replaceChildren();
    try {
      const [all, groups] = await Promise.all([this.album.list(), this.album.listGroups()]);
      if (version !== this.albumVersion) return;
      const referenced = new Set(groups.flatMap((g) => g.members.map((m) => m.id))),
        entries = all.filter(
          (e) =>
            e.recent || e.pb || e.averagePB?.length || e.manual !== false || !referenced.has(e.id),
        );
      this.albumEntries = entries;
      this.albumGroups = groups;
      this.recordingGroups = new Map();
      for (const group of groups)
        for (const member of group.members)
          if (member.id) {
            if (!this.recordingGroups.has(member.id))
              this.recordingGroups.set(member.id, new Set());
            this.recordingGroups.get(member.id).add(group.id);
          }
      $('album-message').textContent =
        entries.length || groups.length
          ? ''
          : 'Your last 12 solves and PB recordings appear here. You can also save a recording from Share.';
      for (const group of groups) {
        const row = document.createElement('li');
        row.className = 'album-entry album-average';
        row.dataset.id = group.id;
        const info = document.createElement('div');
        info.className = 'album-info';
        const title = document.createElement('strong');
        title.textContent = `${group.size} × ${group.size} FTO · ao${group.count} · ${formatTime(group.averageMs === null ? Infinity : group.averageMs)}`;
        const date = document.createElement('time');
        date.dateTime = group.completedAt;
        date.textContent = new Date(group.completedAt).toLocaleString();
        info.append(title, date);
        const view = document.createElement('button');
        view.innerHTML = icon('share');
        view.setAttribute(
          'aria-label',
          `Open ao${group.count} ${formatTime(group.averageMs === null ? Infinity : group.averageMs)}`,
        );
        view.onclick = () =>
          this.averages.show(group).catch((error) => {
            $('album-message').textContent = error.message;
          });
        const remove = document.createElement('button');
        remove.innerHTML = icon('trash');
        remove.className = 'album-delete';
        remove.setAttribute('aria-label', `Delete ao${group.count}`);
        remove.onclick = async () => {
          try {
            if (
              !(await this.confirm(
                `Delete this saved ao${group.count}? Recordings used by other saved averages, recent solves or personal bests will be kept.`,
                'Delete average',
                'Delete saved average?',
              ))
            )
              return;
            await this.album.removeGroup(group.id);
            await this.renderAlbum();
          } catch (error) {
            $('album-message').textContent = error.message;
          }
        };
        const actions = document.createElement('div');
        actions.className = 'album-actions';
        actions.append(view, remove);
        row.append(info, actions);
        this.addSelection(row, group.id, true, title.textContent);
        $('album-list').append(row);
      }
      for (const entry of entries) {
        const row = document.createElement('li');
        row.dataset.id = entry.id;
        row.className = 'album-entry';
        const info = document.createElement('div');
        info.className = 'album-info';
        const title = document.createElement('strong');
        title.textContent = `${entry.size} × ${entry.size} FTO · ${result(entry)}`;
        info.append(title);
        if (entry.pb) {
          const badge = document.createElement('span');
          badge.className = 'album-pb';
          badge.textContent = '[PB]';
          info.append(badge);
        }
        for (const count of entry.averagePB ?? []) {
          const badge = document.createElement('span');
          badge.className = 'album-pb';
          badge.textContent = `ao${count} PB`;
          info.append(badge);
        }
        if (entry.recent && !entry.pb && !entry.averagePB?.length) {
          const badge = document.createElement('span');
          badge.className = 'album-recent';
          badge.textContent = 'Recent';
          info.append(badge);
        }
        const date = new Date(entry.completedAt),
          stamp = document.createElement('time');
        stamp.dateTime = entry.completedAt;
        stamp.textContent = `${date.toLocaleDateString()} · ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
        info.append(stamp);
        const watch = document.createElement('button');
        watch.innerHTML = icon('resume');
        watch.className = 'album-play';
        watch.setAttribute(
          'aria-label',
          `Play ${entry.size} × ${entry.size} solve ${result(entry)}`,
        );
        watch.title = 'Play solve';
        watch.onclick = async () => {
          try {
            this.play(await this.album.get(entry.id));
          } catch (error) {
            $('album-message').textContent = error.message;
          }
        };
        const share = document.createElement('button');
        share.innerHTML = icon('share');
        share.setAttribute(
          'aria-label',
          `Share ${entry.size} × ${entry.size} solve ${result(entry)}`,
        );
        share.className = 'share-recording';
        share.onclick = async () => {
          try {
            await this.share(await this.album.get(entry.id));
          } catch (error) {
            $('album-message').textContent = error.message;
          }
        };
        const remove = document.createElement('button');
        remove.innerHTML = icon('trash');
        remove.className = 'album-delete';
        remove.setAttribute(
          'aria-label',
          `Delete ${entry.size} × ${entry.size} solve ${result(entry)}`,
        );
        remove.title = referenced.has(entry.id)
          ? 'Used by a saved average. Delete that average first.'
          : 'Delete recording';
        remove.disabled = referenced.has(entry.id);
        remove.onclick = async () => {
          remove.disabled = true;
          try {
            if (
              !(await this.confirm(
                `Delete the ${entry.size} × ${entry.size} recording (${result(entry)}) from your album? Its solve time and personal-best result will be kept.`,
                'Delete recording',
                'Delete album recording?',
              ))
            )
              return;
            await this.album.remove(entry.id);
            await this.renderAlbum();
          } catch (error) {
            $('album-message').textContent = error.message;
          } finally {
            remove.disabled = false;
          }
        };
        const actions = document.createElement('div');
        actions.className = 'album-actions';
        actions.append(watch, share, remove);
        row.append(info, actions);
        this.addSelection(row, entry.id, false, title.textContent);
        $('album-list').append(row);
      }
      this.updateSelection();
    } catch (error) {
      $('album-message').textContent = error.message;
    }
  }
  addSelection(row, id, group, label) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'album-selection';
    input.dataset.kind = group ? 'group' : 'recording';
    input.dataset.id = id;
    input.setAttribute('aria-label', `Select ${label}`);
    input.onchange = () => {
      const set = group ? this.selectedGroups : this.selectedRecordings;
      if (input.checked) set.add(id);
      else set.delete(id);
      this.updateSelection();
    };
    row.prepend(input);
    row.addEventListener('click', (event) => {
      if (this.selecting && !event.target.closest('button,input,a')) input.click();
    });
  }
  updateSelection() {
    const entries = this.albumEntries ?? [],
      groups = this.albumGroups ?? [];
    for (const id of this.selectedRecordings)
      if (!entries.some((entry) => entry.id === id)) this.selectedRecordings.delete(id);
    for (const id of this.selectedGroups)
      if (!groups.some((group) => group.id === id)) this.selectedGroups.delete(id);
    for (const checkbox of $('album-list').querySelectorAll('.album-selection')) {
      const group = checkbox.dataset.kind === 'group',
        id = checkbox.dataset.id,
        blocked =
          !group &&
          [...(this.recordingGroups?.get(id) ?? [])].some(
            (owner) => !this.selectedGroups.has(owner),
          );
      if (blocked) this.selectedRecordings.delete(id);
      checkbox.disabled = this.bulkBusy || blocked;
      checkbox.checked = (group ? this.selectedGroups : this.selectedRecordings).has(id);
      checkbox.title = blocked ? 'Select every saved average that uses this recording first.' : '';
    }
    const count = this.selectedRecordings.size + this.selectedGroups.size,
      total = entries.length + groups.length;
    $('album-dialog').dataset.selecting = String(this.selecting);
    $('album-select').hidden = this.selecting;
    $('album-select').disabled = !total;
    $('album-selection-tools').hidden = !this.selecting;
    $('album-selection-help').hidden = !this.selecting || !groups.length;
    $('album-selected-count').textContent = `${count} selected`;
    $('album-delete-selected').disabled = !count || this.bulkBusy;
    $('album-select-done').disabled = this.bulkBusy;
    $('album-select-all').disabled = !total || this.bulkBusy;
    $('album-select-all').checked = !!total && count === total;
    $('album-select-all').indeterminate = count > 0 && count < total;
  }
  async deleteSelected() {
    if (this.bulkBusy) return;
    const recordingIDs = [...this.selectedRecordings],
      groupIDs = [...this.selectedGroups];
    if (!recordingIDs.length && !groupIDs.length) return;
    const version = this.albumVersion;
    this.bulkBusy = true;
    this.updateSelection();
    try {
      if (
        !(await this.confirm(
          `Delete ${recordingIDs.length} recording${recordingIDs.length === 1 ? '' : 's'} and ${groupIDs.length} saved average${groupIDs.length === 1 ? '' : 's'}? Solve times and PB results stay. Deleting an average also removes its recordings if nothing else retains them.`,
          'Delete selected',
          'Delete album selection?',
        ))
      )
        return;
      const removed = await this.album.removeMany({ recordingIDs, groupIDs });
      if (version !== this.albumVersion) return;
      this.selectedRecordings.clear();
      this.selectedGroups.clear();
      await this.renderAlbum();
      $('album-message').textContent =
        `Deleted ${removed.recordings} recordings and ${removed.groups} saved averages.`;
    } catch (error) {
      $('album-message').textContent = error.message;
    } finally {
      this.bulkBusy = false;
      this.updateSelection();
    }
  }
  openImport() {
    this.pause();
    this.cancelSharedLink();
    this.importVersion++;
    this.importBusy = false;
    $('recording-paste').value = '';
    $('recording-import').value = '';
    $('paste-message').textContent = '';
    this.setImportBusy(false);
    if (!$('paste-dialog').open) $('paste-dialog').showModal();
  }
  cancelImport() {
    this.cancelSharedLink();
    this.importVersion++;
    this.importBusy = false;
    clearRecordingLink();
  }
  setImportBusy(busy) {
    $('recording-paste-load').disabled = busy;
    $('choose-recording-file').disabled = busy;
  }
  async watchImported(input) {
    if (input === undefined || this.importBusy) return;
    this.importBusy = true;
    this.linkVersion++;
    clearRecordingLink();
    const version = ++this.importVersion;
    this.setImportBusy(true);
    $('paste-message').textContent = 'Opening recording…';
    try {
      if (typeof input !== 'string' && input.size > 16 * 1024 * 1024)
        throw Error('Recording must be smaller than 16 MB');
      const text = typeof input === 'string' ? input : await input.text();
      if (text.length > 16 * 1024 * 1024) throw Error('Recording must be smaller than 16 MB');
      let packageData;
      try {
        packageData = JSON.parse(text);
      } catch {
        // Non-JSON input is handled by the recording link/payload parser below.
      }
      if (packageData?.format === AVERAGE_FORMAT) {
        const group = await this.album.importGroup(packageData, {
          shouldSave: () => version === this.importVersion && $('paste-dialog').open,
        });
        if (!group || version !== this.importVersion || !$('paste-dialog').open) return;
        $('paste-dialog').close();
        await this.averages.show(group);
        return;
      }
      const data = await parseRecordingText(text);
      if (version !== this.importVersion || !$('paste-dialog').open) return;
      this.play(data);
    } catch (error) {
      if (version === this.importVersion) $('paste-message').textContent = error.message;
    } finally {
      if (version === this.importVersion) {
        this.importBusy = false;
        this.setImportBusy(false);
        $('recording-import').value = '';
      }
    }
  }
  showLinkToast(message, state = 'loading') {
    clearTimeout(this.linkToastTimer);
    $('recording-link-status').textContent = message;
    $('recording-link-toast').dataset.state = state;
    $('recording-link-toast').hidden = false;
    if (state !== 'loading')
      this.linkToastTimer = setTimeout(() => this.hideLinkToast(), state === 'error' ? 8000 : 2000);
  }
  hideLinkToast() {
    clearTimeout(this.linkToastTimer);
    $('recording-link-toast').hidden = true;
  }
  cancelSharedLink() {
    this.linkVersion++;
    this.hideLinkToast();
  }
  async openSharedLink() {
    const cloud = new URLSearchParams(location.hash.slice(1));
    if (cloud.has('short') || cloud.has('rank')) {
      this.pause();
      const version = ++this.linkVersion;
      this.showLinkToast('Loading recording…');
      try {
        let data = await getCloudRecording(
          cloud.has('short') ? 'short' : 'rank',
          cloud.get('short') ?? cloud.get('rank'),
        );
        data = withoutInspection(validateRecording(data));
        if (data.size !== 3) throw Error('Only 3×3 recordings are supported here');
        if (version !== this.linkVersion) return;
        this.play(data);
        this.showLinkToast('Recording loaded', 'success');
      } catch (error) {
        if (version === this.linkVersion) this.showLinkToast(error.message, 'error');
      }
      return;
    }
    let payload;
    try {
      payload = recordingPayload();
    } catch (error) {
      this.showLinkToast(`Couldn’t import link: ${error.message}`, 'error');
      return;
    }
    if (!payload) {
      this.cancelSharedLink();
      return;
    }
    this.pause();
    this.importVersion++;
    this.importBusy = false;
    this.setImportBusy(false);
    const version = ++this.linkVersion;
    history.replaceState(
      history.state,
      '',
      location.pathname + location.search + '#replay=' + payload,
    );
    this.showLinkToast('Importing link…');
    try {
      const data = await decodeRecording(payload);
      if (version !== this.linkVersion) return;
      this.play(data);
      this.showLinkToast('Recording loaded', 'success');
    } catch (error) {
      if (version !== this.linkVersion) return;
      clearRecordingLink();
      this.showLinkToast(`Couldn’t import link: ${error.message}`, 'error');
    }
  }
}

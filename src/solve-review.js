import { validateRecording } from './solve-recording.js';
import { formatTime } from './solve-timer.js';
import { averageWindow } from './solve-statistics.js';
// Match the backend's one-nanosecond allowance for float8/JSON round trips.
export const evidenceTimeMatches = (recorded, claimed) =>
  Number.isFinite(recorded) &&
  Number.isFinite(claimed) &&
  recorded > 0 &&
  claimed > 0 &&
  Math.abs(recorded - claimed) <= 0.000001;
const solverIdentity = (row) =>
  /^[0-9]{4}[A-Z]{4}[0-9]{2}$/.test(row.wca_id ?? '')
    ? `${row.username} · ${row.wca_id}${row.wca_verified ? ' ✓' : ' (self-reported)'}`
    : row.username;
// Review uses the simulator's one replay viewer. Queue navigation never decides.
export class SolveReview {
  constructor({ rpc, isAdmin, play, pause, recover }) {
    Object.assign(this, { rpc, isAdmin, play, pause, recover });
    this.revision = 0;
    this.queueRevision = 0;
    this.rows = [];
    this.current = null;
    this.evidence = null;
    this.approvable = false;
    this.opened = new Set();
    this.watchIndex = -1;
    this.saving = false;
    const panel = (this.panel = document.createElement('aside'));
    panel.id = 'solve-review-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Review solves');
    panel.innerHTML = `<header><div><h2>Review solves</h2><span data-count></span></div><div><button data-refresh aria-label="Refresh submissions">↻</button><button data-collapse aria-label="Collapse review" aria-expanded="true">−</button><button data-close aria-label="Close review">×</button></div></header><div data-body><div class="review-tools"><button data-recover>Recover single</button><span>Check a recording affected by a submission problem.</span></div><details data-queue open><summary>Submissions awaiting a decision</summary><div class="review-state-filters" role="group" aria-label="Review status"><button data-review-state="active" aria-pressed="true">To review</button><button data-review-state="held" aria-pressed="false">On hold</button><button data-review-state="all" aria-pressed="false">All pending</button></div><div class="review-filters" role="group" aria-label="Filter submissions"><button data-filter="all" aria-pressed="true">All</button><button data-filter="single" aria-pressed="false">Single</button><button data-filter="ao5" aria-pressed="false">ao5</button><button data-filter="ao12" aria-pressed="false">ao12</button></div><ol data-queue-list aria-label="Pending submissions"></ol><nav class="review-pages" aria-label="Submission pages"><button data-prev-page>Previous</button><span data-page></span><button data-next-page>Next</button></nav></details><section data-detail hidden><div class="review-result"><div><h3 data-solver></h3><p data-submitted></p></div><div><strong data-result></strong><span data-metric></span></div></div><p data-investigation hidden></p><p data-check class="review-check"></p><div class="review-evidence-heading"><h3>Recordings <small data-progress></small></h3><button data-watch-next>Watch next</button></div><ol data-evidence></ol><p class="review-help">Parentheses mark the trimmed solves. Opening a replay does not approve it.</p><label>Message to solver<textarea data-note maxlength="500" rows="2" placeholder="Explain a rejection or investigation hold. Approval notes are optional."></textarea></label><div class="review-decision"><button data-reject>Reject & next</button><button data-hold>Hold & next</button><button data-approve class="primary">Approve & next</button></div></section></div><p data-message role="status"></p>`;
    document.body.append(panel);
    this.$ = (selector) => panel.querySelector(selector);
    this.filter = 'all';
    this.reviewState = 'active';
    this.cursors = [null];
    this.pageIndex = 0;
    this.$('[data-prev-page]').onclick = () => {
      if (!this.saving && !this.loading && this.pageIndex > 0) {
        this.pageIndex--;
        this.loadQueue();
      }
    };
    this.$('[data-next-page]').onclick = () => {
      if (!this.saving && !this.loading && this.hasMore) {
        this.cursors[++this.pageIndex] = this.nextCursor;
        this.loadQueue();
      }
    };
    const decisions = this.$('.review-decision');
    panel.insertBefore(decisions, this.$('[data-message]'));
    decisions.hidden = true;
    this.relocate = () => {
      const parent = document.documentElement.classList.contains('compact-ui')
        ? document.body
        : document.getElementById('solve-panel');
      if (parent && panel.parentElement !== parent) parent.append(panel);
    };
    this.relocate();
    new MutationObserver(this.relocate).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    this.$('[data-recover]').hidden = !recover;
    this.$('[data-recover]').onclick = () => {
      if (this.isAdmin()) this.recover?.();
    };
    this.$('[data-close]').onclick = () => this.close();
    this.$('[data-refresh]').onclick = () => this.loadQueue(this.current?.id);
    this.$('[data-collapse]').onclick = () => {
      const hidden = !this.$('[data-body]').hidden;
      this.$('[data-body]').hidden = hidden;
      this.$('.review-decision').hidden = hidden || !this.evidence;
      this.$('[data-collapse]').textContent = hidden ? '+' : '−';
      this.$('[data-collapse]').setAttribute('aria-expanded', String(!hidden));
    };
    for (const button of panel.querySelectorAll('[data-filter]'))
      button.onclick = () => {
        if (this.saving) return;
        this.filter = button.dataset.filter;
        for (const b of panel.querySelectorAll('[data-filter]'))
          b.setAttribute('aria-pressed', String(b === button));
        this.pageIndex = 0;
        this.cursors = [null];
        this.loadQueue();
      };
    this.$('[data-watch-next]').onclick = () => {
      const next = this.recordings.findIndex((r, i) => r && !this.opened.has(i));
      if (next >= 0) this.watch(next);
    };
    this.$('[data-approve]').onclick = () => this.decide(true);
    this.$('[data-reject]').onclick = () => this.decide(false);
    this.$('[data-hold]').onclick = () => this.decide('hold');
    for (const button of panel.querySelectorAll('[data-review-state]'))
      button.onclick = () => {
        if (this.saving) return;
        this.reviewState = button.dataset.reviewState;
        for (const b of panel.querySelectorAll('[data-review-state]'))
          b.setAttribute('aria-pressed', String(b === button));
        this.pageIndex = 0;
        this.cursors = [null];
        this.loadQueue();
      };
    document.addEventListener('ftoers-identity-change', () => {
      if (!this.isAdmin()) this.close();
    });
  }
  filtered() {
    return this.rows.filter(
      (row) =>
        (this.filter === 'all' || row.metric === this.filter) &&
        (this.reviewState === 'all' ||
          (this.reviewState === 'held' && row.status === 'investigating') ||
          (this.reviewState === 'active' && row.status !== 'investigating')),
    );
  }
  controls(enabled) {
    for (const selector of ['[data-approve]', '[data-reject]', '[data-hold]', '[data-note]'])
      this.$(selector).disabled = !enabled || (selector === '[data-approve]' && !this.approvable);
    this.$('[data-watch-next]').disabled =
      !enabled || !this.recordings?.some((r, i) => r && !this.opened.has(i));
  }
  clearDetail() {
    this.revision++;
    this.current = null;
    this.evidence = null;
    this.approvable = false;
    this.$('[data-detail]').hidden = true;
    this.$('.review-decision').hidden = true;
    this.controls(false);
  }
  close() {
    this.revision++;
    this.panel.hidden = true;
    document.documentElement.classList.remove('reviewing');
    this.evidence = null;
    this.approvable = false;
    this.$('[data-evidence]').replaceChildren();
  }
  async open() {
    if (!this.isAdmin()) return;
    this.pause();
    this.panel.hidden = false;
    document.documentElement.classList.add('reviewing');
    this.relocate();
    this.$('[data-body]').hidden = false;
    this.$('[data-collapse]').setAttribute('aria-expanded', 'true');
    this.$('[data-collapse]').textContent = '−';
    await this.loadQueue();
  }
  renderQueue() {
    const held = this.counts?.held ?? this.rows.filter((r) => r.status === 'investigating').length;
    const pending = this.counts?.pending ?? this.rows.length - held;
    this.$('[data-count]').textContent = `${pending} pending${held ? ` · ${held} on hold` : ''}`;
    this.$('[data-prev-page]').disabled = this.saving || this.loading || this.pageIndex === 0;
    this.$('[data-next-page]').disabled = this.saving || this.loading || !this.hasMore;
    this.$('[data-page]').textContent = `Page ${this.pageIndex + 1}`;
    this.$('[data-queue-list]').replaceChildren();
    for (const row of this.filtered()) {
      const li = document.createElement('li'),
        button = document.createElement('button'),
        name = document.createElement('strong'),
        time = document.createElement('span');
      name.textContent = solverIdentity(row);
      time.textContent = `${row.metric} · ${formatTime(row.ms)}`;
      button.append(name, time);
      if (row.status === 'investigating') {
        const badge = document.createElement('small');
        badge.className = 'review-hold-badge';
        badge.textContent = 'On hold';
        button.append(badge);
      }
      button.setAttribute(
        'aria-label',
        `Review ${row.username} ${row.metric} ${formatTime(row.ms)}`,
      );
      button.setAttribute('aria-current', String(row.id === this.current?.id));
      button.disabled = this.saving;
      button.onclick = () => this.loadEvidence(row);
      li.append(button);
      this.$('[data-queue-list]').append(li);
    }
  }
  async loadQueue(preferredID, index = 0) {
    ++this.revision;
    this.loading = true;
    this.clearDetail();
    const queueVersion = ++this.queueRevision;
    this.renderQueue();
    this.controls(false);
    this.$('[data-refresh]').disabled = true;
    this.$('[data-message]').textContent = 'Loading submissions…';
    try {
      const page = await this.rpc('review_queue_page', {
        review_state: this.reviewState,
        category: this.filter,
        after_cursor: this.cursors[this.pageIndex],
      });
      const rows = page.rows;
      if (!Array.isArray(rows))
        throw Error('The review queue needs the local backend update before it can load.');
      if (queueVersion !== this.queueRevision || !this.isAdmin() || this.panel.hidden) return;
      this.loading = false;
      this.counts = page.counts;
      this.hasMore = page.has_more;
      this.nextCursor = page.next_cursor;
      if (!rows.length && this.pageIndex > 0) {
        this.pageIndex--;
        return this.loadQueue();
      }
      this.rows = rows;
      this.renderQueue();
      const filtered = this.filtered(),
        selected =
          filtered.find((row) => row.id === preferredID) ??
          filtered[Math.min(index, filtered.length - 1)];
      if (selected) await this.loadEvidence(selected);
      else {
        this.clearDetail();
        this.$('[data-message]').textContent = rows.length
          ? 'No pending submissions in this filter.'
          : 'No pending submissions.';
      }
    } catch (error) {
      if (queueVersion === this.queueRevision)
        this.$('[data-message]').textContent = /review_queue_page|PGRST202/.test(error.message)
          ? 'The review queue needs the local backend update before it can load.'
          : error.message;
    } finally {
      if (queueVersion === this.queueRevision) {
        this.loading = false;
        this.renderQueue();
        this.$('[data-refresh]').disabled = this.saving;
      }
    }
  }
  async loadEvidence(row) {
    if (this.saving) return;
    const version = ++this.revision;
    this.current = row;
    this.renderQueue();
    this.controls(false);
    this.evidence = null;
    this.approvable = false;
    this.recordings = [];
    this.opened.clear();
    this.watchIndex = -1;
    this.$('[data-evidence]').replaceChildren();
    this.$('[data-note]').value = '';
    this.$('[data-note]').removeAttribute('aria-invalid');
    this.$('[data-hold]').textContent =
      row.status === 'investigating' ? 'Update hold & next' : 'Hold & next';
    this.$('[data-investigation]').hidden = row.status !== 'investigating';
    this.$('[data-investigation]').textContent =
      row.status === 'investigating'
        ? `Current investigation message: ${row.investigation_note ?? ''}`
        : '';
    this.$('.review-decision').hidden = true;
    this.$('[data-detail]').hidden = false;
    this.$('[data-solver]').textContent = solverIdentity(row);
    this.$('[data-result]').textContent = formatTime(row.ms);
    this.$('[data-metric]').textContent = row.metric;
    const date = row.submitted_at ?? row.created_at;
    this.$('[data-submitted]').textContent = date ? new Date(date).toLocaleString() : '';
    this.$('[data-check]').textContent = 'Checking evidence…';
    this.$('[data-message]').textContent = 'Loading recordings…';
    this.$('[data-progress]').textContent = '';
    try {
      const evidence = await this.rpc('review_evidence', { submission: row.id });
      if (version !== this.revision || !this.isAdmin()) return;
      if (!Array.isArray(evidence) || !evidence.length)
        throw Error('Recording evidence is unavailable.');
      this.evidence = evidence;
      const count = { single: 1, ao5: 5, ao12: 12 }[row.metric],
        window = count > 1 ? averageWindow(evidence, count) : null,
        computed = count === 1 ? (evidence[0].dnf ? Infinity : evidence[0].ms) : window?.value,
        excluded = new Set(window?.excluded ?? []);
      this.approvable =
        evidence.length === count &&
        Number.isFinite(computed) &&
        Math.abs(computed - row.ms) < 0.01;
      for (const [index, entry] of evidence.entries()) {
        const li = document.createElement('li'),
          info = document.createElement('div'),
          time = document.createElement('strong'),
          note = document.createElement('small');
        li.dataset.index = String(index);
        li.dataset.trimmed = String(excluded.has(index));
        const result = entry.dnf ? 'DNF' : formatTime(entry.ms);
        time.textContent = `${index + 1}. ${excluded.has(index) ? '(' + result + ')' : result}`;
        note.textContent = excluded.has(index) ? 'Trimmed' : '';
        info.append(time, note);
        li.append(info);
        let recording;
        try {
          if (entry.recording) {
            recording = validateRecording(entry.recording);
            const usedUndo =
                recording.usedUndo ||
                recording.events.some(
                  (e) =>
                    (e.type === 'accept' && e.action === 'undo') ||
                    (e.type === 'sound' && e.kind === 'undo'),
                ),
              usedPause = recording.usedPause || recording.events.some((e) => e.type === 'pause');
            if (recording.solver?.username && recording.solver.username !== row.username)
              throw Error('Solver identity does not match');
            if (
              recording.size !== 3 ||
              (!entry.dnf &&
                (recording.dnf ||
                  usedUndo ||
                  usedPause ||
                  !evidenceTimeMatches(recording.solveMs, entry.ms)))
            )
              throw Error('Recording result does not match');
          } else if (!entry.dnf) throw Error('Recording missing');
        } catch {
          recording = null;
          this.approvable = false;
          note.textContent = 'Invalid or missing recording';
          li.dataset.invalid = 'true';
        }
        this.recordings[index] = recording;
        if (recording) {
          const watch = document.createElement('button');
          watch.textContent = 'Watch';
          watch.setAttribute('aria-label', `Watch evidence solve ${index + 1}`);
          watch.onclick = () => this.watch(index);
          li.append(watch);
        } else if (entry.dnf && !li.dataset.invalid)
          note.textContent =
            (excluded.has(index) ? 'Trimmed · ' : '') +
            (entry.reason === 'pause'
              ? 'Paused · counts as DNF'
              : entry.reason === 'undo'
                ? 'Undo · counts as DNF'
                : entry.reason === 'abandoned'
                  ? 'Abandoned · DNF'
                  : entry.reason === 'skipped'
                    ? 'Skipped scramble · DNF'
                    : 'DNF · no replay');
        this.$('[data-evidence]').append(li);
      }
      this.$('[data-check]').textContent = this.approvable
        ? count === 1
          ? 'Single time matches its recording.'
          : `${row.metric} verified from ${count} results · ${formatTime(computed)}`
        : 'Result or recording evidence does not match. Approval is disabled.';
      this.$('[data-check]').dataset.valid = String(this.approvable);
      this.$('.review-decision').hidden = this.$('[data-body]').hidden;
      this.controls(true);
      this.updateProgress();
      this.$('[data-message]').textContent = this.approvable
        ? ''
        : 'Evidence is invalid or missing. This submission can be rejected.';
    } catch (error) {
      if (version === this.revision) {
        this.$('[data-message]').textContent = error.message;
        this.$('[data-check]').textContent = 'Evidence unavailable.';
        this.$('[data-check]').dataset.valid = 'false';
        this.$('.review-decision').hidden = this.$('[data-body]').hidden;
        this.controls(true);
      }
    }
  }
  updateProgress() {
    const total = this.recordings.filter(Boolean).length;
    this.$('[data-progress]').textContent = `${this.opened.size}/${total} opened`;
    this.$('[data-watch-next]').disabled = this.saving || this.opened.size >= total;
    this.$('[data-watch-next]').textContent = this.opened.size ? 'Watch next' : 'Watch first';
  }
  watch(index) {
    if (!this.isAdmin() || !this.recordings[index] || this.saving) return;
    this.play(this.recordings[index]);
    this.watchIndex = index;
    this.opened.add(index);
    for (const li of this.$('[data-evidence]').children) {
      const current = Number(li.dataset.index) === index;
      li.dataset.current = String(current);
      const button = li.querySelector('button');
      if (button) {
        button.textContent = this.opened.has(Number(li.dataset.index)) ? 'Watch again' : 'Watch';
        button.setAttribute('aria-current', String(current));
      }
    }
    this.updateProgress();
  }
  async decide(approve) {
    if (
      !this.isAdmin() ||
      !this.current ||
      this.saving ||
      (approve === true && (!this.evidence || !this.approvable))
    )
      return;
    const note = this.$('[data-note]').value.trim();
    if (approve !== true && note.length < 3) {
      this.$('[data-note]').setAttribute('aria-invalid', 'true');
      this.$('[data-message]').textContent =
        approve === 'hold'
          ? 'Write the investigation message to send to the solver.'
          : 'Write an explanation for the rejection.';
      this.$('[data-note]').focus();
      return;
    }
    this.$('[data-note]').removeAttribute('aria-invalid');
    const id = this.current.id,
      version = this.revision,
      index = this.filtered().findIndex((row) => row.id === id);
    this.saving = true;
    this.controls(false);
    this.renderQueue();
    this.$('[data-refresh]').disabled = true;
    this.$('[data-message]').textContent = 'Saving decision…';
    try {
      if (approve === 'hold') await this.rpc('hold_submission', { submission: id, note });
      else await this.rpc('review_submission', { submission: id, approve, note });
      document.dispatchEvent(new Event('ftoers-submission-reviewed'));
      if (version !== this.revision) return;
      this.saving = false;
      await this.loadQueue(null, index);
    } catch (error) {
      if (version === this.revision) {
        this.$('[data-message]').textContent = String(error.message).includes('hold_submission')
          ? 'Investigation holds need the pending backend update. No decision was changed.'
          : error.message;
        this.controls(true);
      }
    } finally {
      this.saving = false;
      this.$('[data-refresh]').disabled = false;
      this.renderQueue();
      if (this.evidence) this.controls(true);
    }
  }
}

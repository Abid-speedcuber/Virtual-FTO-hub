import { mountAvatarConnection } from './avatar-connection.js';
import { ConnectionGrace, isConnectionError } from './connection-grace.js';
import { mountSubmissionNotifications } from './submission-notifications.js';
import { mountOnlineNotices } from './online-notices.js';
// Network eligibility is separate from local PBs. Reloads/account/long offline gaps
// break average sequences. Only submit() sends a PB to the review queue.
export const eligibleCandidate = (row) =>
  row &&
  row.evidence_complete === true &&
  ['single', 'ao5', 'ao12'].includes(row.metric) &&
  Number.isFinite(row.ms) &&
  row.ms > 0;
export class OnlineAttempts {
  constructor({
    rpc,
    getProfile,
    online = () => navigator.onLine,
    id = () => crypto.randomUUID(),
    status = () => {},
    onCandidates = () => {},
    onConnectionChange = () => {},
    now = () => performance.now(),
    schedule = (fn, ms) => setTimeout(fn, ms),
    cancel = (id) => clearTimeout(id),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }) {
    Object.assign(this, { rpc, getProfile, online, id, status, onCandidates, now, sleep });
    this.outstanding = new Set();
    this.connection = new ConnectionGrace({
      online,
      now,
      schedule,
      cancel,
      onChange: onConnectionChange,
      onExpired: () => {
        this.invalidate();
        for (const a of this.outstanding) if (!a.finished || a.interruptedAtFinish) a.valid = false;
        this.status(
          'Connection lost for five seconds. This solve is ineligible and leaderboard averages will start a new sequence.',
        );
      },
    });
    this.sequence = id();
    this.attempt = null;
    this.queue = Promise.resolve();
    this.candidates = new Map();
    this.submitting = new Map();
    this.owner = getProfile()?.id;
    this.candidateRevision = 0;
  }
  notify() {
    this.onCandidates(
      [...this.candidates.values()].map((row) => ({ ...row, busy: this.submitting.has(row.id) })),
    );
  }
  arm(size) {
    this.attempt = {
      size,
      owner: this.getProfile()?.id,
      solver: this.getProfile()
        ? { id: this.getProfile().id, username: this.getProfile().username }
        : null,
      valid: !!this.getProfile() && this.online(),
      undo: false,
      started: false,
    };
  }
  invalidate() {
    if (this.attempt) {
      this.attempt.valid = false;
      this.outstanding.delete(this.attempt);
    }
    this.sequence = this.id();
  }
  accountChanged() {
    const owner = this.getProfile()?.id;
    if (this.attempt && this.attempt.owner !== owner) this.invalidate();
    if (owner !== this.owner) {
      this.owner = owner;
      this.candidateRevision++;
      this.candidates.clear();
      this.notify();
      this.status('');
    }
  }
  markPause() {
    const a = this.attempt;
    if (a?.started) {
      a.paused = true;
      this.status(
        'Paused solves count as DNF for the leaderboard. Your local solve and recording are kept.',
      );
    }
  }
  offline() {
    this.connection.offline();
    if (!this.connection.expired)
      this.status(
        'Connection interrupted · reconnect within five seconds. The timer is still running.',
      );
  }
  onlineAgain() {
    const interrupted = this.connection.since !== null,
      allowed = this.connection.online();
    if (interrupted && !this.attempt?.paused)
      this.status(
        allowed
          ? 'Connection restored.'
          : 'Connection restored. Leaderboard averages start with a new sequence.',
      );
  }
  async request(fn, owner) {
    if (!(await this.connection.wait())) throw Error('Connection lost for five seconds');
    for (;;) {
      if (owner !== this.getProfile()?.id) throw Error('Account changed');
      if (!this.connection.check()) throw Error('Connection lost for five seconds');
      try {
        const result = await this.connection.run(fn);
        this.connection.online();
        return result;
      } catch (error) {
        if (!isConnectionError(error)) throw error;
        this.connection.offline();
        if (!this.connection.check()) throw error;
        await this.sleep(250);
        if (!this.online() && !(await this.connection.wait()))
          throw Error('Connection lost for five seconds');
      }
    }
  }
  markUndo() {
    if (this.attempt) this.attempt.undo = true;
  }
  start() {
    const a = this.attempt;
    if (!a || a.started) return;
    const profile = this.getProfile();
    a.owner = profile?.id;
    a.solver = profile ? { id: profile.id, username: profile.username } : null;
    a.valid =
      !!profile && (this.online() || (this.connection.since !== null && this.connection.check()));
    a.started = true;
    if (a.size !== 3 || !a.valid || a.owner !== this.getProfile()?.id) {
      a.valid = false;
      return;
    }
    a.requestId = crypto.randomUUID();
    a.startedAt = this.now();
    this.outstanding.add(a);
    a.ticket = this.queue.then(() => {
      if (!a.valid || a.owner !== this.getProfile()?.id)
        throw Error('Attempt is no longer eligible');
      const session = this.sequence;
      return this.request(
        () =>
          this.rpc('begin_attempt', {
            session,
            request_id: a.requestId,
            start_delay_ms: Math.min(5000, Math.max(0, this.now() - a.startedAt)),
          }),
        a.owner,
      );
    });
    a.ticket.catch(() => {
      a.valid = false;
      this.sequence = this.id();
      if (a.owner === this.getProfile()?.id)
        this.status('Leaderboard unavailable for this attempt.');
    });
    this.queue = a.ticket.catch(() => {});
  }
  finish(recording, { localPB = false } = {}) {
    const a = this.attempt;
    this.attempt = null;
    if (a) {
      a.finished = true;
      a.interruptedAtFinish = this.connection.since !== null;
    }
    const paused = !!(a?.paused || recording?.usedPause);
    if (paused)
      this.status(
        'Paused solves count as DNF for the leaderboard. Your local solve and recording are kept.',
      );
    if (
      !paused &&
      localPB &&
      (recording?.size ?? a?.size) === 3 &&
      (a?.undo || recording?.usedUndo)
    )
      this.status(
        'Your PB solve is invalid for the leaderboard because it used undo. It counts as DNF in leaderboard averages.',
      );
    if (!a?.ticket) {
      if (recording?.size === 3 && !recording.usedUndo && !paused)
        this.status(
          !this.getProfile()
            ? 'Sign in before starting a solve to make it eligible for the leaderboard.'
            : !this.online()
              ? 'This solve was offline and cannot be submitted.'
              : 'This solve has no online start record and cannot be submitted. Start a new scramble to record an eligible solve.',
        );
      return Promise.resolve();
    }
    const valid = a.valid && a.owner === this.getProfile()?.id;
    const replay =
      valid && recording && !recording.dnf && recording.size === 3
        ? structuredClone(recording)
        : null;
    if (replay) {
      replay.solver = a.solver;
      replay.usedUndo = !!(a.undo || recording.usedUndo);
      replay.usedPause = paused;
    }
    const task = this.queue.then(async () => {
      const attempt = await a.ticket;
      if (a.owner !== this.getProfile()?.id) {
        this.sequence = this.id();
        return;
      }
      if (!(await this.connection.wait())) return;
      // Never fall back to finish_attempt: old backends auto-submit that RPC.
      const result = await this.request(
        () => this.rpc('record_online_attempt', { attempt, replay: a.valid ? replay : null }),
        a.owner,
      );
      if (a.owner !== this.getProfile()?.id) return result;
      this.candidateRevision++;
      this.candidates = new Map(
        (result.candidates ?? []).filter(eligibleCandidate).map((row) => [row.metric, row]),
      );
      this.notify();
      const invalid = result.invalid_pb || (localPB && replay?.usedUndo);
      this.status(
        paused || result.invalid_reason === 'pause'
          ? 'Paused solves count as DNF for the leaderboard. Your local solve and recording are kept.'
          : invalid
            ? 'Your PB solve is invalid for the leaderboard because it used undo. It counts as DNF in leaderboard averages.'
            : result.candidates?.length
              ? ''
              : result.dnf
                ? 'This attempt counts as DNF for the leaderboard.'
                : '',
      );
      return result;
    });
    this.queue = task
      .catch((error) => {
        this.sequence = this.id();
        if (a.owner === this.getProfile()?.id)
          this.status(
            (localPB && replay?.usedUndo
              ? 'Your PB solve is invalid for the leaderboard because it used undo. '
              : '') +
              (String(error.message).includes('record_online_attempt')
                ? 'Leaderboard submissions are unavailable until the backend update is applied. Your time is saved on this device.'
                : 'Online result could not be recorded: ' + error.message),
          );
      })
      .finally(() => this.outstanding.delete(a));
    return this.queue;
  }
  // Skipping inspection is a leaderboard-only DNF, not a local timer result.
  skip() {
    const a = this.attempt;
    if (a?.started) return Promise.resolve();
    this.attempt = null;
    const owner = this.getProfile()?.id;
    if (!a || a.started || a.size !== 3 || !owner) return Promise.resolve();
    const request_id = crypto.randomUUID();
    const task = this.queue.then(async () => {
      if (owner !== this.getProfile()?.id) {
        this.sequence = this.id();
        return;
      }
      const session = this.sequence;
      const result = await this.request(
        () => this.rpc('skip_online_scramble', { session, request_id }),
        owner,
      );
      if (owner !== this.getProfile()?.id) return;
      this.candidateRevision++;
      this.candidates = new Map(
        (result.candidates ?? []).filter(eligibleCandidate).map((row) => [row.metric, row]),
      );
      this.notify();
      this.status(
        'Skipped scramble counts as DNF in leaderboard averages. Your local times are unchanged.',
      );
    });
    this.queue = task.catch((error) => {
      this.sequence = this.id();
      if (owner === this.getProfile()?.id)
        this.status(
          'Could not record the skipped scramble. Leaderboard averages will start a new sequence.',
        );
    });
    return this.queue;
  }
  async loadCandidates() {
    const owner = this.getProfile()?.id,
      revision = ++this.candidateRevision;
    if (!owner || !this.online()) return;
    try {
      const rows = await this.rpc('my_leaderboard_candidates');
      if (revision !== this.candidateRevision || owner !== this.getProfile()?.id) return;
      this.candidates = new Map(
        (rows ?? []).filter(eligibleCandidate).map((row) => [row.metric, row]),
      );
      this.notify();
    } catch {
      /* An older backend must not trigger a legacy auto-submit fallback. */
    }
  }
  submit(id) {
    if (this.submitting.has(id)) return this.submitting.get(id);
    const candidate = [...this.candidates.values()].find((row) => row.id === id),
      owner = this.getProfile()?.id;
    if (!candidate || !owner || !this.online()) {
      this.status('Connect to the internet and sign in to submit this result.');
      return Promise.resolve();
    }
    const task = Promise.resolve()
      .then(() => this.rpc('submit_leaderboard', { submission: id }))
      .then((result) => {
        if (owner !== this.getProfile()?.id) return;
        if (this.candidates.get(candidate.metric)?.id === id)
          this.candidates.delete(candidate.metric);
        this.candidateRevision++;
        this.status(
          result.status === 'approved'
            ? 'This result is already approved.'
            : result.status === 'investigating'
              ? 'This submission is on hold for investigation. Check your notifications.'
              : `${candidate.metric === 'single' ? 'Single' : candidate.metric} submitted for administrator approval.`,
        );
      })
      .catch((error) => {
        if (owner === this.getProfile()?.id) this.status('Could not submit: ' + error.message);
      })
      .finally(() => {
        this.submitting.delete(id);
        if (owner === this.getProfile()?.id) this.notify();
      });
    this.submitting.set(id, task);
    this.notify();
    return task;
  }
}

let account = null,
  avatarConnection = null;
const sharedModule = (name) => new URL('./shared/' + name + '.js', document.baseURI).href;
export const network = new OnlineAttempts({
  rpc: (...args) => account.rpc(...args),
  onConnectionChange: (connected) => avatarConnection?.setOnline(connected),
  getProfile: () => account?.profile,
  status: (text) => {
    const host = document.getElementById('leaderboard-status');
    if (host) host.textContent = text;
  },
  onCandidates: (rows) =>
    document.dispatchEvent(new CustomEvent('ftoers-online-pbs', { detail: rows })),
});
export function currentSolver() {
  const p = account?.profile;
  return p ? { id: p.id, username: p.username } : null;
}
export async function initNetwork() {
  try {
    mountOnlineNotices(network);
    account = await import(/* @vite-ignore */ sharedModule('account'));
    account.mountAccount(document.getElementById('network-account'), {
      surface: 'simulator',
      showIdentity: true,
      onSettings: () => document.dispatchEvent(new Event('ftoers-settings')),
      onAbout: () => document.dispatchEvent(new Event('ftoers-about')),
      onReview: () => document.dispatchEvent(new Event('ftoers-review')),
    });
    avatarConnection = mountAvatarConnection(document.getElementById('network-account'));
    const notifications = mountSubmissionNotifications({
      rpc: account.rpc,
      getProfile: () => account.profile,
      onSignIn: () => account.openAccount(),
    });
    account.onAccountChange(() => {
      network.accountChanged();
      network.loadCandidates();
      notifications.refresh();
      document.dispatchEvent(new Event('ftoers-identity-change'));
    });
    const { mountLeaderboard } = await import('./leaderboard.js');
    mountLeaderboard(document.getElementById('leaderboard-dialog'), {
      rpc: account.rpc,
      configured: account.configured,
    });
    await account.ready;
    network.accountChanged();
    await Promise.all([network.loadCandidates(), notifications.refresh()]);
    window.addEventListener('offline', () => network.offline());
    window.addEventListener('online', () => network.onlineAgain());
  } catch {
    console.warn('FTOers account controls are unavailable.');
  }
}
export async function createShortLink(recording) {
  if (!account) throw Error('FTOers accounts are unavailable.');
  await account.ready;
  if (!account.profile) {
    account.openAccount();
    throw Error('Sign in and choose a username to create a temporary link.');
  }
  if (!navigator.onLine) throw Error('Connect to the internet to create a temporary link.');
  const code = await account.rpc('create_short_link', { replay: recording });
  return 'https://ftoers.web.app/virtual/#short=' + code;
}
export async function getCloudRecording(kind, value) {
  if (!account) {
    account = await import(/* @vite-ignore */ sharedModule('account'));
  }
  return kind === 'short'
    ? account.rpc('get_short_link', { code: value })
    : account.rpc('public_replay', { submission: value });
}

export const accountIsAdmin = () => !!account?.profile?.admin;
export async function networkRPC(...args) {
  if (!account) throw Error('FTOers accounts are unavailable.');
  return account.rpc(...args);
}

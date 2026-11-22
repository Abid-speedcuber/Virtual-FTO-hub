import './leaderboard.css';
const format = (ms) => {
  const c = Math.floor(ms / 10),
    s = Math.floor(c / 100);
  return `${s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : s}.${String(c % 100).padStart(2, '0')}`;
};
export function mountLeaderboard(dialog, { rpc, configured, getProfile = () => null }) {
  if (!dialog || dialog.dataset.mounted) return;
  dialog.dataset.mounted = 'true';
  const $ = (selector) => dialog.querySelector(selector);
  let revision = 0,
    kind = 'single';
  async function load() {
    const version = ++revision,
      body = $('#board-rows'),
      message = $('#board-message');
    body.replaceChildren();
    message.textContent = 'Loading leaderboard…';
    try {
      let rows;
      try {
        rows = await rpc('leaderboard_profiles', { kind });
      } catch (error) {
        // Older backends can still display rankings while the new migration awaits approval.
        if (
          !/could not find the function.*leaderboard_profiles|function.*leaderboard_profiles.*does not exist/i.test(
            error.message,
          )
        )
          throw error;
        rows = await rpc('leaderboard', { kind });
      }
      if (version !== revision) return;
      message.textContent = rows.length ? '' : 'No approved results yet.';
      rows.forEach((row, i) => {
        const tr = document.createElement('tr');
        const ownResult = !!getProfile()?.username && row.username === getProfile().username;
        if (ownResult) {
          tr.classList.add('board-current-user');
          tr.setAttribute('aria-label', 'Your leaderboard result');
        }
        for (const text of [i + 1, row.username, format(row.ms)]) {
          const td = document.createElement('td');
          td.textContent = text;
          tr.append(td);
        }
        const identity = tr.children[1];
        if (/^[0-9]{4}[A-Z]{4}[0-9]{2}$/.test(row.wca_id ?? '')) {
          const wca = document.createElement('a');
          wca.className = 'board-wca';
          wca.href = 'https://www.worldcubeassociation.org/persons/' + row.wca_id;
          wca.target = '_blank';
          wca.rel = 'noopener noreferrer';
          wca.textContent = row.wca_id + (row.wca_verified ? ' ✓' : '');
          wca.title = row.wca_verified
            ? 'Verified through WCA sign-in'
            : 'Self-reported WCA ID; account not connected';
          wca.setAttribute(
            'aria-label',
            row.wca_id + (row.wca_verified ? ', verified WCA account' : ', self-reported WCA ID'),
          );
          identity.append(' ', wca);
        }
        const td = document.createElement('td');
        if (kind === 'single' && i < 10 && row.has_replay) {
          const link = document.createElement('a');
          link.href = '#rank=' + row.id;
          link.textContent = 'Watch solve';
          link.onclick = () => dialog.close();
          td.append(link);
        } else td.textContent = '—';
        tr.append(td);
        body.append(tr);
      });
    } catch (error) {
      if (version === revision)
        message.textContent = configured
          ? 'Could not load leaderboard. ' + error.message
          : 'Leaderboard will be available when the shared backend is connected.';
    }
  }
  for (const button of dialog.querySelectorAll('[data-metric]'))
    button.onclick = () => {
      kind = button.dataset.metric;
      for (const other of dialog.querySelectorAll('[data-metric]'))
        other.setAttribute('aria-pressed', String(other === button));
      load();
    };
  new MutationObserver(() => {
    if (dialog.open) load();
  }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  document.addEventListener('ftoers-identity-change', () => {
    if (dialog.open) load();
  });
  if (dialog.open) load();
}

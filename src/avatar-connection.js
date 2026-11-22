// Device/backend connection indicator; no presence writes or polling.
export function mountAvatarConnection(host, { online = () => navigator.onLine } = {}) {
  if (!host) return { setOnline: () => {} };
  let connected = online() ? null : false;
  function render() {
    const button = host.querySelector('#ft-account-trigger');
    if (!button) return;
    let dot = button.querySelector('.avatar-connection-dot');
    if (!dot) {
      dot = document.createElement('span');
      dot.className = 'avatar-connection-dot';
      dot.id = 'avatar-connection-status';
      dot.setAttribute('role', 'img');
      button.append(dot);
      button.setAttribute('aria-describedby', dot.id);
    }
    const state = connected === true ? 'online' : 'offline',
      label =
        connected === true
          ? 'Backend: Connected'
          : connected === null
            ? 'Backend: Checking connection'
            : 'Backend: Unreachable or device offline';
    if (button.dataset.connection !== state) button.dataset.connection = state;
    if (dot.getAttribute('aria-label') !== label) {
      dot.setAttribute('aria-label', label);
      dot.title = label;
    }
  }
  const observer = new MutationObserver(render);
  observer.observe(host, { childList: true, subtree: true });
  const setOnline = (value) => {
    connected = value === null ? null : !!value;
    render();
  };
  window.addEventListener('offline', () => setOnline(false));
  window.addEventListener('online', () => setOnline(null));
  render();
  return { setOnline };
}

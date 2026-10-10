export const navigate = (path) => {
  if (location.pathname + location.search === path) return;
  history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export const resolveRoute = (path, authenticated) => {
  if (authenticated && !path.startsWith('/host')) return { view: 'redirect', to: '/host' };
  if (path.startsWith('/host')) {
    if (authenticated && (path === '/host/login' || path === '/host/register')) return { view: 'host-dashboard' };
    if (!authenticated && path === '/host/register') return { view: 'host-register' };
    if (!authenticated || path === '/host/login') return { view: 'host-login' };
    if (path.startsWith('/host/room/')) return { view: 'host-room' };
    if (/^\/host\/quiz\/[^/]+\/edit$/.test(path)) return { view: 'host-quiz-editor' };
    if (/^\/host\/quiz\/[^/]+\/preview$/.test(path)) return { view: 'host-quiz-preview' };
    return { view: 'host-dashboard' };
  }
  return { view: 'participant' };
};

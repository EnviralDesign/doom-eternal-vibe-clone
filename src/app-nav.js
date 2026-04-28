const NAV_ITEMS = [
  { label: 'Game', href: 'index.html' },
  { label: 'Inspect', href: 'index.html?inspect' },
  { label: 'Env Only', href: 'index.html?inspect&envOnly' },
  { label: 'Level Editor', href: 'level_editor.html' },
  { label: 'Runtime Assets', href: 'runtime_asset_lab.html' },
  { label: 'Textures', href: 'texture_lab.html' },
  { label: 'Weapons', href: 'weapon_lab.html' },
  { label: 'Characters', href: 'character_lab.html' }
];

function activeNavItem(pathname, search, href) {
  const target = new URL(href, location.href);
  const targetPage = target.pathname.split('/').pop() || 'index.html';
  const currentPage = pathname.split('/').pop() || 'index.html';
  if (currentPage !== targetPage) return false;
  if (targetPage !== 'index.html') return true;
  const current = new URLSearchParams(search);
  const targetParams = new URLSearchParams(target.search);
  if (!target.search) return !search;
  const wantsEnvOnly = targetParams.has('envOnly');
  const isEnvOnly = current.has('envOnly') || current.has('noPunctuals') || current.has('environmentOnly');
  if (wantsEnvOnly) return current.has('inspect') && isEnvOnly;
  if (targetParams.has('inspect')) return current.has('inspect') && !isEnvOnly;
  return search === target.search;
}

function mountAppNav() {
  if (document.querySelector('.app-nav')) return;
  const style = document.createElement('style');
  style.textContent = `
    .app-nav {
      position: fixed;
      left: 14px;
      top: 14px;
      z-index: 90;
      display: flex;
      align-items: center;
      gap: 5px;
      max-width: calc(100vw - 28px);
      overflow-x: auto;
      padding: 5px;
      background: rgba(8, 4, 3, .72);
      border: 1px solid rgba(255, 142, 72, .28);
      box-shadow: 0 18px 54px rgba(0,0,0,.36);
      backdrop-filter: blur(14px);
      pointer-events: auto;
    }
    .app-nav a {
      flex: 0 0 auto;
      min-height: 28px;
      display: inline-grid;
      place-items: center;
      padding: 0 9px;
      color: rgba(255, 237, 214, .82);
      border: 1px solid rgba(255,255,255,.10);
      background: rgba(255,255,255,.055);
      text-decoration: none;
      font: 800 11px/1 ui-sans-serif, system-ui, Segoe UI, sans-serif;
      letter-spacing: 0;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .app-nav a:hover {
      color: #140704;
      background: #ffd07a;
      border-color: rgba(255, 245, 210, .72);
    }
    .app-nav a.active {
      color: #071217;
      background: #9ce8ff;
      border-color: rgba(220, 248, 255, .9);
    }
    body.has-app-nav #pauseIndicator,
    body.has-app-nav #perfLog,
    body.has-app-nav #lightingLabPanel,
    body.has-app-nav #help {
      top: 58px;
    }
    body.has-app-nav > .panel,
    body.has-app-nav > #panel {
      top: 58px;
      max-height: calc(100vh - 72px);
    }
    body.has-app-nav #ammoStrip {
      top: 58px;
    }
    @media (max-width: 760px) {
      .app-nav { left: 8px; right: 8px; top: 8px; }
      body.has-app-nav #pauseIndicator,
      body.has-app-nav #perfLog,
      body.has-app-nav #lightingLabPanel,
      body.has-app-nav #help,
      body.has-app-nav #ammoStrip { top: 52px; }
    }
  `;
  document.head.appendChild(style);

  const nav = document.createElement('nav');
  nav.className = 'app-nav';
  nav.setAttribute('aria-label', 'Hellrush pages');
  const currentPath = location.pathname;
  const currentSearch = location.search;
  for (const item of NAV_ITEMS) {
    const link = document.createElement('a');
    link.href = item.href;
    link.textContent = item.label;
    if (activeNavItem(currentPath, currentSearch, item.href)) link.classList.add('active');
    nav.appendChild(link);
  }
  document.body.prepend(nav);
  document.body.classList.add('has-app-nav');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAppNav, { once: true });
} else {
  mountAppNav();
}

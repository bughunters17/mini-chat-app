(() => {
  const storageKey = 'mc_theme';
  const root = document.documentElement;

  function savedTheme() {
    const value = localStorage.getItem(storageKey);
    return value === 'light' ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    const nextTheme = theme === 'light' ? 'light' : 'dark';
    root.dataset.theme = nextTheme;
    localStorage.setItem(storageKey, nextTheme);
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.textContent = nextTheme === 'dark' ? 'Light' : 'Dark';
      button.setAttribute('aria-label', 'Switch to ' + (nextTheme === 'dark' ? 'light' : 'dark') + ' mode');
      button.setAttribute('aria-pressed', nextTheme === 'dark' ? 'true' : 'false');
    });
  }

  function createToggle() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-toggle';
    button.dataset.themeToggle = 'true';
    button.addEventListener('click', () => {
      applyTheme(root.dataset.theme === 'light' ? 'dark' : 'light');
    });
    return button;
  }

  function mountToggle() {
    if (document.querySelector('[data-theme-toggle]')) {
      applyTheme(root.dataset.theme || savedTheme());
      return;
    }

    const toggle = createToggle();
    const toolbarActions = document.querySelector('.toolbar-actions');
    const chatHeader = document.querySelector('.chat-header');
    const landingToolbar = document.querySelector('.window-toolbar');

    if (toolbarActions) {
      toolbarActions.prepend(toggle);
    } else if (chatHeader) {
      const closeButton = chatHeader.querySelector('.logout-btn');
      chatHeader.insertBefore(toggle, closeButton || null);
    } else if (landingToolbar) {
      landingToolbar.appendChild(toggle);
    } else {
      document.body.appendChild(toggle);
    }

    applyTheme(root.dataset.theme || savedTheme());
  }

  applyTheme(savedTheme());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountToggle);
  } else {
    mountToggle();
  }
})();

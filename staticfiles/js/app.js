/* ==========================================================================
   AURA MOBILITY CORE APPLICATION ENGINE & PWA MANAGER
   Theme Engine, PWA ServiceWorker, Installation Prompts, SPA Routing, Toasts
   ========================================================================== */

const AuraApp = {
  deferredInstallPrompt: null,

  init() {
    this.initTheme();
    this.bindEvents();
    this.initToasts();
    this.initPWA();
  },

  /* PWA Service Worker & Install Prompt Registration */
  initPWA() {
    if (localStorage.getItem('pwa-banner-dismissed') === 'true') {
      return;
    }

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then(reg => console.log('[PWA] ServiceWorker registered scope:', reg.scope))
          .catch(err => console.warn('[PWA] ServiceWorker registration failed:', err));
      });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      if (localStorage.getItem('pwa-banner-dismissed') !== 'true') {
        const pwaBanner = document.getElementById('pwa-install-banner');
        if (pwaBanner) {
          pwaBanner.style.display = 'flex';
        }
      }
    });

    window.addEventListener('appinstalled', () => {
      console.log('[PWA] Application successfully installed');
      this.deferredInstallPrompt = null;
      localStorage.setItem('pwa-banner-dismissed', 'true');
      const pwaBanner = document.getElementById('pwa-install-banner');
      if (pwaBanner) pwaBanner.style.display = 'none';
      this.showToast("App installed to home screen! 🎉", "success");
    });
  },

  dismissPWABanner() {
    localStorage.setItem('pwa-banner-dismissed', 'true');
    const pwaBanner = document.getElementById('pwa-install-banner');
    if (pwaBanner) pwaBanner.style.display = 'none';
  },

  triggerPWAInstall() {
    if (this.deferredInstallPrompt) {
      this.deferredInstallPrompt.prompt();
      this.deferredInstallPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('[PWA] User accepted installation prompt');
        }
        this.deferredInstallPrompt = null;
        localStorage.setItem('pwa-banner-dismissed', 'true');
        const pwaBanner = document.getElementById('pwa-install-banner');
        if (pwaBanner) pwaBanner.style.display = 'none';
      });
    }
  },

  /* Theme Engine (Light / Dark mode) */
  initTheme() {
    const savedTheme = localStorage.getItem('aura-theme') || 'light';
    this.setTheme(savedTheme);
  },

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('aura-theme', theme);
    if (window.AuraGraphics) {
      window.AuraGraphics.autoInjectLogos();
    }
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    this.setTheme(next);
    this.showToast(`Switched to ${next} mode`, 'info');
  },

  /* Toast Notification Manager */
  initToasts() {
    let container = document.getElementById('aura-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'aura-toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
  },

  showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('aura-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? '✓' : type === 'danger' ? '✕' : type === 'warning' ? '⚠' : 'ℹ';
    toast.innerHTML = `
      <span style="font-weight: bold; font-size: 1.1rem;">${icon}</span>
      <span style="flex: 1;">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /* Switch View Sections in SPA mode */
  switchView(viewName) {
    document.querySelectorAll('.aura-view-section').forEach(sec => {
      sec.style.display = 'none';
    });

    const target = document.getElementById(`view-${viewName}`);
    if (target) {
      target.style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.showToast(`Navigated to ${viewName.replace('-', ' ').toUpperCase()}`, 'info');
    }
  },

  bindEvents() {
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      btn.addEventListener('click', () => this.toggleTheme());
    });

    document.querySelectorAll('[data-view-target]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const target = btn.getAttribute('data-view-target');
        this.switchView(target);
      });
    });

    const pwaInstallBtn = document.getElementById('btn-pwa-install');
    if (pwaInstallBtn) {
      pwaInstallBtn.addEventListener('click', () => this.triggerPWAInstall());
    }

    const pwaDismissBtn = document.getElementById('btn-pwa-dismiss');
    if (pwaDismissBtn) {
      pwaDismissBtn.addEventListener('click', () => this.dismissPWABanner());
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  AuraApp.init();
});

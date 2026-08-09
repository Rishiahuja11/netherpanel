/* ============================================
   NetherPanel - Dashboard JavaScript
   ============================================ */

const NetherApp = {
  currentWizardStep: 1,
  maxWizardStep: 4,

  init() {
    this.initLucideIcons();
    this.initUserMenu();
    this.initMobileMenu();
    this.initNotifications();
    this.initFilters();
    this.initStatCounters();
    this.initCreateServerModal();
    this.initWizardNavigation();
    this.initSliders();
    this.initServerActions();
  },

  initLucideIcons() {
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  initUserMenu() {
    const toggle = document.getElementById('user-menu-toggle');
    const menu = document.querySelector('.user-menu');

    if (!toggle || !menu) return;

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target)) {
        menu.classList.remove('open');
      }
    });
  },

  initMobileMenu() {
    const btn = document.getElementById('mobile-menu-btn');
    const nav = document.getElementById('mobile-nav');

    if (!btn || !nav) return;

    btn.addEventListener('click', () => {
      nav.style.display = nav.style.display === 'flex' ? 'none' : 'flex';
    });
  },

  initNotifications() {
    const btn = document.getElementById('notifications-btn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      NetherApp.showToast('Notifications', 'You have 3 new notifications', 'info');
    });
  },

  initFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    const serverCards = document.querySelectorAll('.server-card');

    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const filter = btn.dataset.filter;

        serverCards.forEach(card => {
          if (filter === 'all' || card.dataset.status === filter) {
            card.style.display = '';
            card.style.animation = 'fadeInUp 0.3s ease';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });
  },

  initStatCounters() {
    const counters = document.querySelectorAll('.stat-value[data-target]');

    const animateCounter = (el) => {
      const target = parseInt(el.dataset.target);
      const suffix = el.dataset.suffix || '';
      const duration = 1500;
      const step = target / (duration / 16);
      let current = 0;

      const update = () => {
        current += step;
        if (current >= target) {
          el.textContent = target + suffix;
          return;
        }
        el.textContent = Math.floor(current) + suffix;
        requestAnimationFrame(update);
      };

      update();
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(counter => observer.observe(counter));
  },

  initCreateServerModal() {
    const openBtns = [
      document.getElementById('create-server-btn'),
      document.getElementById('create-server-btn-2')
    ];
    const modal = document.getElementById('create-server-modal');
    const closeBtn = document.getElementById('close-modal');

    openBtns.forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => {
          modal.classList.add('active');
          document.body.style.overflow = 'hidden';
        });
      }
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
          document.body.style.overflow = '';
        }
      });
    }
  },

  initWizardNavigation() {
    const prevBtn = document.getElementById('wizard-prev');
    const nextBtn = document.getElementById('wizard-next');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (NetherApp.currentWizardStep > 1) {
          NetherApp.setWizardStep(NetherApp.currentWizardStep - 1);
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (NetherApp.currentWizardStep < NetherApp.maxWizardStep) {
          NetherApp.setWizardStep(NetherApp.currentWizardStep + 1);
        } else {
          NetherApp.createServer();
        }
      });
    }
  },

  setWizardStep(step) {
    this.currentWizardStep = step;

    document.querySelectorAll('.wizard-step').forEach(s => {
      const sStep = parseInt(s.dataset.step);
      s.classList.remove('active', 'completed');
      if (sStep === step) s.classList.add('active');
      if (sStep < step) s.classList.add('completed');
    });

    document.querySelectorAll('.wizard-panel').forEach(p => {
      p.classList.remove('active');
      if (parseInt(p.dataset.panel) === step) p.classList.add('active');
    });

    const prevBtn = document.getElementById('wizard-prev');
    const nextBtn = document.getElementById('wizard-next');

    if (prevBtn) {
      prevBtn.style.display = step === 1 ? 'none' : 'inline-flex';
    }

    if (nextBtn) {
      if (step === this.maxWizardStep) {
        nextBtn.innerHTML = '<i data-lucide="check"></i> Create Server';
        nextBtn.classList.add('btn-primary');
      } else {
        nextBtn.innerHTML = 'Next Step <i data-lucide="arrow-right"></i>';
      }
      lucide.createIcons();
    }

    this.updateReview();
  },

  updateReview() {
    const name = document.getElementById('server-name')?.value || 'My Server';
    const software = document.querySelector('input[name="software"]:checked')?.value || 'paper';
    const version = document.getElementById('server-version')?.value || '1.21.4';
    const cpu = document.getElementById('server-cpu')?.value || '2';
    const ram = document.getElementById('server-ram')?.value || '4';
    const disk = document.getElementById('server-disk')?.value || '20';
    const location = document.getElementById('server-location');
    const locationText = location?.options[location.selectedIndex]?.text || 'US East';

    const softwareNames = {
      paper: 'Paper', spigot: 'Spigot', purpur: 'Purpur',
      fabric: 'Fabric', forge: 'Forge', vanilla: 'Vanilla'
    };

    const el = (id) => document.getElementById(id);
    if (el('review-name')) el('review-name').textContent = name;
    if (el('review-software')) el('review-software').textContent = softwareNames[software] || software;
    if (el('review-version')) el('review-version').textContent = version;
    if (el('review-cpu')) el('review-cpu').textContent = `${cpu} cores`;
    if (el('review-ram')) el('review-ram').textContent = `${ram} GB`;
    if (el('review-disk')) el('review-disk').textContent = `${disk} GB`;
    if (el('review-location')) el('review-location').textContent = locationText;
  },

  initSliders() {
    const sliders = {
      'server-cpu': { display: 'cpu-value', suffix: ' cores' },
      'server-ram': { display: 'ram-value', suffix: ' GB' },
      'server-disk': { display: 'disk-value', suffix: ' GB' }
    };

    Object.entries(sliders).forEach(([id, config]) => {
      const slider = document.getElementById(id);
      const display = document.getElementById(config.display);

      if (slider && display) {
        slider.addEventListener('input', () => {
          display.textContent = slider.value + config.suffix;
        });
      }
    });
  },

  createServer() {
    const modal = document.getElementById('create-server-modal');
    const name = document.getElementById('server-name')?.value || 'My Server';

    NetherApp.showToast('Creating Server', `Setting up "${name}"...`, 'info');

    setTimeout(() => {
      modal.classList.remove('active');
      document.body.style.overflow = '';
      NetherApp.showToast('Server Created', `"${name}" has been created successfully!`, 'success');

      NetherApp.currentWizardStep = 1;
      NetherApp.setWizardStep(1);
    }, 2000);
  },

  initServerActions() {
    document.querySelectorAll('.action-btn-sm').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const title = btn.title;
        const card = btn.closest('.server-card');
        const name = card?.querySelector('.server-name')?.textContent || 'Server';

        if (title === 'Restart') {
          NetherApp.showToast('Restarting', `Restarting ${name}...`, 'info');
        } else if (title === 'Stop') {
          NetherApp.showToast('Stopping', `Stopping ${name}...`, 'warning');
        } else if (title === 'Start') {
          NetherApp.showToast('Starting', `Starting ${name}...`, 'success');
        } else if (title === 'Delete') {
          NetherApp.showToast('Delete', `Delete request for ${name}`, 'error');
        }
      });
    });
  },

  showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
      success: 'check-circle',
      error: 'alert-circle',
      warning: 'alert-triangle',
      info: 'info'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i data-lucide="${icons[type]}" class="toast-icon"></i>
      <div class="toast-message">
        <div class="toast-title">${title}</div>
        <div class="toast-desc">${message}</div>
      </div>
      <button class="toast-close" onclick="this.parentElement.classList.add('leaving'); setTimeout(() => this.parentElement.remove(), 300);">
        <i data-lucide="x"></i>
      </button>
    `;

    container.appendChild(toast);
    lucide.createIcons({ nodes: [toast] });

    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), 300);
      }
    }, 5000);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  NetherApp.init();
});

/* ============================================
   NetherPanel - Dashboard JavaScript
   ============================================ */

const NetherApp = {
  currentWizardStep: 1,
  maxWizardStep: 4,
  selectedGameType: 'java',
  authToken: localStorage.getItem('netherpanel_token') || null,

  JAVA_SOFTWARE: {
    paper: { name: 'Paper', desc: 'High performance, plugin support' },
    spigot: { name: 'Spigot', desc: 'Modified server with plugin API' },
    purpur: { name: 'Purpur', desc: 'Enhanced Paper with extra features' },
    fabric: { name: 'Fabric', desc: 'Lightweight mod loader' },
    forge: { name: 'Forge', desc: 'Classic modding platform' },
    vanilla: { name: 'Vanilla', desc: 'Official Minecraft server' }
  },

  BEDROCK_SOFTWARE: {
    pocketmine: { name: 'PocketMine-MP', desc: 'PHP-based Bedrock server software' },
    nukkit: { name: 'Nukkit', desc: 'Java-based Bedrock server software' },
    bedrock: { name: 'Bedrock Server', desc: 'Official Bedrock Dedicated Server' }
  },

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
    this.initGameTypeSelector();
    this.loadUserServers();
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

    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const filter = btn.dataset.filter;
        const serverCards = document.querySelectorAll('.server-card');

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

  initGameTypeSelector() {
    const gameTypeInputs = document.querySelectorAll('input[name="game-type"]');
    gameTypeInputs.forEach(input => {
      input.addEventListener('change', () => {
        NetherApp.selectedGameType = input.value;
        NetherApp.updateSoftwareOptions();
        NetherApp.updatePort();
      });
    });
  },

  updateSoftwareOptions() {
    const grid = document.getElementById('software-grid');
    if (!grid) return;

    const software = this.selectedGameType === 'bedrock' ? this.BEDROCK_SOFTWARE : this.JAVA_SOFTWARE;
    const entries = Object.entries(software);

    grid.innerHTML = entries.map(([key, val], i) => `
      <label class="software-option">
        <input type="radio" name="software" value="${key}" ${i === 0 ? 'checked' : ''}>
        <div class="software-card">
          <div class="software-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <strong>${val.name}</strong>
          <span>${val.desc}</span>
        </div>
      </label>
    `).join('');

    this.updateVersionOptions();
    lucide.createIcons();
  },

  updateVersionOptions() {
    const select = document.getElementById('server-version');
    if (!select) return;

    const versions = this.selectedGameType === 'bedrock'
      ? ['1.21.50', '1.21.40', '1.21.30', '1.21.0', '1.20.80', '1.20.70']
      : ['1.21.4', '1.21.3', '1.21.2', '1.21.1', '1.20.4', '1.20.1'];

    select.innerHTML = versions.map(v => `<option value="${v}">${v}</option>`).join('');
  },

  updatePort() {
    const portInput = document.getElementById('server-port');
    const hint = document.getElementById('port-hint');
    if (portInput) {
      portInput.value = this.selectedGameType === 'bedrock' ? 19132 : 25565;
    }
    if (hint) {
      hint.textContent = this.selectedGameType === 'bedrock'
        ? 'Default port for Bedrock Edition'
        : 'Default port for Java Edition';
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
    const ramMin = document.getElementById('server-ram-min')?.value || '1024';
    const ramMax = document.getElementById('server-ram-max')?.value || '2048';
    const port = document.getElementById('server-port')?.value || '25565';

    const allSoftware = { ...this.JAVA_SOFTWARE, ...this.BEDROCK_SOFTWARE };
    const gameLabel = this.selectedGameType === 'bedrock' ? 'Bedrock Edition' : 'Java Edition';
    const softwareName = allSoftware[software]?.name || software;

    const el = (id) => document.getElementById(id);
    if (el('review-name')) el('review-name').textContent = name;
    if (el('review-game')) el('review-game').textContent = gameLabel;
    if (el('review-software')) el('review-software').textContent = softwareName;
    if (el('review-version')) el('review-version').textContent = version;
    if (el('review-ram')) el('review-ram').textContent = `${ramMin}-${ramMax} MB`;
    if (el('review-port')) el('review-port').textContent = port;
  },

  initSliders() {
    const sliders = {
      'server-ram-min': { display: 'ram-min-value', suffix: ' MB' },
      'server-ram-max': { display: 'ram-max-value', suffix: ' MB' }
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

  async createServer() {
    const modal = document.getElementById('create-server-modal');
    const name = document.getElementById('server-name')?.value || 'My Server';
    const software = document.querySelector('input[name="software"]:checked')?.value || 'paper';
    const version = document.getElementById('server-version')?.value || '1.21.4';
    const ramMin = parseInt(document.getElementById('server-ram-min')?.value || '1024');
    const ramMax = parseInt(document.getElementById('server-ram-max')?.value || '2048');
    const port = parseInt(document.getElementById('server-port')?.value || '25565');

    NetherApp.showToast('Creating Server', `Setting up "${name}"...`, 'info');

    try {
      const res = await fetch('/api/servers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({
          name,
          version,
          server_type: software,
          game_type: this.selectedGameType,
          port,
          ram_min: ramMin,
          ram_max: ramMax
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create server');
      }

      modal.classList.remove('active');
      document.body.style.overflow = '';
      NetherApp.showToast('Server Created', `"${name}" has been created successfully!`, 'success');

      NetherApp.currentWizardStep = 1;
      NetherApp.setWizardStep(1);
      NetherApp.loadUserServers();
    } catch (err) {
      NetherApp.showToast('Error', err.message, 'error');
    }
  },

  async loadUserServers() {
    try {
      const res = await fetch('/api/servers', {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });

      if (!res.ok) return;

      const servers = await res.json();
      const grid = document.getElementById('servers-grid');
      if (!grid || !servers.length) return;

      grid.innerHTML = servers.map(server => `
        <div class="server-card" data-status="${server.status}" onclick="window.location.href='server.html?id=${server.id}'">
          <div class="server-card-header">
            <div class="server-info">
              <h3 class="server-name">${server.name}</h3>
              <span class="server-version">${server.server_type} ${server.version}</span>
            </div>
            <div class="server-status ${server.status}">
              <span class="status-dot"></span>
              <span>${server.status}</span>
            </div>
          </div>
          <div class="server-card-body">
            <div class="server-metrics">
              <div class="metric">
                <i data-lucide="cpu"></i>
                <div class="metric-bar">
                  <div class="metric-fill" style="width: 0%" data-color="orange"></div>
                </div>
                <span class="metric-value">0%</span>
              </div>
              <div class="metric">
                <i data-lucide="hard-drive"></i>
                <div class="metric-bar">
                  <div class="metric-fill" style="width: 0%" data-color="cyan"></div>
                </div>
                <span class="metric-value">0 GB</span>
              </div>
            </div>
            <div class="server-players">
              <i data-lucide="users"></i>
              <span><strong>0</strong> / 20 players</span>
            </div>
          </div>
          <div class="server-card-footer">
            <span class="server-ip">localhost:${server.port}</span>
            <div class="server-actions">
              <button class="action-btn-sm" title="Start" onclick="event.stopPropagation(); NetherApp.serverAction(${server.id}, 'start')">
                <i data-lucide="play"></i>
              </button>
              <button class="action-btn-sm danger" title="Delete" onclick="event.stopPropagation(); NetherApp.serverAction(${server.id}, 'delete')">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </div>
        </div>
      `).join('');

      lucide.createIcons();
    } catch (err) {
      console.error('Failed to load servers:', err);
    }
  },

  async serverAction(id, action) {
    if (action === 'delete') {
      if (!confirm('Are you sure you want to delete this server?')) return;
    }

    try {
      const res = await fetch(`/api/servers/${id}/${action}`, {
        method: action === 'delete' ? 'DELETE' : 'POST',
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });

      if (res.ok) {
        NetherApp.showToast('Success', `Server ${action} completed`, 'success');
        NetherApp.loadUserServers();
      }
    } catch (err) {
      NetherApp.showToast('Error', err.message, 'error');
    }
  },

  initServerActions() {
    document.querySelectorAll('.action-btn-sm').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
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

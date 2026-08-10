const NetherApp = {
  currentWizardStep: 1,
  maxWizardStep: 4,
  selectedGameType: 'java',
  servers: [],

  JAVA_SOFTWARE: {
    paper: { name: 'Paper', desc: 'High performance, plugin support' },
    folia: { name: 'Folia', desc: 'Multithreaded regions for Paper' },
    spigot: { name: 'Spigot', desc: 'Modified server with plugin API' },
    purpur: { name: 'Purpur', desc: 'Enhanced Paper with extra features' },
    fabric: { name: 'Fabric', desc: 'Lightweight mod loader' },
    forge: { name: 'Forge', desc: 'Classic modding platform' },
    neoforge: { name: 'NeoForge', desc: 'Modern Forge fork, active dev' },
    quilt: { name: 'Quilt', desc: 'Fabric fork with extra features' },
    vanilla: { name: 'Vanilla', desc: 'Official Minecraft server' }
  },
  BEDROCK_SOFTWARE: {
    bedrock: { name: 'Bedrock Server', desc: 'Official Bedrock Dedicated Server' },
    pocketmine: { name: 'PocketMine-MP', desc: 'PHP-based Bedrock with plugins' },
    nukkit: { name: 'Nukkit', desc: 'Java-based Bedrock server software' },
    powernukkit: { name: 'PowerNukkit', desc: 'Enhanced Nukkit with extra features' }
  },

  init() {
    this.token = localStorage.getItem('token');
    this.authToken = this.token;
    this.user = JSON.parse(localStorage.getItem('user') || 'null');

    if (!this.token || !this.user) {
      window.location.href = 'login.html';
      return;
    }

    this.updateUserUI();
    this.initLucideIcons();
    this.initUserMenu();
    this.initCreateServerModal();
    this.initWizardNavigation();
    this.initGameTypeSelector();
    this.initLogout();
    this.updateSoftwareOptions();
    this.loadServers();
  },

  api(method, url, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` }
    };
    if (body) opts.body = JSON.stringify(body);
    return fetch(url, opts).then(async r => {
      if (r.status === 401 || r.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
        return;
      }
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Request failed');
      return data;
    });
  },

  updateUserUI() {
    const name = this.user?.username || 'User';
    const initials = name.substring(0, 2).toUpperCase();
    document.getElementById('page-title').textContent = `Welcome, ${name}`;
    document.getElementById('user-display-name').textContent = name;
    document.getElementById('user-avatar').textContent = initials;
    document.getElementById('user-avatar-lg').textContent = initials;
    document.getElementById('dropdown-user-name').textContent = name;
    document.getElementById('dropdown-user-email').textContent = this.user?.email || '-';
  },

  initLucideIcons() { if (typeof lucide !== 'undefined') lucide.createIcons(); },

  initUserMenu() {
    const toggle = document.getElementById('user-menu-toggle');
    const menu = document.querySelector('.user-menu');
    if (!toggle || !menu) return;
    toggle.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('open'); });
    document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.classList.remove('open'); });
  },

  initLogout() {
    document.getElementById('btn-logout')?.addEventListener('click', e => {
      e.preventDefault();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = 'login.html';
    });
  },

  initCreateServerModal() {
    const modal = document.getElementById('create-server-modal');
    document.getElementById('create-server-btn')?.addEventListener('click', () => {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
    document.getElementById('close-modal')?.addEventListener('click', () => {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    });
    modal?.addEventListener('click', e => {
      if (e.target === modal) { modal.classList.remove('active'); document.body.style.overflow = ''; }
    });
  },

  initGameTypeSelector() {
    document.querySelectorAll('input[name="game-type"]').forEach(input => {
      input.addEventListener('change', () => {
        this.selectedGameType = input.value;
        this.updateSoftwareOptions();
        this.updatePort();
      });
    });
  },

  updateSoftwareOptions() {
    const grid = document.getElementById('software-grid');
    if (!grid) return;
    const sw = this.selectedGameType === 'bedrock' ? this.BEDROCK_SOFTWARE : this.JAVA_SOFTWARE;
    grid.innerHTML = Object.entries(sw).map(([key, val], i) => `
      <label class="software-option">
        <input type="radio" name="software" value="${key}" ${i === 0 ? 'checked' : ''}>
        <div class="software-card">
          <div class="software-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg></div>
          <strong>${val.name}</strong>
          <span>${val.desc}</span>
        </div>
      </label>
    `).join('');
    grid.querySelectorAll('input[name="software"]').forEach(input => {
      input.addEventListener('change', () => {
        this.selectedSoftware = input.value;
        this.updateVersionOptions();
      });
    });
    this.selectedSoftware = Object.keys(sw)[0];
    this.updateVersionOptions();
    this.initLucideIcons();
  },

  async updateVersionOptions() {
    const sel = document.getElementById('server-version');
    if (!sel) return;
    sel.innerHTML = '<option value="">Loading versions...</option>';
    try {
      const software = this.selectedSoftware || 'paper';
      const res = await fetch(`/api/servers/versions?software=${software}`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
        return;
      }
      const versions = await res.json();
      if (Array.isArray(versions) && versions.length > 0) {
        sel.innerHTML = versions.map(x => `<option value="${x}">${x}</option>`).join('');
      } else {
        sel.innerHTML = '<option value="">No versions available</option>';
      }
    } catch (err) {
      console.error('Failed to fetch versions:', err);
      sel.innerHTML = '<option value="">Failed to load versions</option>';
    }
  },

  updatePort() {
    const port = document.getElementById('server-port');
    const hint = document.getElementById('port-hint');
    if (port) port.value = this.selectedGameType === 'bedrock' ? 19132 : 25565;
    if (hint) hint.textContent = this.selectedGameType === 'bedrock' ? 'Default Bedrock port' : 'Default Java port';
  },

  initWizardNavigation() {
    document.getElementById('wizard-prev')?.addEventListener('click', () => {
      if (this.currentWizardStep > 1) this.setWizardStep(this.currentWizardStep - 1);
    });
    document.getElementById('wizard-next')?.addEventListener('click', () => {
      if (this.currentWizardStep < this.maxWizardStep) {
        this.setWizardStep(this.currentWizardStep + 1);
      } else {
        this.createServer();
      }
    });
  },

  setWizardStep(step) {
    this.currentWizardStep = step;
    document.querySelectorAll('.wizard-step').forEach(s => {
      const n = parseInt(s.dataset.step);
      s.classList.remove('active', 'completed');
      if (n === step) s.classList.add('active');
      if (n < step) s.classList.add('completed');
    });
    document.querySelectorAll('.wizard-panel').forEach(p => {
      p.classList.remove('active');
      if (parseInt(p.dataset.panel) === step) p.classList.add('active');
    });
    document.getElementById('wizard-prev').style.display = step === 1 ? 'none' : 'inline-flex';
    const next = document.getElementById('wizard-next');
    if (step === this.maxWizardStep) {
      next.innerHTML = '<i data-lucide="check"></i> Create Server';
    } else {
      next.innerHTML = 'Next Step <i data-lucide="arrow-right"></i>';
    }
    this.initLucideIcons();
    this.updateReview();
  },

  updateReview() {
    const name = document.getElementById('server-name')?.value || 'My Server';
    const sw = document.querySelector('input[name="software"]:checked')?.value || 'paper';
    const ver = document.getElementById('server-version')?.value || '1.21.4';
    const ramMin = document.getElementById('server-ram-min')?.value || '1024';
    const ramMax = document.getElementById('server-ram-max')?.value || '2048';
    const port = document.getElementById('server-port')?.value || '25565';
    const sub = document.getElementById('server-subdomain')?.value;
    const allSw = { ...this.JAVA_SOFTWARE, ...this.BEDROCK_SOFTWARE };
    const addr = sub
      ? (port === '25565' || port === '19132'
        ? `${sub}.smp45.qzz.io`
        : `${sub}.smp45.qzz.io:${port}`)
      : `your-ip:${port}`;

    document.getElementById('review-name').textContent = name;
    document.getElementById('review-game').textContent = this.selectedGameType === 'bedrock' ? 'Bedrock' : 'Java';
    document.getElementById('review-software').textContent = allSw[sw]?.name || sw;
    document.getElementById('review-version').textContent = ver;
    document.getElementById('review-ram').textContent = `${ramMin}-${ramMax} MB`;
    document.getElementById('review-port').textContent = port;
    document.getElementById('review-address').textContent = addr;
  },

  async createServer() {
    const name = document.getElementById('server-name')?.value?.trim();
    const software = document.querySelector('input[name="software"]:checked')?.value;
    const version = document.getElementById('server-version')?.value;
    const ramMin = parseInt(document.getElementById('server-ram-min')?.value || '1024');
    const ramMax = parseInt(document.getElementById('server-ram-max')?.value || '2048');
    const port = parseInt(document.getElementById('server-port')?.value || '25565');
    const subdomain = document.getElementById('server-subdomain')?.value?.trim();

    if (!name) return this.showToast('Error', 'Server name is required', 'error');

    try {
      this.showToast('Creating', `Setting up "${name}"...`, 'info');
      const server = await this.api('POST', '/api/servers', {
        name, version, server_type: software,
        game_type: this.selectedGameType, port,
        ram_min: ramMin, ram_max: ramMax, subdomain
      });
      document.getElementById('create-server-modal').classList.remove('active');
      document.body.style.overflow = '';
      this.showToast('Created', `"${name}" created successfully!`, 'success');
      this.currentWizardStep = 1;
      this.setWizardStep(1);
      this.loadServers();
    } catch (err) {
      this.showToast('Error', err.message, 'error');
    }
  },

  async loadServers() {
    try {
      this.servers = await this.api('GET', '/api/servers');
      this.renderServers();
    } catch (err) {
      console.error('Failed to load servers:', err);
    }
  },

  renderServers() {
    const grid = document.getElementById('servers-grid');
    const empty = document.getElementById('empty-state');
    document.getElementById('stat-total').textContent = this.servers.length;
    document.getElementById('stat-running').textContent = this.servers.filter(s => s.status === 'running').length;
    document.getElementById('stat-stopped').textContent = this.servers.filter(s => s.status !== 'running').length;

    if (!this.servers.length) {
      grid.innerHTML = '';
      grid.appendChild(empty || this.createEmptyState());
      this.initLucideIcons();
      return;
    }

    grid.innerHTML = this.servers.map(s => {
      const isRunning = s.status === 'running';
      const addr = s.subdomain
        ? (s.port === 25565 || s.port === 19132
          ? `${s.subdomain}.smp45.qzz.io`
          : `${s.subdomain}.smp45.qzz.io:${s.port}`)
        : `localhost:${s.port}`;
      return `
      <div class="server-card" data-status="${s.status}">
        <div class="server-card-header">
          <div class="server-info">
            <h3 class="server-name">${s.name}</h3>
            <span class="server-version">${s.server_type} ${s.version}</span>
          </div>
          <div class="server-status ${s.status}">
            <span class="status-dot"></span>
            <span>${s.status}</span>
          </div>
        </div>
        <div class="server-card-body">
          <div class="server-players">
            <i data-lucide="globe"></i>
            <span>${addr}</span>
          </div>
        </div>
        <div class="server-card-footer">
          <div class="server-actions">
            ${isRunning
              ? `<button class="action-btn-sm" title="Stop" onclick="NetherApp.serverAction(${s.id}, 'stop')"><i data-lucide="square"></i></button>
                 <button class="action-btn-sm" title="Restart" onclick="NetherApp.serverAction(${s.id}, 'restart')"><i data-lucide="refresh-cw"></i></button>`
              : `<button class="action-btn-sm" title="Start" onclick="NetherApp.serverAction(${s.id}, 'start')"><i data-lucide="play"></i></button>`}
            <button class="action-btn-sm danger" title="Delete" onclick="NetherApp.deleteServer(${s.id}, '${s.name.replace(/'/g, "\\'")}')"><i data-lucide="trash-2"></i></button>
            <a href="server.html?id=${s.id}" class="action-btn-sm" title="Manage"><i data-lucide="settings"></i></a>
          </div>
        </div>
      </div>`;
    }).join('');
    this.initLucideIcons();
  },

  createEmptyState() {
    const div = document.createElement('div');
    div.className = 'empty-state';
    div.id = 'empty-state';
    div.innerHTML = '<i data-lucide="server" style="width:48px;height:48px;opacity:0.3;"></i><p>No servers yet</p><span>Create your first server to get started</span>';
    return div;
  },

  async serverAction(id, action) {
    try {
      this.showToast('Working', `${action}ing server...`, 'info');
      await this.api('POST', `/api/servers/${id}/${action}`);
      this.showToast('Done', `Server ${action} completed`, 'success');
      setTimeout(() => this.loadServers(), 1000);
    } catch (err) {
      this.showToast('Error', err.message, 'error');
    }
  },

  async deleteServer(id, name) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await this.api('DELETE', `/api/servers/${id}`);
      this.showToast('Deleted', `"${name}" deleted`, 'success');
      this.loadServers();
    } catch (err) {
      this.showToast('Error', err.message, 'error');
    }
  },

  showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: 'check-circle', error: 'alert-circle', warning: 'alert-triangle', info: 'info' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i data-lucide="${icons[type]}" class="toast-icon"></i>
      <div class="toast-message"><div class="toast-title">${title}</div><div class="toast-desc">${message}</div></div>
      <button class="toast-close" onclick="this.parentElement.remove()"><i data-lucide="x"></i></button>`;
    container.appendChild(toast);
    lucide.createIcons({ nodes: [toast] });
    setTimeout(() => toast.remove(), 5000);
  }
};

document.addEventListener('DOMContentLoaded', () => NetherApp.init());

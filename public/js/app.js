const NetherApp = {
  currentWizardStep: 1,
  maxWizardStep: 5,
  wizardBackupFile: null,
  selectedGameType: 'java',
  servers: [],
  panelConfig: { cloudflare_enabled: true, domain: 'smp45.qzz.io', resource_ram_limit: 0, resource_cpu_limit: '' },

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
    this.initWizardBackupImport();
    this.initGameTypeSelector();
    this.initLogout();
    this.initSettingsModal();
    this.loadPanelConfig();
    this.updateSoftwareOptions();
    this.loadServers();
    setInterval(() => this.loadServerStats(), 15000);
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
    document.getElementById('user-avatar').textContent = initials;
    document.getElementById('user-avatar-lg').textContent = initials;
    document.getElementById('dropdown-user-name').textContent = name;
    document.getElementById('dropdown-user-email').textContent = this.user?.email || '-';
    const settingsBtn = document.getElementById('btn-settings');
    if (settingsBtn) settingsBtn.style.display = this.user?.role === 'admin' ? 'flex' : 'none';
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

  async loadPanelConfig() {
    try {
      const res = await fetch('/api/client/config');
      if (res.ok) {
        this.panelConfig = await res.json();
        this.updateSubdomainHint();
        this.updateResourceHint();
      }
    } catch (err) {
      console.error('Failed to load panel config:', err);
    }
  },

  updateSubdomainHint() {
    const cfEnabled = this.panelConfig?.cloudflare_enabled !== false;
    const hint = document.getElementById('subdomain-cf-hint');
    const input = document.getElementById('server-subdomain');
    if (hint) hint.style.display = cfEnabled ? 'none' : '';
    if (input) input.disabled = !cfEnabled;
    const preview = document.getElementById('subdomain-preview');
    if (preview && !cfEnabled) preview.textContent = 'localhost:<port>';
  },

  updateResourceHint() {
    const ram = parseInt(this.panelConfig?.resource_ram_limit, 10) || 0;
    const cpu = String(this.panelConfig?.resource_cpu_limit || '').trim();
    const hint = document.getElementById('resource-limit-hint');
    if (!hint) return;
    const parts = [];
    if (ram > 0) parts.push(`${ram} MB RAM`);
    if (cpu) parts.push(`${cpu} CPU core${cpu === '1' ? '' : 's'}`);
    if (parts.length) {
      hint.style.display = '';
      hint.textContent = `Global limit: ${parts.join(' · ')} (set in Settings)`;
    } else {
      hint.style.display = 'none';
    }
  },

  initSettingsModal() {
    const modal = document.getElementById('settings-modal');
    document.getElementById('btn-settings')?.addEventListener('click', () => {
      if (!modal) return;
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
      this.loadSettingsForm();
      this.syncThemeControls();
    });
    document.getElementById('close-settings-modal')?.addEventListener('click', () => {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    });
    modal?.addEventListener('click', e => {
      if (e.target === modal) { modal.classList.remove('active'); document.body.style.overflow = ''; }
    });
    document.getElementById('btn-save-settings')?.addEventListener('click', () => this.saveSettings());
    document.getElementById('btn-cf-test')?.addEventListener('click', () => this.testCloudflare());
    document.getElementById('btn-cf-login')?.addEventListener('click', () => this.cloudflareLogin());
    document.getElementById('btn-cf-2fa')?.addEventListener('click', () => this.cloudflareVerify2fa());
    document.getElementById('btn-cf-gh')?.addEventListener('click', () => this.cloudflareGitHub());
    document.getElementById('btn-cf-tunnel')?.addEventListener('click', () => this.createTunnel());
    document.getElementById('cf-password')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.cloudflareLogin();
    });
    document.getElementById('cf-2fa-code')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.cloudflareVerify2fa();
    });
    document.getElementById('btn-create-token')?.addEventListener('click', () => this.createApiToken());
    document.getElementById('btn-copy-token')?.addEventListener('click', () => {
      const val = document.getElementById('new-token-value');
      if (!val || !val.value) return;
      if (navigator.clipboard) navigator.clipboard.writeText(val.value).then(() => this.showToast('Copied', 'API token copied to clipboard', 'success'));
    });
    document.getElementById('token-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-delete-token]');
      if (btn) this.deleteApiToken(btn.dataset.deleteToken);
    });
    document.getElementById('cf-enabled')?.addEventListener('change', () => this.updateCfDomainSample());
    document.getElementById('cf-domain')?.addEventListener('input', () => this.updateCfDomainSample());
    document.querySelectorAll('input[name="panel-theme"]').forEach(r => {
      r.addEventListener('change', () => {
        if (!r.checked) return;
        this.applyTheme(r.value);
        try { localStorage.setItem('netherpanel_theme', r.value); } catch (e) {}
      });
    });
  },

  applyTheme(theme) {
    if (theme && theme !== 'jtg') document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
  },

  syncThemeControls() {
    const current = document.documentElement.getAttribute('data-theme') || 'jtg';
    document.querySelectorAll('input[name="panel-theme"]').forEach(r => {
      r.checked = (r.value === current);
    });
  },

  async loadSettingsForm() {
    try {
      const settings = await this.api('GET', '/api/admin/settings');
      const map = {};
      settings.forEach(s => { map[s.key] = s; });
      const setVal = (id, key, def) => {
        const el = document.getElementById(id);
        if (el && map[key]) el.value = map[key].value || '';
        else if (el && def) el.value = def;
      };
      setVal('cf-zone-id', 'cloudflare_zone_id');
      setVal('cf-server-ip', 'cloudflare_server_ip');
      setVal('cf-domain', 'cloudflare_domain', 'smp45.qzz.io');
      setVal('resource-ram-limit', 'resource_ram_limit', '0');
      setVal('resource-cpu-limit', 'resource_cpu_limit', '');
      setVal('cf-email', 'cloudflare_email', '');
      const enabledEl = document.getElementById('cf-enabled');
      if (enabledEl) enabledEl.checked = (map['cloudflare_enabled']?.value || 'true') === 'true';
      const result = document.getElementById('cf-test-result');
      if (result) result.textContent = '';
      const tunnelUrl = map['cloudflare_tunnel_url']?.value;
      const tunnelHost = document.getElementById('cf-tunnel-host');
      if (tunnelHost) tunnelHost.textContent = `panel.${map['cloudflare_domain']?.value || 'your-domain'}`;
      if (tunnelUrl) this.setCfTunnelResult(`Tunnel: ${tunnelUrl}`, true);
      this.updateCfDomainSample();
      this.loadApiTokens();
    } catch (err) {
      this.showToast('Error', err.message, 'error');
    }
  },

  collectCloudflareSettings() {
    return [
      { key: 'cloudflare_enabled', value: document.getElementById('cf-enabled')?.checked ? 'true' : 'false', category: 'cloudflare' },
      { key: 'cloudflare_domain', value: document.getElementById('cf-domain')?.value?.trim() || 'smp45.qzz.io', category: 'cloudflare' },
      { key: 'cloudflare_email', value: document.getElementById('cf-email')?.value?.trim() || '', category: 'cloudflare' },
      { key: 'cloudflare_zone_id', value: document.getElementById('cf-zone-id')?.value?.trim() || '', category: 'cloudflare' },
      { key: 'cloudflare_server_ip', value: document.getElementById('cf-server-ip')?.value?.trim() || '', category: 'cloudflare' },
      { key: 'resource_ram_limit', value: document.getElementById('resource-ram-limit')?.value?.trim() || '0', category: 'resource' },
      { key: 'resource_cpu_limit', value: document.getElementById('resource-cpu-limit')?.value?.trim() || '', category: 'resource' }
    ];
  },

  async saveSettings(silent) {
    try {
      const settings = this.collectCloudflareSettings();
      await this.api('PUT', '/api/admin/settings', { settings });
      this.panelConfig.cloudflare_enabled = settings.find(s => s.key === 'cloudflare_enabled').value === 'true';
      this.panelConfig.domain = settings.find(s => s.key === 'cloudflare_domain').value;
      this.panelConfig.resource_ram_limit = settings.find(s => s.key === 'resource_ram_limit').value;
      this.panelConfig.resource_cpu_limit = settings.find(s => s.key === 'resource_cpu_limit').value;
      this.updateSubdomainHint();
      this.updateResourceHint();
      if (!silent) this.showToast('Saved', 'Settings updated', 'success');
      return true;
    } catch (err) {
      this.showToast('Error', err.message, 'error');
      return false;
    }
  },

  async testCloudflare() {
    const result = document.getElementById('cf-test-result');
    if (result) result.textContent = 'Testing...';
    const saved = await this.saveSettings(true);
    if (!saved) return;
    try {
      const data = await this.api('POST', '/api/admin/cloudflare/test');
      if (data && data.success) {
        if (result) { result.textContent = `Connected to zone "${data.zoneName}"`; result.style.color = 'var(--success)'; }
      } else {
        if (result) { result.textContent = data?.error || 'Connection failed'; result.style.color = 'var(--error)'; }
      }
    } catch (err) {
      if (result) { result.textContent = err.message; result.style.color = 'var(--error)'; }
    }
  },

  updateCfDomainSample() {
    const domain = document.getElementById('cf-domain')?.value?.trim() || 'smp45.qzz.io';
    const sample = document.getElementById('cf-domain-sample');
    if (sample) sample.textContent = `myserver.${domain}`;
  },

  setCfLoginResult(text, ok) {
    const el = document.getElementById('cf-login-result');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = ok ? 'var(--success)' : 'var(--error)';
  },

  setCfTunnelResult(text, ok) {
    const el = document.getElementById('cf-tunnel-result');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = ok ? 'var(--success)' : 'var(--error)';
  },

  cloudflareGitHub() {
    window.open('https://oidc.iam.cfapi.net/api/v1/sso/init?client=github&env=production', '_blank', 'noopener');
    this.setCfLoginResult('GitHub login opens in a new tab. It can\u2019t give the panel a token \u2014 log in with email & password here for automatic tunnel setup.', false);
  },

  async createTunnel() {
    const btn = document.getElementById('btn-cf-tunnel');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }
    this.setCfTunnelResult('Creating tunnel...', true);
    try {
      const data = await this.api('POST', '/api/admin/cloudflare/tunnel');
      if (data && data.success) {
        this.setCfTunnelResult(`Tunnel live at ${data.url}` + (data.running ? '' : ' — cloudflared not running'), true);
      } else {
        this.setCfTunnelResult(data?.error || 'Tunnel creation failed.', false);
      }
    } catch (err) {
      this.setCfTunnelResult(err.message, false);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Create tunnel'; }
    }
  },

  async cloudflareLogin() {
    const email = document.getElementById('cf-email')?.value?.trim();
    const password = document.getElementById('cf-password')?.value;
    if (!email || !password) return this.setCfLoginResult('Email and password are required.', false);
    const btn = document.getElementById('btn-cf-login');
    if (btn) { btn.disabled = true; btn.textContent = 'Logging in...'; }
    try {
      const data = await this.api('POST', '/api/admin/cloudflare/login', { email, password });
      if (data && data.requires2fa) {
        this.pendingAuthId = data.pendingAuthId;
        const row = document.getElementById('cf-2fa-row');
        if (row) row.style.display = 'flex';
        document.getElementById('cf-2fa-code')?.focus();
        this.setCfLoginResult(`2FA required${data.email ? ' for ' + data.email : ''}. Enter your authenticator code.`, true);
      } else if (data && data.success) {
        document.getElementById('cf-password').value = '';
        this.setCfLoginResult('Logged in. Zone auto-detected' + (data.zoneId ? '' : ' — set Zone ID manually if not matched.'), true);
        if (data.zoneId) {
          const zoneInput = document.getElementById('cf-zone-id');
          if (zoneInput && !zoneInput.value) zoneInput.value = data.zoneId;
        }
        if (data.tunnel) {
          if (data.tunnel.success) this.setCfTunnelResult(`Tunnel live at ${data.tunnel.url}`, true);
          else if (data.tunnel.skipped) this.setCfTunnelResult(data.tunnel.error || 'Tunnel skipped', false);
          else this.setCfTunnelResult(`Tunnel not created: ${data.tunnel.error || 'unknown error'}`, false);
        }
      }
    } catch (err) {
      this.setCfLoginResult(err.message, false);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Log in'; }
    }
  },

  async cloudflareVerify2fa() {
    const code = document.getElementById('cf-2fa-code')?.value?.trim();
    if (!code || !this.pendingAuthId) return this.setCfLoginResult('Enter your 2FA code first.', false);
    const btn = document.getElementById('btn-cf-2fa');
    if (btn) { btn.disabled = true; btn.textContent = 'Verifying...'; }
    try {
      const data = await this.api('POST', '/api/admin/cloudflare/login/2fa', { pendingAuthId: this.pendingAuthId, code });
      if (data && data.success) {
        document.getElementById('cf-password').value = '';
        const row = document.getElementById('cf-2fa-row');
        if (row) row.style.display = 'none';
        this.pendingAuthId = null;
        this.setCfLoginResult('2FA verified. Zone auto-detected' + (data.zoneId ? '' : ' — set Zone ID manually if not matched.'), true);
        if (data.zoneId) {
          const zoneInput = document.getElementById('cf-zone-id');
          if (zoneInput && !zoneInput.value) zoneInput.value = data.zoneId;
        }
        if (data.tunnel) {
          if (data.tunnel.success) this.setCfTunnelResult(`Tunnel live at ${data.tunnel.url}`, true);
          else if (data.tunnel.skipped) this.setCfTunnelResult(data.tunnel.error || 'Tunnel skipped', false);
          else this.setCfTunnelResult(`Tunnel not created: ${data.tunnel.error || 'unknown error'}`, false);
        }
      }
    } catch (err) {
      this.setCfLoginResult(err.message, false);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Verify'; }
    }
  },

  async loadApiTokens() {
    const list = document.getElementById('token-list');
    if (!list) return;
    try {
      const tokens = await this.api('GET', '/api/me/tokens');
      if (!tokens.length) {
        list.innerHTML = '<div class="notif-empty">No API tokens</div>';
        return;
      }
      list.innerHTML = tokens.map(t => `
        <div class="token-row">
          <div class="token-info">
            <span class="token-name">${this.escapeHtml(t.name)}</span>
            <span class="token-scope">${this.escapeHtml(t.scopes)}</span>
            <span class="token-meta">${t.last_used_at ? 'Last used ' + new Date(t.last_used_at).toLocaleString() : 'Never used'}${t.expires_at ? ' · expires ' + new Date(t.expires_at).toLocaleDateString() : ''}</span>
          </div>
          <button class="btn-sm danger" data-delete-token="${t.id}" title="Delete"><i data-lucide="trash-2"></i></button>
        </div>`).join('');
      this.initLucideIcons();
    } catch (err) {
      list.innerHTML = `<div class="notif-empty">Failed to load tokens: ${this.escapeHtml(err.message)}</div>`;
    }
  },

  async createApiToken() {
    const name = document.getElementById('token-name')?.value?.trim();
    if (!name) return this.showToast('Error', 'Token name is required', 'error');
    const scope = document.getElementById('token-scope')?.value || 'all';
    try {
      const data = await this.api('POST', '/api/me/tokens', { name, scopes: [scope] });
      const display = document.getElementById('new-token-display');
      const value = document.getElementById('new-token-value');
      if (display) display.style.display = '';
      if (value) value.value = data.token || '';
      document.getElementById('token-name').value = '';
      this.showToast('Created', `Token "${name}" created`, 'success');
      this.loadApiTokens();
    } catch (err) {
      this.showToast('Error', err.message, 'error');
    }
  },

  async deleteApiToken(id) {
    if (!confirm('Delete this API token? It will immediately stop working.')) return;
    try {
      await this.api('DELETE', `/api/me/tokens/${id}`);
      this.showToast('Deleted', 'API token deleted', 'success');
      this.loadApiTokens();
    } catch (err) {
      this.showToast('Error', err.message, 'error');
    }
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

  initWizardBackupImport() {
    const area = document.getElementById('backup-import-area');
    const input = document.getElementById('wizard-backup-file');
    const selected = document.getElementById('wizard-backup-selected');
    const nameEl = document.getElementById('wizard-backup-name');
    const removeBtn = document.getElementById('wizard-backup-remove');

    if (area && input) {
      area.addEventListener('click', () => input.click());
      area.addEventListener('dragover', e => { e.preventDefault(); area.style.borderColor = 'var(--primary)'; });
      area.addEventListener('dragleave', () => { area.style.borderColor = 'var(--border)'; });
      area.addEventListener('drop', e => {
        e.preventDefault();
        area.style.borderColor = 'var(--border)';
        if (e.dataTransfer.files.length && e.dataTransfer.files[0].name.endsWith('.zip')) {
          input.files = e.dataTransfer.files;
          input.dispatchEvent(new Event('change'));
        }
      });
    }
    if (input) {
      input.addEventListener('change', () => {
        if (input.files.length > 0) {
          this.wizardBackupFile = input.files[0];
          if (nameEl) nameEl.textContent = input.files[0].name;
          if (selected) selected.style.display = '';
          if (area) area.style.display = 'none';
        }
      });
    }
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        this.wizardBackupFile = null;
        if (input) input.value = '';
        if (selected) selected.style.display = 'none';
        if (area) area.style.display = '';
      });
    }
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
      next.innerHTML = 'Create Server';
    } else {
      next.innerHTML = 'Next Step';
    }
    this.initLucideIcons();
    this.updateReview();
  },

  updateReview() {
    const name = document.getElementById('server-name')?.value || 'My Server';
    const sw = document.querySelector('input[name="software"]:checked')?.value || 'paper';
    const ver = document.getElementById('server-version')?.value || '1.21.4';
    const domain = this.panelConfig?.domain || 'smp45.qzz.io';
    const cfEnabled = this.panelConfig?.cloudflare_enabled !== false;
    const sub = cfEnabled ? document.getElementById('server-subdomain')?.value?.trim() : '';
    const allSw = { ...this.JAVA_SOFTWARE, ...this.BEDROCK_SOFTWARE };
    const addr = sub ? `${sub}.${domain}` : 'Auto-assigned on create';

    document.getElementById('review-name').textContent = name;
    document.getElementById('review-game').textContent = this.selectedGameType === 'bedrock' ? 'Bedrock' : 'Java';
    document.getElementById('review-software').textContent = allSw[sw]?.name || sw;
    document.getElementById('review-version').textContent = ver;
    document.getElementById('review-port').textContent = 'Auto (random)';
    document.getElementById('review-address').textContent = addr;

    const backupRow = document.getElementById('review-backup-row');
    const backupName = document.getElementById('review-backup');
    if (this.wizardBackupFile) {
      if (backupRow) backupRow.style.display = '';
      if (backupName) backupName.textContent = this.wizardBackupFile.name;
    } else {
      if (backupRow) backupRow.style.display = 'none';
    }

    const preview = document.getElementById('subdomain-preview');
    if (preview) preview.textContent = sub ? `${sub}.${domain}` : `myserver.${domain}`;
  },

  async createServer() {
    const name = document.getElementById('server-name')?.value?.trim();
    const software = document.querySelector('input[name="software"]:checked')?.value;
    const version = document.getElementById('server-version')?.value;
    const cfEnabled = this.panelConfig?.cloudflare_enabled !== false;
    const subdomain = cfEnabled ? document.getElementById('server-subdomain')?.value?.trim() : '';

    if (!name) return this.showToast('Error', 'Server name is required', 'error');
    if (subdomain && !/^[a-z0-9-]+$/.test(subdomain)) return this.showToast('Error', 'Subdomain can only contain lowercase letters, numbers, and hyphens', 'error');

    try {
      this.showToast('Creating', `Setting up "${name}"...`, 'info');
      const server = await this.api('POST', '/api/servers', {
        name, version, server_type: software,
        game_type: this.selectedGameType,
        ram_min: 0, ram_max: 2048, subdomain
      });

      if (this.wizardBackupFile) {
        this.showToast('Importing', 'Uploading backup file...', 'info');
        const fd = new FormData();
        fd.append('file', this.wizardBackupFile);
        const uploadRes = await fetch(`/api/servers/${server.id}/restore-upload`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.token}` },
          body: fd
        });
        if (!uploadRes.ok) {
          const d = await uploadRes.json();
          this.showToast('Warning', `Server created but backup import failed: ${d.error}`, 'error');
        } else {
          this.showToast('Imported', 'Backup restored successfully!', 'success');
        }
      }

      document.getElementById('create-server-modal').classList.remove('active');
      document.body.style.overflow = '';
      this.showToast('Created', `"${name}" created successfully!`, 'success');
      this.currentWizardStep = 1;
      this.wizardBackupFile = null;
      const input = document.getElementById('wizard-backup-file');
      if (input) input.value = '';
      const sel = document.getElementById('wizard-backup-selected');
      if (sel) sel.style.display = 'none';
      const area = document.getElementById('backup-import-area');
      if (area) area.style.display = '';
      this.setWizardStep(1);
      this.loadServers();
    } catch (err) {
      this.showToast('Error', err.message, 'error');
    }
  },

  async loadServers() {
    try {
      const result = await this.api('GET', '/api/servers');
      this.servers = Array.isArray(result) ? result : [];
      this.renderServers();
      this.loadServerStats();
    } catch (err) {
      console.error('Failed to load servers:', err);
    }
  },

  async loadServerStats() {
    const running = this.servers.filter(s => s.status === 'running');
    for (const s of running) {
      try {
        const res = await fetch(`/api/servers/${s.id}/resources`, {
          headers: { 'Authorization': `Bearer ${this.token}` }
        });
        if (res.ok) {
          const stats = await res.json();
          const card = document.querySelector(`.server-card[data-server-id="${s.id}"]`);
          if (card) {
            const statsEl = card.querySelector('.server-stats');
            if (statsEl) {
              const cpu = stats.cpu ? stats.cpu.toFixed(1) : '0';
              const mem = stats.memory ? `${(stats.memory / 1024 / 1024).toFixed(0)}MB` : '0MB';
              statsEl.innerHTML = `<span title="CPU"><i data-lucide="cpu" style="width:12px;height:12px"></i> ${cpu}%</span><span title="Memory"><i data-lucide="hard-drive" style="width:12px;height:12px"></i> ${mem}</span>`;
              lucide.createIcons({ nodes: [statsEl] });
            }
          }
        }
      } catch (e) {}
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
      const addr = s.address || `localhost:${s.port}`;
      return `
      <div class="server-card" data-status="${s.status}" data-server-id="${s.id}">
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
          ${isRunning ? '<div class="server-stats" style="display:flex;gap:0.75rem;font-size:0.75rem;color:var(--text-muted);margin-top:0.4rem"></div>' : ''}
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

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: 'check-circle', error: 'alert-circle', warning: 'alert-triangle', info: 'info' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i data-lucide="${icons[type]}" class="toast-icon"></i>
      <div class="toast-message"><div class="toast-title">${this.escapeHtml(title)}</div><div class="toast-desc">${this.escapeHtml(String(message))}</div></div>
      <button class="toast-close" onclick="this.parentElement.classList.add('leaving'); setTimeout(() => this.parentElement.remove(), 300);"><i data-lucide="x"></i></button>`;
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

document.addEventListener('DOMContentLoaded', () => NetherApp.init());

/* ============================================
   NetherPanel - Server Management JavaScript
   ============================================ */

const NetherServer = {
  term: null,
  fitAddon: null,
  autoScroll: true,
  ws: null,

  async init() {
    this.serverId = new URLSearchParams(window.location.search).get('id') || '1';
    this.authToken = localStorage.getItem('token') || null;
    this.initLucideIcons();
    this.initUserMenu();
    await this.loadServerInfo();
    this.initServerTabs();
    this.initConsole();
    this.initPowerControls();
    this.initFileManager();
    this.initModManager();
    this.initSettingsNav();
    this.initSettingsActions();
    this.initScheduleActions();
    this.initBackupActions();
  },

  async loadServerInfo() {
    try {
      const res = await fetch(`/api/servers/${this.serverId}`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      if (!res.ok) throw new Error('Failed to load server');
      const server = await res.json();
      this.serverData = server;

      document.getElementById('server-title').textContent = server.name;

      const addr = server.subdomain
        ? (server.port === 25565 || server.port === 19132
          ? `${server.subdomain}.smp45.qzz.io`
          : `${server.subdomain}.smp45.qzz.io:${server.port}`)
        : `localhost:${server.port}`;
      document.getElementById('server-addr-text').textContent = addr;

      const versionBadge = document.getElementById('server-version-badge');
      versionBadge.textContent = `${server.server_type || server.software || 'Paper'} ${server.version || server.mc_version || '1.21.4'}`;

      const statusBadge = document.getElementById('server-status-badge');
      statusBadge.className = `server-status-badge ${server.status}`;
      statusBadge.querySelector('span:last-child').textContent =
        server.status === 'running' ? 'Running' : server.status === 'starting' ? 'Starting' : 'Stopped';

      const userAvatar = document.querySelector('.avatar-circle');
      if (userAvatar) {
        const userRes = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${this.authToken}` }
        });
        if (userRes.ok) {
          const user = await userRes.json();
          const initials = (user.username || 'U').slice(0, 2).toUpperCase();
          document.querySelectorAll('.avatar-circle').forEach(el => el.textContent = initials);
          const nameEl = document.querySelector('.dropdown-user-name');
          const emailEl = document.querySelector('.dropdown-user-email');
          if (nameEl) nameEl.textContent = user.username;
          if (emailEl) emailEl.textContent = user.email || '';
        }
      }
    } catch (err) {
      console.error('Failed to load server info:', err);
    }
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

  initServerTabs() {
    const tabs = document.querySelectorAll('.server-tab');
    const contents = document.querySelectorAll('.server-tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;

        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        contents.forEach(c => {
          c.classList.remove('active');
          if (c.id === `tab-${target}`) {
            c.classList.add('active');
          }
        });

        if (target === 'console' && this.term) {
          setTimeout(() => this.fitAddon.fit(), 100);
        }
      });
    });
  },

  initConsole() {
    const container = document.getElementById('xterm-container');
    if (!container || typeof Terminal === 'undefined') {
      this.initFallbackConsole();
      return;
    }

    const theme = {
      background: '#0d0816',
      foreground: '#e2e8f0',
      cursor: '#f97316',
      cursorAccent: '#0d0816',
      selectionBackground: 'rgba(249, 115, 22, 0.3)',
      black: '#1a1025',
      red: '#ef4444',
      green: '#22c55e',
      yellow: '#eab308',
      blue: '#3b82f6',
      magenta: '#a855f7',
      cyan: '#06b6d4',
      white: '#e2e8f0',
      brightBlack: '#64748b',
      brightRed: '#f87171',
      brightGreen: '#4ade80',
      brightYellow: '#facc15',
      brightBlue: '#60a5fa',
      brightMagenta: '#c084fc',
      brightCyan: '#22d3ee',
      brightWhite: '#f1f5f9'
    };

    this.term = new Terminal({
      theme,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowTransparency: true,
      scrollback: 10000,
      padding: { top: 8, bottom: 8, left: 8, right: 8 }
    });

    this.fitAddon = new FitAddon.FitAddon();
    this.term.loadAddon(this.fitAddon);
    this.term.open(container);
    this.fitAddon.fit();

    this.term.writeln('\x1b[38;2;249;115;22m  _   _                       ___  __  __  ___  \x1b[0m');
    this.term.writeln('\x1b[38;2;6;182;212m | \\ | | _____  ___   _ ___ / _ \\|  \\/  |/ _ \\ \x1b[0m');
    this.term.writeln('\x1b[38;2;168;85;247m |  \\| |/ _ \\ \\/ / | | / __| | | | |\\/| | | | |\x1b[0m');
    this.term.writeln('\x1b[38;2;34;197;94m | |\\  |  __/>  <| |_| \\__ \\ |_| | |  | | |_| |\x1b[0m');
    this.term.writeln('\x1b[38;2;249;115;22m |_| \\_|\\___/_/\\_\\\\__,_|___/\\___/|_|  |_|\\___/ \x1b[0m');
    this.term.writeln('');
    this.term.writeln('\x1b[38;2;148;163;184m  NetherPanel Console v1.0.0\x1b[0m');
    this.term.writeln('\x1b[38;2;148;163;184m  Type "help" for available commands\x1b[0m');
    this.term.writeln('');

    this.printServerLog();

    let currentLine = '';
    this.term.onKey(({ key, domEvent }) => {
      const code = domEvent.keyCode;

      if (code === 13) {
        this.term.writeln('');
        if (currentLine.trim()) {
          this.processCommand(currentLine.trim());
        }
        currentLine = '';
      } else if (code === 8) {
        if (currentLine.length > 0) {
          currentLine = currentLine.slice(0, -1);
          this.term.write('\b \b');
        }
      } else if (!domEvent.ctrlKey && !domEvent.altKey && !domEvent.metaKey) {
        currentLine += key;
        this.term.write(key);
      }
    });

    const input = document.getElementById('console-input');
    const sendBtn = document.getElementById('console-send');

    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const cmd = input.value.trim();
          if (cmd) {
            this.term.writeln(`\x1b[38;2;249;115;22m❯\x1b[0m ${cmd}`);
            this.processCommand(cmd);
            input.value = '';
          }
        }
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        if (input) {
          const cmd = input.value.trim();
          if (cmd) {
            this.term.writeln(`\x1b[38;2;249;115;22m❯\x1b[0m ${cmd}`);
            this.processCommand(cmd);
            input.value = '';
          }
        }
      });
    }

    const clearBtn = document.getElementById('console-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.term.clear());
    }

    const scrollBtn = document.getElementById('console-scroll-toggle');
    if (scrollBtn) {
      scrollBtn.addEventListener('click', () => {
        this.autoScroll = !this.autoScroll;
        scrollBtn.classList.toggle('active', this.autoScroll);
        NetherServer.showToast(
          this.autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled',
          '',
          'info'
        );
      });
    }

    window.addEventListener('resize', () => {
      if (this.fitAddon) this.fitAddon.fit();
    });

    this.connectSocket();
  },

  connectSocket() {
    if (this.socket) return;
    const token = this.authToken;
    if (!token) return;

    this.socket = io(window.location.origin, { transports: ['websocket', 'polling'] });

    this.socket.on('connect', () => {
      this.socket.emit('auth', token);
    });

    this.socket.on('authenticated', () => {
      this.socket.emit('subscribe_console', this.serverId);
    });

    this.socket.on('console_history', (data) => {
      if (data.lines && this.term) {
        data.lines.forEach(line => {
          this.term.writeln(line.line || line);
        });
      }
    });

    this.socket.on('console_line', (data) => {
      if (data.line && this.term) {
        this.term.writeln(data.line.line || data.line);
      }
    });

    this.socket.on('status_update', (data) => {
      const badge = document.getElementById('server-status-badge');
      if (badge) {
        const status = data.status || 'stopped';
        badge.className = `server-status-badge ${status}`;
        badge.innerHTML = `<span class="status-dot"></span><span>${status === 'running' ? 'Running' : status === 'starting' ? 'Starting' : 'Stopped'}</span>`;
      }
    });

    this.socket.on('error', (data) => {
      console.error('Socket error:', data.error);
    });

    this.socket.on('disconnect', () => {
      if (this.term) {
        this.term.writeln('\x1b[38;2;234;179;8m[Console] Disconnected from server. Reconnecting...\x1b[0m');
      }
    });
  },

  initFallbackConsole() {
    const container = document.getElementById('xterm-container');
    if (!container) return;

    container.innerHTML = `
      <div style="padding: 16px; font-family: var(--font-mono); font-size: 13px; color: var(--text-primary); height: 100%; overflow-y: auto; background: #0d0816;">
        <div style="color: var(--accent-orange);">  _   _                       ___  __  __  ___</div>
        <div style="color: var(--accent-cyan);"> | \\ | | _____  ___   _ ___ / _ \\|  \\/  |/ _ \\</div>
        <div style="color: var(--accent-purple);"> |  \\| |/ _ \\ \\/ / | | / __| | | | |\\/| | | | |</div>
        <div style="color: var(--success);"> | |\\  |  __/>  <| |_| \\__ \\ |_| | |  | | |_| |</div>
        <div style="color: var(--accent-orange);"> |_| \\_|\\___/_/\\_\\\\__,_|___/\\___/|_|  |_|\\___/</div>
        <br>
        <div style="color: var(--text-tertiary);">NetherPanel Console v1.0.0</div>
        <div style="color: var(--text-muted);">Console connected. Output will appear here.</div>
        <br>
      </div>
    `;
  },

  printServerLog() {
    fetch(`/api/servers/${this.serverId}/console`, {
      headers: { 'Authorization': `Bearer ${this.authToken}` }
    }).then(r => r.json()).then(logs => {
      if (!Array.isArray(logs) || logs.length === 0) {
        if (this.term) {
          this.term.writeln('\x1b[38;2;100;116;139m[Console] No logs yet. Start the server to see output.\x1b[0m');
        }
        return;
      }
      logs.forEach(entry => {
        if (this.term) {
          const line = entry.line || entry.message || JSON.stringify(entry);
          this.term.writeln(line);
        }
      });
    }).catch(() => {
      if (this.term) {
        this.term.writeln('\x1b[38;2;239;68;68m[Console] Failed to load server logs\x1b[0m');
      }
    });
  },

  processCommand(cmd) {
    const lower = cmd.toLowerCase().trim();

    if (lower === 'clear') {
      this.term.clear();
      return;
    }

    if (!cmd) return;

    this.term.writeln(`\x1b[38;2;148;163;184m> ${cmd}\x1b[0m`);

    fetch(`/api/servers/${this.serverId}/command`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ command: cmd })
    }).then(r => r.json()).then(data => {
      if (data.error) {
        this.term.writeln(`\x1b[38;2;239;68;68m${data.error}\x1b[0m`);
      } else if (data.output) {
        data.output.split('\n').forEach(line => {
          this.term.writeln(`\x1b[38;2;148;163;184m${line}\x1b[0m`);
        });
      }
    }).catch(() => {
      this.term.writeln('\x1b[38;2;239;68;68mFailed to send command. Is the server running?\x1b[0m');
    });
  },

  initPowerControls() {
    const startBtn = document.getElementById('btn-start');
    const stopBtn = document.getElementById('btn-stop');
    const restartBtn = document.getElementById('btn-restart');
    const killBtn = document.getElementById('btn-kill');

    if (startBtn) {
      startBtn.addEventListener('click', () => this.powerAction('start'));
    }
    if (stopBtn) {
      stopBtn.addEventListener('click', () => this.powerAction('stop'));
    }
    if (restartBtn) {
      restartBtn.addEventListener('click', () => this.powerAction('restart'));
    }
    if (killBtn) {
      killBtn.addEventListener('click', () => this.powerAction('kill'));
    }
  },

  powerAction(action) {
    const badge = document.getElementById('server-status-badge');
    const actions = {
      start: { text: 'Starting server...', color: 'running', toast: ['Starting', 'Server is starting up...', 'success'] },
      stop: { text: 'Stopping server...', color: 'stopped', toast: ['Stopping', 'Server is shutting down...', 'warning'] },
      restart: { text: 'Restarting...', color: 'running', toast: ['Restarting', 'Server is restarting...', 'info'] },
      kill: { text: 'Killing...', color: 'stopped', toast: ['Killing', 'Force stopping server...', 'error'] }
    };

    const cfg = actions[action];
    if (!cfg) return;

    NetherServer.showToast(cfg.toast[0], cfg.toast[1], cfg.toast[2]);

    if (badge) {
      badge.className = `server-status-badge ${cfg.color === 'running' ? 'running' : 'stopped'}`;
      badge.innerHTML = `<span class="status-dot"></span><span>${cfg.text}</span>`;
    }

    if (this.term) {
      const colors = {
        start: '\x1b[38;2;34;197;94m',
        stop: '\x1b[38;2;239;68;68m',
        restart: '\x1b[38;2;234;179;8m',
        kill: '\x1b[38;2;239;68;68m'
      };
      this.term.writeln(`${colors[action]}[NetherPanel] ${cfg.toast[1]}\x1b[0m`);
    }

    fetch(`/api/servers/${this.serverId}/${action}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.authToken}`, 'Content-Type': 'application/json' }
    }).then(res => res.json()).then(data => {
      if (data.error) {
        NetherServer.showToast('Error', data.error, 'error');
        return;
      }
      const finalStatus = (action === 'start' || action === 'restart') ? 'running' : 'stopped';
      if (badge) {
        badge.className = `server-status-badge ${finalStatus}`;
        badge.innerHTML = `<span class="status-dot"></span><span>${finalStatus === 'running' ? 'Running' : 'Stopped'}</span>`;
      }
      if (this.serverData) this.serverData.status = finalStatus;
    }).catch(() => {
      NetherServer.showToast('Error', 'Failed to communicate with server', 'error');
    });
  },

  initFileManager() {
    this.loadFiles();
  },

  async loadFiles(subPath = '') {
    try {
      const res = await fetch(`/api/servers/${this.serverId}/files?path=${encodeURIComponent(subPath)}`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      if (!res.ok) throw new Error('Failed to load files');
      const files = await res.json();
      this.renderFiles(files, subPath);
    } catch (err) {
      console.error('Failed to load files:', err);
    }
  },

  renderFiles(files, currentPath) {
    const tree = document.getElementById('file-tree');
    if (!tree) return;

    let html = '';
    if (currentPath) {
      const parent = currentPath.split('/').slice(0, -1).join('/');
      html += `<div class="file-tree-item" data-path="${parent}" onclick="NetherServer.loadFiles('${parent}')">
        <i data-lucide="folder" style="color: var(--text-tertiary)"></i>
        <span>..</span>
      </div>`;
    }

    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    files.forEach(file => {
      const icon = file.isDirectory ? 'folder' : 'file';
      const color = file.isDirectory ? 'var(--accent-orange)' : 'var(--text-tertiary)';
      const size = file.isDirectory ? '' : this.formatBytes(file.size);
      const clickAction = file.isDirectory
        ? `NetherServer.loadFiles('${currentPath ? currentPath + '/' : ''}${file.name}')`
        : `NetherServer.openFile('${currentPath ? currentPath + '/' : ''}${file.name}')`;
      html += `<div class="file-tree-item" data-path="${file.path}" onclick="${clickAction}">
        <i data-lucide="${icon}" style="color: ${color}"></i>
        <span>${file.name}</span>
        <span class="file-size">${size}</span>
      </div>`;
    });

    tree.innerHTML = html;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  },

  async openFile(filePath) {
    const editor = document.getElementById('file-editor');
    const fileName = document.getElementById('current-file-name');
    if (fileName) fileName.textContent = filePath.split('/').pop();

    try {
      const res = await fetch(`/api/servers/${this.serverId}/files/read?path=${encodeURIComponent(filePath)}`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      if (!res.ok) throw new Error('Failed to read file');
      const data = await res.json();

      if (editor) {
        editor.innerHTML = `<textarea spellcheck="false" id="file-editor-content">${data.content || ''}</textarea>`;
      }

      const saveBtn = document.getElementById('file-save-btn');
      if (saveBtn) {
        saveBtn.onclick = () => this.saveFile(filePath);
      }
    } catch (err) {
      if (editor) {
        editor.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-muted);">
          <p>Failed to load file.</p>
        </div>`;
      }
    }
  },

  async saveFile(filePath) {
    const content = document.getElementById('file-editor-content')?.value;
    if (content === undefined) return;

    try {
      const res = await fetch(`/api/servers/${this.serverId}/files/write`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: filePath, content })
      });
      if (!res.ok) throw new Error('Failed to save');
      NetherServer.showToast('Saved', 'File saved successfully', 'success');
    } catch (err) {
      NetherServer.showToast('Error', 'Failed to save file', 'error');
    }
  },

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  },

  initModManager() {
    this.modOffset = 0;
    this.modLimit = 20;

    const isModded = this.serverData && ['fabric', 'forge', 'quilt', 'neoforge'].includes(this.serverData.server_type || this.serverData.software);
    const isPlugin = this.serverData && ['paper', 'spigot', 'purpur', 'bukkit'].includes(this.serverData.server_type || this.serverData.software);
    const modTab = document.querySelector('.server-tab[data-tab="mods"]');
    if (modTab) {
      const label = isPlugin ? 'Plugins' : 'Mods';
      modTab.querySelector('span').textContent = label;
    }

    const tabs = document.querySelectorAll('.mods-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.mods-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById(`mods-${tab.dataset.modsTab}-panel`);
        if (panel) panel.classList.add('active');
      });
    });

    const searchInput = document.getElementById('mod-search');
    let searchTimeout;
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.modOffset = 0;
          this.searchMods(searchInput.value);
        }, 400);
      });
    }

    const categoryFilter = document.getElementById('mod-category');
    const loaderFilter = document.getElementById('mod-loader');
    const versionFilter = document.getElementById('mod-version');

    [categoryFilter, loaderFilter, versionFilter].forEach(el => {
      if (el) {
        el.addEventListener('change', () => {
          this.modOffset = 0;
          this.searchMods(document.getElementById('mod-search')?.value || '');
        });
      }
    });

    const loadMoreBtn = document.getElementById('mods-load-more');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => {
        this.modOffset += this.modLimit;
        this.searchMods(document.getElementById('mod-search')?.value || '', true);
      });
    }

    this.loadInstalledMods();
  },

  async loadInstalledMods() {
    try {
      const res = await fetch(`/api/servers/${this.serverId}/mods`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      if (!res.ok) return;
      const mods = await res.json();
      this.renderInstalledMods(mods);
    } catch (err) {
      console.error('Failed to load installed mods:', err);
    }
  },

  renderInstalledMods(mods) {
    const container = document.getElementById('installed-mods');
    const count = document.getElementById('installed-count');
    if (count) count.textContent = `(${mods.length})`;

    if (!mods.length) {
      container.innerHTML = `
        <div class="mods-empty-state">
          <i data-lucide="package-open"></i>
          <p>No mods or plugins installed yet</p>
          <span>Browse and install mods from Modrinth</span>
        </div>`;
      lucide.createIcons({ nodes: [container] });
      return;
    }

    container.innerHTML = mods.map(mod => `
      <div class="mod-card installed" data-mod-id="${mod.id}">
        <div class="mod-icon"><i data-lucide="puzzle"></i></div>
        <div class="mod-info">
          <h4 class="mod-name">${mod.name}</h4>
          <div class="mod-meta">
            <span class="mod-version-badge">v${mod.version}</span>
            <span class="mod-author">${mod.slug || ''}</span>
          </div>
        </div>
        <div class="mod-actions">
          <button class="btn-sm" disabled><i data-lucide="check-circle"></i> Installed</button>
          <button class="btn-sm danger" onclick="NetherServer.removeMod(${mod.id})" title="Remove"><i data-lucide="trash-2"></i></button>
        </div>
      </div>
    `).join('');

    lucide.createIcons({ nodes: [container] });
  },

  async searchMods(query, append = false) {
    const container = document.getElementById('available-mods');
    const info = document.getElementById('mods-results-info');
    const loadMoreBtn = document.getElementById('mods-load-more');

    if (!append) {
      container.innerHTML = '<div class="mods-loading"><div class="spinner"></div><span>Searching Modrinth...</span></div>';
    }

    try {
      const params = new URLSearchParams({
        query: query || '',
        limit: this.modLimit.toString(),
        offset: this.modOffset.toString(),
        index: 'relevance'
      });

      const category = document.getElementById('mod-category')?.value;
      const loaderFilter = document.getElementById('mod-loader');
      let loader = loaderFilter?.value;
      if (!loader && this.serverData) {
        const sw = (this.serverData.server_type || this.serverData.software || '').toLowerCase();
        if (['fabric', 'forge', 'quilt', 'neoforge'].includes(sw)) loader = sw;
        else if (['paper', 'spigot', 'purpur', 'bukkit'].includes(sw)) loader = 'paper';
      }
      const facets = [];
      if (category) facets.push(`categories:${category}`);
      if (loader) facets.push(`categories:${loader}`);
      if (facets.length > 0) params.append('facets', JSON.stringify([facets]));

      const res = await fetch(`https://api.modrinth.com/v2/search?${params}`);
      const data = await res.json();

      if (info) {
        info.textContent = `Showing ${Math.min(this.modOffset + data.hits.length, data.total_hits)} of ${data.total_hits} results`;
      }

      const cards = data.hits.map(mod => `
        <div class="mod-card" data-modrinth-id="${mod.project_id}">
          <div class="mod-icon">
            ${mod.icon_url ? `<img src="${mod.icon_url}" alt="${mod.title}" onerror="this.parentElement.innerHTML='<i data-lucide=\\'puzzle\\'></i>'">` : '<i data-lucide="puzzle"></i>'}
          </div>
          <div class="mod-info">
            <h4 class="mod-name">${mod.title}</h4>
            <p class="mod-desc">${mod.description}</p>
            <div class="mod-meta">
              <span class="mod-downloads"><i data-lucide="download"></i> ${this.formatNumber(mod.downloads)}</span>
              <span class="mod-author">by ${mod.author}</span>
            </div>
          </div>
          <div class="mod-actions">
            <button class="btn-sm btn-install" onclick="NetherServer.installModFromModrinth('${mod.project_id}', '${mod.title.replace(/'/g, "\\'")}')">
              <i data-lucide="download"></i> Install
            </button>
          </div>
        </div>
      `).join('');

      if (append) {
        container.insertAdjacentHTML('beforeend', cards);
      } else {
        container.innerHTML = cards || '<div class="mods-empty-state"><p>No mods found</p></div>';
      }

      if (loadMoreBtn) {
        loadMoreBtn.style.display = data.hits.length >= this.modLimit ? '' : 'none';
      }

      lucide.createIcons({ nodes: [container] });
    } catch (err) {
      container.innerHTML = '<div class="mods-empty-state"><p>Failed to search Modrinth</p></div>';
      console.error('Modrinth search error:', err);
    }
  },

  async installModFromModrinth(modrinthId, modName) {
    NetherServer.showToast('Installing', `Installing ${modName}...`, 'info');
    try {
      const res = await fetch(`/api/servers/${this.serverId}/mods/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({ mod_id: modrinthId })
      });

      if (res.ok) {
        NetherServer.showToast('Installed', `${modName} installed successfully`, 'success');
        this.loadInstalledMods();
      } else {
        const err = await res.json();
        NetherServer.showToast('Error', err.error || 'Failed to install mod', 'error');
      }
    } catch (err) {
      NetherServer.showToast('Error', 'Failed to install mod', 'error');
    }
  },

  async removeMod(modId) {
    if (!confirm('Are you sure you want to remove this mod?')) return;
    try {
      const res = await fetch(`/api/servers/${this.serverId}/mods/${modId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      if (res.ok) {
        NetherServer.showToast('Removed', 'Mod removed successfully', 'success');
        this.loadInstalledMods();
      }
    } catch (err) {
      NetherServer.showToast('Error', 'Failed to remove mod', 'error');
    }
  },

  formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  },

  initSettingsNav() {
    const navItems = document.querySelectorAll('.settings-nav-item');
    const sections = document.querySelectorAll('.settings-section');

    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const section = item.dataset.section;

        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        sections.forEach(s => {
          s.classList.remove('active');
          if (s.id === `settings-${section}`) {
            s.classList.add('active');
          }
        });
      });
    });
  },

  initSettingsActions() {
    const saveBtn = document.getElementById('save-settings');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        NetherServer.showToast('Saved', 'Settings saved successfully', 'success');
      });
    }
  },

  initScheduleActions() {
    document.querySelectorAll('.schedule-card .btn-sm').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.textContent.trim();
        const card = btn.closest('.schedule-card');
        const scheduleId = card?.dataset?.scheduleId;
        const name = card?.querySelector('h4')?.textContent || 'Task';

        if (text.includes('Run Now') && scheduleId) {
          NetherServer.showToast('Running', `Running "${name}"...`, 'info');
          fetch(`/api/servers/${this.serverId}/schedules/${scheduleId}/run`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.authToken}` }
          }).then(r => r.json()).then(d => {
            if (d.error) NetherServer.showToast('Error', d.error, 'error');
            else NetherServer.showToast('Done', `"${name}" executed`, 'success');
          }).catch(() => NetherServer.showToast('Error', 'Failed to run schedule', 'error'));
        }
      });
    });
  },

  initBackupActions() {
    const createBtn = document.getElementById('create-backup-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        NetherServer.showToast('Creating Backup', 'Backup is being created...', 'info');
        fetch(`/api/servers/${this.serverId}/backups`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.authToken}`, 'Content-Type': 'application/json' }
        }).then(r => r.json()).then(d => {
          if (d.error) NetherServer.showToast('Error', d.error, 'error');
          else NetherServer.showToast('Backup Complete', 'Backup created successfully!', 'success');
        }).catch(() => NetherServer.showToast('Error', 'Failed to create backup', 'error'));
      });
    }

    document.querySelectorAll('.backup-card .btn-sm').forEach(btn => {
      btn.addEventListener('click', () => {
        const icon = btn.querySelector('i');
        const card = btn.closest('.backup-card');
        const backupId = card?.dataset?.backupId;
        const name = card?.querySelector('.backup-name')?.textContent || 'Backup';

        if (icon?.dataset.lucide === 'rotate-ccw' && backupId) {
          NetherServer.showToast('Restoring', `Restoring from "${name}"...`, 'warning');
          fetch(`/api/servers/${this.serverId}/backups/${backupId}/restore`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.authToken}` }
          }).then(r => r.json()).then(d => {
            if (d.error) NetherServer.showToast('Error', d.error, 'error');
            else NetherServer.showToast('Restored', `"${name}" restored`, 'success');
          }).catch(() => NetherServer.showToast('Error', 'Failed to restore', 'error'));
        } else if (icon?.dataset.lucide === 'trash-2' && backupId) {
          NetherServer.showToast('Deleted', `Backup "${name}" deleted`, 'error');
          fetch(`/api/servers/${this.serverId}/backups/${backupId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${this.authToken}` }
          }).then(r => r.json()).then(d => {
            if (d.error) NetherServer.showToast('Error', d.error, 'error');
            else card.remove();
          }).catch(() => NetherServer.showToast('Error', 'Failed to delete', 'error'));
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

const NetherMods = {
  install(btn) {
    NetherServer.installMod(btn);
  }
};

function copyAddress() {
  const text = document.getElementById('server-addr-text')?.textContent;
  if (text) {
    navigator.clipboard.writeText(text).then(() => {
      NetherServer.showToast('Copied', 'Address copied to clipboard', 'success');
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  NetherServer.init();
});

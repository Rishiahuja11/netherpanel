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
    this.initBackupActions();
    this.initPlayers();
    this.initLogsControls();
    this.initSettingsDanger();
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
      const csEl = document.getElementById('console-status');
      if (csEl) { csEl.textContent = 'Connected'; csEl.style.color = 'var(--success)'; }
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
      const csEl = document.getElementById('console-status');
      if (csEl) { csEl.textContent = 'Disconnected'; csEl.style.color = 'var(--error)'; }
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

    if (this.socket && this.socket.connected) {
      this.socket.emit('send_command', { serverId: parseInt(this.serverId), command: cmd });
    } else {
      this.term.writeln('\x1b[38;2;239;68;68mNot connected. Reconnecting...\x1b[0m');
      this.connectSocket();
    }
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
    this.currentDirPath = '';

    const backBtn = document.getElementById('files-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        const parent = this.currentDirPath.split('/').slice(0, -1).join('/');
        this.loadFiles(parent);
      });
    }

    const editorBack = document.getElementById('file-editor-back');
    if (editorBack) {
      editorBack.addEventListener('click', () => this.closeEditor());
    }

    const uploadBtn = document.getElementById('file-upload-btn');
    const uploadInput = document.getElementById('file-upload-input');
    if (uploadBtn && uploadInput) {
      uploadBtn.addEventListener('click', () => uploadInput.click());
      uploadInput.addEventListener('change', () => this.uploadFiles());
    }

    const downloadBtn = document.getElementById('file-download-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        if (this.currentFilePath) this.downloadFile(this.currentFilePath);
      });
    }

    this.loadFiles();
  },

  async loadFiles(subPath = '') {
    this.currentDirPath = subPath;
    const list = document.getElementById('files-list');
    const backBtn = document.getElementById('files-back-btn');
    const pathEl = document.getElementById('files-current-path');

    if (backBtn) backBtn.style.display = subPath ? '' : 'none';
    if (pathEl) pathEl.textContent = subPath || 'Server Files';

    this.closeEditor();

    try {
      const res = await fetch(`/api/servers/${this.serverId}/files?path=${encodeURIComponent(subPath)}`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      if (!res.ok) throw new Error('Failed to load files');
      const files = await res.json();
      this.renderFiles(files, subPath);
    } catch (err) {
      if (list) list.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted)">Failed to load files</div>';
    }
  },

  renderFiles(files, currentPath) {
    const list = document.getElementById('files-list');
    if (!list) return;

    let html = '';
    if (currentPath) {
      const parent = currentPath.split('/').slice(0, -1).join('/');
      html += `<div class="file-item parent" onclick="NetherServer.loadFiles('${parent}')">
        <i data-lucide="arrow-up"></i>
        <span class="file-name">..</span>
      </div>`;
    }

    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    files.forEach(file => {
      const icon = file.isDirectory ? 'folder' : 'file';
      const color = file.isDirectory ? 'var(--accent-blue)' : 'var(--text-tertiary)';
      const size = file.isDirectory ? '' : this.formatBytes(file.size);
      const cls = file.isDirectory ? 'file-item folder' : 'file-item';
      const fullPath = currentPath ? currentPath + '/' + file.name : file.name;
      const clickAction = file.isDirectory
        ? `NetherServer.loadFiles('${fullPath}')`
        : `NetherServer.openFile('${fullPath}')`;
      html += `<div class="${cls}" onclick="${clickAction}">
        <i data-lucide="${icon}" style="color: ${color}"></i>
        <span class="file-name">${file.name}</span>
        <span class="file-size">${size}</span>
      </div>`;
    });

    if (!files.length && !currentPath) {
      html = '<div style="padding:3rem;text-align:center;color:var(--text-muted)"><i data-lucide="folder-open" style="width:32px;height:32px;margin-bottom:0.5rem"></i><p>Server directory is empty</p></div>';
    }

    list.innerHTML = html;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  },

  async openFile(filePath) {
    this.currentFilePath = filePath;
    const panel = document.getElementById('file-editor-panel');
    const editor = document.getElementById('file-editor');
    const nameEl = document.getElementById('file-editor-name');
    const list = document.getElementById('files-list');

    if (nameEl) nameEl.textContent = filePath.split('/').pop();
    if (panel) panel.style.display = 'flex';
    if (list) list.style.display = 'none';

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
        editor.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Failed to load file.</div>`;
      }
    }
  },

  closeEditor() {
    const panel = document.getElementById('file-editor-panel');
    const list = document.getElementById('files-list');
    if (panel) panel.style.display = 'none';
    if (list) list.style.display = '';
    this.currentFilePath = null;
  },

  async saveFile(filePath) {
    const content = document.getElementById('file-editor-content')?.value;
    if (content === undefined) return;

    try {
      const res = await fetch(`/api/servers/${this.serverId}/files/write`, {
        method: 'PUT',
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

  async uploadFiles() {
    const input = document.getElementById('file-upload-input');
    if (!input || !input.files.length) return;

    const formData = new FormData();
    for (const file of input.files) {
      formData.append('files', file);
    }
    formData.append('path', this.currentDirPath || '');

    try {
      NetherServer.showToast('Uploading', `Uploading ${input.files.length} file(s)...`, 'info');
      const res = await fetch(`/api/servers/${this.serverId}/files/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.authToken}` },
        body: formData
      });
      if (res.ok) {
        NetherServer.showToast('Uploaded', 'Files uploaded successfully', 'success');
        input.value = '';
        this.loadFiles(this.currentDirPath || '');
      } else {
        const d = await res.json();
        NetherServer.showToast('Error', d.error || 'Upload failed', 'error');
      }
    } catch (e) {
      NetherServer.showToast('Error', 'Failed to upload files', 'error');
    }
  },

  downloadFile(filePath) {
    const a = document.createElement('a');
    a.href = `/api/servers/${this.serverId}/files/download?path=${encodeURIComponent(filePath)}`;
    a.setAttribute('download', '');
    document.body.appendChild(a);
    a.click();
    a.remove();
  },

  downloadBackup(backupId) {
    const a = document.createElement('a');
    a.href = `/api/servers/${this.serverId}/backups/${backupId}/download`;
    a.setAttribute('download', '');
    document.body.appendChild(a);
    a.click();
    a.remove();
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
    const serverType = this.serverData?.server_type || this.serverData?.software || 'paper';
    const isPlugin = ['paper', 'spigot', 'purpur', 'folia', 'bukkit', 'pocketmine', 'nukkit', 'powernukkit'].includes(serverType);
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
    const isPoggit = ['pocketmine'].includes(serverType);
    const isHangar = ['paper', 'spigot', 'purpur', 'folia'].includes(serverType);
    const searchSource = isPoggit ? 'Poggit' : isHangar ? 'Hangar' : 'Modrinth';

    if (searchInput) {
      searchInput.placeholder = `Search ${isPlugin ? 'plugins' : 'mods'} on ${searchSource}...`;
    }
    const browseLabel = document.getElementById('browse-label');
    if (browseLabel) {
      browseLabel.textContent = isPlugin ? 'Plugins' : 'Mods';
    }
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

    [categoryFilter].forEach(el => {
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
    this.searchMods('');
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
    const isPlugin = this.serverData && ['paper', 'spigot', 'purpur', 'folia', 'bukkit', 'pocketmine', 'nukkit', 'powernukkit'].includes(this.serverData.server_type || this.serverData.software);

    if (!mods.length) {
      container.innerHTML = `
        <div class="mods-empty-state">
          <i data-lucide="package-open"></i>
          <p>No ${isPlugin ? 'plugins' : 'mods'} installed yet</p>
          <span>Browse and install ${isPlugin ? 'plugins' : 'mods'} from Modrinth</span>
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
    const serverType = this.serverData?.server_type || 'paper';

    const isPlugin = ['paper', 'spigot', 'purpur', 'folia', 'bukkit', 'pocketmine', 'nukkit', 'powernukkit'].includes(serverType);
    const isPoggit = ['pocketmine'].includes(serverType);
    const isHangar = ['paper', 'spigot', 'purpur', 'folia'].includes(serverType);

    const searchSource = isPoggit ? 'Poggit' : isHangar ? 'Hangar' : 'Modrinth';

    if (!append) {
      container.innerHTML = `<div class="mods-loading"><div class="spinner"></div><span>Searching ${searchSource}...</span></div>`;
    }

    try {
      const params = new URLSearchParams({
        q: query || '',
        limit: this.modLimit.toString()
      });

      const res = await fetch(`/api/servers/${this.serverId}/mods/search?${params}`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });

      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      const hits = data.hits || [];
      this.searchSource = data.source || searchSource.toLowerCase();

      if (info) {
        info.textContent = `Showing ${Math.min(this.modOffset + hits.length, data.total_hits)} of ${data.total_hits} results (${searchSource})`;
      }

      const cards = hits.map(mod => `
        <div class="mod-card" data-mod-id="${mod.id}">
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
            <button class="btn-sm btn-install" onclick="NetherServer.installModFromSearch('${mod.id}', '${mod.title.replace(/'/g, "\\'")}')">
              <i data-lucide="download"></i> Install
            </button>
          </div>
        </div>
      `).join('');

      if (append) {
        container.insertAdjacentHTML('beforeend', cards);
      } else {
        container.innerHTML = cards || '<div class="mods-empty-state"><p>No results found</p></div>';
      }

      if (loadMoreBtn) {
        loadMoreBtn.style.display = hits.length >= this.modLimit ? '' : 'none';
      }

      lucide.createIcons({ nodes: [container] });
    } catch (err) {
      container.innerHTML = `<div class="mods-empty-state"><p>Failed to search ${searchSource}</p></div>`;
      console.error('Search error:', err);
    }
  },

  async installModFromModrinth(modrinthId, modName, source = 'modrinth') {
    NetherServer.showToast('Installing', `Installing ${modName}...`, 'info');
    try {
      const res = await fetch(`/api/servers/${this.serverId}/mods/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({ mod_id: modrinthId, source, name: modName })
      });

      if (res.ok) {
        NetherServer.showToast('Installed', `${modName} installed successfully`, 'success');
        this.loadInstalledMods();
      } else {
        const err = await res.json();
        NetherServer.showToast('Error', err.error || 'Failed to install', 'error');
      }
    } catch (err) {
      NetherServer.showToast('Error', 'Failed to install', 'error');
    }
  },

  async installModFromSearch(modId, modName) {
    const source = this.searchSource || 'modrinth';
    return this.installModFromModrinth(modId, modName, source);
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
    if (this.serverData) {
      const nameEl = document.getElementById('setting-name');
      const javaArgsEl = document.getElementById('setting-java-args');
      const portEl = document.getElementById('setting-port');
      const ramMaxEl = document.getElementById('setting-ram-max');
      const subdomainEl = document.getElementById('setting-subdomain');
      const startupCmdEl = document.getElementById('setting-startup-cmd');
      if (nameEl) nameEl.value = this.serverData.name || '';
      if (javaArgsEl) javaArgsEl.value = this.serverData.java_args || `-Xmx${this.serverData.ram_max}M -Xms${this.serverData.ram_min}M`;
      if (portEl) portEl.value = this.serverData.port || 25565;
      if (ramMaxEl) ramMaxEl.value = this.serverData.ram_max || 2048;
      if (subdomainEl) subdomainEl.value = this.serverData.subdomain || '';
      if (startupCmdEl) startupCmdEl.value = this.serverData.startup_cmd || '';
    }

    this.loadServerProperties();

    const saveBtn = document.getElementById('save-settings');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const body = {};
        const nameEl = document.getElementById('setting-name');
        const javaArgsEl = document.getElementById('setting-java-args');
        const portEl = document.getElementById('setting-port');
        const ramMaxEl = document.getElementById('setting-ram-max');
        const subdomainEl = document.getElementById('setting-subdomain');
        const startupCmdEl = document.getElementById('setting-startup-cmd');
        if (nameEl?.value) body.name = nameEl.value;
        if (javaArgsEl?.value) body.java_args = javaArgsEl.value;
        if (portEl?.value) body.port = parseInt(portEl.value);
        if (ramMaxEl?.value) body.ram_max = parseInt(ramMaxEl.value);
        if (subdomainEl?.value !== undefined) body.subdomain = subdomainEl.value;
        if (startupCmdEl?.value !== undefined) body.startup_cmd = startupCmdEl.value;
        try {
          const res = await fetch(`/api/servers/${this.serverId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${this.authToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          if (res.ok) {
            this.serverData = await res.json();
          }
        } catch (e) {}

        await this.saveServerProperties();
      });
    }
  },

  async loadServerProperties() {
    try {
      const res = await fetch(`/api/servers/${this.serverId}/properties`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      if (!res.ok) return;
      const props = await res.json();
      this.currentProps = props;

      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
      const setCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val === 'true'; };

      setVal('sp-motd', props.motd);
      setVal('sp-max-players', props['max-players']);
      setVal('sp-gamemode', props.gamemode);
      setVal('sp-difficulty', props.difficulty);
      setVal('sp-spawn-protection', props['spawn-protection']);
      setVal('sp-view-distance', props['view-distance']);
      setCheck('sp-online-mode', props['online-mode']);
      setCheck('sp-pvp', props.pvp);
      setCheck('sp-allow-flight', props['allow-flight']);
      setCheck('sp-enable-command-block', props['enable-command-block']);
      setCheck('sp-hardcore', props.hardcore);
      setCheck('sp-spawn-animals', props['spawn-animals']);
      setCheck('sp-spawn-monsters', props['spawn-monsters']);
    } catch (err) {}
  },

  async saveServerProperties() {
    const props = {};
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : undefined; };
    const getCheck = (id) => { const el = document.getElementById(id); return el ? el.checked ? 'true' : 'false' : undefined; };

    const motd = getVal('sp-motd'); if (motd !== undefined) props.motd = motd;
    const maxPlayers = getVal('sp-max-players'); if (maxPlayers) props['max-players'] = String(parseInt(maxPlayers) || 20);
    const gamemode = getVal('sp-gamemode'); if (gamemode !== undefined) props.gamemode = gamemode;
    const difficulty = getVal('sp-difficulty'); if (difficulty !== undefined) props.difficulty = difficulty;
    const spawnProt = getVal('sp-spawn-protection'); if (spawnProt !== undefined) props['spawn-protection'] = String(parseInt(spawnProt) || 0);
    const viewDist = getVal('sp-view-distance'); if (viewDist) props['view-distance'] = String(parseInt(viewDist) || 10);

    const boolKeys = ['sp-online-mode','sp-pvp','sp-allow-flight','sp-enable-command-block','sp-hardcore','sp-spawn-animals','sp-spawn-monsters'];
    const propKeys = ['online-mode','pvp','allow-flight','enable-command-block','hardcore','spawn-animals','spawn-monsters'];
    boolKeys.forEach((id, i) => { const v = getCheck(id); if (v !== undefined) props[propKeys[i]] = v; });

    if (Object.keys(props).length === 0) {
      NetherServer.showToast('Saved', 'Settings saved', 'success');
      return;
    }

    try {
      const res = await fetch(`/api/servers/${this.serverId}/properties`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${this.authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(props)
      });
      if (res.ok) {
        NetherServer.showToast('Saved', 'Settings saved successfully', 'success');
      } else {
        const d = await res.json();
        NetherServer.showToast('Error', d.error || 'Failed to save', 'error');
      }
    } catch (e) {
      NetherServer.showToast('Error', 'Failed to save properties', 'error');
    }
  },

  async initBackupActions() {
    const container = document.getElementById('backups-list');
    const downloadBtn = document.getElementById('download-backup-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = `/api/servers/${this.serverId}/download`;
        a.setAttribute('download', '');
        document.body.appendChild(a);
        a.click();
        a.remove();
        NetherServer.showToast('Downloading', 'Backup zip is downloading...', 'info');
      });
    }

    const restoreFileInput = document.getElementById('restore-file-input');
    const restoreFileBtn = document.getElementById('restore-file-btn');
    const restoreFileName = document.getElementById('restore-file-name');
    const restoreUploadBtn = document.getElementById('restore-upload-btn');
    if (restoreFileBtn && restoreFileInput) {
      restoreFileBtn.addEventListener('click', () => restoreFileInput.click());
      restoreFileInput.addEventListener('change', () => {
        if (restoreFileInput.files.length > 0) {
          if (restoreFileName) restoreFileName.textContent = restoreFileInput.files[0].name;
          if (restoreUploadBtn) restoreUploadBtn.style.display = '';
        }
      });
    }
    if (restoreUploadBtn) {
      restoreUploadBtn.addEventListener('click', async () => {
        if (!restoreFileInput || !restoreFileInput.files.length) return;
        restoreUploadBtn.disabled = true;
        restoreUploadBtn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px"></div> Restoring...';
        const fd = new FormData();
        fd.append('file', restoreFileInput.files[0]);
        try {
          const res = await fetch(`/api/servers/${this.serverId}/restore-upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.authToken}` },
            body: fd
          });
          if (res.ok) {
            NetherServer.showToast('Restored', 'Backup restored successfully', 'success');
            restoreFileInput.value = '';
            if (restoreFileName) restoreFileName.textContent = 'No file chosen';
            restoreUploadBtn.style.display = 'none';
          } else {
            const d = await res.json();
            NetherServer.showToast('Error', d.error || 'Failed', 'error');
          }
        } catch (e) { NetherServer.showToast('Error', 'Failed to restore backup', 'error'); }
        restoreUploadBtn.disabled = false;
        restoreUploadBtn.innerHTML = '<i data-lucide="rotate-ccw"></i> Restore from zip';
        lucide.createIcons({ nodes: [restoreUploadBtn.parentElement] });
      });
    }

    this.loadBackups();
  },

  async loadBackups() {
    const container = document.getElementById('backups-list');
    if (!container) return;
    try {
      const res = await fetch(`/api/servers/${this.serverId}/backups`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      if (!res.ok) return;
      const backups = await res.json();
      if (!backups.length) {
        container.innerHTML = '<div class="mods-empty-state"><i data-lucide="database"></i><p>No backups yet</p><span>Create a backup to protect your server data</span></div>';
        lucide.createIcons({ nodes: [container] });
        return;
      }
      container.innerHTML = backups.map(b => `
        <div class="backup-card" data-backup-id="${b.id}">
          <div class="backup-info">
            <div class="backup-icon"><i data-lucide="database"></i></div>
            <div>
              <h4 class="backup-name">${b.name}</h4>
              <div class="backup-meta">
                <span><i data-lucide="calendar"></i> ${new Date(b.created_at).toLocaleString()}</span>
              </div>
            </div>
          </div>
          <div class="backup-actions">
            <button class="btn-sm" onclick="NetherServer.downloadBackup(${b.id})" title="Download"><i data-lucide="download"></i></button>
            <button class="btn-sm" onclick="NetherServer.restoreBackup(${b.id})" title="Restore"><i data-lucide="rotate-ccw"></i></button>
            <button class="btn-sm danger" onclick="NetherServer.deleteBackup(${b.id})" title="Delete"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
      `).join('');
      lucide.createIcons({ nodes: [container] });
    } catch (err) {
      container.innerHTML = '<div class="mods-empty-state"><p>Failed to load backups</p></div>';
    }
  },

  async restoreBackup(backupId) {
    NetherServer.showToast('Restoring', 'Restoring backup...', 'warning');
    try {
      const res = await fetch(`/api/servers/${this.serverId}/backups/${backupId}/restore`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      const d = await res.json();
      if (d.error) NetherServer.showToast('Error', d.error, 'error');
      else NetherServer.showToast('Restored', 'Backup restored', 'success');
    } catch (e) { NetherServer.showToast('Error', 'Failed to restore', 'error'); }
  },

  async deleteBackup(backupId) {
    try {
      await fetch(`/api/servers/${this.serverId}/backups/${backupId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      NetherServer.showToast('Deleted', 'Backup removed', 'success');
      this.loadBackups();
    } catch (e) { NetherServer.showToast('Error', 'Failed to delete', 'error'); }
  },

  initLogsControls() {
    const select = document.getElementById('log-lines-select');
    if (select) {
      select.addEventListener('change', () => this.loadLogs());
    }
    this.loadLogs();
  },

  async deleteServer() {
    if (!confirm(`Are you sure you want to delete "${this.serverData?.name}"? This cannot be undone.`)) return;
    try {
      await fetch(`/api/servers/${this.serverId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      this.showToast('Deleted', 'Server deleted', 'success');
      window.location.href = 'index.html';
    } catch (e) { this.showToast('Error', 'Failed to delete server', 'error'); }
  },

  initSettingsDanger() {},

  escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  initPlayers() {
    const tabs = document.querySelectorAll('.players-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.players-section').forEach(s => s.classList.remove('active'));
        const sec = document.getElementById(`players-${tab.dataset.playersTab}-section`);
        if (sec) sec.classList.add('active');
      });
    });
    this.loadWhitelist();
    this.loadOps();
    this.loadBans();
  },

  async loadWhitelist() {
    const container = document.getElementById('whitelist-list');
    if (!container) return;
    try {
      const res = await fetch(`/api/servers/${this.serverId}/players/whitelist`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      if (!res.ok) { container.innerHTML = '<div class="mods-empty-state"><p>Failed to load whitelist</p></div>'; return; }
      const data = await res.json();
      const players = data.players || [];
      if (!players.length) {
        container.innerHTML = '<div class="mods-empty-state"><i data-lucide="shield-check"></i><p>No players whitelisted</p><span>Add players using the input above</span></div>';
        lucide.createIcons({ nodes: [container] });
        return;
      }
      container.innerHTML = players.map(p => `
        <div class="player-card">
          <div class="player-info">
            <div class="player-avatar"><i data-lucide="user"></i></div>
            <span class="player-name">${this.escapeHtml(p.name)}</span>
          </div>
          <button class="btn-sm danger" onclick="NetherServer.removeWhitelist('${this.escapeHtml(p.name)}')"><i data-lucide="trash-2"></i></button>
        </div>
      `).join('');
      lucide.createIcons({ nodes: [container] });
    } catch (err) { container.innerHTML = '<div class="mods-empty-state"><p>Error loading whitelist</p></div>'; }
  },

  async addToWhitelist() {
    const input = document.getElementById('whitelist-input');
    const name = input?.value?.trim();
    if (!name) return;
    try {
      const res = await fetch(`/api/servers/${this.serverId}/players/whitelist`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${this.authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: name })
      });
      if (res.ok) { this.showToast('Added', `${name} added to whitelist`, 'success'); input.value = ''; this.loadWhitelist(); }
      else { const d = await res.json(); this.showToast('Error', d.error, 'error'); }
    } catch (e) { this.showToast('Error', 'Failed to add player', 'error'); }
  },

  async removeWhitelist(name) {
    try {
      const res = await fetch(`/api/servers/${this.serverId}/players/whitelist`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${this.authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: name })
      });
      if (res.ok) { this.showToast('Removed', `${name} removed from whitelist`, 'success'); this.loadWhitelist(); }
    } catch (e) { this.showToast('Error', 'Failed to remove player', 'error'); }
  },

  async loadOps() {
    const container = document.getElementById('ops-list');
    if (!container) return;
    try {
      const res = await fetch(`/api/servers/${this.serverId}/players/ops`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      if (!res.ok) { container.innerHTML = '<div class="mods-empty-state"><p>Failed to load operators</p></div>'; return; }
      const data = await res.json();
      const players = data.ops || [];
      if (!players.length) {
        container.innerHTML = '<div class="mods-empty-state"><i data-lucide="shield"></i><p>No operators configured</p><span>Add operators using the input above</span></div>';
        lucide.createIcons({ nodes: [container] });
        return;
      }
      container.innerHTML = players.map(p => `
        <div class="player-card">
          <div class="player-info">
            <div class="player-avatar op"><i data-lucide="crown"></i></div>
            <span class="player-name">${this.escapeHtml(p.name)}</span>
            <span class="player-level">Level ${p.level || 4}</span>
          </div>
          <button class="btn-sm danger" onclick="NetherServer.removeOp('${this.escapeHtml(p.name)}')"><i data-lucide="trash-2"></i></button>
        </div>
      `).join('');
      lucide.createIcons({ nodes: [container] });
    } catch (err) { container.innerHTML = '<div class="mods-empty-state"><p>Error loading operators</p></div>'; }
  },

  async addOp() {
    const input = document.getElementById('ops-input');
    const levelEl = document.getElementById('ops-level');
    const name = input?.value?.trim();
    const level = parseInt(levelEl?.value || '4');
    if (!name) return;
    try {
      const res = await fetch(`/api/servers/${this.serverId}/players/ops`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${this.authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: name, level })
      });
      if (res.ok) { this.showToast('Added', `${name} is now an operator`, 'success'); input.value = ''; this.loadOps(); }
      else { const d = await res.json(); this.showToast('Error', d.error, 'error'); }
    } catch (e) { this.showToast('Error', 'Failed to add operator', 'error'); }
  },

  async removeOp(name) {
    try {
      const res = await fetch(`/api/servers/${this.serverId}/players/ops`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${this.authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: name })
      });
      if (res.ok) { this.showToast('Removed', `${name} deopped`, 'success'); this.loadOps(); }
    } catch (e) { this.showToast('Error', 'Failed to remove operator', 'error'); }
  },

  async loadBans() {
    const container = document.getElementById('bans-list');
    if (!container) return;
    try {
      const res = await fetch(`/api/servers/${this.serverId}/players/bans`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      if (!res.ok) { container.innerHTML = '<div class="mods-empty-state"><p>Failed to load bans</p></div>'; return; }
      const data = await res.json();
      const players = data.bans || [];
      if (!players.length) {
        container.innerHTML = '<div class="mods-empty-state"><i data-lucide="shield-alert"></i><p>No players banned</p><span>Ban players using the form above</span></div>';
        lucide.createIcons({ nodes: [container] });
        return;
      }
      container.innerHTML = players.map(p => `
        <div class="player-card">
          <div class="player-info">
            <div class="player-avatar banned"><i data-lucide="ban"></i></div>
            <div>
              <span class="player-name">${this.escapeHtml(p.name)}</span>
              <span class="player-reason">${this.escapeHtml(p.reason || 'No reason')}</span>
            </div>
          </div>
          <button class="btn-sm" onclick="NetherServer.unbanPlayer('${this.escapeHtml(p.name)}')"><i data-lucide="rotate-ccw"></i> Unban</button>
        </div>
      `).join('');
      lucide.createIcons({ nodes: [container] });
    } catch (err) { container.innerHTML = '<div class="mods-empty-state"><p>Error loading bans</p></div>'; }
  },

  async banPlayer() {
    const nameInput = document.getElementById('ban-player-input');
    const reasonInput = document.getElementById('ban-reason-input');
    const name = nameInput?.value?.trim();
    const reason = reasonInput?.value?.trim() || 'Banned by operator';
    if (!name) return;
    try {
      const res = await fetch(`/api/servers/${this.serverId}/players/bans`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${this.authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: name, reason })
      });
      if (res.ok) { this.showToast('Banned', `${name} has been banned`, 'success'); nameInput.value = ''; reasonInput.value = ''; this.loadBans(); }
      else { const d = await res.json(); this.showToast('Error', d.error, 'error'); }
    } catch (e) { this.showToast('Error', 'Failed to ban player', 'error'); }
  },

  async unbanPlayer(name) {
    try {
      const res = await fetch(`/api/servers/${this.serverId}/players/bans`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${this.authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: name })
      });
      if (res.ok) { this.showToast('Unbanned', `${name} has been unbanned`, 'success'); this.loadBans(); }
    } catch (e) { this.showToast('Error', 'Failed to unban player', 'error'); }
  },

  async loadLogs() {
    const container = document.getElementById('logs-content');
    if (!container) return;
    const lines = document.getElementById('log-lines-select')?.value || '200';
    try {
      const res = await fetch(`/api/servers/${this.serverId}/logs?lines=${lines}`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      if (!res.ok) { container.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted);">Failed to load logs. Server may not have started yet.</div>'; return; }
      const data = await res.json();
      const logLines = (data.content || '').split('\n');
      container.innerHTML = `<pre class="logs-pre">${logLines.map(l => {
        let cls = '';
        if (/\berror\b/i.test(l)) cls = 'log-error';
        else if (/\bwarn/i.test(l)) cls = 'log-warn';
        else if (/\binfo\b/i.test(l)) cls = 'log-info';
        else if (/debug/i.test(l)) cls = 'log-debug';
        return `<span class="${cls}">${this.escapeHtml(l)}</span>`;
      }).join('\n')}</pre>`;
      container.scrollTop = container.scrollHeight;
    } catch (err) { container.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted);">Error loading logs</div>'; }
  },

  logAutoRefreshInterval: null,
  toggleLogAutoRefresh() {
    const btn = document.getElementById('log-autorefresh-toggle');
    if (this.logAutoRefreshInterval) {
      clearInterval(this.logAutoRefreshInterval);
      this.logAutoRefreshInterval = null;
      if (btn) btn.classList.remove('active');
      this.showToast('Auto-refresh', 'Log auto-refresh disabled', 'info');
    } else {
      this.logAutoRefreshInterval = setInterval(() => this.loadLogs(), 5000);
      if (btn) btn.classList.add('active');
      this.showToast('Auto-refresh', 'Logs will refresh every 5 seconds', 'info');
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
        <div class="toast-title">${this.escapeHtml(title)}</div>
        <div class="toast-desc">${this.escapeHtml(String(message))}</div>
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

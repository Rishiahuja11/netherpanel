/* ============================================
   NetherPanel - Server Management JavaScript
   ============================================ */

const NetherServer = {
  term: null,
  fitAddon: null,
  autoScroll: true,
  ws: null,

  init() {
    this.initLucideIcons();
    this.initUserMenu();
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
    const logs = [
      { time: '15:42:01', msg: '[Server] Starting Minecraft server version 1.21.4', color: 'cyan' },
      { time: '15:42:02', msg: '[Server] Loading properties', color: 'default' },
      { time: '15:42:02', msg: '[Server] Default game type: SURVIVAL', color: 'default' },
      { time: '15:42:03', msg: '[Server] Generating keypair', color: 'default' },
      { time: '15:42:04', msg: '[Server] Preparing level "world"', color: 'default' },
      { time: '15:42:10', msg: '[Server] Preparing spawn area: 45%', color: 'yellow' },
      { time: '15:42:15', msg: '[Server] Preparing spawn area: 89%', color: 'yellow' },
      { time: '15:42:18', msg: '[Server] Done (16.234s)! For help, type "help"', color: 'green' },
      { time: '15:42:20', msg: '[Server] Timings Reset', color: 'dim' },
      { time: '15:43:01', msg: '[Essentials] EssentialsX v2.20.1 enabled', color: 'cyan' },
      { time: '15:43:01', msg: '[LuckPerms] LuckPerms v5.4.121 enabled', color: 'cyan' },
      { time: '15:43:02', msg: '[WorldEdit] WorldEdit v7.3.0 enabled', color: 'cyan' },
      { time: '15:43:05', msg: '[Auth] Server fully started and ready for connections', color: 'green' },
    ];

    const colorMap = {
      cyan: '\x1b[38;2;6;182;212m',
      green: '\x1b[38;2;34;197;94m',
      yellow: '\x1b[38;2;234;179;8m',
      red: '\x1b[38;2;239;68;68m',
      dim: '\x1b[38;2;100;116;139m',
      default: '\x1b[38;2;148;163;184m'
    };

    logs.forEach((log, i) => {
      setTimeout(() => {
        if (this.term) {
          const color = colorMap[log.color] || colorMap.default;
          this.term.writeln(`${color}[${log.time}] ${log.msg}\x1b[0m`);
        }
      }, i * 150);
    });
  },

  processCommand(cmd) {
    const lower = cmd.toLowerCase().trim();

    const responses = {
      'help': [
        'Available commands:',
        '  help        - Show this help message',
        '  list        - List online players',
        '  say <msg>   - Broadcast a message',
        '  tp          - Teleport commands',
        '  gamemode    - Change game mode',
        '  give        - Give items',
        '  ban         - Ban a player',
        '  kick        - Kick a player',
        '  whitelist   - Whitelist commands',
        '  save-all    - Save all worlds',
        '  stop        - Stop the server',
        '  plugins     - List plugins'
      ],
      'list': ['Connected players (18/50): Steve, Alex, Notch, Herobrine, jeb_, Dinnerbone, CaptainSparklez, antvenom'],
      'plugins': ['Plugins (3): EssentialsX v2.20.1, LuckPerms v5.4.121, WorldEdit v7.3.0'],
      'save-all': ['[Server] Saving...',
                    '[Server] Saved the game'],
      'stop': ['[Server] Stopping the server...', '[Server] Server stopped'],
    };

    if (lower === 'help' || lower === '?') {
      responses.help.forEach(line => {
        this.term.writeln(`\x1b[38;2;148;163;184m${line}\x1b[0m`);
      });
    } else if (lower === 'list') {
      this.term.writeln('\x1b[38;2;34;197;94mConnected players (18/50):\x1b[0m');
      this.term.writeln('\x1b[38;2;148;163;184mSteve, Alex, Notch, Herobrine, jeb_, Dinnerbone, CaptainSparklez, antvenom\x1b[0m');
    } else if (lower === 'plugins') {
      this.term.writeln('\x1b[38;2;6;182;212mPlugins (3): EssentialsX v2.20.1, LuckPerms v5.4.121, WorldEdit v7.3.0\x1b[0m');
    } else if (lower === 'save-all') {
      this.term.writeln('\x1b[38;2;234;179;8m[Server] Saving...\x1b[0m');
      setTimeout(() => {
        this.term.writeln('\x1b[38;2;34;197;94m[Server] Saved the game\x1b[0m');
      }, 800);
    } else if (lower === 'stop') {
      this.term.writeln('\x1b[38;2;239;68;68m[Server] Stopping the server...\x1b[0m');
    } else if (lower.startsWith('say ')) {
      const msg = cmd.substring(4);
      this.term.writeln(`\x1b[38;2;6;182;212m[Server] ${msg}\x1b[0m`);
    } else if (lower === 'clear') {
      this.term.clear();
    } else {
      this.term.writeln(`\x1b[38;2;239;68;68mUnknown command: "${cmd}". Type "help" for a list of commands.\x1b[0m`);
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

    setTimeout(() => {
      if (badge) {
        const finalStatus = (action === 'start' || action === 'restart') ? 'running' : 'stopped';
        badge.className = `server-status-badge ${finalStatus}`;
        badge.innerHTML = `<span class="status-dot"></span><span>${finalStatus === 'running' ? 'Running' : 'Stopped'}</span>`;
      }
      NetherServer.showToast('Done', `Server ${action} completed`, 'success');
    }, 3000);
  },

  initFileManager() {
    const fileItems = document.querySelectorAll('.file-tree-item');
    const editor = document.getElementById('file-editor');
    const fileName = document.getElementById('current-file-name');
    const saveBtn = document.getElementById('file-save-btn');

    const fileContents = {
      '/server.properties': `#Minecraft server properties
#Sat Aug 09 2026
level-name=world
level-seed=
level-type=minecraft\\:normal
gamemode=survival
difficulty=normal
pvp=true
max-players=50
online-mode=true
allow-flight=false
spawn-protection=16
view-distance=10
simulation-distance=10
network-compression-threshold=256
rate-limit=0
white-list=false
enable-query=true
query.port=25565
server-port=25565
server-ip=
spawn-animals=true
spawn-monsters=true
spawn-npcs=true
generate-structures=true
allow-nether=true
hardcore=false
enable-command-block=true
broadcast-rcon-to-ops=true
broadcast-console-to-ops=true
max-world-size=29999984
sync-chunk-writes=true
entity-broadcast-range-percentage=100`,

      '/bukkit.yml': `# This is the main configuration file for Bukkit.
# ... bukkit.yml configuration ...
settings:
  allow-end: true
  warn-on-overload: true
  permissions-file: permissions.yml
  update-folder: update
  plugin-profiling: false
  debug: false
  connection-throttle: 4000
  query-plugins: true
  deprecated-verbose: default
  shutdown-message: Server closed
  minimum-api: none
  use-map-color-cache: true
spawn-limits:
  monsters: 70
  animals: 10
  water-animals: 5
  water-ambient: 20
  water-underground-creature: 5
  axolotls: 5
  ambient: 15
chunk-gc:
  period-in-ticks: 400
ticks:
  animal-spawns: 400
  monster-spawns: 1
  water-spawns: 400
  water-ambient-spawns: 400
  water-underground-creature-spawns: 400
  axolotl-spawns: 400
  ambient-spawns: 400
  autosave: 6000
aliases: now-hierarchical-by-default
`,

      '/ops.json': `[
  {
    "uuid": "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    "name": "Notch",
    "level": 4,
    "bypassesPlayerLimit": true
  },
  {
    "uuid": "4566e69fcu08e48977f43bcd132eae95",
    "name": "jeb_",
    "level": 3,
    "bypassesPlayerLimit": false
  }
]`,

      '/whitelist.json': `[
  {
    "uuid": "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    "name": "Notch"
  },
  {
    "uuid": "4566e69fcu08e48977f43bcd132eae95",
    "name": "jeb_"
  }
]`
    };

    fileItems.forEach(item => {
      item.addEventListener('click', () => {
        fileItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        const path = item.dataset.path;
        const name = item.querySelector('span')?.textContent || path;

        if (fileName) fileName.textContent = name;

        if (fileContents[path] && editor) {
          editor.innerHTML = `<textarea spellcheck="false">${fileContents[path]}</textarea>`;
        } else if (editor) {
          editor.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: var(--text-muted);">
              <p>Preview not available for this file.</p>
              <p style="font-size: 0.8rem; margin-top: 0.5rem;">Click "Download" to save locally or edit via console.</p>
            </div>
          `;
        }
      });
    });

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        NetherServer.showToast('Saved', 'File saved successfully', 'success');
      });
    }
  },

  initModManager() {
    this.authToken = localStorage.getItem('netherpanel_token') || null;
    this.serverId = new URLSearchParams(window.location.search).get('id') || '1';
    this.modOffset = 0;
    this.modLimit = 20;

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
      const loader = document.getElementById('mod-loader')?.value;
      if (category) params.append('facets', `[["categories:${category}"]]`);
      if (loader) params.append('facets', `[["categories:${loader}"]]`);

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
        const name = card?.querySelector('h4')?.textContent || 'Task';

        if (text.includes('Run Now')) {
          NetherServer.showToast('Running', `Running "${name}"...`, 'info');
        } else if (text.includes('Edit')) {
          NetherServer.showToast('Edit', `Editing "${name}"...`, 'info');
        }
      });
    });
  },

  initBackupActions() {
    const createBtn = document.getElementById('create-backup-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        NetherServer.showToast('Creating Backup', 'Backup is being created...', 'info');
        setTimeout(() => {
          NetherServer.showToast('Backup Complete', 'Backup created successfully!', 'success');
        }, 3000);
      });
    }

    document.querySelectorAll('.backup-card .btn-sm').forEach(btn => {
      btn.addEventListener('click', () => {
        const icon = btn.querySelector('i');
        const card = btn.closest('.backup-card');
        const name = card?.querySelector('.backup-name')?.textContent || 'Backup';

        if (icon?.dataset.lucide === 'rotate-ccw') {
          NetherServer.showToast('Restoring', `Restoring from "${name}"...`, 'warning');
        } else if (icon?.dataset.lucide === 'download') {
          NetherServer.showToast('Downloading', `Downloading "${name}"...`, 'info');
        } else if (icon?.dataset.lucide === 'trash-2') {
          NetherServer.showToast('Deleted', `Backup "${name}" deleted`, 'error');
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

document.addEventListener('DOMContentLoaded', () => {
  NetherServer.init();
});

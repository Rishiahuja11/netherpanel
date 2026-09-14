/* ============================================
   NetherPanel - Admin Panel JavaScript
   ============================================ */

const Admin = {
  user: null,
  users: [],
  servers: [],
  editingUserId: null,
  resetUserId: null,

  init() {
    this.user = this.getUser();
    if (!this.user) {
      window.location.href = 'login.html';
      return;
    }
    if (this.user.role !== 'admin') {
      window.location.href = 'index.html';
      return;
    }
    this.initNav();
    this.initUserMenu();
    this.initModals();
    this.initSettingsForm();
    this.loadSection('overview');
    lucide.createIcons();
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch (e) {
      return null;
    }
  },

  async apiCall(url, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) { try { data = await res.json(); } catch (e) {} }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
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
    setTimeout(() => { toast.classList.add('leaving'); setTimeout(() => toast.remove(), 300); }, 5000);
  },

  initNav() {
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.loadSection(tab.dataset.tab);
      });
    });
  },

  async loadSection(tab) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    const section = document.getElementById(`section-${tab}`);
    if (section) section.classList.add('active');

    if (tab === 'overview') await this.loadOverview();
    else if (tab === 'users') await this.loadUsers();
    else if (tab === 'servers') await this.loadServers();
    else if (tab === 'settings') await this.loadSettings();
  },

  setLoading(elementId, msg = 'Loading...') {
    document.getElementById(elementId).innerHTML = `<tr><td colspan="8"><div class="empty-state"><p>${msg}</p></div></td></tr>`;
  },

  async loadOverview() {
    try {
      const stats = await this.apiCall('/api/admin/stats');
      document.getElementById('stat-users').textContent = stats.users.total;
      document.getElementById('stat-servers').textContent = stats.servers.total;
      document.getElementById('stat-running').textContent = stats.servers.running;
      document.getElementById('stat-ram').innerHTML = `${this.escapeHtml(stats.resources.running_ram)} <span class="stat-unit">MB</span>`;

      const bars = [
        { label: 'Running', value: stats.servers.running, color: 'var(--accent-green)' },
        { label: 'Stopped', value: stats.servers.stopped, color: 'var(--text-muted)' },
        { label: 'Crashed', value: stats.servers.crashed, color: 'var(--error)' }
      ];
      const max = Math.max(1, stats.servers.total);
      document.getElementById('server-status-bars').innerHTML = bars.map(b => `
        <div class="admin-bar-row">
          <span>${b.label}</span>
          <div class="admin-bar-track"><div class="admin-bar-fill" style="width:${(b.value / max) * 100}%;background:${b.color}"></div></div>
          <strong>${b.value}</strong>
        </div>
      `).join('');

      const logs = await this.apiCall('/api/admin/logs?limit=8');
      const list = document.getElementById('recent-logs');
      if (!logs.length) {
        list.innerHTML = `<div class="empty-state"><p>No activity yet</p></div>`;
      } else {
        list.innerHTML = logs.map(log => `
          <div class="admin-log-item">
            <span class="log-dot ${log.resource_type || 'action'}"></span>
            <div class="log-text">
              <strong>${this.escapeHtml(log.username || 'system')}</strong>
              <span>${this.escapeHtml(log.details || log.action)}</span>
            </div>
            <time>${this.escapeHtml((log.created_at || '').slice(0, 16).replace('T', ' '))}</time>
          </div>
        `).join('');
      }
      lucide.createIcons();
    } catch (err) {
      this.showToast('Error', err.message, 'error');
    }
  },

  async loadUsers() {
    this.setLoading('users-body');
    try {
      const [users, servers] = await Promise.all([
        this.apiCall('/api/admin/users'),
        this.apiCall('/api/admin/servers')
      ]);
      this.users = users;
      this.servers = servers;

      const ownerCounts = {};
      servers.forEach(s => { ownerCounts[s.user_id] = (ownerCounts[s.user_id] || 0) + 1; });

      const body = document.getElementById('users-body');
      if (!users.length) {
        body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>No users</p></div></td></tr>`;
        return;
      }
      body.innerHTML = users.map(u => `
        <tr>
          <td>
            <div class="user-cell">
              <div class="avatar-circle sm">${this.escapeHtml((u.username || '?')[0].toUpperCase())}</div>
              <div>
                <strong>${this.escapeHtml(u.username)}</strong>
                ${u.must_change_password ? '<span class="tag tag-warn">pwd&nbsp;change</span>' : ''}
              </div>
            </div>
          </td>
          <td class="muted">${this.escapeHtml(u.email || '-')}</td>
          <td><span class="tag ${u.role === 'admin' ? 'tag-admin' : 'tag-user'}">${this.escapeHtml(u.role)}</span></td>
          <td>${ownerCounts[u.id] || 0}</td>
          <td class="muted">${this.escapeHtml((u.created_at || '').slice(0, 10))}</td>
          <td class="td-actions">
            <button class="btn-icon" data-action="edit" data-id="${u.id}" title="Edit"><i data-lucide="pencil"></i></button>
            <button class="btn-icon" data-action="resetpw" data-id="${u.id}" title="Reset password"><i data-lucide="key-round"></i></button>
            ${u.username !== 'admin' ? `<button class="btn-icon danger" data-action="delete" data-id="${u.id}" title="Delete"><i data-lucide="trash-2"></i></button>` : ''}
          </td>
        </tr>
      `).join('');
      lucide.createIcons();

      body.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = parseInt(btn.dataset.id, 10);
          const action = btn.dataset.action;
          if (action === 'edit') this.editUser(id);
          else if (action === 'resetpw') this.openResetPassword(id);
          else if (action === 'delete') this.deleteUser(id);
        });
      });
    } catch (err) {
      document.getElementById('users-body').innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>${this.escapeHtml(err.message)}</p></div></td></tr>`;
    }
  },

  async loadServers() {
    this.setLoading('servers-body');
    try {
      const servers = await this.apiCall('/api/admin/servers');
      this.servers = servers;
      const users = this.users.length ? this.users : await this.apiCall('/api/admin/users');
      this.users = users;
      const nameById = {};
      users.forEach(u => { nameById[u.id] = u.username; });

      const body = document.getElementById('servers-body');
      if (!servers.length) {
        body.innerHTML = `<tr><td colspan="7"><div class="empty-state"><p>No servers</p></div></td></tr>`;
        return;
      }
      body.innerHTML = servers.map(s => `
        <tr>
          <td><a href="server.html?id=${s.id}" class="cell-link"><strong>${this.escapeHtml(s.name)}</strong></a></td>
          <td class="muted">${this.escapeHtml(nameById[s.user_id] || '-')}</td>
          <td class="muted">${this.escapeHtml(s.server_type)}</td>
          <td class="muted">${this.escapeHtml(s.game_type)}</td>
          <td class="muted">${this.escapeHtml(s.ram_min)}-${this.escapeHtml(s.ram_max)} MB</td>
          <td><span class="status-pill ${s.status}">${this.escapeHtml(s.status)}</span></td>
          <td class="td-actions">
            <button class="btn-icon" data-pow="start" data-id="${s.id}" title="Start" ${s.status === 'running' && s.is_running ? 'disabled' : ''}><i data-lucide="play"></i></button>
            <button class="btn-icon" data-pow="stop" data-id="${s.id}" title="Stop" ${!(s.status === 'running' && s.is_running) ? 'disabled' : ''}><i data-lucide="square"></i></button>
            <button class="btn-icon" data-pow="restart" data-id="${s.id}" title="Restart" ${s.status !== 'running' || !s.is_running ? 'disabled' : ''}><i data-lucide="refresh-ccw"></i></button>
            <button class="btn-icon danger" data-pow="delete" data-id="${s.id}" title="Delete"><i data-lucide="trash-2"></i></button>
          </td>
        </tr>
      `).join('');
      lucide.createIcons();

      body.querySelectorAll('button[data-pow]').forEach(btn => {
        btn.addEventListener('click', () => this.serverAction(btn.dataset.pow, parseInt(btn.dataset.id, 10)));
      });
    } catch (err) {
      document.getElementById('servers-body').innerHTML = `<tr><td colspan="7"><div class="empty-state"><p>${this.escapeHtml(err.message)}</p></div></td></tr>`;
    }
  },

  async serverAction(action, id) {
    const server = this.servers.find(s => s.id === id);
    if (!server) return;
    if (action === 'delete') {
      if (!confirm(`Delete server "${server.name}" and all its files? This cannot be undone.`)) return;
    }
    try {
      await this.apiCall(`/api/admin/servers/${id}/${action}`, 'POST');
      if (action === 'delete') {
        await this.apiCall(`/api/admin/servers/${id}`, 'DELETE');
        this.showToast('Success', 'Server deleted', 'success');
      } else {
        this.showToast('Success', `Server ${action} requested`, 'success');
      }
      this.loadServers();
    } catch (err) {
      this.showToast('Error', err.message, 'error');
    }
  },

  editUser(id) {
    const user = this.users.find(u => u.id === id);
    if (!user) return;
    this.editingUserId = id;
    document.getElementById('user-modal-title').textContent = `Edit ${user.username}`;
    document.getElementById('user-username').value = user.username;
    document.getElementById('user-email').value = user.email || '';
    document.getElementById('user-password-group').style.display = 'none';
    document.getElementById('user-password').value = '';
    document.getElementById('user-password').removeAttribute('required');
    document.getElementById('user-admin-role').checked = user.role === 'admin';
    document.getElementById('user-force-change').checked = !!user.must_change_password;
    document.getElementById('user-modal').classList.add('active');
  },

  openAddUser() {
    this.editingUserId = null;
    document.getElementById('user-modal-title').textContent = 'Add User';
    document.getElementById('user-form').reset();
    document.getElementById('user-password-group').style.display = 'block';
    document.getElementById('user-password').setAttribute('required', '');
    document.getElementById('user-username').value = '';
    document.getElementById('user-email').value = '';
    document.getElementById('user-admin-role').checked = false;
    document.getElementById('user-force-change').checked = true;
    document.getElementById('user-modal').classList.add('active');
  },

  async saveUser(e) {
    e.preventDefault();
    const username = document.getElementById('user-username').value.trim();
    const email = document.getElementById('user-email').value.trim();
    const password = document.getElementById('user-password').value;
    const isAdmin = document.getElementById('user-admin-role').checked;
    const forceChange = document.getElementById('user-force-change').checked;

    try {
      if (this.editingUserId) {
        const body = { username, email };
        if (email) body.email = email;
        body.role = isAdmin ? 'admin' : 'user';
        body.must_change_password = forceChange;
        await this.apiCall(`/api/admin/users/${this.editingUserId}`, 'PUT', body);
      } else {
        if (password.length < 8) throw new Error('Password must be at least 8 characters');
        await this.apiCall('/api/admin/users', 'POST', {
          username, email, password, role: isAdmin ? 'admin' : 'user', must_change_password: forceChange
        });
      }
      this.closeModal('user-modal');
      this.showToast('Success', 'User saved', 'success');
      this.loadUsers();
    } catch (err) {
      this.showToast('Error', err.message, 'error');
    }
  },

  openResetPassword(id) {
    this.resetUserId = id;
    document.getElementById('reset-password-input').value = '';
    document.getElementById('password-modal').classList.add('active');
  },

  async doResetPassword() {
    const newPassword = document.getElementById('reset-password-input').value;
    if (newPassword.length < 8) {
      this.showToast('Error', 'Password must be at least 8 characters', 'error');
      return;
    }
    try {
      await this.apiCall(`/api/admin/users/${this.resetUserId}/reset-password`, 'POST', { newPassword });
      this.closeModal('password-modal');
      this.showToast('Success', 'Password reset', 'success');
    } catch (err) {
      this.showToast('Error', err.message, 'error');
    }
  },

  async deleteUser(id) {
    const user = this.users.find(u => u.id === id);
    if (!user) return;
    if (!confirm(`Delete user "${user.username}"? This will remove their servers and access.`)) return;
    try {
      await this.apiCall(`/api/admin/users/${id}`, 'DELETE');
      this.showToast('Success', 'User deleted', 'success');
      this.loadUsers();
    } catch (err) {
      this.showToast('Error', err.message, 'error');
    }
  },

  async loadSettings() {
    try {
      const settings = await this.apiCall('/api/admin/settings');
      const map = {};
      settings.forEach(s => { map[s.key] = s.value; });
      document.getElementById('set-panel-name').value = map['panel_name'] || '';
      document.getElementById('set-max-servers').value = map['max_servers_per_user'] || '';
      document.getElementById('set-ram-user').value = map['ram_per_user'] || '';
      document.getElementById('set-ram-limit').value = map['resource_ram_limit'] || '';
      document.getElementById('set-allow-reg').checked = map['allow_registrations'] !== 'false';
    } catch (err) {
      this.showToast('Error', err.message, 'error');
    }
  },

  async saveSettings() {
    const settings = [
      { key: 'panel_name', value: document.getElementById('set-panel-name').value.trim() || 'NetherPanel' },
      { key: 'max_servers_per_user', value: String(Math.max(1, parseInt(document.getElementById('set-max-servers').value, 10) || 1)) },
      { key: 'ram_per_user', value: String(Math.max(0, parseInt(document.getElementById('set-ram-user').value, 10) || 0)) },
      { key: 'resource_ram_limit', value: String(Math.max(0, parseInt(document.getElementById('set-ram-limit').value, 10) || 0)) },
      { key: 'allow_registrations', value: document.getElementById('set-allow-reg').checked ? 'true' : 'false' }
    ];
    try {
      await this.apiCall('/api/admin/settings', 'PUT', { settings });
      this.showToast('Success', 'Settings saved', 'success');
      try {
        const cfg = await this.apiCall('/api/client/config');
        this.user = JSON.parse(localStorage.getItem('user') || '{}');
        this.user.must_change_password = 0;
        localStorage.setItem('user', JSON.stringify(this.user));
      } catch (e) {}
    } catch (err) {
      this.showToast('Error', err.message, 'error');
    }
  },

  initSettingsForm() {
    document.getElementById('btn-save-settings').addEventListener('click', () => this.saveSettings());
    document.getElementById('btn-add-user').addEventListener('click', () => this.openAddUser());
  },

  initModals() {
    document.getElementById('user-form').addEventListener('submit', e => this.saveUser(e));
    document.getElementById('close-user-modal').addEventListener('click', () => this.closeModal('user-modal'));
    document.getElementById('close-password-modal').addEventListener('click', () => this.closeModal('password-modal'));
    document.getElementById('btn-reset-password').addEventListener('click', () => this.doResetPassword());
  },

  closeModal(id) {
    document.getElementById(id).classList.remove('active');
  },

  initUserMenu() {
    const user = this.user;
    document.getElementById('user-avatar').textContent = (user.username || '?')[0].toUpperCase();
    document.getElementById('user-avatar-lg').textContent = (user.username || '?')[0].toUpperCase();
    document.getElementById('dropdown-user-name').textContent = user.username;
    document.getElementById('dropdown-user-email').textContent = user.email || '-';

    const toggle = document.getElementById('user-menu-toggle');
    const menu = document.querySelector('.user-menu');
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    document.addEventListener('click', () => menu.classList.remove('open'));
    document.getElementById('btn-logout').addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = 'login.html';
    });
  }
};

document.addEventListener('DOMContentLoaded', () => Admin.init());
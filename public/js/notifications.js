/* NetherPanel - Notification bell (shared by index.html and server.html) */
(function () {
  function token() { return localStorage.getItem('token'); }
  function auth() { return { 'Authorization': `Bearer ${token()}` }; }

  function loadNotifications() {
    fetch('/api/me/notifications', { headers: auth() })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        const items = (data && data.items) || [];
        renderList(items);
        renderBadge(data.unread || 0);
      })
      .catch(() => {});
  }

  function renderBadge(count) {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    if (count > 0) {
      badge.style.display = 'flex';
      badge.textContent = count > 99 ? '99+' : count;
    } else {
      badge.style.display = 'none';
    }
  }

  function renderList(items) {
    const list = document.getElementById('notif-list');
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<div class="notif-empty">No notifications</div>';
      return;
    }
    list.innerHTML = items.map(n => `
      <div class="notif-item ${n.read ? 'read' : ''} type-${n.type}">
        <div class="notif-title">${escapeHtml(n.title)}</div>
        ${n.body ? `<div class="notif-body">${escapeHtml(n.body)}</div>` : ''}
        <div class="notif-time">${timeAgo(n.created_at)}</div>
      </div>`).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function markAllRead() {
    fetch('/api/me/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() } })
      .then(() => loadNotifications())
      .catch(() => {});
  }

  function timeAgo(iso) {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    const secs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secs < 60) return 'just now';
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function init() {
    const wrap = document.getElementById('notif-wrap');
    const btn = document.getElementById('btn-notifications');
    const dropdown = document.getElementById('notif-dropdown');
    if (!btn || !dropdown) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = dropdown.classList.toggle('open');
      if (open) loadNotifications();
    });
    document.addEventListener('click', (e) => {
      if (wrap && !wrap.contains(e.target)) dropdown.classList.remove('open');
    });
    document.getElementById('btn-mark-read')?.addEventListener('click', markAllRead);

    loadNotifications();
    setInterval(loadNotifications, 15000);

    if (typeof io !== 'undefined') {
      const socket = io();
      socket.on('connect', () => {
        if (token()) socket.emit('auth', token());
      });
      socket.on('notification', (n) => {
        if (n && n.userId && String(n.userId) === String((JSON.parse(localStorage.getItem('user') || '{}')).id)) {
          loadNotifications();
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

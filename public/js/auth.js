/* ============================================
   NetherPanel - Auth Page JavaScript
   ============================================ */

const NetherAuth = {
  init() {
    this.initParticles();
    this.initTabs();
    this.initPasswordToggle();
    this.initPasswordStrength();
    this.initFormSubmissions();
    this.initLucideIcons();
    this.checkExistingSession();
  },

  initLucideIcons() {
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  checkExistingSession() {
    const token = localStorage.getItem('token');
    if (token) {
      window.location.href = 'index.html';
    }
  },

  initParticles() {},

  initTabs() {
    const tabs = document.querySelectorAll('.auth-tab');
    const forms = document.querySelectorAll('.auth-form');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        forms.forEach(f => {
          f.classList.remove('active');
          if (f.id === `${target}-form`) f.classList.add('active');
        });
      });
    });
  },

  initPasswordToggle() {
    document.querySelectorAll('.toggle-password').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.parentElement.querySelector('input');
        const icon = btn.querySelector('.eye-icon');
        if (input.type === 'password') {
          input.type = 'text';
          icon.setAttribute('data-lucide', 'eye-off');
        } else {
          input.type = 'password';
          icon.setAttribute('data-lucide', 'eye');
        }
        lucide.createIcons();
      });
    });
  },

  initPasswordStrength() {
    const passwordInput = document.getElementById('reg-password');
    const strengthEl = document.getElementById('password-strength');
    if (!passwordInput || !strengthEl) return;

    passwordInput.addEventListener('input', () => {
      const val = passwordInput.value;
      if (val.length === 0) {
        strengthEl.classList.remove('visible');
        return;
      }
      strengthEl.classList.add('visible');
      let score = 0;
      if (val.length >= 8) score++;
      if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
      if (/[0-9]/.test(val)) score++;
      if (/[^A-Za-z0-9]/.test(val)) score++;

      const levels = ['weak', 'fair', 'good', 'strong'];
      const labels = ['Weak', 'Fair', 'Good', 'Strong'];
      const level = levels[Math.min(score, 3)];
      strengthEl.dataset.strength = level;
      strengthEl.querySelector('.strength-text').textContent = labels[Math.min(score, 3)];
    });
  },

  async apiCall(url, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  initFormSubmissions() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const btn = loginForm.querySelector('button[type="submit"]');

        if (!username || !password) {
          NetherAuth.showToast('Error', 'Please fill in all fields', 'error');
          return;
        }

        btn.innerHTML = '<span class="spinner spinner-sm"></span> Signing in...';
        btn.disabled = true;

        try {
          const data = await NetherAuth.apiCall('/api/auth/login', 'POST', { username, password });
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          NetherAuth.showToast('Success', 'Logged in successfully!', 'success');
          setTimeout(() => { window.location.href = 'index.html'; }, 500);
        } catch (err) {
          NetherAuth.showToast('Error', err.message, 'error');
          btn.innerHTML = '<span>Sign In</span><i data-lucide="arrow-right"></i>';
          btn.disabled = false;
          lucide.createIcons({ nodes: [btn] });
        }
      });
    }

    if (registerForm) {
      registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        const confirmPassword = document.getElementById('reg-password-confirm').value;
        const btn = registerForm.querySelector('button[type="submit"]');

        if (!username || !email || !password || !confirmPassword) {
          NetherAuth.showToast('Error', 'Please fill in all fields', 'error');
          return;
        }

        if (password !== confirmPassword) {
          NetherAuth.showToast('Error', 'Passwords do not match', 'error');
          return;
        }

        if (password.length < 6) {
          NetherAuth.showToast('Error', 'Password must be at least 6 characters', 'error');
          return;
        }

        btn.innerHTML = '<span class="spinner spinner-sm"></span> Creating account...';
        btn.disabled = true;

        try {
          const data = await NetherAuth.apiCall('/api/auth/register', 'POST', { username, email, password });
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          NetherAuth.showToast('Success', 'Account created successfully!', 'success');
          setTimeout(() => { window.location.href = 'index.html'; }, 500);
        } catch (err) {
          NetherAuth.showToast('Error', err.message, 'error');
          btn.innerHTML = '<span>Create Account</span><i data-lucide="user-plus"></i>';
          btn.disabled = false;
          lucide.createIcons({ nodes: [btn] });
        }
      });
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
  }
};

document.addEventListener('DOMContentLoaded', () => NetherAuth.init());

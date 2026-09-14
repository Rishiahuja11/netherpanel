/* NetherPanel Docs — shared behaviour (no dependencies besides lucide on CDN) */

var NETHER_DOCS = {
  /* Fill in your YouTube short's video ID once uploaded, e.g. VIDEO_ID: 'abc123XYZ'.
     The showcase block embeds it as a 9:16 portrait short. Leave empty for a
     "coming soon" placeholder. */
  YT_VIDEO_ID: '',
  YT_CHANNEL_URL: 'https://www.youtube.com/@Rishiahuja1',
  CHANNEL_HANDLE: '@Rishiahuja1',
  CHANNEL_SUBS: '171 subscribers',
  REPO_URL: 'https://github.com/Rishiahuja11/netherpanel',
  /* Where the live panel lives. The "Open Panel" button points here. When the
     docs are served from the panel itself this can stay localhost. For a
     standalone docs deployment on Render/Vercel/Netlify, point it at your
     panel's public address, e.g. 'http://192.168.1.42:3000'. */
  PANEL_URL: 'http://localhost:3000'
};

(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- Icons ---------- */
  function renderIcons() {
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  /* ---------- Theme toggle ---------- */
  function initTheme() {
    try {
      var saved = localStorage.getItem('np-docs-theme');
      if (saved) document.documentElement.setAttribute('data-theme', saved);
    } catch (e) { /* storage unavailable — ignore */ }
  }

  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('np-docs-theme', t); } catch (e) { /* ignore */ }
  }

  /* ---------- Sidebar: active page + on-this-page TOC ---------- */
  function initTree() {
    var current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('#docs-tree a[href]').forEach(function (a) {
      var href = (a.getAttribute('href') || '').split('#')[0].toLowerCase();
      if (href === current) a.classList.add('active');
    });

    var active = $('#docs-tree a.active');
    var anchors = $$('.docs-content h2[id]');
    if (active && anchors.length) {
      var ul = document.createElement('ul');
      ul.className = 'onpage';
      anchors.forEach(function (h) {
        var li = document.createElement('li');
        var ah = document.createElement('a');
        ah.href = '#' + h.id;
        ah.textContent = h.textContent;
        li.appendChild(ah);
        ul.appendChild(li);
      });
      active.parentElement.insertBefore(ul, active.nextSibling);
    }
  }

  /* ---------- Scrollspy highlight in on-this-page ---------- */
  function initScrollspy() {
    var links = $$('.docs-tree .onpage a');
    if (!links.length) return;
    var headings = links.map(function (a) {
      return document.getElementById(a.getAttribute('href').slice(1));
    });
    function onScroll() {
      var mark = headings[0];
      headings.forEach(function (h) {
        if (h && h.getBoundingClientRect().top <= 80) mark = h;
      });
      links.forEach(function (a, i) {
        a.style.color = headings[i] === mark ? 'var(--blue)' : '';
        a.style.fontWeight = headings[i] === mark ? '700' : '';
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Code block copy buttons ---------- */
  function initCopy() {
    $$('.code-block').forEach(function (block) {
      if (block.querySelector('.copy-btn')) return;
      var head = block.querySelector('.code-block-head');
      if (!head) return;
      var btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = '[ copy ]';
      btn.addEventListener('click', function () {
        var text = block.querySelector('pre').innerText;
        function done() {
          btn.textContent = '[ copied ]';
          setTimeout(function () { btn.textContent = '[ copy ]'; }, 1500);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, done);
        } else {
          var ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          done();
        }
      });
      head.appendChild(btn);
    });
  }

  /* ---------- Back to top ---------- */
  function initToTop() {
    var btn = $('.to-top');
    if (!btn) return;
    window.addEventListener('scroll', function () {
      btn.style.display = window.scrollY > 600 ? 'flex' : 'none';
    }, { passive: true });
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ---------- Mobile nav ---------- */
  function initMobileNav() {
    var toggle = $('#docs-nav-toggle');
    var overlay = $('.docs-mobile-nav');
    if (!toggle || !overlay) return;
    toggle.addEventListener('click', function () { overlay.classList.add('open'); });
    $$('.close-nav, .docs-tree a', overlay).forEach(function (el) {
      el.addEventListener('click', function () { overlay.classList.remove('open'); });
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.classList.remove('open');
    });

    /* mirror the code-block copy buttons into any copied tree? not needed */
  }

  /* ---------- YouTube showcase ---------- */
  function initYouTube() {
    var host = $('#yt-embed');
    if (!host) return;
    var cfg = NETHER_DOCS;

    if (cfg.YT_VIDEO_ID) {
      var iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube.com/embed/' + cfg.YT_VIDEO_ID + '?rel=0';
      iframe.title = 'NetherPanel — watch on Rishiahuja1';
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
      iframe.setAttribute('allowfullscreen', '');
      host.appendChild(iframe);
    } else {
      var ph = document.createElement('div');
      ph.className = 'yt-placeholder';
      ph.innerHTML =
        '<div class="yt-play" data-lucide="play"></div>' +
        '<strong>Short coming soon</strong>' +
        '<span style="font-size:0.78rem">NetherPanel in under a minute — on ' + cfg.CHANNEL_HANDLE + '</span>';
      host.appendChild(ph);
      ph.querySelector('.yt-play').addEventListener('click', function () {
        window.open(cfg.YT_CHANNEL_URL, '_blank');
      });
    }

    var sub = $('#yt-sub-btn');
    if (sub) {
      if (cfg.YT_VIDEO_ID) {
        sub.setAttribute('href', 'https://www.youtube.com/watch?v=' + cfg.YT_VIDEO_ID);
        sub.querySelector('span').textContent = 'Watch on YouTube';
      } else {
        sub.setAttribute('href', cfg.YT_CHANNEL_URL);
      }
      /* force blank target for buttons pointing offsite */
      $$('#yt-sub-btn[href^="http"]').forEach(function (a) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); });
      if ($('#yt-subs')) $('#yt-subs').textContent = cfg.CHANNEL_SUBS + ' · ' + cfg.CHANNEL_HANDLE;
    }
  }

  /* ---------- External links ---------- */
  function initExternalLinks() {
    $$('a[href^="http"]').forEach(function (a) {
      if (!a.classList.contains('btn-youtube')) return;
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    });
  }

  /* ---------- Open Panel link ---------- */
  function initPanelLink() {
    var btn = $('#btn-open-panel');
    var links = $$('.btn-panel');
    if (btn) btn.href = NETHER_DOCS.PANEL_URL;
    links.forEach(function (a) { a.href = NETHER_DOCS.PANEL_URL; });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initTree();
    initScrollspy();
    initCopy();
    initToTop();
    initMobileNav();
    initYouTube();
    initPanelLink();
    renderIcons();
  });
})();
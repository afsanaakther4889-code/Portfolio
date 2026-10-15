/* ============================================================
   程鑫涛 · 工业设计师 — 作品集交互
   依赖：无。全部原生 JS，可直接双击 index.html 打开。
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------------------------------------------------------
     1. 预加载计数
     --------------------------------------------------------- */
  (function preloader() {
    var el = $('#preloader');
    var out = $('#loadCount');
    if (!el || !out) return;

    document.body.classList.add('is-locked');

    function finish() {
      el.classList.add('is-done');
      document.documentElement.classList.add('is-ready');
      document.body.classList.remove('is-locked');
      // 预加载层退出后从无障碍树与布局中移除
      window.setTimeout(function () { el.setAttribute('hidden', ''); }, 900);
    }

    if (reduced) {
      out.textContent = '100%';
      finish();
      return;
    }

    var start = null;
    var DURATION = 1100;

    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / DURATION, 1);
      // easeOutExpo：先快后慢，像真实加载
      var eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      out.textContent = Math.round(eased * 100) + '%';
      if (p < 1) {
        window.requestAnimationFrame(step);
      } else {
        window.setTimeout(finish, 220);
      }
    }
    window.requestAnimationFrame(step);

    // 兜底：资源异常时不让页面卡在加载层
    window.setTimeout(function () {
      if (!el.classList.contains('is-done')) finish();
    }, 4000);
  })();

  /* ---------------------------------------------------------
     2. 滚动揭示
     --------------------------------------------------------- */
  (function reveal() {
    var items = $$('.reveal');
    if (!items.length) return;

    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach(function (n) { n.classList.add('is-visible'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

    items.forEach(function (n) { io.observe(n); });
  })();

  /* ---------------------------------------------------------
     3. 页头滚动态 + 阅读进度
     --------------------------------------------------------- */
  (function scrollUI() {
    var header = $('#siteHeader');
    var bar = $('#pageProgress');
    var ticking = false;

    function update() {
      var y = window.scrollY || window.pageYOffset;
      if (header) header.classList.toggle('is-stuck', y > 24);

      if (bar) {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = (h > 0 ? Math.min(y / h, 1) * 100 : 0) + '%';
      }
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }, { passive: true });

    update();
  })();

  /* ---------------------------------------------------------
     4. 数字滚动
     --------------------------------------------------------- */
  (function counters() {
    var nums = $$('[data-count]');
    if (!nums.length) return;

    function run(el) {
      var target = parseInt(el.getAttribute('data-count'), 10) || 0;
      if (reduced) { el.textContent = String(target); return; }

      var start = null;
      var DURATION = 1400;
      function step(ts) {
        if (start === null) start = ts;
        var p = Math.min((ts - start) / DURATION, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(eased * target));
        if (p < 1) window.requestAnimationFrame(step);
      }
      window.requestAnimationFrame(step);
    }

    if (!('IntersectionObserver' in window)) {
      nums.forEach(run);
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        run(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.5 });

    nums.forEach(function (n) { io.observe(n); });
  })();

  /* ---------------------------------------------------------
     5. 跑马灯：复制一份轨道实现无缝循环
     --------------------------------------------------------- */
  (function marquee() {
    var track = $('.marquee__track');
    if (!track || reduced) return;
    var clone = track.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.parentNode.appendChild(clone);
  })();

  /* ---------------------------------------------------------
     6. 移动端导航
     --------------------------------------------------------- */
  (function nav() {
    var toggle = $('[data-nav-toggle]');
    var header = $('#siteHeader');
    if (!toggle || !header) return;

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', String(open));
      header.classList.toggle('is-open', open);
      var label = $('.sr-only', toggle);
      if (label) label.textContent = open ? '收起菜单' : '展开菜单';
      // 移动端展开时用页头自身承载导航列表
      if (window.innerWidth < 1024) {
        header.style.background = open ? 'rgba(0,0,0,.96)' : '';
      }
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    $$('.site-header__nav a').forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth >= 1024) setOpen(false);
    });
  })();

  /* ---------------------------------------------------------
     7. 联系浮层
     --------------------------------------------------------- */
  (function contactPanel() {
    var panel = $('#contactPanel');
    if (!panel) return;
    var lastFocus = null;

    function open() {
      lastFocus = document.activeElement;
      panel.removeAttribute('hidden');
      document.body.classList.add('is-locked');
      var close = $('[data-contact-close]', panel);
      if (close) close.focus();
    }

    function close() {
      panel.setAttribute('hidden', '');
      document.body.classList.remove('is-locked');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    $$('[data-contact-open]').forEach(function (b) {
      b.addEventListener('click', open);
    });
    $$('[data-contact-close]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        // 面板里的“填写表单”按钮需要跳到联系版块，不能拦掉默认行为
        if (b.tagName === 'A' || b.hasAttribute('href')) close();
        else { e.preventDefault(); close(); }
      });
    });

    panel.addEventListener('click', function (e) {
      if (e.target === panel) close();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hasAttribute('hidden')) close();
    });
  })();

  /* ---------------------------------------------------------
     8. 表单校验
     真实投递需接后端或表单服务（见 README）。
     --------------------------------------------------------- */
  (function form() {
    var form = $('#contactForm');
    if (!form) return;
    var status = $('#formStatus');

    function fieldOf(input) { return input.closest('.field'); }

    function invalid(input, msg) {
      var f = fieldOf(input);
      if (f) f.classList.add('is-invalid');
      input.setAttribute('aria-invalid', 'true');
      if (status) status.textContent = msg;
      input.focus();
      return false;
    }

    function clear(input) {
      var f = fieldOf(input);
      if (f) f.classList.remove('is-invalid');
      input.removeAttribute('aria-invalid');
    }

    $$('input, textarea', form).forEach(function (input) {
      input.addEventListener('input', function () {
        clear(input);
        if (status) status.textContent = '';
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var name = $('#f-name');
      var contact = $('#f-contact');
      var msg = $('#f-msg');

      if (!name.value.trim()) return invalid(name, '请填写你的称呼');
      if (!contact.value.trim()) return invalid(contact, '请留下联系方式，方便我回复你');
      if (!msg.value.trim()) return invalid(msg, '简单说一下需求，我才能判断能不能帮上');

      var checked = $('input[name="type"]:checked', form);
      var type = checked ? checked.value : '产品设计';

      // 没有后端时的降级方案：把内容整理成邮件草稿
      var to = (form.getAttribute('data-mailto') || '').trim();
      var body =
        '合作类型：' + type + '\n' +
        '称呼：' + name.value.trim() + '\n' +
        '联系方式：' + contact.value.trim() + '\n\n' +
        '需求说明：\n' + msg.value.trim();

      if (to) {
        window.location.href = 'mailto:' + to +
          '?subject=' + encodeURIComponent('产品设计需求 — ' + name.value.trim()) +
          '&body=' + encodeURIComponent(body);
        if (status) status.textContent = '已打开邮件草稿，发送后我会尽快回复。';
      } else {
        if (status) {
          status.textContent =
            '内容已就绪。请把上面的信息发到微信 15571570741，我会尽快回复。';
        }
        // 方便用户一键复制
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(body).then(function () {
            if (status) status.textContent = '内容已复制到剪贴板，发到微信 15571570741 即可。';
          }).catch(function () { /* 用户拒绝授权时保持上面的提示 */ });
        }
      }

      form.reset();
    });
  })();

  /* ---------------------------------------------------------
     9. 页脚年份
     --------------------------------------------------------- */
  (function year() {
    var el = $('#year');
    if (el) el.textContent = String(new Date().getFullYear());
  })();

  /* ---------------------------------------------------------
     10. 占位内容提醒（上线前删掉这一段即可）
     --------------------------------------------------------- */
  (function placeholderNotice() {
    var flagged = $$('[data-placeholder="true"]');
    if (!flagged.length) return;
    // eslint-disable-next-line no-console
    console.info(
      '[作品集] 还有 ' + flagged.length + ' 处占位内容待替换：邮箱、城市、项目文案。' +
      '搜索 data-placeholder 和「占位」即可定位。'
    );
  })();

})();

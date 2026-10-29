/* =========================================================
   尖叫工业设计教育 · JIANO
   交互层：无依赖，全部为渐进增强
   ========================================================= */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var raf = window.requestAnimationFrame.bind(window);

  window.__JIANO_READY = true;

  /* ---------- 0. 年份 ---------- */
  var yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- 1. 自定义光标 ---------- */
  if (fine && !reduce) {
    var cur = $('#cursor');
    var dot = $('.cursor__dot', cur);
    var ring = $('.cursor__ring', cur);
    var label = $('.cursor__label', cur);
    var mx = -100, my = -100, rx = -100, ry = -100, seen = false;
    document.body.classList.add('has-cursor');

    document.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      if (!seen) { seen = true; rx = mx; ry = my; cur.classList.add('is-on'); }
    }, { passive: true });

    (function loop() {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      dot.style.transform = 'translate(' + mx + 'px,' + my + 'px) translate(-50%,-50%)';
      ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px) translate(-50%,-50%)';
      raf(loop);
    })();

    var HOT = 'a, button, [data-cursor], .work__open, .wall__item, .chip, .step';
    document.addEventListener('mouseover', function (e) {
      var t = e.target.closest ? e.target.closest(HOT) : null;
      if (!t) { cur.classList.remove('is-big'); label.textContent = ''; return; }
      var txt = t.getAttribute('data-cursor');
      if (!txt && t.classList.contains('work__open')) txt = 'VIEW';
      if (!txt) txt = '';
      label.textContent = txt;
      cur.classList.toggle('is-big', !!txt || t.tagName === 'A' || t.tagName === 'BUTTON');
      if (!txt) cur.classList.remove('is-big');
    });
    document.addEventListener('mouseleave', function () { cur.classList.add('is-hide'); });
    document.addEventListener('mouseenter', function () { cur.classList.remove('is-hide'); });
  }

  /* ---------- 2. 滚动显现 ---------- */
  $$('[data-reveal]').forEach(function (el) {
    var d = el.getAttribute('data-reveal-delay');
    if (d) el.style.setProperty('--rd', d + 'ms');
  });

  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    $$('[data-reveal]').forEach(function (el) { io.observe(el); });
  } else {
    $$('[data-reveal]').forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------- 3. 顶部导航 / 进度 ---------- */
  var head = $('#head');
  var progress = $('#progress i');
  var lastY = window.scrollY;

  /* ---------- 3.5 导航跟随区块深浅 ---------- */
  var bgSections = $$('[data-bg]');
  function updateHeadTheme() {
    if (!head || !bgSections.length) return;
    var line = head.getBoundingClientRect().height * 0.5;
    var mode = 'dark';
    for (var i = 0; i < bgSections.length; i++) {
      var r = bgSections[i].getBoundingClientRect();
      if (r.top <= line && r.bottom > line) { mode = bgSections[i].getAttribute('data-bg'); break; }
    }
    head.classList.toggle('head--light', mode === 'light');
  }

  function onScroll() {
    var y = window.scrollY;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.width = (h > 0 ? Math.min(100, (y / h) * 100) : 0) + '%';

    if (head) {
      head.classList.toggle('is-stuck', y > 8);
      var down = y > lastY;
      if (document.body.classList.contains('menu-open')) down = false;
      head.classList.toggle('is-hide', down && y > 420);
    }
    lastY = y;
    updateHeadTheme();
  }
  var sTick = false;
  window.addEventListener('scroll', function () {
    if (sTick) return;
    sTick = true;
    raf(function () { onScroll(); sTick = false; });
  }, { passive: true });

  /* ---------- 4. 导航高亮 ---------- */
  var navLinks = $$('#nav a');
  var sections = navLinks.map(function (a) { return $(a.getAttribute('href')); }).filter(Boolean);
  if ('IntersectionObserver' in window && sections.length) {
    var navIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        navLinks.forEach(function (a) {
          a.classList.toggle('is-on', a.getAttribute('href') === '#' + en.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { navIO.observe(s); });
  }

  /* ---------- 5. 移动菜单 ---------- */
  var burger = $('#burger');
  var menu = $('#menu');
  function closeMenu() {
    document.body.classList.remove('menu-open');
    if (burger) { burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', '打开菜单'); }
    if (menu) menu.setAttribute('aria-hidden', 'true');
  }
  if (burger) {
    burger.addEventListener('click', function () {
      var open = !document.body.classList.contains('menu-open');
      document.body.classList.toggle('menu-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
      if (menu) menu.setAttribute('aria-hidden', String(!open));
    });
  }
  $$('#menu a').forEach(function (a) { a.addEventListener('click', closeMenu); });

  /* ---------- 6. 首屏背景：DriftWall（React Bits 组件的原生移植） ---------- */
  var heroWallEl = $('#heroWall');
  var heroSection = $('#hero');
  var wall = null;
  var wallBP = bp();

  function bp() {
    var w = window.innerWidth;
    return w < 620 ? 1 : w < 1024 ? 2 : 3;
  }

  function heroWallItems() {
    var pages = [];
    Object.keys(window.JIANO_WORKS || {}).forEach(function (id) {
      var w = window.JIANO_WORKS[id];
      if (w.wall === false) return;
      for (var i = 0; i < w.count; i++) {
        pages.push({
          image: w.base + 'mini-' + (i + 1 < 10 ? '0' + (i + 1) : i + 1) + '.webp',
          work: id,
          index: i,
          title: w.title + ' 第 ' + (i + 1) + ' 页'
        });
      }
    });
    // 打散一次，避免同一项目的页面挤在相邻几列
    var mixed = [];
    for (var k = 0; k < pages.length; k++) mixed.push(pages[(k * 13) % pages.length]);
    return mixed;
  }

  function wallOptions() {
    var level = bp();
    var tw = level === 1 ? 118 : level === 2 ? 158 : 198;
    var gap = level === 1 ? 10 : level === 2 ? 14 : 18;
    return {
      items: heroWallItems(),
      columns: level === 1 ? 3 : level === 2 ? 4 : 5,
      tileWidth: tw,
      tileHeight: Math.round(tw * 0.66),
      gap: gap,
      radius: 10,
      tilt: 15,
      turn: -14,
      roll: 0,
      perspective: 1200,
      depth: 120,
      speed: 34,
      direction: 'up',
      variance: 0.45,
      parallax: 0.6,
      pauseOnHover: false,
      lift: 56,
      fade: 0.62,
      dim: 0.58,
      grayscale: true,
      overlayColor: '#0a0a10',
      decorative: true,
      pointerTarget: heroSection,
      label: '学员作品背景',
      cursorLabel: '看这一页',
      onSelect: function (item) { openLightbox(item.work, item.index); }
    };
  }

  if (heroWallEl && window.createDriftWall) {
    wall = window.createDriftWall(heroWallEl, wallOptions());
  }

  // 首屏离开视口时暂停动画，省电
  if (wall && heroSection && 'IntersectionObserver' in window) {
    var wallIO = new IntersectionObserver(function (entries) {
      if (!wall || !wall.setActive) return;
      wall.setActive(entries[0].isIntersecting);
    }, { threshold: 0 });
    wallIO.observe(heroSection);
  }

  var wallTimer = null;
  window.addEventListener('resize', function () {
    window.clearTimeout(wallTimer);
    wallTimer = window.setTimeout(function () {
      if (bp() === wallBP || !heroWallEl) return;
      wallBP = bp();
      if (wall) wall.destroy();
      wall = window.createDriftWall ? window.createDriftWall(heroWallEl, wallOptions()) : null;
    }, 240);
  });

  /* ---------- 6.1 开场：黑屏粒子 + 入场票 ---------- */
  var gate = $('#gate');
  var gateCanvas = $('#gateCanvas');
  var gateTicket = null;
  var particles = null;

  function initParticles(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = 0, H = 0, dots = [], raf = 0, last = 0, alpha = 0, dead = false;
    var pointer = { x: -9999, y: -9999 };
    var still = reduce;

    function seed() {
      var n = Math.round(Math.min(190, Math.max(64, (W * H) / 11000)));
      dots = [];
      for (var i = 0; i < n; i++) {
        dots.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.16,
          vy: (Math.random() - 0.5) * 0.16,
          r: Math.random() * 1.4 + 0.5,
          a: Math.random() * 0.5 + 0.25,
          lime: Math.random() < 0.18
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      var i, j, d, dx, dy, dist;
      ctx.lineWidth = 0.6;
      for (i = 0; i < dots.length; i++) {
        for (j = i + 1; j < dots.length; j++) {
          dx = dots[i].x - dots[j].x;
          dy = dots[i].y - dots[j].y;
          dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 118) continue;
          ctx.globalAlpha = (1 - dist / 118) * 0.17 * alpha;
          ctx.strokeStyle = 'rgba(198,255,0,0.6)';
          ctx.beginPath();
          ctx.moveTo(dots[i].x, dots[i].y);
          ctx.lineTo(dots[j].x, dots[j].y);
          ctx.stroke();
        }
      }
      for (i = 0; i < dots.length; i++) {
        d = dots[i];
        ctx.globalAlpha = d.a * alpha;
        ctx.fillStyle = d.lime ? 'rgba(198,255,0,1)' : 'rgba(255,255,255,1)';
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function frame(ts) {
      if (dead) return;
      if (!last) last = ts;
      var dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      alpha = Math.min(1, alpha + dt / 0.9);

      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        d.x += d.vx * dt * 60;
        d.y += d.vy * dt * 60;
        var dx = d.x - pointer.x;
        var dy = d.y - pointer.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150 && dist > 0.1) {
          var push = (1 - dist / 150) * 0.55;
          d.x += (dx / dist) * push;
          d.y += (dy / dist) * push;
        }
        if (d.x < -12) d.x = W + 12;
        else if (d.x > W + 12) d.x = -12;
        if (d.y < -12) d.y = H + 12;
        else if (d.y > H + 12) d.y = -12;
      }
      draw();
      raf = requestAnimationFrame(frame);
    }

    function resize() {
      W = canvas.clientWidth || window.innerWidth;
      H = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      if (still) {
        alpha = 1;
        draw();
      }
    }

    function onMove(e) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    }

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    resize();
    if (!still) raf = requestAnimationFrame(frame);

    return {
      stop: function () {
        dead = true;
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize);
        window.removeEventListener('pointermove', onMove);
      }
    };
  }

  function dismissGate() {
    if (!gate || gate.classList.contains('is-out')) return;
    gate.classList.add('is-out');
    gate.style.display = 'grid';
    document.documentElement.classList.remove('gate-pending');
    if (particles && particles.stop) particles.stop();
    window.setTimeout(function () {
      gate.style.display = 'none';
      gate.setAttribute('aria-hidden', 'true');
    }, 820);
  }

  if (gate && gateCanvas) {
    particles = initParticles(gateCanvas);

    var gateTicketEl = $('#gateTicket');
    if (gateTicketEl && window.createTearTicket) {
      gateTicket = window.createTearTicket(gateTicketEl, {
        width: 600,
        height: 320,
        stubSize: 190,
        radius: 18,
        holes: 16,
        holeSize: 7,
        notch: 4,
        tearAngle: 6,
        stretch: 28,
        resistance: 0.12,
        rotate: 0,
        tilt: true,
        tiltMax: 7,
        tiltReach: 340,
        parallax: 6,
        perspective: 1000,
        background: '#f4efe2',
        stubBackground: '#ece5d5',
        color: '#2b2620',
        borderColor: 'rgba(107, 90, 60, 0.3)',
        border: true,
        borderWidth: 1,
        ariaLabel: '撕开票据，进入网站',
        onTear: dismissGate
      });
      window.__gateReady = true;
      window.__gateTicket = gateTicket;
    }

    var gateSkip = $('#gateSkip');
    if (gateSkip) gateSkip.addEventListener('click', dismissGate);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.documentElement.classList.contains('gate-pending')) {
        dismissGate();
      }
    });
  }

  /* ---------- 7. 磁吸按钮 ---------- */
  if (fine && !reduce) {
    $$('[data-magnetic]').forEach(function (btn) {
      btn.addEventListener('mousemove', function (e) {
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - r.left - r.width / 2) * 0.18;
        var dy = (e.clientY - r.top - r.height / 2) * 0.3;
        btn.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
      });
      btn.addEventListener('mouseleave', function () { btn.style.transform = ''; });
    });
  }

  /* ---------- 8. 作品卡：聚光跟随 ---------- */
  $$('.work__media').forEach(function (media) {
    media.addEventListener('mousemove', function (e) {
      var r = media.getBoundingClientRect();
      media.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      media.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
  });

  /* ---------- 9. 数字滚动 ---------- */
  function countUp(el) {
    var to = parseFloat(el.getAttribute('data-to')) || 0;
    var suffix = el.getAttribute('data-suffix') || '';
    if (reduce) { el.textContent = to + suffix; return; }
    var t0 = 0, dur = 1500;
    function tick(now) {
      if (!t0) t0 = now;
      var p = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(to * e) + suffix;
      if (p < 1) raf(tick);
    }
    raf(tick);
  }
  if ('IntersectionObserver' in window) {
    var cIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        countUp(en.target);
        cIO.unobserve(en.target);
      });
    }, { threshold: 0.5 });
    $$('.count').forEach(function (el) { cIO.observe(el); });
  } else {
    $$('.count').forEach(function (el) { el.textContent = (el.getAttribute('data-to') || 0) + (el.getAttribute('data-suffix') || ''); });
  }

  /* ---------- 10. 作品筛选（FLIP） ---------- */
  var grid = $('#grid');
  var chips = $$('.chip');

  function filterWorks(filter) {
    if (!grid) return;
    var works = $$('.work', grid);
    var before = new Map();
    works.forEach(function (w) {
      if (!w.classList.contains('is-off')) before.set(w, w.getBoundingClientRect());
    });

    var shown = [];
    works.forEach(function (w) {
      var isSlot = w.classList.contains('work--slot');
      var cats = (w.getAttribute('data-cats') || '').split(/\s+/);
      var on = isSlot ? filter === 'all' : (filter === 'all' || cats.indexOf(filter) > -1);
      w.classList.toggle('is-off', !on);
      if (on) shown.push(w);
    });

    // 第一件真实作品占据整行（只有一件结果时也占整行）
    works.forEach(function (w) { w.classList.remove('work--wide'); });
    var reals = shown.filter(function (w) { return !w.classList.contains('work--slot'); });
    if (reals.length === 1 || (filter === 'all' && shown.length > 2)) {
      reals[0].classList.add('work--wide');
    }

    if (reduce) return;

    // FLIP
    shown.forEach(function (w) {
      var a = before.get(w);
      var b = w.getBoundingClientRect();
      if (!a) {
        w.animate(
          [{ opacity: 0, transform: 'translateY(22px) scale(.985)' }, { opacity: 1, transform: 'none' }],
          { duration: 620, easing: 'cubic-bezier(.19,1,.22,1)' }
        );
        return;
      }
      var dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        w.animate(
          [{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }],
          { duration: 680, easing: 'cubic-bezier(.19,1,.22,1)' }
        );
      }
    });
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      if (chip.classList.contains('is-on')) return;
      chips.forEach(function (c) {
        c.classList.remove('is-on');
        c.setAttribute('aria-pressed', 'false');
      });
      chip.classList.add('is-on');
      chip.setAttribute('aria-pressed', 'true');
      filterWorks(chip.getAttribute('data-filter'));
    });
  });

  /* ---------- 11. 作品浏览器 ---------- */
  var lb = $('#lb');
  var lbImg = $('#lbImg');
  var lbTitle = $('#lbTitle');
  var lbSub = $('#lbSub');
  var lbNo = $('#lbNo');
  var lbCur = $('#lbCur');
  var lbTotal = $('#lbTotal');
  var lbThumbs = $('#lbThumbs');
  var lbProg = $('#lbProg');
  var lbLoad = $('#lbLoad');
  var lbStage = $('#lbStage');
  var lbClose = $('#lbClose');
  var lbPrev = $('#lbPrev');
  var lbNext = $('#lbNext');

  var curWork = null;
  var idx = 0;
  var lastFocus = null;
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };

  function imgSrc(w, i) { return w.base + 'full-' + pad(i + 1) + '.webp'; }
  function thumbSrc(w, i) { return w.base + 'thumb-' + pad(i + 1) + '.webp'; }

  function paintLightbox(dir) {
    var w = curWork;
    if (!w) return;
    var total = w.count;
    lbCur.textContent = idx + 1;
    lbTotal.textContent = total;
    lbProg.style.width = ((idx + 1) / total * 100) + '%';
    var tbtns = $$('button', lbThumbs);
    tbtns.forEach(function (b, i) { b.classList.toggle('is-on', i === idx); });
    if (tbtns[idx]) {
      var b0 = tbtns[idx];
      lbThumbs.scrollTo({
        left: b0.offsetLeft - lbThumbs.clientWidth / 2 + b0.offsetWidth / 2,
        behavior: reduce ? 'auto' : 'smooth'
      });
    }

    lbImg.classList.remove('is-on');
    lbLoad.classList.add('is-on');

    var src = imgSrc(w, idx);
    var pre = new Image();
    pre.onload = function () {
      lbImg.src = src;
      lbImg.alt = w.title + ' · 第 ' + (idx + 1) + ' 页';
      lbImg.classList.add('is-on');
      lbLoad.classList.remove('is-on');
    };
    pre.onerror = function () { lbLoad.classList.remove('is-on'); };
    pre.src = src;

    // 预载相邻页
    [idx + 1, idx - 1].forEach(function (i) {
      if (i < 0 || i >= total) return;
      var p = new Image(); p.src = imgSrc(w, i);
    });
  }

  function openLightbox(id, start) {
    var w = window.JIANO_WORKS && window.JIANO_WORKS[id];
    if (!w) return;
    lastFocus = document.activeElement;
    curWork = w;
    idx = typeof start === 'number' ? Math.min(Math.max(0, start), w.count - 1) : 0;

    lbTitle.textContent = w.title;
    lbSub.textContent = w.en + ' · ' + w.cat;
    lbNo.textContent = w.no;

    lbThumbs.innerHTML = '';
    for (var i = 0; i < w.count; i++) {
      (function (i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', '第 ' + (i + 1) + ' 页');
        var im = document.createElement('img');
        im.src = thumbSrc(w, i);
        im.alt = '';
        im.loading = 'lazy';
        b.appendChild(im);
        b.addEventListener('click', function () { idx = i; paintLightbox(); });
        lbThumbs.appendChild(b);
      })(i);
    }

    lb.hidden = false;
    document.body.classList.add('lb-open');
    paintLightbox();
    raf(function () {
      lb.classList.add('is-on');
      if (lbClose) lbClose.focus({ preventScroll: true });
    });
  }

  function closeLightbox() {
    lb.classList.remove('is-on');
    document.body.classList.remove('lb-open');
    window.setTimeout(function () {
      lb.hidden = true;
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
      lbImg.removeAttribute('src');
    }, reduce ? 0 : 420);
  }

  $$('[data-open]').forEach(function (btn) {
    btn.addEventListener('click', function () { openLightbox(btn.getAttribute('data-open')); });
  });

  // 调研资料：直接跳到对应项目的那一页
  $$('.res').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var page = parseInt(btn.getAttribute('data-page'), 10) || 1;
      openLightbox(btn.getAttribute('data-work'), page - 1);
    });
  });
  if (lbClose) lbClose.addEventListener('click', closeLightbox);
  if (lbPrev) lbPrev.addEventListener('click', function () { idx = (idx - 1 + curWork.count) % curWork.count; paintLightbox(); });
  if (lbNext) lbNext.addEventListener('click', function () { idx = (idx + 1) % curWork.count; paintLightbox(); });

  document.addEventListener('keydown', function (e) {
    if (lb.hidden || !curWork) { if (e.key === 'Escape') closeMenu(); return; }
    if (e.key === 'Escape') { closeLightbox(); }
    else if (e.key === 'ArrowRight') { idx = (idx + 1) % curWork.count; paintLightbox(); }
    else if (e.key === 'ArrowLeft') { idx = (idx - 1 + curWork.count) % curWork.count; paintLightbox(); }
    else if (e.key === 'Tab') {
      var f = $$('button, [href], input, select, textarea', lb).filter(function (el) { return el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // 拖动 / 轻扫翻页
  if (lbStage) {
    var sx = 0, dragging = false;
    lbStage.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.lb__nav')) return;
      dragging = true; sx = e.clientX;
    });
    window.addEventListener('pointerup', function (e) {
      if (!dragging) return;
      dragging = false;
      var dx = e.clientX - sx;
      if (Math.abs(dx) < 55 || !curWork) return;
      idx = dx < 0 ? (idx + 1) % curWork.count : (idx - 1 + curWork.count) % curWork.count;
      paintLightbox();
    });
  }

  /* ---------- 11.5 作品墙 ---------- */
  var wallRail = $('#wallRail');
  if (wallRail && window.JIANO_WORKS) {
    var pages = [];
    Object.keys(window.JIANO_WORKS).forEach(function (id) {
      var w = window.JIANO_WORKS[id];
      if (w.wall === false) return;
      for (var i = 0; i < w.count; i++) pages.push({ id: id, i: i });
    });

    var half = Math.ceil(pages.length / 2);
    var rowsData = [pages.slice(0, half), pages.slice(half)];

    rowsData.forEach(function (list, r) {
      var track = wallRail.querySelector('[data-wall-row="' + r + '"]');
      if (!track) return;
      for (var copy = 0; copy < 2; copy++) {
        list.forEach(function (item) {
          var w = window.JIANO_WORKS[item.id];
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'wall__item';
          b.setAttribute('data-cursor', '看这一页');
          b.setAttribute('aria-label', w.title + ' 第 ' + (item.i + 1) + ' 页');
          var im = document.createElement('img');
          im.src = w.base + 'mini-' + pad(item.i + 1) + '.webp';
          im.alt = '';
          im.width = 480; im.height = 270;
          im.loading = 'lazy';
          im.decoding = 'async';
          b.appendChild(im);
          b.addEventListener('click', function () { openLightbox(item.id, item.i); });
          track.appendChild(b);
        });
      }
    });
  }

  /* ---------- 11.6 单页作品（React Bits Masonry 原生移植） ---------- */
  var singlesMount = $('#singlesMasonry');
  var MORE = window.JIANO_WORKS && window.JIANO_WORKS.more;
  if (singlesMount && MORE && window.createMasonry) {
    var dims = MORE.dims || [];
    var masonryItems = [];
    for (var mi = 0; mi < MORE.count; mi++) {
      var dm = dims[mi] || [1400, 787];
      masonryItems.push({
        id: String(mi + 1),
        img: MORE.base + 'thumb-' + pad(mi + 1) + '.webp',
        width: dm[0],
        height: dm[1],
        title: 'PAGE ' + pad(mi + 1),
        // 每 9 页放一张双列宽图，墙面才有节奏
        span: mi % 9 === 0 ? 2 : 1
      });
    }
    window.__masonry = window.createMasonry(singlesMount, {
      items: masonryItems,
      columns: 'auto',
      columnWidth: 240,
      gap: 14,
      radius: 8,
      animateFrom: 'bottom',
      stagger: 0.03,
      duration: 0.7,
      bounce: 0.12,
      blurToFocus: true,
      revealOnScroll: true,
      hoverEffect: 'zoom',
      focusOnHover: false,
      captions: 'hover',
      parallax: 0,
      lightbox: true,
      cursorLabel: '看大图'
    });
  }

  /* ---------- 12. 教学体系标签 ---------- */
  var steps = $$('.step');
  function activateStep(n) {
    steps.forEach(function (s) {
      var on = s.getAttribute('data-panel') === String(n);
      s.classList.toggle('is-on', on);
      s.setAttribute('aria-selected', String(on));
      s.tabIndex = on ? 0 : -1;
    });
    $$('.panel').forEach(function (p) {
      var on = p.id === 'panel-' + n;
      p.classList.toggle('is-on', on);
      if (on) p.removeAttribute('hidden'); else p.setAttribute('hidden', '');
    });
  }
  steps.forEach(function (s, i) {
    s.addEventListener('click', function () { activateStep(s.getAttribute('data-panel')); });
    s.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var dir = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1;
      var next = steps[(i + dir + steps.length) % steps.length];
      next.focus();
      activateStep(next.getAttribute('data-panel'));
    });
  });

  /* ---------- 13. 学员反馈轮播 ---------- */
  var vTrack = $('#vTrack');
  var vDots = $('#vDots');
  if (vTrack && vDots) {
    var slides = $$('.quote', vTrack);
    var vi = 0;
    var timer = null;

    slides.forEach(function (_, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', '第 ' + (i + 1) + ' 条反馈');
      b.addEventListener('click', function () { goVoice(i); restart(); });
      vDots.appendChild(b);
    });

    function goVoice(i) {
      vi = (i + slides.length) % slides.length;
      vTrack.style.transform = 'translateX(' + (-vi * 100) + '%)';
      $$('button', vDots).forEach(function (b, k) { b.classList.toggle('is-on', k === vi); });
      slides.forEach(function (s, k) { s.setAttribute('aria-hidden', String(k !== vi)); });
    }
    function restart() {
      window.clearInterval(timer);
      if (reduce) return;
      timer = window.setInterval(function () { goVoice(vi + 1); }, 7000);
    }
    goVoice(0);
    restart();
    var vPrev = $('#vPrev'), vNext = $('#vNext');
    if (vPrev) vPrev.addEventListener('click', function () { goVoice(vi - 1); restart(); });
    if (vNext) vNext.addEventListener('click', function () { goVoice(vi + 1); restart(); });
    var voices = $('#voices');
    if (voices) {
      voices.addEventListener('mouseenter', function () { window.clearInterval(timer); });
      voices.addEventListener('mouseleave', restart);
    }
  }

  /* ---------- 14. 初始化 ---------- */
  onScroll();
  filterWorks('all');

  // 锚点滚动后收起菜单
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href');
    if (id.length < 2) return;
    var target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    closeMenu();
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    if (history.replaceState) history.replaceState(null, '', id);
  });
})();

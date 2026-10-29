/* =========================================================
   Masonry —— React Bits 组件 (Masonry.jsx) 的原生 JS 移植
   原组件：https://reactbits.dev  ·  布局算法 / 弹簧动画 / 揭示 / 灯箱与原件一致
   用法：
     var m = window.createMasonry(el, { items: [...], columnWidth: 240 });
     m.refresh(); m.destroy();
   ========================================================= */
(function () {
  'use strict';

  var EASE = 'cubic-bezier(0.2, 0.9, 0.2, 1)';
  var ITEM = 'masonry__item';
  var CARD = 'masonry__card';
  var MEDIA = 'masonry__media';
  var PARALLAX = 'masonry__parallax';
  var IMAGE = 'masonry__image';
  var CAPTION = 'masonry__caption';
  var TITLE = 'masonry__title';
  var TEXT = 'masonry__text';

  var ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  var ICON_PREV = '<svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M19 12H5m6-7-7 7 7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M5 12h14m-6-7 7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var clamp = function (v, min, max) { return Math.min(max, Math.max(min, v)); };
  var keyOf = function (item) { return String(item.id); };
  var reduced = function () {
    return typeof window !== 'undefined' &&
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  function aspectOf(item) {
    var w = item.width || 0, h = item.height || 0;
    if (w > 0 && h > 0) return h / w;
    if (h > 0) return h / 600;
    return 1;
  }

  function gridOf(width, columns, columnWidth, gap) {
    var fixed = Number(columns);
    var count = (columns !== 'auto' && fixed > 0)
      ? Math.max(1, Math.round(fixed))
      : Math.max(1, Math.floor((width + gap) / (Math.max(40, columnWidth) + gap)));
    return { count: count, size: Math.max(1, (width - gap * (count - 1)) / count) };
  }

  function place(heights, item, grid, gap, commit) {
    var count = grid.count, size = grid.size;
    var span = Math.min(count, Math.max(1, Math.round(item.span || 1)));
    var column = 0, top = Infinity, start, k, y;
    for (start = 0; start <= count - span; start++) {
      y = 0;
      for (k = start; k < start + span; k++) y = Math.max(y, heights[k]);
      if (y < top - 0.5) { top = y; column = start; }
    }
    var w = size * span + gap * (span - 1);
    var h = Math.max(1, w * aspectOf(item));
    if (commit) for (k = column; k < column + span; k++) heights[k] = top + h + gap;
    return { x: Math.round(column * (size + gap)), y: Math.round(top), w: w, h: h };
  }

  function layoutOf(list, width, columns, columnWidth, gap) {
    var grid = gridOf(width, columns, columnWidth, gap);
    var heights = [];
    for (var i = 0; i < grid.count; i++) heights.push(0);
    var tiles = list.map(function (item) {
      var p = place(heights, item, grid, gap, true);
      return { item: item, id: keyOf(item), x: p.x, y: p.y, w: p.w, h: p.h };
    });
    var maxH = 0;
    for (var j = 0; j < heights.length; j++) maxH = Math.max(maxH, heights[j]);
    return { tiles: tiles, height: Math.max(0, maxH - gap) };
  }

  function create(root, options) {
    if (!root) return null;

    var o = {
      items: [],
      columns: 'auto',
      columnWidth: 240,
      gap: 12,
      radius: 12,
      animateFrom: 'bottom',
      stagger: 0.05,
      duration: 0.6,
      bounce: 0.15,
      blurToFocus: true,
      revealOnScroll: true,
      hoverEffect: 'zoom',
      focusOnHover: false,
      captions: 'hover',
      parallax: 0,
      lightbox: true,
      cursorLabel: '',
      onItemClick: null
    };
    if (options) Object.keys(options).forEach(function (k) { o[k] = options[k]; });
    o.gap = Math.max(0, o.gap);
    o.stagger = Math.max(0, o.stagger);
    o.duration = Math.max(0.05, o.duration);
    o.bounce = clamp(o.bounce, 0, 0.9);
    o.parallax = clamp(o.parallax, 0, 1);

    var state = {
      width: 0,
      springs: new Map(),
      nodes: new Map(),
      loaded: new Set(),
      waiting: new Set(),
      pending: new Set(),
      engine: { raf: 0, last: 0, flush: 0 },
      openId: null,
      closing: false,
      lastShown: null,
      box: null,
      alive: true
    };

    root.classList.add('masonry');
    root.setAttribute('role', 'list');
    root.setAttribute('data-hover', o.hoverEffect);
    root.style.setProperty('--masonry-radius', Math.max(0, o.radius) + 'px');

    /* ---------- 卡片 ---------- */
    function createNode(tile) {
      var item = tile.item;
      var id = tile.id;

      var wrap = document.createElement('div');
      wrap.className = ITEM;
      wrap.setAttribute('data-id', id);
      wrap.setAttribute('role', 'listitem');
      wrap.style.width = tile.w + 'px';
      wrap.style.height = tile.h + 'px';

      var card = document.createElement('button');
      card.type = 'button';
      card.className = CARD;
      card.setAttribute('data-card', '');
      card.setAttribute('aria-label', item.title || item.alt || '作品');
      if (o.cursorLabel) card.setAttribute('data-cursor', o.cursorLabel);

      var media = document.createElement('span');
      media.className = MEDIA;
      media.setAttribute('data-media', '');

      var holder = document.createElement('span');
      holder.className = PARALLAX;
      holder.setAttribute('data-parallax', '');

      var img = document.createElement('img');
      img.className = IMAGE;
      img.src = item.img;
      img.alt = item.alt || item.title || '';
      img.draggable = false;
      img.decoding = 'async';
      img.addEventListener('load', function () { markLoaded(id); });
      img.addEventListener('error', function () { markLoaded(id); });

      holder.appendChild(img);
      media.appendChild(holder);

      if (o.captions !== 'none' && (item.title || item.description)) {
        var cap = document.createElement('span');
        cap.className = CAPTION;
        cap.setAttribute('data-mode', o.captions);
        if (item.title) {
          var t = document.createElement('span');
          t.className = TITLE;
          t.textContent = item.title;
          cap.appendChild(t);
        }
        if (item.description) {
          var d = document.createElement('span');
          d.className = TEXT;
          d.textContent = item.description;
          cap.appendChild(d);
        }
        media.appendChild(cap);
      }

      card.appendChild(media);
      wrap.appendChild(card);

      card.addEventListener('click', function (e) { onCardClick(e, item); });
      card.addEventListener('pointerenter', function () { onEnter(id); });
      card.addEventListener('pointerleave', function (e) { onLeave(e); });
      card.addEventListener('pointermove', function (e) { onTilt(e); });

      if (img.complete && img.naturalWidth) markLoaded(id);

      return wrap;
    }

    /* ---------- 布局 ---------- */
    function applyLayout() {
      if (!state.width) return;
      var layout = layoutOf(o.items, state.width, o.columns, o.columnWidth, o.gap);
      var instant = reduced();

      layout.tiles.forEach(function (tile) {
        var node = state.nodes.get(tile.id);
        if (!node) {
          node = createNode(tile);
          state.nodes.set(tile.id, node);
          root.appendChild(node);
        } else {
          node.style.width = tile.w + 'px';
          node.style.height = tile.h + 'px';
        }

        var spring = state.springs.get(tile.id);
        if (!spring) {
          spring = {
            x: tile.x, y: tile.y, s: 1, vx: 0, vy: 0, vs: 0,
            tx: tile.x, ty: tile.y, w: tile.w, h: tile.h,
            shown: false, dragging: false, blur: false, reveal: 0, start: 0
          };
          state.springs.set(tile.id, spring);
          node.style.opacity = '0';
          node.style.transform = 'translate3d(' + tile.x + 'px,' + tile.y + 'px,0)';
        } else if (spring.shown && Math.abs(spring.w - tile.w) > 0.5 && !instant) {
          spring.s *= spring.w / tile.w;
        }

        spring.tx = tile.x;
        spring.ty = tile.y;
        spring.w = tile.w;
        spring.h = tile.h;

        if (!spring.shown) {
          spring.x = tile.x;
          spring.y = tile.y;
          node.style.transform = 'translate3d(' + tile.x + 'px,' + tile.y + 'px,0)';
        } else if (instant && !spring.dragging) {
          spring.x = tile.x;
          spring.y = tile.y;
          spring.s = 1;
          paint(tile.id, spring);
        }
      });

      root.style.height = layout.height + 'px';
      observeReveals();
      kick();
    }

    /* ---------- 绘制 / 弹簧 ---------- */
    function paint(id, spring) {
      var node = state.nodes.get(id);
      if (!node) return;
      node.style.transform = 'translate3d(' + spring.x + 'px,' + spring.y + 'px,0) scale(' + spring.s + ')';
      if (spring.reveal < 1) {
        var eased = 1 - Math.pow(1 - Math.max(0, spring.reveal), 3);
        node.style.opacity = String(eased);
        node.style.filter = spring.blur ? 'blur(' + ((1 - eased) * 12).toFixed(2) + 'px)' : '';
      } else if (node.style.opacity !== '') {
        node.style.opacity = '';
        node.style.filter = '';
      }
    }

    function frame(now) {
      var eng = state.engine;
      eng.raf = 0;
      if (!state.alive) return;
      var elapsed = clamp((now - eng.last) / 1000, 0, 1 / 20);
      eng.last = now;
      var omega = (Math.PI * 2) / o.duration;
      var zeta = clamp(1 - o.bounce, 0.1, 1);
      var steps = Math.max(1, Math.ceil(elapsed / (1 / 240)));
      var dt = elapsed / steps;
      var active = false;

      state.springs.forEach(function (spring, id) {
        if (!spring.shown) return;
        if (spring.dragging) { paint(id, spring); return; }
        if (now < spring.start) { active = true; return; }
        for (var i = 0; i < steps; i++) {
          spring.vx += (-omega * omega * (spring.x - spring.tx) - 2 * zeta * omega * spring.vx) * dt;
          spring.vy += (-omega * omega * (spring.y - spring.ty) - 2 * zeta * omega * spring.vy) * dt;
          spring.vs += (-omega * omega * (spring.s - 1) - 2 * zeta * omega * spring.vs) * dt;
          spring.x += spring.vx * dt;
          spring.y += spring.vy * dt;
          spring.s += spring.vs * dt;
        }
        var resting =
          Math.abs(spring.x - spring.tx) < 0.05 &&
          Math.abs(spring.y - spring.ty) < 0.05 &&
          Math.abs(spring.s - 1) < 0.0005 &&
          Math.abs(spring.vx) + Math.abs(spring.vy) < 0.05 &&
          Math.abs(spring.vs) < 0.001;
        if (resting) {
          spring.x = spring.tx;
          spring.y = spring.ty;
          spring.s = 1;
          spring.vx = spring.vy = spring.vs = 0;
        } else {
          active = true;
        }
        if (spring.reveal < 1) {
          spring.reveal = clamp((now - spring.start) / (o.duration * 1000), 0, 1);
          if (spring.reveal < 1) active = true;
        }
        paint(id, spring);
      });

      if (active) eng.raf = requestAnimationFrame(frame);
    }

    function kick() {
      var eng = state.engine;
      if (eng.raf || typeof window === 'undefined') return;
      eng.last = performance.now();
      eng.raf = requestAnimationFrame(frame);
    }

    /* ---------- 揭示 ---------- */
    function visibleCenter() {
      var rect = root.getBoundingClientRect();
      var top = Math.max(0, -rect.top);
      var bottom = Math.min(rect.height, window.innerHeight - rect.top);
      return bottom > top ? (top + bottom) / 2 : rect.height / 2;
    }

    function flushReveals() {
      var eng = state.engine;
      eng.flush = 0;
      var batch = [];
      state.pending.forEach(function (id) {
        var spring = state.springs.get(id);
        if (spring && !spring.shown) batch.push({ id: id, spring: spring });
      });
      state.pending.clear();
      if (!batch.length) return;

      batch.sort(function (a, b) { return a.spring.ty - b.spring.ty || a.spring.tx - b.spring.tx; });
      var now = performance.now();
      var still = reduced() || o.animateFrom === 'none';
      var rootWidth = root.clientWidth;
      var centerY = visibleCenter();
      var DIRECTIONS = ['bottom', 'top', 'left', 'right'];

      batch.forEach(function (entry, rank) {
        var id = entry.id, spring = entry.spring;
        spring.shown = true;
        spring.blur = o.blurToFocus && !still;

        if (still) {
          spring.x = spring.tx;
          spring.y = spring.ty;
          spring.s = 1;
          spring.reveal = 1;
          spring.start = now;
          paint(id, spring);
          return;
        }

        var direction = o.animateFrom === 'random'
          ? DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)]
          : o.animateFrom;
        var distance = 60 + Math.min(spring.h, 280) * 0.35;

        spring.x = spring.tx;
        spring.y = spring.ty;
        spring.s = 0.96;

        if (direction === 'center') {
          spring.x = rootWidth / 2 - spring.w / 2;
          spring.y = centerY - spring.h / 2;
          spring.s = 0.55;
        } else if (direction === 'bottom') {
          spring.y += distance;
        } else if (direction === 'top') {
          spring.y -= distance;
        } else if (direction === 'left') {
          spring.x -= distance;
        } else if (direction === 'right') {
          spring.x += distance;
        }

        spring.vx = spring.vy = spring.vs = 0;
        spring.reveal = 0;
        spring.start = now + rank * o.stagger * 1000;
        paint(id, spring);
      });

      kick();
    }

    function requestReveal(id) {
      var spring = state.springs.get(id);
      if (!spring || spring.shown) return;
      if (!state.loaded.has(id)) {
        state.waiting.add(id);
        return;
      }
      state.waiting.delete(id);
      state.pending.add(id);
      if (!state.engine.flush) state.engine.flush = requestAnimationFrame(flushReveals);
    }

    function markLoaded(id) {
      state.loaded.add(id);
      var node = state.nodes.get(id);
      var img = node && node.querySelector('img');
      if (img) img.setAttribute('data-loaded', '');
      if (state.waiting.has(id)) requestReveal(id);
    }

    var io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = entry.target.getAttribute('data-id');
          if (id) requestReveal(id);
          io.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -6% 0px' });
    }

    function observeReveals() {
      if (!o.revealOnScroll || !io) {
        state.springs.forEach(function (spring, id) {
          if (!spring.shown) requestReveal(id);
        });
        return;
      }
      state.nodes.forEach(function (node, id) {
        var spring = state.springs.get(id);
        if (!spring || spring.shown || node.getAttribute('data-observed')) return;
        node.setAttribute('data-observed', '');
        io.observe(node);
      });
    }

    /* ---------- 交互 ---------- */
    function setDimmed(activeId) {
      state.nodes.forEach(function (node, id) {
        if (activeId && id !== activeId) node.setAttribute('data-dimmed', '');
        else node.removeAttribute('data-dimmed');
      });
    }

    function onEnter(id) {
      if (o.focusOnHover) setDimmed(id);
    }

    function onLeave(e) {
      if (o.focusOnHover) setDimmed(null);
      e.currentTarget.style.removeProperty('--masonry-tilt-x');
      e.currentTarget.style.removeProperty('--masonry-tilt-y');
    }

    function onTilt(e) {
      if (o.hoverEffect !== 'tilt') return;
      var card = e.currentTarget;
      var rect = card.getBoundingClientRect();
      var px = (e.clientX - rect.left) / rect.width - 0.5;
      var py = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.setProperty('--masonry-tilt-x', (-py * 10).toFixed(2) + 'deg');
      card.style.setProperty('--masonry-tilt-y', (px * 10).toFixed(2) + 'deg');
    }

    function onCardClick(e, item) {
      if (o.onItemClick) o.onItemClick(item, o.items.indexOf(item), e);
      if (e.defaultPrevented) return;
      if (!o.lightbox) return;
      e.preventDefault();
      openBox(item);
    }

    /* ---------- 灯箱 ---------- */
    function frameFor(item) {
      var aspect = aspectOf(item);
      var pad = window.innerWidth < 640 ? 16 : 72;
      var room = (item.title || item.description || item.url) ? 56 : 0;
      var maxW = Math.max(40, window.innerWidth - pad * 2);
      var maxH = Math.max(40, window.innerHeight - pad * 2 - room);
      var w = maxW, h = w * aspect;
      if (h > maxH) { h = maxH; w = h / aspect; }
      return {
        left: (window.innerWidth - w) / 2,
        top: (window.innerHeight - room - h) / 2,
        width: w, height: h, room: room
      };
    }

    function mediaRect(id) {
      var node = state.nodes.get(id);
      var media = node && node.querySelector('[data-media]');
      return media ? media.getBoundingClientRect() : null;
    }

    function destroyBox() {
      if (state.box && state.box.parentNode) state.box.parentNode.removeChild(state.box);
      state.box = null;
    }

    function buildBox(item) {
      destroyBox();
      var box = document.createElement('div');
      box.className = 'masonry-lightbox';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', item.title || item.alt || '作品');

      var backdrop = document.createElement('div');
      backdrop.className = 'masonry-lightbox__backdrop';
      backdrop.setAttribute('data-box-backdrop', '');
      backdrop.addEventListener('click', closeBox);

      var frame = frameFor(item);
      var img = document.createElement('img');
      img.className = 'masonry-lightbox__image';
      img.setAttribute('data-box-image', '');
      img.src = item.img;
      img.alt = item.alt || item.title || '';
      img.draggable = false;
      img.style.width = frame.width + 'px';
      img.style.height = frame.height + 'px';
      img.style.left = frame.left + 'px';
      img.style.top = frame.top + 'px';
      img.style.borderRadius = '6px';
      img.addEventListener('click', closeBox);

      box.appendChild(backdrop);
      box.appendChild(img);

      if (frame.room > 0) {
        var cap = document.createElement('div');
        cap.className = 'masonry-lightbox__caption';
        cap.setAttribute('data-box-fade', '');
        cap.style.top = (frame.top + frame.height + 18) + 'px';
        if (item.title) {
          var sp = document.createElement('span');
          sp.textContent = item.title;
          cap.appendChild(sp);
        }
        if (item.description) {
          var muted = document.createElement('span');
          muted.className = 'masonry-lightbox__muted';
          muted.textContent = item.description;
          cap.appendChild(muted);
        }
        box.appendChild(cap);
      }

      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'masonry-lightbox__button masonry-lightbox__close';
      close.setAttribute('data-box-fade', '');
      close.setAttribute('data-box-close', '');
      close.setAttribute('aria-label', '关闭');
      close.innerHTML = ICON_CLOSE;
      close.addEventListener('click', closeBox);
      box.appendChild(close);

      if (o.items.length > 1) {
        var prev = document.createElement('button');
        prev.type = 'button';
        prev.className = 'masonry-lightbox__button masonry-lightbox__prev';
        prev.setAttribute('data-box-fade', '');
        prev.setAttribute('aria-label', '上一张');
        prev.innerHTML = ICON_PREV;
        prev.addEventListener('click', function () { stepBox(-1); });
        box.appendChild(prev);

        var next = document.createElement('button');
        next.type = 'button';
        next.className = 'masonry-lightbox__button masonry-lightbox__next';
        next.setAttribute('data-box-fade', '');
        next.setAttribute('aria-label', '下一张');
        next.innerHTML = ICON_NEXT;
        next.addEventListener('click', function () { stepBox(1); });
        box.appendChild(next);
      }

      document.body.appendChild(box);
      state.box = box;
      return box;
    }

    function openBox(item) {
      var id = keyOf(item);
      var node = state.nodes.get(id);
      if (node) node.setAttribute('data-hidden', '');
      state.openId = id;
      state.lastShown = id;

      var box = buildBox(item);
      document.documentElement.style.overflow = 'hidden';

      var img = box.querySelector('[data-box-image]');
      var backdrop = box.querySelector('[data-box-backdrop]');
      var rect = mediaRect(id);

      if (rect && !reduced() && img) {
        var target = img.getBoundingClientRect();
        var scale = rect.width / target.width;
        img.animate([
          {
            transform: 'translate(' + (rect.left - target.left) + 'px,' + (rect.top - target.top) + 'px) scale(' + scale + ')',
            borderRadius: (o.radius / Math.max(scale, 0.01)) + 'px'
          },
          { transform: 'none', borderRadius: '6px' }
        ], { duration: 520, easing: EASE });
        if (backdrop) backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, easing: 'ease' });
        box.querySelectorAll('[data-box-fade]').forEach(function (fade) {
          fade.animate([
            { opacity: 0 },
            { opacity: 0, offset: 0.5 },
            { opacity: 1 }
          ], { duration: 560, easing: 'ease' });
        });
      }

      var close = box.querySelector('[data-box-close]');
      if (close) close.focus({ preventScroll: true });
    }

    function closeBox() {
      if (!state.openId || state.closing) return;
      var id = state.openId;
      var node = state.nodes.get(id);
      var img = state.box && state.box.querySelector('[data-box-image]');
      var backdrop = state.box && state.box.querySelector('[data-box-backdrop]');
      var rect = mediaRect(id);

      var finish = function () {
        destroyBox();
        if (node) node.removeAttribute('data-hidden');
        state.openId = null;
        state.closing = false;
        document.documentElement.style.overflow = '';
        var last = state.lastShown && state.nodes.get(state.lastShown);
        var card = last && last.querySelector('[data-card]');
        if (card) card.focus({ preventScroll: true });
      };

      if (!img || !rect || reduced()) { finish(); return; }

      state.closing = true;
      var current = img.getBoundingClientRect();
      var scale = rect.width / current.width;
      img.getAnimations().forEach(function (a) { a.cancel(); });
      var anim = img.animate([
        { transform: 'none', borderRadius: '6px' },
        {
          transform: 'translate(' + (rect.left - current.left) + 'px,' + (rect.top - current.top) + 'px) scale(' + scale + ')',
          borderRadius: (o.radius / Math.max(scale, 0.01)) + 'px'
        }
      ], { duration: 380, easing: EASE, fill: 'forwards' });

      if (backdrop) backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease', fill: 'forwards' });
      if (state.box) {
        state.box.querySelectorAll('[data-box-fade]').forEach(function (fade) {
          fade.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
        });
      }

      anim.finished.then(finish).catch(finish);
    }

    function stepBox(dir) {
      if (!state.openId || state.closing || o.items.length < 2) return;
      var index = o.items.findIndex(function (it) { return keyOf(it) === state.openId; });
      var next = o.items[(index + dir + o.items.length) % o.items.length];

      var oldNode = state.nodes.get(state.openId);
      if (oldNode) oldNode.removeAttribute('data-hidden');
      var newNode = state.nodes.get(keyOf(next));
      if (newNode) newNode.setAttribute('data-hidden', '');

      state.openId = keyOf(next);
      state.lastShown = state.openId;

      var box = buildBox(next);
      var img = box.querySelector('[data-box-image]');
      if (img) {
        img.animate([
          { opacity: 0, transform: 'scale(0.97)' },
          { opacity: 1, transform: 'none' }
        ], { duration: reduced() ? 1 : 320, easing: EASE });
      }
    }

    function onKey(e) {
      if (!state.openId) return;
      if (e.key === 'Escape') { e.stopPropagation(); closeBox(); }
      else if (e.key === 'ArrowRight') { e.stopPropagation(); stepBox(1); }
      else if (e.key === 'ArrowLeft') { e.stopPropagation(); stepBox(-1); }
    }
    document.addEventListener('keydown', onKey, true);

    /* ---------- 尺寸 ---------- */
    var ro = new ResizeObserver(function (entries) {
      var w = Math.round(entries[0].contentRect.width);
      if (!w || Math.abs(w - state.width) < 2) return;
      state.width = w;
      applyLayout();
    });
    ro.observe(root);

    state.width = Math.round(root.getBoundingClientRect().width);
    applyLayout();

    return {
      refresh: function () { state.width = Math.round(root.getBoundingClientRect().width); applyLayout(); },
      close: closeBox,
      destroy: function () {
        state.alive = false;
        cancelAnimationFrame(state.engine.raf);
        cancelAnimationFrame(state.engine.flush);
        ro.disconnect();
        if (io) io.disconnect();
        document.removeEventListener('keydown', onKey, true);
        closeBox();
        destroyBox();
        root.innerHTML = '';
        root.classList.remove('masonry');
      }
    };
  }

  window.createMasonry = create;
})();

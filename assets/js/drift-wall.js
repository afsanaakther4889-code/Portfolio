/* =========================================================
   DriftWall —— React Bits 组件 (DriftWall.jsx) 的原生 JS 移植
   原组件：https://reactbits.dev  ·  props / 动效 / 缓动曲线保持一致
   用法：
     var wall = window.createDriftWall(el, { items: [...], columns: 5 });
     wall.destroy();
   ========================================================= */
(function () {
  'use strict';

  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

  var DEFAULTS = {
    items: [],
    columns: 5,
    tileWidth: 200,
    tileHeight: 132,
    gap: 18,
    radius: 14,
    tilt: 16,
    turn: -14,
    roll: 0,
    perspective: 1200,
    depth: 120,
    speed: 42,
    direction: 'up',
    variance: 0.45,
    parallax: 0.6,
    pauseOnHover: false,
    lift: 64,
    fade: 0.6,
    dim: 0.55,
    grayscale: false,
    overlayColor: '#060010',
    decorative: true,
    pointerTarget: null,
    label: 'Drifting wall of tiles',
    cursorLabel: '',
    onSelect: null
  };

  function columnFactor(index, variance) {
    var pseudo = ((index * 0.6180339887 + 0.35) % 1) * 2 - 1;
    return 1 + variance * pseudo;
  }

  function create(container, options) {
    if (!container) return null;

    var o = {};
    Object.keys(DEFAULTS).forEach(function (k) { o[k] = DEFAULTS[k]; });
    if (options) Object.keys(options).forEach(function (k) { o[k] = options[k]; });

    var state = {
      h: 0,
      cols: [],
      meta: [],
      tracks: [],
      offsets: [],
      velocities: [],
      baseVel: [],
      hoveredCol: -1,
      activeEl: null,
      wallHovered: false,
      pointer: { x: 0, y: 0 },
      damped: { x: 0, y: 0 },
      last: null,
      raf: null,
      alive: true
    };

    container.classList.add('drift-wall');
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', o.label);
    if (o.decorative) container.setAttribute('aria-hidden', 'true');

    var plane = document.createElement('div');
    plane.className = 'drift-wall__plane';
    container.appendChild(plane);

    /* ---- CSS 变量 ---- */
    container.style.setProperty('--dw-tile-w', o.tileWidth + 'px');
    container.style.setProperty('--dw-tile-h', o.tileHeight + 'px');
    container.style.setProperty('--dw-gap', o.gap + 'px');
    container.style.setProperty('--dw-radius', o.radius + 'px');
    container.style.setProperty('--dw-perspective', o.perspective + 'px');
    container.style.setProperty('--dw-lift', o.lift + 'px');
    container.style.setProperty('--dw-dim', o.dim);
    container.style.setProperty('--dw-gray', o.grayscale ? 1 : 0);
    container.style.setProperty('--dw-overlay', o.overlayColor);
    container.style.setProperty('--dw-edge', Math.max(0, (1 - o.fade) * 100) + '%');

    /* ---- 单个瓦片 ---- */
    function makeTile(item, id, colIndex) {
      var el = document.createElement(item.href && !o.decorative ? 'a' : 'div');
      el.className = 'drift-wall__tile';
      el.setAttribute('data-tile-id', id);
      el.setAttribute('data-col', colIndex);
      if (o.cursorLabel) el.setAttribute('data-cursor', o.cursorLabel);

      if (item.href && !o.decorative) {
        el.href = item.href;
        el.target = '_blank';
        el.rel = 'noreferrer noopener';
      } else if (!o.decorative) {
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', item.title || 'tile');
      } else {
        el.tabIndex = -1;
      }

      var inner = document.createElement('span');
      inner.className = 'drift-wall__inner';

      var img = document.createElement('img');
      img.src = item.image;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.draggable = false;

      var overlay = document.createElement('span');
      overlay.className = 'drift-wall__overlay';
      overlay.setAttribute('aria-hidden', 'true');

      inner.appendChild(img);
      inner.appendChild(overlay);
      el.appendChild(inner);

      el.addEventListener('click', function (e) {
        if (!o.onSelect) return;
        e.preventDefault();
        o.onSelect(item);
      });

      if (!o.decorative) {
        el.addEventListener('focus', function () { activate(el, colIndex); });
        el.addEventListener('blur', release);
      }
      return el;
    }

    /* ---- 布局并生成 DOM ---- */
    function build() {
      var cols = [];
      for (var c = 0; c < o.columns; c++) cols.push([]);
      o.items.forEach(function (item, i) { cols[i % o.columns].push(item); });
      cols = cols.map(function (col) { return col.length ? col : o.items.slice(0, 1); });

      var unit = o.tileHeight + o.gap;
      var h = state.h || container.clientHeight || 600;

      var meta = cols.map(function (col) {
        var copyHeight = Math.max(unit, col.length * unit);
        var copies = Math.max(2, Math.ceil((h * 1.6) / copyHeight) + 1);
        return { copyHeight: copyHeight, copies: copies };
      });

      plane.innerHTML = '';
      state.tracks = [];

      cols.forEach(function (col, ci) {
        var colEl = document.createElement('div');
        colEl.className = 'drift-wall__col';
        var track = document.createElement('div');
        track.className = 'drift-wall__track';

        for (var copy = 0; copy < meta[ci].copies; copy++) {
          col.forEach(function (item, ii) {
            track.appendChild(makeTile(item, ci + '-' + copy + '-' + ii, ci));
          });
        }
        colEl.appendChild(track);
        plane.appendChild(colEl);
        state.tracks[ci] = track;
      });

      state.cols = cols;
      state.meta = meta;
      state.offsets = meta.map(function (m, ci) { return m.copyHeight * ((ci * 0.37) % 1); });
      state.velocities = cols.map(function () { return 0; });

      var dirSign = o.direction === 'up' ? 1 : -1;
      state.baseVel = cols.map(function (_, ci) {
        var altSign = ci % 2 === 0 ? 1 : -1;
        return o.speed * columnFactor(ci, o.variance) * dirSign * altSign;
      });

      applyStatic();
    }

    /* ---- 3D 平面 ---- */
    function applyPlane(px, py) {
      plane.style.transform =
        'translate(-50%, -50%) scale(1.18) ' +
        'rotateX(' + (o.tilt + py) + 'deg) ' +
        'rotateY(' + (o.turn + px) + 'deg) ' +
        'rotateZ(' + o.roll + 'deg) ' +
        'translateZ(' + -o.depth + 'px)';
    }

    function applyStatic() {
      applyPlane(0, 0);
      state.tracks.forEach(function (el, ci) {
        var m = state.meta[ci];
        if (el && m) el.style.transform = 'translate3d(0,' + -(state.offsets[ci] || 0) + 'px,0)';
      });
    }

    /* ---- 悬停 ---- */
    function activate(el, colIndex) {
      if (state.activeEl && state.activeEl !== el) state.activeEl.classList.remove('is-active');
      state.activeEl = el;
      state.hoveredCol = colIndex;
      el.classList.add('is-active');
    }
    function release() {
      if (state.activeEl) state.activeEl.classList.remove('is-active');
      state.activeEl = null;
      state.hoveredCol = -1;
    }

    /* ---- 指针 ---- */
    var moveTarget = o.pointerTarget || container;

    function onPointerMove(e) {
      if (o.parallax > 0 && !reduceMQ.matches) {
        var rect = moveTarget.getBoundingClientRect();
        if (rect.width && rect.height) {
          state.pointer.x = (e.clientX - rect.left) / rect.width - 0.5;
          state.pointer.y = (e.clientY - rect.top) / rect.height - 0.5;
        }
      }
      var hit = document.elementFromPoint(e.clientX, e.clientY);
      var tile = hit && hit.closest ? hit.closest('[data-tile-id]') : null;
      if (!tile || tile === state.activeEl) return;
      activate(tile, Number(tile.getAttribute('data-col')));
    }

    function onPointerEnter() { state.wallHovered = true; }

    function onPointerLeave() {
      state.wallHovered = false;
      state.pointer.x = 0;
      state.pointer.y = 0;
      release();
    }

    moveTarget.addEventListener('pointermove', onPointerMove, { passive: true });
    moveTarget.addEventListener('pointerenter', onPointerEnter);
    moveTarget.addEventListener('pointerleave', onPointerLeave);

    /* ---- 主循环 ---- */
    function frame(ts) {
      if (!state.alive) return;
      if (state.last === null) state.last = ts;
      var dt = Math.min(0.05, Math.max(0, ts - state.last) / 1000);
      state.last = ts;

      var maxTilt = o.parallax * 8;
      var targetX = state.pointer.x * maxTilt;
      var targetY = -state.pointer.y * maxTilt;
      var damp = 1 - Math.exp(-dt / 0.12);
      state.damped.x += (targetX - state.damped.x) * damp;
      state.damped.y += (targetY - state.damped.y) * damp;
      applyPlane(state.damped.x, state.damped.y);

      var reduced = reduceMQ.matches;

      for (var c = 0; c < state.tracks.length; c++) {
        var m = state.meta[c];
        if (!m) continue;
        var el = state.tracks[c];

        if (reduced) {
          if (el) el.style.transform = 'translate3d(0,' + -(state.offsets[c] || 0) + 'px,0)';
          continue;
        }

        var paused = state.wallHovered && o.pauseOnHover;
        var factor = paused || state.hoveredCol === c ? 0 : 1;
        var target = state.baseVel[c] * factor;

        var ease = 1 - Math.exp(-dt / (target === 0 ? 0.16 : 0.28));
        state.velocities[c] += (target - state.velocities[c]) * ease;

        var next = (state.offsets[c] || 0) + state.velocities[c] * dt;
        next = ((next % m.copyHeight) + m.copyHeight) % m.copyHeight;
        state.offsets[c] = next;

        if (el) el.style.transform = 'translate3d(0,' + -next + 'px,0)';
      }

      state.raf = requestAnimationFrame(frame);
    }

    /* ---- 尺寸监听 ---- */
    var resizeTimer = null;
    var ro = new ResizeObserver(function (entries) {
      var h = entries[0].contentRect.height;
      if (!h || Math.abs(h - state.h) < 4) return;
      state.h = h;
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(build, 120);
    });
    ro.observe(container);

    state.h = container.clientHeight || 600;
    build();
    state.raf = requestAnimationFrame(frame);

    return {
      rebuild: build,
      setActive: function (on) {
        if (on) {
          if (!state.raf && state.alive) { state.last = null; state.raf = requestAnimationFrame(frame); }
        } else if (state.raf) {
          cancelAnimationFrame(state.raf);
          state.raf = null;
        }
      },
      destroy: function () {
        state.alive = false;
        if (state.raf) cancelAnimationFrame(state.raf);
        window.clearTimeout(resizeTimer);
        ro.disconnect();
        moveTarget.removeEventListener('pointermove', onPointerMove);
        moveTarget.removeEventListener('pointerenter', onPointerEnter);
        moveTarget.removeEventListener('pointerleave', onPointerLeave);
        container.innerHTML = '';
        container.classList.remove('drift-wall');
      }
    };
  }

  window.createDriftWall = create;
})();

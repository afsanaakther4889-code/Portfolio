/**
 * CircularCarousel — 原生移植版（无依赖）
 *
 * 源自 React Bits 的 <CircularCarousel /> 组件（JavaScript + CSS）。
 * 本文件把 React 实现移植为原生版本：
 *   - useState / useRef / useMemo / useEffect / useLayoutEffect
 *       → 实例字段、闭包与显式的 setup/teardown
 *   - 内联 style 变量（--cc-fade / --cc-radius / --cc-inner）
 *       → 同样的 CSS 自定义属性，样式表沿用原组件 CSS
 *   - JSX 卡片与贴片渲染 → 原生 DOM 构建，几何计算逐行保留
 *
 * 对外 API：
 *   const carousel = createCircularCarousel(container, { items, preset, ... });
 *   carousel.setItems(newItems);   // 等长时交叉淡入（等价于 React 侧换 items）
 *   carousel.destroy();
 *
 * 依赖：无
 */
(function () {
  'use strict';

  const PRESETS = {
    cylinder: {
      axis: 'y', tilt: -5, perspective: 2500, curve: 1,
      spread: 1, inward: false, billboard: false, backfaces: true, window: 0,
    },
    orbit: {
      axis: 'y', tilt: -16, perspective: 1500, curve: 0,
      spread: 1.45, inward: false, billboard: true, backfaces: false, window: 0,
    },
    wheel: {
      axis: 'x', tilt: 0, perspective: 1800, curve: 0,
      spread: 1, inward: false, billboard: false, backfaces: true, window: 1.7,
    },
    panorama: {
      axis: 'y', tilt: 0, perspective: 0, curve: 1,
      spread: 1, inward: true, billboard: false, backfaces: false, window: 0,
    },
  };

  const INTRO_LENGTH = { assemble: 1500, rise: 1400, spin: 1800, none: 0 };
  const TILES = 8;
  const OVERLAP = 2.5;
  const DRAG_THRESHOLD = 5;
  const SPRING = 118;
  const SETTLE_SPEED = 9;
  const CAPTION_SPACE = 76;
  const SWAP_LENGTH = 700;
  const SWAP_SPREAD = 420;
  const TO_RAD = Math.PI / 180;

  /* 渲染数量的安全上限。原组件不限制卡片数，只把【预加载】限制在 16 张；
     这里给渲染也留一个宽松上限（64），避免误传几百张时把环压成一个点。 */
  const MAX_ITEMS = 64;
  const PRELOAD_LIMIT = 16;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const wrap = (degrees) => ((((degrees + 180) % 360) + 360) % 360) - 180;
  const easeOut = (t) => 1 - Math.pow(1 - t, 4);
  const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);

  const rotateX = (p, degrees) => {
    const r = degrees * TO_RAD;
    const c = Math.cos(r);
    const s = Math.sin(r);
    return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
  };
  const rotateY = (p, degrees) => {
    const r = degrees * TO_RAD;
    const c = Math.cos(r);
    const s = Math.sin(r);
    return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
  };

  const DEFAULTS = {
    items: [],
    preset: 'cylinder',
    intro: 'rise',
    cardWidth: 220,
    aspectRatio: 1,
    gap: 25,
    curve: undefined,
    tilt: undefined,
    perspective: undefined,
    autoplay: 'drift',
    speed: 14,
    interval: 3,
    direction: 'left',
    draggable: true,
    momentum: 0.6,
    snap: true,
    pauseOnHover: true,
    focusOnClick: true,
    parallax: 0.3,
    stretch: 0.5,
    depthFade: 0.55,
    fadeColor: '#000000',
    innerShade: 0.6,
    cornerRadius: 12,
    captions: false,
    onChange: null,
    onItemClick: null,
    ariaLabel: '作品图片',
  };

  /** 监听 prefers-reduced-motion，返回 { get, subscribe } */
  function reducedMotionWatch() {
    const query = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    let value = query ? query.matches : false;
    const listeners = new Set();
    if (query) {
      const update = () => {
        value = query.matches;
        listeners.forEach((fn) => fn(value));
      };
      if (query.addEventListener) query.addEventListener('change', update);
      else if (query.addListener) query.addListener(update);
    }
    return {
      get: () => value,
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    };
  }

  function createCircularCarousel(container, options = {}) {
    if (!container) throw new Error('CircularCarousel: 容器不存在');

    const cfg = Object.assign({}, DEFAULTS, options);
    const motion = reducedMotionWatch();

    const shape = PRESETS[cfg.preset] ? cfg.preset : 'cylinder';
    const layout = PRESETS[shape];
    const axis = layout.axis;
    const tiltValue = cfg.tilt === undefined || cfg.tilt === null ? layout.tilt : cfg.tilt;
    const curveValue = layout.billboard
      ? 0
      : clamp(cfg.curve === undefined || cfg.curve === null ? layout.curve : cfg.curve, 0, 1);

    const cardW = Math.max(40, cfg.cardWidth);
    const cardH = cardW / clamp(cfg.aspectRatio, 0.2, 5);
    const along = axis === 'x' ? cardH : cardW;

    let items = (cfg.items && cfg.items.length ? cfg.items : []).slice(0, MAX_ITEMS);
    let count = Math.max(items.length, 1);
    let step = 360 / count;

    /* ---------- 半径：弦长与弧长的插值 ---------- */
    const computeRadius = () => {
      const n = Math.max(count, 3);
      const pitch = (along + cfg.gap) * layout.spread;
      const chord = pitch / (2 * Math.sin(Math.PI / n));
      const arc = (n * pitch) / (2 * Math.PI);
      return Math.max(chord + (arc - chord) * curveValue, along * 0.6);
    };
    let radius = computeRadius();

    /* ---------- 贴片几何：把一张卡沿环向切成 8 片以贴合曲率 ---------- */
    const computeTiles = () => {
      const total = curveValue > 0.001 ? TILES : 1;
      const length = along / total;
      const bend = curveValue > 0.001 ? radius / curveValue : 0;
      return Array.from({ length: total }, (_, index) => {
        const start = index * length - (index > 0 ? OVERLAP / 2 : 0);
        const end = (index + 1) * length + (index < total - 1 ? OVERLAP / 2 : 0);
        const center = (start + end) / 2 - along / 2;
        const alpha = bend ? center / bend : 0;
        const shift = bend ? bend * Math.sin(alpha) : center;
        const sink = bend ? bend * (1 - Math.cos(alpha)) : 0;
        const depth = layout.inward ? sink : -sink;
        const turn = ((layout.inward ? -alpha : alpha) * 180) / Math.PI;
        const move = axis === 'x'
          ? `translate3d(0px, ${shift}px, ${depth}px) rotateX(${-turn}deg)`
          : `translate3d(${shift}px, 0px, ${depth}px) rotateY(${turn}deg)`;
        return { index, total, start, end, size: end - start, move };
      });
    };
    let tiles = computeTiles();

    /* ---------- DOM ---------- */
    const root = document.createElement('div');
    root.className = 'circular-carousel';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-roledescription', 'carousel');
    root.setAttribute('aria-label', cfg.ariaLabel);
    root.tabIndex = 0;
    root.dataset.axis = axis;
    root.dataset.shape = shape;
    root.style.setProperty('--cc-fade', cfg.fadeColor);
    root.style.setProperty('--cc-radius', `${Math.max(0, cfg.cornerRadius)}px`);
    root.style.setProperty('--cc-inner', (1 - clamp(cfg.innerShade, 0, 1)).toFixed(3));
    if (cfg.draggable) root.dataset.draggable = '';

    root.innerHTML =
      '<div class="circular-carousel__view">' +
        '<div class="circular-carousel__stage">' +
          '<div class="circular-carousel__camera">' +
            '<div class="circular-carousel__ring"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="circular-carousel__live" aria-live="polite" aria-atomic="true"></div>';

    const stage = root.querySelector('.circular-carousel__stage');
    const camera = root.querySelector('.circular-carousel__camera');
    const ring = root.querySelector('.circular-carousel__ring');
    const live = root.querySelector('.circular-carousel__live');

    let captionEl = null;
    if (cfg.captions) {
      captionEl = document.createElement('div');
      captionEl.className = 'circular-carousel__caption';
      captionEl.setAttribute('aria-hidden', 'true');
      root.appendChild(captionEl);
    }

    container.appendChild(root);

    /* ---------- 状态 ---------- */
    const state = {
      angle: 0,
      velocity: 0,
      target: null,
      dir: 0,
      press: null,
      drag: false,
      hover: false,
      pointer: { inside: false, x: 0, y: 0 },
      yaw: 0,
      pitch: 0,
      intro: null,
      introDone: false,
      holdUntil: 0,
      stepAt: 0,
      suppressClick: false,
      wheelTimer: 0,
      fit: 1,
      shift: 0,
      drop: 0,
      last: 0,
    };

    let ready = false;
    let dragging = false;
    let active = 0;
    let raf = 0;
    let visible = true;
    let destroyed = false;
    let leaving = null;

    const cards = [];
    const dragSign = layout.inward ? -1 : 1;
    let directionSign = (cfg.direction === 'right' ? 1 : -1) * dragSign;
    state.dir = directionSign;

    const settings = () => {
      const reduced = motion.get();
      return {
        count,
        step,
        radius,
        layout,
        axis,
        tilt: tiltValue,
        perspective: layout.inward ? radius
          : (cfg.perspective === undefined || cfg.perspective === null
            ? layout.perspective : cfg.perspective),
        cardW,
        cardH,
        intro: reduced ? 'none' : (cfg.intro in INTRO_LENGTH ? cfg.intro : 'rise'),
        autoplay: reduced ? 'off' : cfg.autoplay,
        speed: cfg.speed,
        interval: Math.max(0.5, cfg.interval),
        draggable: cfg.draggable,
        momentum: clamp(cfg.momentum, 0, 1),
        snap: cfg.snap,
        pauseOnHover: cfg.pauseOnHover,
        parallax: reduced ? 0 : clamp(cfg.parallax, 0, 1),
        stretch: reduced ? 0 : clamp(cfg.stretch, 0, 1),
        depthFade: clamp(cfg.depthFade, 0, 1),
        captions: cfg.captions,
        reduced,
      };
    };

    /* ---------- 卡片构建 ---------- */
    const buildTile = (item, tile, back) => {
      const strip = back ? tile.total - 1 - tile.index : tile.index;
      const first = strip === 0;
      const last = strip === tile.total - 1;
      const r = 'var(--cc-radius)';
      const frameRadius = axis === 'x'
        ? `${first ? r : 0} ${first ? r : 0} ${last ? r : 0} ${last ? r : 0}`
        : `${first ? r : 0} ${last ? r : 0} ${last ? r : 0} ${first ? r : 0}`;
      const offset = back ? along - tile.end : tile.start;
      const box = axis === 'x'
        ? { left: -cardW / 2, top: -tile.size / 2, width: cardW, height: tile.size }
        : { left: -tile.size / 2, top: -cardH / 2, width: tile.size, height: cardH };
      const photoStyle = axis === 'x'
        ? { left: 0, top: -offset, width: cardW, height: cardH }
        : { left: -offset, top: 0, width: cardW, height: cardH };

      const el = document.createElement('div');
      el.className = 'circular-carousel__tile';
      el.setAttribute('aria-hidden', 'true');
      el.style.left = `${box.left}px`;
      el.style.top = `${box.top}px`;
      el.style.width = `${box.width}px`;
      el.style.height = `${box.height}px`;
      el.style.transform = tile.move + (back ? (axis === 'x' ? ' rotateX(180deg)' : ' rotateY(180deg)') : '');

      const frame = document.createElement('div');
      frame.className = 'circular-carousel__frame';
      frame.style.height = `${axis === 'x' ? tile.size : cardH}px`;
      frame.style.borderRadius = frameRadius;

      const img = document.createElement('img');
      img.className = 'circular-carousel__photo';
      img.src = item.src;
      img.alt = '';
      img.draggable = false;
      img.decoding = 'async';
      img.style.left = `${photoStyle.left}px`;
      img.style.top = `${photoStyle.top}px`;
      img.style.width = `${photoStyle.width}px`;
      img.style.height = `${photoStyle.height}px`;
      frame.appendChild(img);

      if (back) {
        const inner = document.createElement('div');
        inner.className = 'circular-carousel__inner';
        frame.appendChild(inner);
      }
      const shade = document.createElement('div');
      shade.className = 'circular-carousel__shade';
      frame.appendChild(shade);

      el.appendChild(frame);
      return el;
    };

    const buildCards = () => {
      ring.textContent = '';
      cards.length = 0;
      for (let index = 0; index < count; index++) {
        const item = items[index];
        const card = document.createElement('div');
        card.className = 'circular-carousel__card';
        card.dataset.ccIndex = String(index);
        card.setAttribute('role', 'group');
        card.setAttribute('aria-roledescription', 'slide');
        card.setAttribute(
          'aria-label',
          `${item && (item.title || item.alt) ? (item.title || item.alt) : `图片 ${index + 1}`}，第 ${index + 1} / ${count} 张`
        );
        for (const tile of tiles) card.appendChild(buildTile(item, tile, false));
        if (layout.backfaces) for (const tile of tiles) card.appendChild(buildTile(item, tile, true));
        ring.appendChild(card);
        cards.push(card);
      }
    };

    const updateLive = () => {
      const current = items[active] || items[0];
      const label = current ? current.title || current.alt || `图片 ${active + 1}` : '';
      live.textContent = `${label}，第 ${active + 1} / ${count} 张`;
      if (captionEl) {
        const title = current ? current.title || current.alt || '' : '';
        const subtitle = current && current.subtitle ? current.subtitle : '';
        captionEl.innerHTML = '';
        const t = document.createElement('span');
        t.className = 'circular-carousel__title';
        t.textContent = title;
        if (subtitle) {
          const s = document.createElement('span');
          s.className = 'circular-carousel__subtitle';
          s.textContent = subtitle;
          t.appendChild(s);
        }
        const c = document.createElement('span');
        c.className = 'circular-carousel__count';
        c.textContent = `${String(active + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`;
        captionEl.appendChild(t);
        captionEl.appendChild(c);
      }
    };

    /* ---------- 测量：把整个环缩放到容器内 ---------- */
    const nearest = (angle) => Math.round(angle / step) * step;

    const measure = () => {
      const s = settings();
      const rect = root.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const room = s.captions ? CAPTION_SPACE : 0;
      const width = rect.width * 0.94;
      const height = (rect.height - room) * 0.92;
      const P = s.perspective;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      if (s.layout.inward) {
        minX = -width / 2;
        maxX = width / 2;
        minY = -s.cardH / 2;
        maxY = s.cardH / 2;
      } else {
        const corners = [
          [-s.cardW / 2, -s.cardH / 2],
          [s.cardW / 2, -s.cardH / 2],
          [-s.cardW / 2, s.cardH / 2],
          [s.cardW / 2, s.cardH / 2],
        ];
        const limit = s.layout.window ? s.layout.window * s.step : 180;
        for (let a = -limit; a <= limit; a += limit / 24) {
          for (const [cx, cy] of corners) {
            let p;
            if (s.axis === 'x') {
              p = rotateY(rotateX([cx, cy, s.radius], -a), s.tilt);
            } else if (s.layout.billboard) {
              const c = rotateY([0, 0, s.radius], a);
              p = rotateX([c[0] + cx, cy, c[2]], s.tilt);
            } else {
              p = rotateX(rotateY([cx, cy, s.radius], a), s.tilt);
            }
            p = [p[0], p[1], p[2] - s.radius];
            if (p[2] >= P * 0.95) continue;
            const k = P / (P - p[2]);
            minX = Math.min(minX, p[0] * k);
            maxX = Math.max(maxX, p[0] * k);
            minY = Math.min(minY, p[1] * k);
            maxY = Math.max(maxY, p[1] * k);
          }
        }
      }

      const spanX = Math.max(maxX - minX, 1);
      const spanY = Math.max(maxY - minY, 1);
      const fit = Math.min(1, width / spanX, height / spanY);
      state.fit = fit;
      state.shift = -((minY + maxY) / 2) * fit - room / 2;
      state.drop = s.axis === 'x'
        ? (rect.width / fit) * 0.55 + s.cardW
        : (rect.height / fit) * 0.55 + s.cardH;
      stage.style.perspective = `${P}px`;
      stage.style.transform = `translate3d(0, ${state.shift}px, 0) scale(${fit})`;
    };

    /* ---------- 入场动画 ---------- */
    const introCard = (elapsed, landing) => {
      if (!state.intro) return { radius: 1, lift: 0 };
      const type = state.intro.type;
      const reach = Math.abs(wrap(landing + state.angle));
      if (type === 'assemble') {
        const delay = (reach / 180) * 420;
        const p = easeOut(clamp((elapsed - delay) / 1080, 0, 1));
        return { radius: 1 + 0.6 * (1 - p), lift: 0 };
      }
      if (type === 'rise') {
        const delay = (reach / 180) * 480;
        const p = easeOutQuint(clamp((elapsed - delay) / 900, 0, 1));
        return { radius: 1, lift: (1 - p) * state.drop };
      }
      if (type === 'spin') {
        const p = easeOut(clamp(elapsed / INTRO_LENGTH.spin, 0, 1));
        return { radius: 1 + 0.28 * (1 - p), lift: 0 };
      }
      return { radius: 1, lift: 0 };
    };

    /* ---------- 每帧推进 ---------- */
    const advance = (s, dt, now) => {
      if (!state.introDone && ready) {
        if (!state.intro) {
          if (s.intro === 'none') state.introDone = true;
          else state.intro = { type: s.intro, start: now };
        }
        if (state.intro && now - state.intro.start >= INTRO_LENGTH[state.intro.type]) {
          state.intro = null;
          state.introDone = true;
        }
      }

      const paused = (s.pauseOnHover && state.hover) || state.drag || now < state.holdUntil;
      const cruise = s.autoplay === 'drift' && !paused && !state.intro ? s.speed * state.dir : 0;
      let busy = Boolean(state.intro) || state.drag;

      if (state.drag || state.intro) {
        state.velocity = state.drag ? state.velocity : 0;
      } else if (state.target !== null) {
        let remaining = dt;
        const damping = 2 * Math.sqrt(SPRING);
        while (remaining > 0) {
          const h = Math.min(remaining, 1 / 240);
          const accel = SPRING * (state.target - state.angle) - damping * state.velocity;
          state.velocity += accel * h;
          state.angle += state.velocity * h;
          remaining -= h;
        }
        if (Math.abs(state.target - state.angle) < 0.004 && Math.abs(state.velocity) < 0.03) {
          state.angle = state.target;
          state.velocity = 0;
          state.target = null;
        }
        busy = true;
      } else {
        const tau = 0.18 + s.momentum * 1.5;
        state.velocity += (cruise - state.velocity) * (1 - Math.exp(-dt / tau));
        state.angle += state.velocity * dt;
        if (cruise === 0 && s.snap && Math.abs(state.velocity) < SETTLE_SPEED) {
          state.target = nearest(state.angle);
        }
        busy = busy || cruise !== 0 || Math.abs(state.velocity) > 0.01 || state.target !== null;
      }

      if (s.autoplay === 'step' && !paused && !state.intro && state.introDone) {
        if (!state.stepAt) state.stepAt = now + s.interval * 1000;
        if (now >= state.stepAt) {
          state.target = (state.target === null ? nearest(state.angle) : state.target) + s.step * state.dir;
          state.stepAt = now + s.interval * 1000;
        }
        busy = true;
      } else {
        state.stepAt = 0;
      }

      if (now < state.holdUntil) busy = true;

      const ease = 1 - Math.exp(-dt / 0.35);
      const aimYaw = state.pointer.inside ? state.pointer.x * s.parallax * 9 : 0;
      const aimPitch = state.pointer.inside ? -state.pointer.y * s.parallax * 6 : 0;
      state.yaw += (aimYaw - state.yaw) * ease;
      state.pitch += (aimPitch - state.pitch) * ease;
      if (Math.abs(aimYaw - state.yaw) > 0.01 || Math.abs(aimPitch - state.pitch) > 0.01) busy = true;

      return busy;
    };

    /* ---------- 写入变换 ---------- */
    const render = (s, now) => {
      const elapsed = state.intro ? now - state.intro.start : 0;
      const swell = 1 + s.stretch * 0.12 * Math.min(1, Math.abs(state.velocity) / 420);
      let spinOffset = 0;
      if (state.intro && state.intro.type === 'spin') {
        const p = easeOut(clamp(elapsed / INTRO_LENGTH.spin, 0, 1));
        spinOffset = -300 * state.dir * (1 - p);
      } else if (state.intro && state.intro.type === 'assemble') {
        const p = easeOut(clamp(elapsed / INTRO_LENGTH.assemble, 0, 1));
        spinOffset = -32 * state.dir * (1 - p);
      }
      const angle = state.angle + spinOffset;
      const R = s.radius * swell;

      if (s.axis === 'x') {
        camera.style.transform =
          `translate3d(0, 0, ${-R}px) rotateY(${s.tilt + state.yaw}deg) rotateX(${state.pitch}deg)`;
        ring.style.transform = `rotateX(${-angle}deg)`;
      } else if (s.layout.inward) {
        camera.style.transform =
          `translate3d(0, 0, ${s.perspective - 1}px) rotateX(${s.tilt + state.pitch}deg) rotateY(${state.yaw}deg)`;
        ring.style.transform = `rotateY(${angle}deg)`;
      } else {
        camera.style.transform =
          `translate3d(0, 0, ${-R}px) rotateX(${s.tilt + state.pitch}deg) rotateY(${state.yaw}deg)`;
        ring.style.transform = `rotateY(${angle}deg)`;
      }

      for (let index = 0; index < s.count; index++) {
        const card = cards[index];
        if (!card) continue;
        const base = index * s.step;
        const mod = introCard(elapsed, base);
        const r = R * mod.radius;
        let transform;
        if (s.axis === 'x') {
          transform = `rotateX(${-base}deg) translateZ(${r}px)`;
        } else if (s.layout.inward) {
          transform = `rotateY(${base}deg) translateZ(${-r}px)`;
        } else {
          transform = `rotateY(${base}deg) translateZ(${r}px)`;
          if (s.layout.billboard) transform += ` rotateY(${-(base + angle)}deg)`;
        }
        if (mod.lift) transform += s.axis === 'x' ? ` translateX(${mod.lift}px)` : ` translateY(${mod.lift}px)`;
        card.style.transform = transform;

        const world = wrap(base + angle);
        const facing = Math.cos(world * TO_RAD);
        if (s.layout.inward) card.style.visibility = Math.abs(world) > 86 ? 'hidden' : '';
        const fade = s.depthFade * Math.pow((1 - facing) / 2, 1.25);
        card.style.setProperty('--cc-depth', fade.toFixed(3));
      }

      const index = ((Math.round(-state.angle / s.step) % s.count) + s.count) % s.count || 0;
      if (index !== active) {
        active = index;
        updateLive();
        if (typeof cfg.onChange === 'function') cfg.onChange(index);
      }
    };

    const frame = (now) => {
      raf = 0;
      if (destroyed) return;
      const s = settings();
      const dt = state.last ? Math.min((now - state.last) / 1000, 0.05) : 1 / 60;
      state.last = now;
      const busy = advance(s, dt, now);
      render(s, now);
      if (busy && visible && !document.hidden) raf = requestAnimationFrame(frame);
      else state.last = 0;
    };

    const wake = () => {
      if (!raf && visible && !document.hidden && !destroyed) raf = requestAnimationFrame(frame);
    };

    /* ---------- 事件 ---------- */
    const updatePointer = (event) => {
      const rect = root.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      state.pointer.x = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
      state.pointer.y = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
    };

    const onPointerDown = (event) => {
      state.suppressClick = false;
      if (!cfg.draggable || event.button !== 0) return;
      state.press = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        angle: state.angle,
        moved: false,
        origin: 0,
        samples: [{ time: performance.now(), angle: state.angle }],
      };
    };

    const onPointerMove = (event) => {
      if (event.pointerType === 'mouse') {
        state.pointer.inside = true;
        updatePointer(event);
      }
      const press = state.press;
      if (!press || press.id !== event.pointerId) {
        wake();
        return;
      }
      const s = settings();
      const delta = s.axis === 'x' ? event.clientY - press.y : event.clientX - press.x;
      const cross = s.axis === 'x' ? event.clientX - press.x : event.clientY - press.y;
      if (!press.moved) {
        if (Math.abs(delta) < DRAG_THRESHOLD) return;
        if (Math.abs(cross) > Math.abs(delta) * 1.2 && event.pointerType !== 'mouse') {
          state.press = null;
          return;
        }
        press.moved = true;
        press.origin = delta;
        state.drag = true;
        state.target = null;
        state.velocity = 0;
        dragging = true;
        root.dataset.dragging = '';
        try { root.setPointerCapture(event.pointerId); } catch (e) { /* 忽略 */ }
      }
      const perPixel = 180 / (Math.PI * s.radius * state.fit);
      state.angle = press.angle + (delta - press.origin) * perPixel * (s.layout.inward ? -1 : 1);
      const now = performance.now();
      press.samples.push({ time: now, angle: state.angle });
      while (press.samples.length > 2 && now - press.samples[0].time > 110) press.samples.shift();
      wake();
    };

    const releasePointer = (event) => {
      const press = state.press;
      if (!press || press.id !== event.pointerId) return;
      state.press = null;
      if (!press.moved) return;
      state.drag = false;
      dragging = false;
      delete root.dataset.dragging;
      state.suppressClick = true;
      const s = settings();
      const first = press.samples[0];
      const last = press.samples[press.samples.length - 1];
      const span = (last.time - first.time) / 1000;
      const velocity = span > 0.008 ? clamp((last.angle - first.angle) / span, -1400, 1400) : 0;
      state.velocity = velocity;
      if (Math.abs(velocity) > 60) state.dir = Math.sign(velocity);
      const coasting = s.autoplay === 'drift'
        && !(s.pauseOnHover && state.hover && event.pointerType === 'mouse');
      if (s.snap && !coasting) {
        const tau = 0.18 + s.momentum * 1.5;
        state.target = Math.round((state.angle + velocity * tau * 0.55) / s.step) * s.step;
      }
      wake();
    };

    const onPointerEnter = (event) => {
      if (event.pointerType !== 'mouse') return;
      state.hover = true;
      wake();
    };

    const onPointerLeave = (event) => {
      if (event.pointerType === 'mouse') {
        state.hover = false;
        state.pointer.inside = false;
      }
      wake();
    };

    const onClick = (event) => {
      if (state.suppressClick) {
        state.suppressClick = false;
        return;
      }
      const card = event.target.closest ? event.target.closest('[data-cc-index]') : null;
      if (!card) return;
      const index = Number(card.getAttribute('data-cc-index'));
      if (cfg.focusOnClick) focusIndex(index);
      if (typeof cfg.onItemClick === 'function') cfg.onItemClick(items[index], index);
    };

    const onKeyDown = (event) => {
      const forward = axis === 'x' ? 'ArrowDown' : 'ArrowRight';
      const backward = axis === 'x' ? 'ArrowUp' : 'ArrowLeft';
      if (event.key === forward) stepBy(1);
      else if (event.key === backward) stepBy(-1);
      else if (event.key === 'Home') focusIndex(0);
      else if (event.key === 'End') focusIndex(count - 1);
      else if (event.key === 'Enter' || event.key === ' ') {
        if (typeof cfg.onItemClick === 'function') cfg.onItemClick(items[active], active);
      } else return;
      event.preventDefault();
    };

    const onWheel = (event) => {
      const s = settings();
      if (!s.draggable) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : 0;
      if (!delta) return;
      event.preventDefault();
      const perPixel = 180 / (Math.PI * s.radius * state.fit);
      state.target = null;
      state.angle -= delta * perPixel * (s.layout.inward ? -1 : 1);
      state.velocity = -delta * perPixel * (s.layout.inward ? -1 : 1) * 30;
      state.holdUntil = performance.now() + 1600;
      clearTimeout(state.wheelTimer);
      state.wheelTimer = setTimeout(() => {
        if (settings().snap) state.target = nearest(state.angle + state.velocity * 0.12);
        wake();
      }, 140);
      wake();
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
        state.last = 0;
      } else wake();
    };

    /* ---------- 公共方法 ---------- */
    function focusIndex(index) {
      let target = -index * step;
      target += 360 * Math.round((state.angle - target) / 360);
      state.target = target;
      state.holdUntil = performance.now() + 2800;
      wake();
    }

    function stepBy(delta) {
      const base = state.target === null ? Math.round(state.angle / step) * step : state.target;
      state.target = base - delta * step * (layout.inward ? -1 : 1);
      state.holdUntil = performance.now() + 2800;
      wake();
    }

    /* ---------- 图片预加载后启用交互 ---------- */
    const sourcesKey = () => items.map((item) => item.src).join('|');
    let loadedKey = '';

    const preload = (onDone) => {
      const list = items.slice(0, PRELOAD_LIMIT).map((item) => item.src);
      const load = (src) => new Promise((resolve) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => (image.decode ? image.decode().then(resolve, resolve) : resolve());
        image.onerror = resolve;
        image.src = src;
      });
      const timeout = new Promise((resolve) => setTimeout(resolve, 2400));
      Promise.race([Promise.all(list.map(load)), timeout]).then(onDone);
    };

    const setupItems = (next, smooth) => {
      items = next.slice(0, MAX_ITEMS);
      count = Math.max(items.length, 1);
      step = 360 / count;
      radius = computeRadius();
      tiles = computeTiles();

      if (smooth) {
        // 等长替换：新图淡入即可，环本身不动
        buildCards();
        updateLive();
        wake();
        return;
      }
      ready = false;
      delete root.dataset.ready;
      state.introDone = false;
      state.intro = null;
      state.angle = 0;
      state.velocity = 0;
      state.target = null;
      state.last = 0;
      buildCards();
      updateLive();
      measure();
      preload(() => {
        if (destroyed) return;
        ready = true;
        root.dataset.ready = '';
        wake();
      });
    };

    /* ---------- 事件绑定与观测 ---------- */
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', releasePointer);
    root.addEventListener('pointercancel', releasePointer);
    root.addEventListener('pointerenter', onPointerEnter);
    root.addEventListener('pointerleave', onPointerLeave);
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('visibilitychange', onVisibility);

    const resizeObserver = new ResizeObserver(() => {
      radius = computeRadius();
      tiles = computeTiles();
      measure();
      wake();
    });
    resizeObserver.observe(root);

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) wake();
      else {
        cancelAnimationFrame(raf);
        raf = 0;
        state.last = 0;
      }
    });
    intersectionObserver.observe(root);

    const unsubscribeMotion = motion.subscribe(() => {
      state.introDone = false;
      state.intro = null;
      wake();
    });

    /* ---------- 启动 ---------- */
    setupItems(items, false);
    measure();
    render(settings(), performance.now());
    wake();

    return {
      el: root,

      /** 替换图片列表：长度相同则交叉淡入，长度不同则重播入场 */
      setItems(next) {
        const list = next && next.length ? next : [];
        const smooth = ready && list.length === items.length && sourcesKey() === loadedKey;
        loadedKey = list.map((item) => item.src).join('|');
        setupItems(list, smooth && list.length === items.length);
      },

      /** 更新外观参数（对应 React 侧改 props） */
      set(next = {}) {
        Object.assign(cfg, next);
        if ('fadeColor' in next) root.style.setProperty('--cc-fade', cfg.fadeColor);
        if ('cornerRadius' in next) {
          root.style.setProperty('--cc-radius', `${Math.max(0, cfg.cornerRadius)}px`);
        }
        if ('innerShade' in next) {
          root.style.setProperty('--cc-inner', (1 - clamp(cfg.innerShade, 0, 1)).toFixed(3));
        }
        if ('direction' in next) {
          directionSign = (cfg.direction === 'right' ? 1 : -1) * dragSign;
          state.dir = directionSign;
        }
        radius = computeRadius();
        tiles = computeTiles();
        measure();
        wake();
      },

      focusIndex,
      stepBy,

      /** 调试用：当前状态快照 */
      debug() {
        return {
          count, step, radius, active, ready, dragging,
          angle: state.angle, velocity: state.velocity,
          fit: state.fit, intro: state.intro ? state.intro.type : null,
        };
      },

      destroy() {
        if (destroyed) return;
        destroyed = true;
        cancelAnimationFrame(raf);
        clearTimeout(state.wheelTimer);
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
        unsubscribeMotion();
        root.removeEventListener('pointerdown', onPointerDown);
        root.removeEventListener('pointermove', onPointerMove);
        root.removeEventListener('pointerup', releasePointer);
        root.removeEventListener('pointercancel', releasePointer);
        root.removeEventListener('pointerenter', onPointerEnter);
        root.removeEventListener('pointerleave', onPointerLeave);
        root.removeEventListener('click', onClick);
        root.removeEventListener('keydown', onKeyDown);
        root.removeEventListener('wheel', onWheel);
        document.removeEventListener('visibilitychange', onVisibility);
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };
  }

  window.CircularCarousel = { create: createCircularCarousel, presets: PRESETS };
})();

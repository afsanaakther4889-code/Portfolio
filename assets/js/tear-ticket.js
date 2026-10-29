/* =========================================================
   TearTicket —— React Bits 组件 (TearTicket.jsx) 的原生 JS 移植
   原组件：https://reactbits.dev  (TearTicket)
   · 撕口几何、桥丝拉伸/回缩、拖拽角度、掉落物理与原件一致
   · 依赖的 motion 弹簧改为手写临界阻尼弹簧（同刚度/阻尼/质量）
   用法：
     var t = window.createTearTicket(mount, { width: 460, onTear: fn });
   ========================================================= */
(function () {
  'use strict';

  var GRAVITY = 2400;
  var ART_INSET = 8;
  var ART_SPAN = 0.78;
  var RETRACT = 0.17;
  var SPRING = { k: 220, c: 24, m: 0.6 };

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function rad(d) { return (d * Math.PI) / 180; }
  function wrapAng(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
  function f(n) { return n.toFixed(2); }

  function noise(seed) {
    var s = seed | 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildGeometry(W, H, S, R, holes, hole, notch, rough, vertical) {
    var main = vertical ? H : W;
    var cross = vertical ? W : H;
    var x = main - S;
    var hr = hole / 2;
    var n = Math.max(1, Math.round(holes));
    var span = cross - 2 * notch;
    var bridge = Math.max(2, (span - n * hole) / (n + 1));
    var random = noise(n * 7919 + Math.round(cross));

    var at = function (u, v) { return vertical ? { x: v, y: u } : { x: u, y: v }; };
    var pt = function (u, v) { return vertical ? f(v) + ',' + f(u) : f(u) + ',' + f(v); };
    var arc = function (r, sweep, u, v) {
      return 'A' + f(r) + ',' + f(r) + ' 0 0 ' + (vertical ? 1 - sweep : sweep) + ' ' + pt(u, v);
    };

    var bridges = [];
    for (var i = 0; i <= n; i += 1) {
      var y0 = notch + i * (bridge + hole);
      var y1 = y0 + bridge;
      var steps = Math.max(2, Math.round(bridge / 2.2));
      var pts = [];
      for (var k = 1; k < steps; k += 1) {
        pts.push([x + (random() - 0.5) * 2 * rough, y0 + (bridge * k) / steps]);
      }
      var centre = at(x, (y0 + y1) / 2);
      bridges.push({ y0: y0, y1: y1, mid: (y0 + y1) / 2, pts: pts, x: centre.x, y: centre.y });
    }

    var body = 'M' + pt(R, 0) + 'L' + pt(x - notch, 0) + arc(notch, 0, x, notch);
    bridges.forEach(function (b, idx) {
      b.pts.forEach(function (p) { body += 'L' + pt(p[0], p[1]); });
      body += 'L' + pt(x, b.y1);
      if (idx < n) body += arc(hr, 0, x, b.y1 + hole);
    });
    body += arc(notch, 0, x - notch, cross) +
      'L' + pt(R, cross) + arc(R, 1, 0, cross - R) +
      'L' + pt(0, R) + arc(R, 1, R, 0) + 'Z';

    var stub = 'M' + pt(x + notch, 0) + 'L' + pt(main - R, 0) + arc(R, 1, main, R) +
      'L' + pt(main, cross - R) + arc(R, 1, main - R, cross) +
      'L' + pt(x + notch, cross) + arc(notch, 0, x, cross - notch);
    for (var j = n; j >= 0; j -= 1) {
      var b2 = bridges[j];
      for (var k2 = b2.pts.length - 1; k2 >= 0; k2 -= 1) stub += 'L' + pt(b2.pts[k2][0], b2.pts[k2][1]);
      stub += 'L' + pt(x, b2.y0);
      if (j > 0) stub += arc(hr, 0, x, b2.y0 - hole);
    }
    stub += arc(notch, 0, x + notch, 0) + 'Z';

    var e0 = at(x, notch); e0.v = notch;
    var e1 = at(x, cross - notch); e1.v = cross - notch;

    var bodyOutline = 'M' + pt(x, cross - notch) + arc(notch, 0, x - notch, cross) +
      'L' + pt(R, cross) + arc(R, 1, 0, cross - R) + 'L' + pt(0, R) + arc(R, 1, R, 0) +
      'L' + pt(x - notch, 0) + arc(notch, 0, x, notch);

    var stubOutline = 'M' + pt(x, notch) + arc(notch, 0, x + notch, 0) +
      'L' + pt(main - R, 0) + arc(R, 1, main, R) + 'L' + pt(main, cross - R) +
      arc(R, 1, main - R, cross) + 'L' + pt(x + notch, cross) + arc(notch, 0, x, cross - notch);

    return {
      vertical: vertical,
      cross: cross,
      body: body,
      stub: stub,
      bridges: bridges,
      ends: [e0, e1],
      bodyOutline: bodyOutline,
      stubOutline: stubOutline
    };
  }

  function create(mount, opts) {
    if (!mount) return null;

    var o = {
      image: '',
      imageAlt: '',
      scrim: true,
      imageRadius: 8,
      orientation: 'horizontal',
      defaultTorn: false,
      onTear: null,
      width: 460,
      height: 250,
      stubSize: 150,
      radius: 16,
      holes: 12,
      holeSize: 6,
      notch: 3,
      roughness: 0,
      tearAngle: 30,
      stretch: 30,
      resistance: 0.45,
      rotate: 4,
      tilt: true,
      tiltMax: 9,
      tiltReach: 260,
      parallax: 6,
      perspective: 1000,
      background: '#27272a',
      color: '#f5f5f5',
      border: true,
      borderColor: '',
      borderWidth: 1,
      stubBackground: '',
      recenter: true,
      disabled: false,
      ariaLabel: '撕开票据',
      className: ''
    };
    if (opts) Object.keys(opts).forEach(function (k) { o[k] = opts[k]; });

    var vertical = o.orientation === 'vertical';
    var geo = buildGeometry(
      o.width, o.height, o.stubSize, o.radius,
      o.holes, o.holeSize, o.notch, o.roughness, vertical
    );

    var bodySrc = mount.querySelector('[data-ticket-body]');
    var stubSrc = mount.querySelector('[data-ticket-stub]');

    var root = document.createElement('div');
    root.className = 'tear-ticket' + (o.className ? ' ' + o.className : '');
    root.setAttribute('data-orientation', o.orientation);

    root.style.setProperty('--tt-w', o.width + 'px');
    root.style.setProperty('--tt-h', o.height + 'px');
    root.style.setProperty('--tt-stub', o.stubSize + 'px');
    root.style.setProperty('--tt-bg', o.background);
    root.style.setProperty('--tt-stub-bg', o.stubBackground || o.background);
    root.style.setProperty('--tt-ink', o.color);
    root.style.setProperty('--tt-edge', o.borderColor || 'rgba(255,255,255,0.18)');
    root.style.setProperty('--tt-edge-w', o.borderWidth);
    root.style.setProperty('--tt-parallax', o.parallax + 'px');
    root.style.setProperty('--tt-body-w', (vertical ? o.width : o.width - o.stubSize) + 'px');
    root.style.setProperty('--tt-body-h', (vertical ? o.height - o.stubSize : o.height) + 'px');
    root.style.setProperty('--tt-inset', ART_INSET + 'px');
    root.style.setProperty('--tt-span', ART_SPAN);
    root.style.setProperty('--tt-art-radius', o.imageRadius + 'px');
    root.style.setProperty('--tt-fit', 1);

    var fibresMarkup = '';
    geo.bridges.forEach(function () { fibresMarkup += '<path></path><path></path>'; });

    var vb = '0 0 ' + o.width + ' ' + o.height;
    var edge = function (d) {
      return o.border
        ? '<svg class="tear-ticket__edge" viewBox="' + vb + '" aria-hidden="true"><path d="' + d + '"/></svg>'
        : '';
    };

    root.innerHTML =
      '<div class="tear-ticket__stage">' +
        '<div class="tear-ticket__plane">' +
          '<div class="tear-ticket__piece" data-body>' +
            edge(geo.bodyOutline) +
            '<div class="tear-ticket__paper" style="clip-path:path(\'' + geo.body + '\')">' +
              (o.image
                ? '<div class="tear-ticket__art">' +
                    '<img class="tear-ticket__image" src="' + o.image + '" alt="' + o.imageAlt + '" draggable="false">' +
                    (o.scrim ? '<div class="tear-ticket__scrim"></div>' : '') +
                  '</div>'
                : '') +
              '<div class="tear-ticket__content"></div>' +
            '</div>' +
          '</div>' +
          '<svg class="tear-ticket__fibres" aria-hidden="true">' + fibresMarkup + '</svg>' +
          '<div class="tear-ticket__piece tear-ticket__piece--stub" data-stub>' +
            edge(geo.stubOutline) +
            '<div class="tear-ticket__paper tear-ticket__paper--stub" style="clip-path:path(\'' + geo.stub + '\')">' +
              '<div class="tear-ticket__stub" data-stub-inner></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<span class="tear-ticket__sr" role="status"></span>';

    mount.innerHTML = '';
    mount.appendChild(root);

    var stage = root.querySelector('.tear-ticket__stage');
    var plane = root.querySelector('.tear-ticket__plane');
    var bodyEl = root.querySelector('[data-body]');
    var stubEl = root.querySelector('[data-stub]');
    var stubInner = root.querySelector('[data-stub-inner]');
    var contentEl = root.querySelector('.tear-ticket__content');
    var imgEl = root.querySelector('.tear-ticket__image');
    var sr = root.querySelector('.tear-ticket__sr');
    var fibrePaths = root.querySelectorAll('.tear-ticket__fibres path');

    if (bodySrc) contentEl.appendChild(bodySrc);
    if (stubSrc) stubInner.appendChild(stubSrc);

    stubEl.setAttribute('role', 'button');
    stubEl.tabIndex = o.disabled ? -1 : 0;
    stubEl.setAttribute('aria-label', o.ariaLabel);
    if (o.disabled) root.setAttribute('data-disabled', '');

    /* ---------- 自适应宽度 ---------- */
    var fit = 1;
    function measure() {
      var next = Math.min(1, mount.clientWidth / o.width) || 1;
      if (Math.abs(next - fit) < 0.002) return;
      fit = next;
      root.style.setProperty('--tt-fit', fit);
      root.style.height = (o.height * fit) + 'px';
    }
    measure();
    var ro = new ResizeObserver(measure);
    ro.observe(mount);

    /* ---------- 状态 ---------- */
    var sim = {
      raf: 0,
      last: 0,
      phase: 'idle',
      id: null,
      sign: 1,
      hinge: { x: 0, y: 0 },
      hingeV: 0,
      grab: { x: 0, y: 0 },
      start: { x: 0, y: 0 },
      point: { x: 0, y: 0 },
      a0: 0,
      theta: 0,
      thetaV: 0,
      sx: 0,
      sy: 0,
      vx: 0,
      vy: 0,
      spin: 0,
      pvx: 0,
      pvy: 0,
      pt: 0,
      fade: 1,
      age: 0,
      bx: 0,
      bv: 0,
      snapped: [],
      snapAt: [],
      span: []
    };

    var used = !!o.defaultTorn;
    var grabbing = false;
    var alive = true;

    function reduced() {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    /* ---------- 绘制 ---------- */
    function paint(now) {
      if (stubEl) {
        stubEl.style.transform =
          'translate(' + sim.sx.toFixed(2) + 'px,' + sim.sy.toFixed(2) + 'px) rotate(' +
          ((sim.theta * sim.sign * 180) / Math.PI).toFixed(3) + 'deg)';
        stubEl.style.opacity = sim.fade.toFixed(3);
      }
      var up = geo.vertical;
      if (bodyEl) bodyEl.style.transform = 'translate' + (up ? 'Y' : 'X') + '(' + sim.bx.toFixed(2) + 'px)';

      var cos = Math.cos(sim.theta * sim.sign);
      var sin = Math.sin(sim.theta * sim.sign);
      var lx = up ? 1.6 : 0;
      var ly = up ? 0 : 1.6;
      var busy = false;

      geo.bridges.forEach(function (b, i) {
        var dx = b.x - sim.hinge.x;
        var dy = b.y - sim.hinge.y;
        var tx = sim.hinge.x + dx * cos - dy * sin + sim.sx;
        var ty = sim.hinge.y + dx * sin + dy * cos + sim.sy;
        var ox = b.x + (up ? 0 : sim.bx);
        var oy = b.y + (up ? sim.bx : 0);
        var gx = tx - ox;
        var gy = ty - oy;
        var gap = Math.sqrt(gx * gx + gy * gy);
        var near = fibrePaths[i * 2];
        var far = fibrePaths[i * 2 + 1];
        if (!near || !far) return;

        var live = sim.phase !== 'idle' && !reduced();

        if (!sim.snapped[i]) {
          if (!live || gap < 0.35) {
            near.style.opacity = '0';
            far.style.opacity = '0';
            return;
          }
          var kk = clamp(gap / o.stretch, 0, 1);
          var sag = gap * 0.18;
          var w = (1.7 - 1.15 * kk).toFixed(2);
          var sx2 = (up ? sag : 0) + gx / 2;
          var sy2 = (up ? 0 : sag) + gy / 2;
          near.setAttribute('d', 'M' + f(ox - lx) + ',' + f(oy - ly) + 'Q' + f(ox - lx + sx2) + ',' +
            f(oy - ly + sy2) + ' ' + f(tx - lx) + ',' + f(ty - ly));
          far.setAttribute('d', 'M' + f(ox + lx) + ',' + f(oy + ly) + 'Q' + f(ox + lx + gx - sx2) + ',' +
            f(oy + ly + gy - sy2) + ' ' + f(tx + lx) + ',' + f(ty + ly));
          near.style.strokeWidth = w;
          far.style.strokeWidth = w;
          near.style.opacity = '1';
          far.style.opacity = '1';
          sim.span[i] = gap;
          return;
        }

        var t = (now - sim.snapAt[i]) / 1000 / RETRACT;
        if (!live || t >= 1 || !sim.snapAt[i]) {
          near.style.opacity = '0';
          far.style.opacity = '0';
          return;
        }
        busy = true;
        var left = (1 - t) * (1 - t);
        var len = (sim.span[i] || o.stretch) * 0.5 * left;
        var ux = gap > 0.01 ? gx / gap : 1;
        var uy = gap > 0.01 ? gy / gap : 0;
        near.setAttribute('d', 'M' + f(ox) + ',' + f(oy) + 'L' + f(ox + ux * len) + ',' + f(oy + uy * len));
        far.setAttribute('d', 'M' + f(tx) + ',' + f(ty) + 'L' + f(tx - ux * len) + ',' + f(ty - uy * len));
        near.style.strokeWidth = '0.9';
        far.style.strokeWidth = '0.9';
        near.style.opacity = left.toFixed(2);
        far.style.opacity = left.toFixed(2);
      });

      return busy;
    }

    /* ---------- 撕开状态 ---------- */
    function finish() {
      if (stubEl) stubEl.style.visibility = 'hidden';
      if (!used) {
        used = true;
        root.setAttribute('data-used', '');
        if (o.recenter) root.setAttribute('data-shift', vertical ? 'y' : 'x');
        stubEl.tabIndex = -1;
        stubEl.setAttribute('aria-hidden', 'true');
        if (sr) sr.textContent = '已入场';
      }
      if (o.onTear) o.onTear();
    }

    /* ---------- 物理 ---------- */
    function step(now) {
      var dt = clamp((now - sim.last) / 1000, 0.001, 0.034);
      sim.last = now;
      var limit = rad(o.tearAngle);

      if (sim.phase === 'held') {
        var count = geo.bridges.length;
        var intact = 0;
        for (var i = 0; i < count; i += 1) if (!sim.snapped[i]) intact += 1;
        var hold = count ? intact / count : 0;
        var follow = 0.92 * (1 - clamp(o.resistance, 0, 0.95) * hold);
        var a = Math.atan2(sim.point.y - sim.hinge.y, sim.point.x - sim.hinge.x);
        var want = clamp(wrapAng(a - sim.a0) * sim.sign * follow, 0, limit + 0.1);
        sim.theta += (want - sim.theta) * (1 - Math.exp(-dt / 0.035));

        var up = geo.vertical;
        var away = clamp(((up ? sim.point.y - sim.start.y : sim.point.x - sim.start.x) || 0) * 0.05, -2, 4);
        var side = clamp(((up ? sim.point.x - sim.start.x : sim.point.y - sim.start.y) || 0) * 0.05, -3, 3);
        var px = up ? side : away;
        var py = up ? away : side;
        sim.sx += (px - sim.sx) * (1 - Math.exp(-dt / 0.05));
        sim.sy += (py - sim.sy) * (1 - Math.exp(-dt / 0.05));

        var slack = Math.sqrt(sim.sx * sim.sx + sim.sy * sim.sy);
        var leftCount = 0;
        geo.bridges.forEach(function (b, idx) {
          if (sim.snapped[idx]) return;
          var d = Math.abs(b.mid - sim.hingeV);
          if (2 * d * Math.sin(sim.theta / 2) + slack > o.stretch || sim.theta >= limit) {
            sim.snapped[idx] = true;
            sim.snapAt[idx] = now;
            sim.bv -= 560 / geo.bridges.length;
          } else {
            leftCount += 1;
          }
        });
        if (leftCount === 0) {
          sim.phase = 'free';
          sim.bv -= 150;
        }
      } else if (sim.phase === 'free') {
        var cos = Math.cos(sim.theta * sim.sign);
        var sin = Math.sin(sim.theta * sim.sign);
        var gx = sim.grab.x - sim.hinge.x;
        var gy = sim.grab.y - sim.hinge.y;
        var wx = sim.point.x - sim.hinge.x - (gx * cos - gy * sin);
        var wy = sim.point.y - sim.hinge.y - (gx * sin + gy * cos);
        sim.sx += (wx - sim.sx) * (1 - Math.exp(-dt / 0.045));
        sim.sy += (wy - sim.sy) * (1 - Math.exp(-dt / 0.045));
        var hang = limit * 0.55 + clamp(sim.pvx * 0.0009 * sim.sign, -0.3, 0.3);
        sim.theta += (hang - sim.theta) * (1 - Math.exp(-dt / 0.12));
      } else if (sim.phase === 'drop') {
        sim.age += dt;
        sim.vy += GRAVITY * dt;
        sim.sx += sim.vx * dt;
        sim.sy += sim.vy * dt;
        sim.theta += sim.spin * dt;
        if (sim.age > 0.16) sim.fade = clamp(1 - (sim.age - 0.16) / 0.42, 0, 1);
        if (sim.fade <= 0) {
          sim.phase = 'idle';
          finish();
        }
      } else if (sim.phase === 'return') {
        sim.thetaV += (-300 * sim.theta - 24 * sim.thetaV) * dt;
        sim.theta += sim.thetaV * dt;
        sim.sx += (0 - sim.sx) * (1 - Math.exp(-dt / 0.07));
        sim.sy += (0 - sim.sy) * (1 - Math.exp(-dt / 0.07));
        if (Math.abs(sim.theta) < 0.0008 && Math.abs(sim.thetaV) < 0.01 &&
            Math.sqrt(sim.sx * sim.sx + sim.sy * sim.sy) < 0.05) {
          sim.theta = 0;
          sim.thetaV = 0;
          sim.sx = 0;
          sim.sy = 0;
          sim.phase = 'idle';
        }
      }

      sim.bv += (-520 * sim.bx - 30 * sim.bv) * dt;
      sim.bx += sim.bv * dt;

      var busy = paint(now);
      var moving = Math.abs(sim.bx) > 0.02 || Math.abs(sim.bv) > 0.5;
      if (sim.phase !== 'idle' || moving || busy) {
        sim.raf = requestAnimationFrame(step);
      } else {
        sim.bx = 0;
        sim.bv = 0;
        paint(now);
        sim.raf = 0;
      }
    }

    function run() {
      if (sim.raf || !alive) return;
      sim.last = performance.now();
      sim.raf = requestAnimationFrame(step);
    }

    function reset() {
      cancelAnimationFrame(sim.raf);
      sim.raf = 0;
      sim.phase = 'idle';
      sim.id = null;
      sim.theta = 0;
      sim.thetaV = 0;
      sim.sx = 0;
      sim.sy = 0;
      sim.fade = 1;
      sim.age = 0;
      sim.bx = 0;
      sim.bv = 0;
      sim.snapped = [];
      sim.snapAt = [];
      sim.span = [];
      if (stubEl) stubEl.style.visibility = '';
      paint(performance.now());
    }

    /* ---------- 指针 ---------- */
    function local(e) {
      var r = stage.getBoundingClientRect();
      var k = r.width / o.width || 1;
      return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
    }

    function tearNow() {
      cancelAnimationFrame(sim.raf);
      sim.raf = 0;
      sim.phase = 'idle';
      root.setAttribute('data-instant', '');
      finish();
    }

    function onStubDown(e) {
      if (o.disabled || used || e.button !== 0 || sim.id !== null || sim.phase === 'drop') return;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      var p = local(e);
      sim.id = e.pointerId;
      sim.start = p;
      sim.point = p;
      sim.pt = performance.now();
      sim.pvx = 0;
      sim.pvy = 0;
      if (sim.theta < 0.01) {
        var far = (geo.vertical ? p.x : p.y) < geo.cross / 2;
        var end = geo.ends[far ? 1 : 0];
        sim.sign = (far ? 1 : -1) * (geo.vertical ? -1 : 1);
        sim.hinge = { x: end.x, y: end.y };
        sim.hingeV = end.v;
        stubEl.style.transformOrigin = sim.hinge.x + 'px ' + sim.hinge.y + 'px';
      }
      var cos = Math.cos(-sim.theta * sim.sign);
      var sin = Math.sin(-sim.theta * sim.sign);
      var ux = p.x - sim.sx - sim.hinge.x;
      var uy = p.y - sim.sy - sim.hinge.y;
      sim.grab = {
        x: sim.hinge.x + ux * cos - uy * sin,
        y: sim.hinge.y + ux * sin + uy * cos
      };
      sim.a0 = Math.atan2(sim.grab.y - sim.hinge.y, sim.grab.x - sim.hinge.x) - (sim.theta * sim.sign) / 0.92;
      sim.phase = 'held';
      sim.thetaV = 0;
      tilt.tx = 0;
      tilt.ty = 0;
      grabbing = true;
      root.setAttribute('data-grabbing', '');
      run();
    }

    function onStubMove(e) {
      if (sim.id !== e.pointerId) return;
      var p = local(e);
      var now = performance.now();
      var dt = Math.max(0.004, (now - sim.pt) / 1000);
      sim.pvx += ((p.x - sim.point.x) / dt - sim.pvx) * 0.35;
      sim.pvy += ((p.y - sim.point.y) / dt - sim.pvy) * 0.35;
      sim.pt = now;
      sim.point = p;
      if (reduced() && Math.sqrt(Math.pow(p.x - sim.start.x, 2) + Math.pow(p.y - sim.start.y, 2)) > 28) {
        sim.id = null;
        grabbing = false;
        root.removeAttribute('data-grabbing');
        tearNow();
      }
    }

    function onStubUp(e) {
      if (sim.id !== e.pointerId) return;
      sim.id = null;
      try {
        if (e.currentTarget.hasPointerCapture && e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch (err) {}
      grabbing = false;
      root.removeAttribute('data-grabbing');
      if (sim.phase === 'free') {
        var still = performance.now() - sim.pt > 80;
        sim.vx = still ? 0 : clamp(sim.pvx, -1600, 1600);
        sim.vy = still ? 0 : clamp(sim.pvy, -1600, 1200);
        sim.spin = clamp(sim.vx * 0.004, -6, 6) + 1.2 * sim.sign;
        sim.age = 0;
        sim.phase = 'drop';
      } else if (sim.phase === 'held') {
        sim.phase = 'return';
      }
      run();
    }

    function onStubKey(e) {
      if (o.disabled || used || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      if (!e.repeat) tearNow();
    }

    stubEl.addEventListener('pointerdown', onStubDown);
    stubEl.addEventListener('pointermove', onStubMove);
    stubEl.addEventListener('pointerup', onStubUp);
    stubEl.addEventListener('pointercancel', onStubUp);
    stubEl.addEventListener('lostpointercapture', onStubUp);
    stubEl.addEventListener('keydown', onStubKey);
    stubEl.addEventListener('dragstart', function (e) { e.preventDefault(); });

    /* ---------- 3D 倾斜 ---------- */
    var tilt = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, raf: 0, last: 0 };
    var depth = o.tiltMax > 0 ? o.parallax / o.tiltMax : 0;

    function applyTilt() {
      if (plane) {
        plane.style.transform = 'perspective(' + o.perspective + 'px) rotate(' + o.rotate + 'deg) rotateX(' +
          tilt.x.toFixed(3) + 'deg) rotateY(' + tilt.y.toFixed(3) + 'deg)';
      }
      if (imgEl) {
        imgEl.style.transform = 'translate(' + (-tilt.y * depth).toFixed(2) + 'px,' +
          (tilt.x * depth).toFixed(2) + 'px)';
      }
      if (contentEl) {
        contentEl.style.transform = 'translate(' + (tilt.y * depth * 0.22).toFixed(2) + 'px,' +
          (-tilt.x * depth * 0.22).toFixed(2) + 'px)';
      }
    }

    function tiltFrame(now) {
      var dt = clamp((now - tilt.last) / 1000, 0.001, 0.034);
      tilt.last = now;
      var steps = 3;
      var h = dt / steps;
      for (var i = 0; i < steps; i += 1) {
        tilt.vx += ((-SPRING.k * (tilt.x - tilt.tx) - SPRING.c * tilt.vx) / SPRING.m) * h;
        tilt.x += tilt.vx * h;
        tilt.vy += ((-SPRING.k * (tilt.y - tilt.ty) - SPRING.c * tilt.vy) / SPRING.m) * h;
        tilt.y += tilt.vy * h;
      }
      applyTilt();
      var moving = Math.abs(tilt.vx) + Math.abs(tilt.vy) > 0.02 ||
        Math.abs(tilt.x - tilt.tx) + Math.abs(tilt.y - tilt.ty) > 0.02;
      if (moving && alive) {
        tilt.raf = requestAnimationFrame(tiltFrame);
      } else {
        tilt.x = tilt.tx;
        tilt.y = tilt.ty;
        tilt.vx = 0;
        tilt.vy = 0;
        applyTilt();
        tilt.raf = 0;
      }
    }

    function kickTilt() {
      if (tilt.raf || !alive) return;
      tilt.last = performance.now();
      tilt.raf = requestAnimationFrame(tiltFrame);
    }

    function onPointerMove(e) {
      if (!o.tilt || reduced() || o.disabled || sim.id !== null) return;
      if (e.pointerType === 'touch') return;
      var r = root.getBoundingClientRect();
      var nx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2 + o.tiltReach), -1, 1);
      var ny = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2 + o.tiltReach), -1, 1);
      tilt.ty = nx * o.tiltMax;
      tilt.tx = -ny * o.tiltMax;
      kickTilt();
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    if (o.defaultTorn) {
      root.setAttribute('data-used', '');
      if (o.recenter) root.setAttribute('data-shift', vertical ? 'y' : 'x');
      stubEl.style.visibility = 'hidden';
      stubEl.tabIndex = -1;
    }

    root.style.height = (o.height * fit) + 'px';
    applyTilt();
    paint(performance.now());

    return {
      __sim: sim,
      tear: tearNow,
      isUsed: function () { return used; },
      destroy: function () {
        alive = false;
        cancelAnimationFrame(sim.raf);
        cancelAnimationFrame(tilt.raf);
        ro.disconnect();
        window.removeEventListener('pointermove', onPointerMove);
        mount.innerHTML = '';
      }
    };
  }

  window.createTearTicket = create;
})();

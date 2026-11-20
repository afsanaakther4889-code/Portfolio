/* =========================================================
   作品画册 · 3D 翻页（原生实现，无依赖）
   桌面：跨页两页，右页向左翻 / 左页向右翻
   手机：单页显示，淡入切换
   ========================================================= */
(function () {
  'use strict';

  var root, body, imgL, imgR, flipR, flipRFront, flipRBack, flipL, flipLFront, flipLBack,
      noEl, titleEl, subEl, curEl, totalEl, pipsEl, prevBtn, nextBtn, closeBtn;

  var work = null;
  var cur = 0;          // 当前页索引（0 起）
  var busy = false;
  var lastFocus = null;
  var SINGLE = false;
  var DUR = 900;

  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function total() { return work ? work.count : 0; }
  function pageSrc(i) { return work.base + 'full-' + pad(i + 1) + '.webp'; }
  function spreadOf(p) { return Math.floor(p / 2); }

  function preload() {
    if (!work) return;
    var a = SINGLE ? cur : spreadOf(cur) * 2;
    for (var i = a - 2; i < a + 6; i++) {
      if (i >= 0 && i < total()) { var im = new Image(); im.src = pageSrc(i); }
    }
  }

  function paintPips() {
    if (!pipsEl) return;
    var n = SINGLE ? total() : Math.ceil(total() / 2);
    if (pipsEl.children.length !== n) {
      pipsEl.innerHTML = '';
      for (var i = 0; i < n; i++) {
        var d = document.createElement('button');
        d.type = 'button';
        d.className = 'book__pip';
        d.setAttribute('aria-label', '第 ' + (SINGLE ? i + 1 : i * 2 + 1) + ' 页');
        (function (i) { d.addEventListener('click', function () { jump(i); }); })(i);
        pipsEl.appendChild(d);
      }
    }
    var active = SINGLE ? cur : spreadOf(cur);
    for (var k = 0; k < pipsEl.children.length; k++) {
      pipsEl.children[k].classList.toggle('is-on', k === active);
    }
  }

  function fitBody() {
    if (!body || SINGLE || !work) return;
    var w1 = imgL.naturalWidth, h1 = imgL.naturalHeight;
    if (!w1 || !h1) return;
    var w2 = imgR.getAttribute('src') ? imgR.naturalWidth : 0;
    var h2 = imgR.getAttribute('src') ? imgR.naturalHeight : 0;
    if (w2 && h2) body.style.aspectRatio = (w1 + w2) + ' / ' + Math.max(h1, h2);
    else body.style.aspectRatio = (w1 * 2) + ' / ' + h1;
  }

  function paint() {
    var n = total();
    if (SINGLE) {
      imgR.src = pageSrc(cur);
      imgR.style.visibility = 'visible';
      imgL.style.visibility = 'hidden';
      if (imgR.naturalWidth) body.style.aspectRatio = imgR.naturalWidth + ' / ' + imgR.naturalHeight;
      curEl.textContent = pad(cur + 1);
      prevBtn.disabled = cur === 0;
      nextBtn.disabled = cur >= n - 1;
    } else {
      var s = spreadOf(cur);
      var a = s * 2, b = a + 1;
      imgL.src = pageSrc(a);
      imgL.style.visibility = 'visible';
      if (b < n) { imgR.src = pageSrc(b); imgR.style.visibility = 'visible'; }
      else { imgR.removeAttribute('src'); imgR.style.visibility = 'hidden'; }
      curEl.textContent = pad(a + 1) + (b < n ? '–' + pad(b + 1) : '');
      prevBtn.disabled = a === 0;
      nextBtn.disabled = a + 2 >= n;
    }
    totalEl.textContent = pad(n);
    paintPips();
    preload();
  }

  function resetSheet(sheet) {
    sheet.classList.remove('is-on');
    sheet.style.transition = 'none';
    sheet.style.transform = 'rotateY(0deg)';
    void sheet.offsetWidth;
    sheet.style.transition = '';
  }

  function goNext() {
    if (busy || !work) return;
    var n = total();

    if (SINGLE) {
      if (cur >= n - 1) return;
      busy = true;
      imgR.classList.add('is-fade');
      window.setTimeout(function () {
        cur++;
        paint();
        imgR.classList.remove('is-fade');
        busy = false;
      }, 200);
      return;
    }

    var s = spreadOf(cur);
    var a = s * 2, b = a + 1, na = a + 2, nb = a + 3;
    if (na >= n || b >= n) return;
    busy = true;

    if (nb < n) { imgR.src = pageSrc(nb); imgR.style.visibility = 'visible'; }
    else { imgR.removeAttribute('src'); imgR.style.visibility = 'hidden'; }
    imgL.src = pageSrc(a);

    flipRFront.src = pageSrc(b);
    flipRBack.src = pageSrc(na);
    flipR.classList.add('is-on');
    void flipR.offsetWidth;
    flipR.style.transform = 'rotateY(-180deg)';

    window.setTimeout(function () {
      cur = na;
      paint();
      resetSheet(flipR);
      busy = false;
    }, DUR);
  }

  function goPrev() {
    if (busy || !work) return;

    if (SINGLE) {
      if (cur <= 0) return;
      busy = true;
      imgR.classList.add('is-fade');
      window.setTimeout(function () {
        cur--;
        paint();
        imgR.classList.remove('is-fade');
        busy = false;
      }, 200);
      return;
    }

    var s = spreadOf(cur);
    var a = s * 2, b = a + 1, pa = a - 2, pb = a - 1;
    if (pa < 0) return;
    busy = true;

    imgL.src = pageSrc(pa);
    if (b < total()) { imgR.src = pageSrc(b); imgR.style.visibility = 'visible'; }
    else { imgR.removeAttribute('src'); imgR.style.visibility = 'hidden'; }

    flipLFront.src = pageSrc(a);
    flipLBack.src = pageSrc(pb);
    flipL.classList.add('is-on');
    void flipL.offsetWidth;
    flipL.style.transform = 'rotateY(180deg)';

    window.setTimeout(function () {
      cur = pa;
      paint();
      resetSheet(flipL);
      busy = false;
    }, DUR);
  }

  function jump(target) {
    if (busy || !work) return;
    if (SINGLE) {
      if (target === cur) return;
      cur = target;
    } else {
      if (target === spreadOf(cur)) return;
      cur = target * 2;
    }
    paint();
  }

  function open(id) {
    init();
    var w = window.JIANO_WORKS && window.JIANO_WORKS[id];
    if (!w || !root) return;
    work = w;
    cur = 0;
    SINGLE = window.matchMedia('(max-width: 760px)').matches;
    root.classList.toggle('is-single', SINGLE);
    lastFocus = document.activeElement;
    noEl.textContent = 'NO. ' + (w.no || '—');
    titleEl.textContent = w.title;
    subEl.textContent = w.en + ' · ' + w.cat;
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('book-open');
    paint();
    void root.offsetWidth;
    root.classList.add('is-on');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  function close() {
    if (!root || root.hidden) return;
    root.classList.remove('is-on');
    document.body.classList.remove('book-open');
    root.setAttribute('aria-hidden', 'true');
    window.setTimeout(function () {
      root.hidden = true;
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }, 260);
  }

  function bind() {
    if (!root || root.__bound) return;
    root.__bound = true;

    closeBtn.addEventListener('click', close);
    prevBtn.addEventListener('click', goPrev);
    nextBtn.addEventListener('click', goNext);

    body.addEventListener('click', function (e) {
      if (e.target.closest('.book__pip')) return;
      if (SINGLE) { goNext(); return; }
      var r = body.getBoundingClientRect();
      if (e.clientX - r.left > r.width / 2) goNext(); else goPrev();
    });

    document.addEventListener('keydown', function (e) {
      if (!root || root.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
    });

    var sx = 0, sy = 0, dragging = false;
    body.addEventListener('pointerdown', function (e) { dragging = true; sx = e.clientX; sy = e.clientY; });
    window.addEventListener('pointerup', function (e) {
      if (!dragging) return;
      dragging = false;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) goNext(); else goPrev();
    });
  }

  function init() {
    if (root) return;
    root = $('book');
    if (!root) return;
    body = $('bookBody');
    imgL = $('bookL');
    imgR = $('bookR');
    flipR = $('bookFlipR');
    flipRFront = $('bookFlipRFront');
    flipRBack = $('bookFlipRBack');
    flipL = $('bookFlipL');
    flipLFront = $('bookFlipLFront');
    flipLBack = $('bookFlipLBack');
    noEl = $('bookNo');
    titleEl = $('bookTitle');
    subEl = $('bookSub');
    curEl = $('bookCur');
    totalEl = $('bookTotal');
    pipsEl = $('bookPips');
    prevBtn = $('bookPrev');
    nextBtn = $('bookNext');
    closeBtn = $('bookClose');
    if (!body) return;
    imgL.addEventListener('load', fitBody);
    imgR.addEventListener('load', function () {
      if (SINGLE && imgR.naturalWidth) body.style.aspectRatio = imgR.naturalWidth + ' / ' + imgR.naturalHeight;
      else fitBody();
    });
    imgR.addEventListener('load', fitBody);
    bind();
  }

  window.JIANO_BOOK = { open: open, close: close };
})();

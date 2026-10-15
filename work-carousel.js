/**
 * 作品详情页：把图集变成环形轮播
 *
 * 页面里放一个 <div class="carousel-host" data-carousel>，
 * 内部的 <li data-src data-title data-subtitle> 即环上的图片数据。
 * 脚本读取这些数据、构建轮播，并把「看大图」按钮接到灯箱
 * （灯箱的开关由 script.js 暴露的 window.__openLightbox 提供）。
 */
(function () {
  'use strict';

  const root = document.documentElement;

  const token = (name, fallback) => {
    const value = getComputedStyle(root).getPropertyValue(name).trim();
    return value || fallback;
  };

  function initCarousel(host) {
    if (!host || !window.CircularCarousel) return;

    const nodes = Array.prototype.slice.call(host.querySelectorAll('[data-src]'));
    if (!nodes.length) return;

    const items = nodes.map((node) => ({
      src: node.getAttribute('data-src'),
      alt: node.getAttribute('data-alt') || '',
      title: node.getAttribute('data-title') || '',
      subtitle: node.getAttribute('data-subtitle') || '',
    }));

    // 组件需要一个有确定高度的父元素
    const stageHost = document.createElement('div');
    stageHost.className = 'carousel-stage';
    host.appendChild(stageHost);

    // 先建工具条，onChange 回调里要用到 button，避免引用未定义
    const toolbar = document.createElement('div');
    toolbar.className = 'carousel-toolbar';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--outline';
    button.textContent = '看大图';
    toolbar.appendChild(button);
    host.appendChild(toolbar);

    let current = 0;

    const labelFor = (index) => {
      const item = items[index];
      const name = (item && (item.title || item.alt)) || `第 ${index + 1} 张`;
      return `查看大图：${name}`;
    };

    const carousel = CircularCarousel.create(stageHost, {
      items,
      preset: host.getAttribute('data-preset') || 'cylinder',
      intro: 'rise',
      cardWidth: Number(host.getAttribute('data-card-width')) || 300,
      aspectRatio: 16 / 10,
      gap: 26,
      curve: 1,
      autoplay: 'drift',
      speed: 11,
      momentum: 0.7,
      snap: true,
      pauseOnHover: true,
      focusOnClick: true,
      parallax: 0.3,
      stretch: 0.5,
      depthFade: 0.62,
      fadeColor: token('--black', '#000000'),
      innerShade: 0.62,
      cornerRadius: 12,
      captions: true,
      draggable: true,
      ariaLabel: host.getAttribute('data-label') || '作品图片环形轮播',
      onChange(index) {
        current = index;
        button.setAttribute('aria-label', labelFor(index));
      },
    });

    button.setAttribute('aria-label', labelFor(0));

    // 单击卡片把它转到正面；「看大图」打开当前正面那张
    button.addEventListener('click', () => {
      const item = items[current];
      if (!item) return;
      if (typeof window.__openLightbox === 'function') {
        window.__openLightbox(item.src, item.alt || item.title || '');
      } else {
        window.open(item.src, '_blank', 'noopener');
      }
    });

    // 缩略图快速跳转：若页面提供了 [data-thumbs] 容器
    const thumbBox = host.parentNode ? host.parentNode.querySelector('[data-thumbs]') : null;
    if (thumbBox) {
      items.forEach((item, index) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'carousel-thumb';
        b.setAttribute('aria-label', `跳转到：${item.title || `第 ${index + 1} 张`}`);
        const img = document.createElement('img');
        img.src = item.src;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        b.appendChild(img);
        b.addEventListener('click', () => carousel.focusIndex(index));
        thumbBox.appendChild(b);
      });
    }

    // 原始列表只作数据来源，从布局与无障碍树中移出
    nodes.forEach((node) => {
      const wrapper = node.closest('figure') || node;
      wrapper.hidden = true;
      wrapper.setAttribute('aria-hidden', 'true');
    });

    host.dataset.carouselReady = 'true';

    // 供自检脚本使用
    window.__workCarousel = carousel;
    return carousel;
  }

  function boot() {
    document.querySelectorAll('[data-carousel]').forEach(initCarousel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

(() => {
  const toggle = document.querySelector('#menu-toggle');
  const navigation = document.querySelector('#navigation');

  function setMenu(open, returnFocus = false) {
    if (!toggle || !navigation) return;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    navigation.hidden = !open;
    navigation.classList.toggle('is-open', open);
    if (returnFocus) toggle.focus({ preventScroll: true });
  }

  if (toggle && navigation) {
    setMenu(false);
    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    toggle.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault();
      setMenu(true);
      navigation.querySelector('a')?.focus();
    });
    navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
    document.addEventListener('pointerdown', event => {
      if (!navigation.contains(event.target) && !toggle.contains(event.target)) setMenu(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        event.preventDefault();
        setMenu(false, true);
      }
    });
    navigation.addEventListener('focusout', event => {
      if (event.relatedTarget && !navigation.contains(event.relatedTarget) && !toggle.contains(event.relatedTarget)) {
        setMenu(false);
      }
    });
  }

  const root = document.documentElement;
  const overlay = document.querySelector('#intro-overlay');
  const mark = document.querySelector('#intro-mark');
  const background = overlay?.querySelector('.intro-background');
  const skip = document.querySelector('#skip-intro');
  const content = document.querySelector('#site-content');
  const banner = document.querySelector('#site-banner');
  const target = document.querySelector('#banner-logo-target');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const logoBounds = { x: 184, y: 201, width: 431, height: 316 };
  const markWidth = 200;
  const markHeight = markWidth * 558 / 759;
  let active = false;
  let safeguard;
  let frame;
  let previousFocus;
  let wasInert = false;
  const animations = new Set();
  root.dataset.introState = 'idle';

  function positionOffset(value, freeSpace) {
    if (value === 'left' || value === 'top') return 0;
    if (value === 'right' || value === 'bottom') return freeSpace;
    if (value === 'center') return freeSpace / 2;
    if (value?.endsWith('%')) return freeSpace * parseFloat(value) / 100;
    return Number.parseFloat(value) || 0;
  }

  // The mark is baked into the supplied banner, so derive its visible position
  // from the same cover/contain crop the browser uses for that image.
  function logoRect() {
    if (!banner || !target || !banner.naturalWidth || !banner.naturalHeight) return null;
    const box = banner.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const styles = getComputedStyle(banner);
    let scaleX = box.width / banner.naturalWidth;
    let scaleY = box.height / banner.naturalHeight;
    if (styles.objectFit === 'cover') scaleX = scaleY = Math.max(scaleX, scaleY);
    else if (styles.objectFit === 'contain') scaleX = scaleY = Math.min(scaleX, scaleY);
    else if (styles.objectFit === 'none') scaleX = scaleY = 1;
    else if (styles.objectFit === 'scale-down') scaleX = scaleY = Math.min(1, scaleX, scaleY);
    const positions = styles.objectPosition.trim().split(/\s+/);
    const offsetX = positionOffset(positions[0], box.width - banner.naturalWidth * scaleX);
    const offsetY = positionOffset(positions[1] || '50%', box.height - banner.naturalHeight * scaleY);
    const rect = {
      left: box.left + offsetX + logoBounds.x * scaleX,
      top: box.top + offsetY + logoBounds.y * scaleY,
      width: logoBounds.width * scaleX,
      height: logoBounds.height * scaleY
    };
    const parent = target.offsetParent || target.parentElement;
    const parentBox = parent.getBoundingClientRect();
    Object.assign(target.style, {
      left: `${rect.left - parentBox.left + parent.scrollLeft - parent.clientLeft}px`,
      top: `${rect.top - parentBox.top + parent.scrollTop - parent.clientTop}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
    return rect;
  }

  function finishIntro(state) {
    if (!active) return;
    active = false;
    clearTimeout(safeguard);
    const restoreFocus = overlay.contains(document.activeElement);
    overlay.hidden = true;
    document.body.classList.remove('intro-active');
    content.inert = wasInert;
    animations.forEach(animation => animation.cancel());
    animations.clear();
    root.dataset.introState = state;
    if (restoreFocus) {
      const focusTarget = previousFocus?.isConnected && previousFocus !== document.body
        ? previousFocus
        : toggle;
      focusTarget?.focus({ preventScroll: true });
    }
  }

  async function animate(element, keyframes, options) {
    if (!active) return;
    const animation = element.animate(keyframes, { fill: 'forwards', ...options });
    animations.add(animation);
    await animation.finished;
  }

  function imageReady(image) {
    if (image.complete) return image.naturalWidth ? Promise.resolve() : Promise.reject(new Error('Image unavailable'));
    return new Promise((resolve, reject) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', reject, { once: true });
    });
  }

  async function playIntro() {
    if (!overlay || !mark || !background || !skip || !content || !banner || !target) return;
    if (reducedMotion.matches || (location.hash && location.hash !== '#top') || !mark.animate) {
      root.dataset.introState = 'skipped';
      return;
    }
    active = true;
    previousFocus = document.activeElement;
    wasInert = content.inert;
    content.inert = true;
    document.body.classList.add('intro-active');
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const startScale = Math.min(160, viewportWidth * 0.42) / markWidth;
    const transformAtCenter = scale => `translate(${(viewportWidth - markWidth * scale) / 2}px, ${(viewportHeight - markHeight * scale) / 2}px) scale(${scale})`;
    const startTransform = transformAtCenter(startScale);
    Object.assign(mark.style, { width: `${markWidth}px`, height: `${markHeight}px`, transform: startTransform, opacity: '1' });
    background.style.opacity = '1';
    overlay.hidden = false;
    // A failed asset or interrupted animation must never leave the page covered.
    safeguard = setTimeout(() => finishIntro('skipped'), 6500);
    try {
      await Promise.all([imageReady(banner), imageReady(mark)]);
      if (!active) return;
      const destination = logoRect();
      if (!destination) throw new Error('Banner has no visible size');
      const coverScale = Math.max(viewportWidth / markWidth, viewportHeight / markHeight) * 1.6;
      const expandedTransform = transformAtCenter(coverScale);
      root.dataset.introState = 'expanding';
      await animate(mark, [
        { transform: startTransform, offset: 0 },
        { transform: startTransform, offset: 0.06 },
        { transform: expandedTransform, offset: 0.94 },
        { transform: expandedTransform, offset: 1 }
      ], { duration: 1150, easing: 'cubic-bezier(.58,0,.24,1)' });
      if (!active) return;
      root.dataset.introState = 'collapsing';
      const destinationTransform = `translate(${destination.left}px, ${destination.top}px) scale(${destination.width / markWidth}, ${destination.height / markHeight})`;
      await Promise.all([
        animate(mark, [
          { transform: expandedTransform },
          { transform: destinationTransform }
        ], { duration: 1150, easing: 'cubic-bezier(.64,0,.24,1)' }),
        animate(background, [
          { opacity: 1, offset: 0 },
          { opacity: 1, offset: 0.15 },
          { opacity: 0, offset: 1 }
        ], { duration: 1150, easing: 'ease-in-out' })
      ]);
      if (!active) return;
      await animate(mark, [{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease-out' });
      finishIntro('complete');
    } catch {
      finishIntro('skipped');
    }
  }

  skip?.addEventListener('click', () => finishIntro('skipped'));
  document.addEventListener('keydown', event => {
    if (active && event.key === 'Escape') {
      event.preventDefault();
      finishIntro('skipped');
    }
  });
  reducedMotion.addEventListener('change', event => {
    if (event.matches) finishIntro('skipped');
  });
  window.addEventListener('resize', () => {
    finishIntro('skipped');
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(logoRect);
  }, { passive: true });
  window.addEventListener('pagehide', () => finishIntro('skipped'));
  banner?.addEventListener('load', logoRect);
  logoRect();
  playIntro();
})();

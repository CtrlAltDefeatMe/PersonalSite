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
  const bars = mark ? [...mark.querySelectorAll('.intro-bar')] : [];
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
    if (!overlay || !mark || !background || !skip || !content || !banner || !target || bars.length !== 4) {
      root.dataset.introState = 'skipped';
      return;
    }
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
    const startScale = Math.min(360, viewportWidth * 0.62) / markWidth;
    const transformAtCenter = scale => `translate(${(viewportWidth - markWidth * scale) / 2}px, ${(viewportHeight - markHeight * scale) / 2}px) scale(${scale})`;
    const startTransform = transformAtCenter(startScale);
    Object.assign(mark.style, { width: `${markWidth}px`, height: `${markHeight}px`, transform: startTransform, opacity: '1' });
    background.style.opacity = '1';
    overlay.hidden = false;
    // A failed asset or interrupted animation must never leave the page covered.
    safeguard = setTimeout(() => finishIntro('skipped'), 10000);
    try {
      await imageReady(banner);
      if (!active) return;
      const destination = logoRect();
      if (!destination) throw new Error('Banner has no visible size');
      // SVG translations use viewBox units; convert viewport distances so every
      // bar begins beyond its own edge on both phones and larger screens.
      const unitsPerPixel = 759 / (markWidth * startScale);
      const travelX = (viewportWidth / 2 + markWidth * startScale) * unitsPerPixel;
      const travelY = (viewportHeight / 2 + markHeight * startScale) * unitsPerPixel;
      const flights = {
        't-cap': { x: -viewportWidth * 0.12 * unitsPerPixel, y: -travelY, rotation: -330, delay: 0 },
        't-stem': { x: -travelX, y: viewportHeight * 0.1 * unitsPerPixel, rotation: 405, delay: 200 },
        'h-crossbar': { x: viewportWidth * 0.08 * unitsPerPixel, y: travelY, rotation: -390, delay: 400 },
        'h-upright': { x: travelX, y: -viewportHeight * 0.12 * unitsPerPixel, rotation: 345, delay: 600 }
      };
      root.dataset.introState = 'tumbling';
      await Promise.all(bars.map(bar => {
        const flight = flights[bar.dataset.bar];
        if (!flight) throw new Error('Unknown logo bar');
        const transform = (x, y, rotation, scale = 1) => `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scale})`;
        return animate(bar, [
          { transform: transform(flight.x, flight.y, flight.rotation, 0.8), opacity: 0, offset: 0 },
          { transform: transform(flight.x * 0.85, flight.y * 0.85, flight.rotation * 0.85, 0.88), opacity: 1, offset: 0.12 },
          { transform: transform(-flight.x * 0.012, -flight.y * 0.012, -Math.sign(flight.rotation) * 7, 1.015), opacity: 1, offset: 0.78 },
          { transform: transform(flight.x * 0.003, flight.y * 0.003, Math.sign(flight.rotation) * 2), opacity: 1, offset: 0.91 },
          { transform: transform(0, 0, 0), opacity: 1, offset: 1 }
        ], { duration: 2900, delay: flight.delay, easing: 'cubic-bezier(.22,.65,.28,1)' });
      }));
      if (!active) return;
      root.dataset.introState = 'assembled';
      await animate(mark, [{ transform: startTransform }, { transform: startTransform }], { duration: 240 });
      if (!active) return;
      root.dataset.introState = 'collapsing';
      const destinationTransform = `translate(${destination.left}px, ${destination.top}px) scale(${destination.width / markWidth}, ${destination.height / markHeight})`;
      await Promise.all([
        animate(mark, [
          { transform: startTransform },
          { transform: destinationTransform }
        ], { duration: 950, easing: 'cubic-bezier(.64,0,.24,1)' }),
        animate(background, [
          { opacity: 1, offset: 0 },
          { opacity: 1, offset: 0.15 },
          { opacity: 0, offset: 1 }
        ], { duration: 950, easing: 'ease-in-out' })
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

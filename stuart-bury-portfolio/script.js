const dialog = document.querySelector('dialog');
const image = document.querySelector('#dialog-image');
const videos = {
  reel: { id: '1079921817', hash: '908c9025c6', title: 'Stuart Bury — Reel', url: 'https://vimeo.com/1079921817/908c9025c6' },
  one: { id: '759263564', title: 'Catcher', url: 'https://vimeo.com/759263564' },
  two: { id: '640227711', title: 'Halloween Raps', url: 'https://vimeo.com/640227711?fl=pl&fe=cm' },
  three: { id: '265075832', title: 'Brother Pup Explains it All... (Kinda)', url: 'https://vimeo.com/265075832?fl=pl&fe=cm' },
  four: { id: '253685560', title: 'HOWL', url: 'https://vimeo.com/253685560' }
};
document.querySelectorAll('[data-frame]').forEach(button => {
  const video = videos[button.dataset.frame];
  button.setAttribute('aria-label', 'Play ' + video.title);
  button.addEventListener('click', () => {
    if (button.classList.contains('film')) {
      expandFilm(button);
      return;
    }
    document.querySelector('#dialog-title').textContent = video.title;
    const iframe = document.createElement('iframe');
    iframe.src = 'https://player.vimeo.com/video/' + video.id + '?' + (video.hash ? 'h=' + video.hash + '&' : '') + 'autoplay=1&title=0&byline=0&portrait=0&dnt=1';
    iframe.title = video.title;
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.allowFullscreen = true;
    image.replaceChildren(iframe);
    const link = document.createElement('a');
    link.href = video.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Watch on Vimeo ↗';
    dialog.querySelector('p').replaceChildren(link);
    dialog.showModal();
  });
});
document.querySelector('.close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => image.replaceChildren());
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });

// Keep movement inside each cropped still, without exposing neighboring artwork.
const thumbnailWindows = [...document.querySelectorAll('.thumbnail-window')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let parallaxFrame = 0;
function updateParallax() {
  parallaxFrame = 0;
  const viewportHeight = window.innerHeight;
  const positions = thumbnailWindows.map(thumbnail => {
    const bounds = thumbnail.getBoundingClientRect();
    const progress = Math.max(-1, Math.min(1,
      (viewportHeight / 2 - (bounds.top + bounds.height / 2)) /
      ((viewportHeight + bounds.height) / 2)
    ));
    const travel = window.innerWidth <= 600 ? 0.1 : 0.32;
    return reducedMotion.matches ? 0 : progress * bounds.height * travel;
  });
  thumbnailWindows.forEach((thumbnail, index) => {
    thumbnail.style.setProperty('--parallax-shift', positions[index].toFixed(2) + 'px');
  });
}
function scheduleParallax() {
  if (!parallaxFrame) parallaxFrame = window.requestAnimationFrame(updateParallax);
}
window.addEventListener('scroll', scheduleParallax, { passive: true });
window.addEventListener('resize', scheduleParallax);
reducedMotion.addEventListener('change', scheduleParallax);
scheduleParallax();

// Warm nearby Vimeo players once, then retain their buffered first frames.
const hoverPointer = window.matchMedia('(hover: hover) and (pointer: fine)');
const previewCache = new Map();
let vimeoSdkPromise;
let activePreview;
function canPreview() {
  return hoverPointer.matches && !reducedMotion.matches && !document.hidden;
}
function loadVimeoSdk() {
  if (window.Vimeo?.Player) return Promise.resolve(window.Vimeo);
  if (!vimeoSdkPromise) {
    vimeoSdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://player.vimeo.com/api/player.js';
      script.onload = () => resolve(window.Vimeo);
      script.onerror = () => { script.remove(); vimeoSdkPromise = undefined; reject(new Error('Preview unavailable')); };
      document.head.append(script);
    });
  }
  return vimeoSdkPromise;
}
function stopHoverPreview() {
  const preview = activePreview;
  activePreview = undefined;
  if (!preview) return;
  preview.layer?.classList.remove('is-playing');
  preview.player?.pause().catch(() => {});
}
function releasePreview(button) {
  const preview = previewCache.get(button);
  if (!preview) return;
  if (activePreview === preview) stopHoverPreview();
  preview.disposed = true;
  preview.layer?.remove();
  previewCache.delete(button);
}
function warmPreview(button) {
  if (previewCache.has(button)) return previewCache.get(button);
  const preview = { button, disposed: false };
  previewCache.set(button, preview);
  preview.ready = (async () => {
    try {
      const Vimeo = await loadVimeoSdk();
      if (preview.disposed || !canPreview()) return;
      const video = videos[button.dataset.frame];
      const layer = document.createElement('span');
      layer.className = 'hover-preview';
      layer.setAttribute('aria-hidden', 'true');
      const iframe = document.createElement('iframe');
      iframe.src = 'https://player.vimeo.com/video/' + video.id + '?background=1&autoplay=1&muted=1&loop=1&controls=0&keyboard=0&title=0&byline=0&portrait=0&dnt=1';
      iframe.title = video.title + ' — silent preview';
      iframe.tabIndex = -1;
      iframe.allow = 'autoplay';
      layer.append(iframe);
      preview.layer = layer;
      button.querySelector('.thumbnail-window').append(layer);
      const player = new Vimeo.Player(iframe);
      preview.player = player;
      player.on('playing', () => {
        if (preview.disposed) return;
        if (activePreview === preview && canPreview() && !dialog.open) {
          layer.classList.add('is-playing');
        } else {
          // Buffer and decode a real frame, then hold it ready for the pointer.
          player.pause().catch(() => {});
        }
      });
      player.on('error', () => releasePreview(button));
      await player.ready();
      return player;
    } catch {
      if (previewCache.get(button) === preview) releasePreview(button);
    }
  })();
  return preview;
}
const nearbyFilms = new Set();
const filmVisibility = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      nearbyFilms.add(entry.target);
      if (canPreview() && !dialog.open) warmPreview(entry.target);
    } else {
      nearbyFilms.delete(entry.target);
      releasePreview(entry.target);
    }
  }
}, { rootMargin: '800px 0px' });
document.querySelectorAll('.film[data-frame]').forEach(button => {
  filmVisibility.observe(button);
  button.addEventListener('pointerenter', async event => {
    if (event.pointerType === 'touch' || !canPreview() || dialog.open || activeInlineFilm) return;
    stopHoverPreview();
    const preview = warmPreview(button);
    activePreview = preview;
    const player = await preview.ready;
    if (player && activePreview === preview && !preview.disposed && canPreview() && !dialog.open) {
      // Resume the retained player immediately; no hover timer or iframe reload.
      player.play().catch(() => {
        if (activePreview === preview) stopHoverPreview();
      });
    }
  });
  button.addEventListener('pointerleave', () => {
    if (activePreview?.button === button) stopHoverPreview();
  });
  button.addEventListener('click', stopHoverPreview);
});
function refreshPreviewAvailability() {
  stopHoverPreview();
  if (!canPreview()) {
    [...previewCache.keys()].forEach(releasePreview);
  } else if (!dialog.open) {
    nearbyFilms.forEach(warmPreview);
  }
}
reducedMotion.addEventListener('change', refreshPreviewAvailability);
hoverPointer.addEventListener('change', refreshPreviewAvailability);
document.addEventListener('visibilitychange', refreshPreviewAvailability);
dialog.addEventListener('close', refreshPreviewAvailability);



// The header reel runs silently; the separate full player retains sound controls.
(async function startHeaderReel() {
  const reelWindow = document.querySelector('.reel .thumbnail-window');
  if (!reelWindow) return;
  try {
    const Vimeo = await loadVimeoSdk();
    const layer = document.createElement('span');
    layer.className = 'reel-background';
    layer.setAttribute('aria-hidden', 'true');
    const iframe = document.createElement('iframe');
    iframe.src = 'https://player.vimeo.com/video/' + videos.reel.id + '?h=' + videos.reel.hash + '&background=1&autoplay=1&loop=1&muted=1&autopause=0&controls=0&keyboard=0&title=0&byline=0&portrait=0&dnt=1';
    iframe.title = 'Stuart Bury — silent looping reel';
    iframe.tabIndex = -1;
    iframe.allow = 'autoplay';
    layer.append(iframe);
    reelWindow.append(layer);
    const player = new Vimeo.Player(iframe);
    player.on('playing', () => layer.classList.add('is-playing'));
    player.on('error', () => layer.classList.remove('is-playing'));
    let reelVisible = true;
    const syncHeaderPlayback = () => {
      const action = document.hidden || dialog.open || activeInlineFilm || !reelVisible ? player.pause() : player.play();
      action.catch(() => {});
    };
    const reelVisibility = new IntersectionObserver(entries => {
      reelVisible = entries[0].isIntersecting;
      syncHeaderPlayback();
    });
    await player.ready();
    await player.setMuted(true);
    await player.setLoop(true);
    reelVisibility.observe(reelWindow);
    document.addEventListener('visibilitychange', syncHeaderPlayback);
    document.querySelectorAll('[data-frame]').forEach(button => button.addEventListener('click', syncHeaderPlayback));
    dialog.addEventListener('close', syncHeaderPlayback);
    document.addEventListener('inlinefilmchange', syncHeaderPlayback);
    syncHeaderPlayback();
  } catch {
    // The existing reel still and full-player button remain available.
  }
})();

// Film clicks replace the cropped thumbnail with an uncropped inline player.
let activeInlineFilm;
const filmSections = new Map();
document.querySelectorAll('.film[data-frame]').forEach(button => {
  const section = document.createElement('div');
  section.className = 'film-section';
  button.before(section);
  section.append(button);
  const panel = document.createElement('div');
  panel.className = 'inline-film-player';
  panel.id = 'film-player-' + button.dataset.frame;
  panel.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', panel.id);
  section.append(panel);
  filmSections.set(button, { section, panel, button });
});
function animateFilmHeight(record, previousHeight) {
  record.animation?.cancel();
  if (reducedMotion.matches) return;
  record.animation = record.section.animate(
    [{ height: previousHeight + 'px' }, { height: record.section.getBoundingClientRect().height + 'px' }],
    { duration: 350, easing: 'cubic-bezier(.2,.7,.2,1)' }
  );
}
function collapseFilm(returnFocus = true) {
  const record = activeInlineFilm;
  if (!record) return;
  const previousHeight = record.section.getBoundingClientRect().height;
  activeInlineFilm = undefined;
  clearTimeout(record.closeFadeTimer);
  record.panel.replaceChildren();
  record.panel.hidden = true;
  record.button.hidden = false;
  record.button.setAttribute('aria-expanded', 'false');
  record.section.classList.remove('is-expanded');
  animateFilmHeight(record, previousHeight);
  if (returnFocus) record.button.focus({ preventScroll: true });
  document.dispatchEvent(new Event('inlinefilmchange'));
}
function expandFilm(button) {
  collapseFilm(false);
  stopHoverPreview();
  const record = filmSections.get(button);
  const previousHeight = record.section.getBoundingClientRect().height;
  const video = videos[button.dataset.frame];
  const iframe = document.createElement('iframe');
  iframe.src = 'https://player.vimeo.com/video/' + video.id + '?autoplay=1&muted=0&loop=0&controls=1&title=0&byline=0&portrait=0&dnt=1#t=0s';
  iframe.title = video.title;
  iframe.allow = 'autoplay; fullscreen; picture-in-picture';
  iframe.allowFullscreen = true;
  const close = document.createElement('button');
  close.className = 'collapse-film';
  close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  close.title = 'Close film';
  close.setAttribute('aria-label', 'Close ' + video.title);
  close.addEventListener('click', () => collapseFilm());
  const revealClose = () => {
    clearTimeout(record.closeFadeTimer);
    close.classList.remove('is-faded');
    record.closeFadeTimer = setTimeout(() => {
      if (!close.matches(':focus-visible')) close.classList.add('is-faded');
    }, 2500);
  };
  record.panel.onpointerenter = revealClose;
  record.panel.onpointermove = revealClose;
  close.addEventListener('focus', () => {
    clearTimeout(record.closeFadeTimer);
    close.classList.remove('is-faded');
  });
  close.addEventListener('blur', revealClose);
  record.panel.replaceChildren(iframe, close);
  record.button.hidden = true;
  record.button.setAttribute('aria-expanded', 'true');
  record.panel.hidden = false;
  record.section.classList.add('is-expanded');
  activeInlineFilm = record;
  animateFilmHeight(record, previousHeight);
  close.focus({ preventScroll: true });
  revealClose();
  document.dispatchEvent(new Event('inlinefilmchange'));
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && activeInlineFilm) collapseFilm();
});




// Keep the photo top and navigation baseline aligned with the adjacent copy.
const introCopy = document.querySelector('.intro-copy');
const introPortrait = document.querySelector('#about .portrait');
const introNavigation = introPortrait?.querySelector('nav');
let portraitAlignmentFrame;
function alignIntroPortrait() {
  cancelAnimationFrame(portraitAlignmentFrame);
  portraitAlignmentFrame = requestAnimationFrame(() => {
    if (!introCopy || !introPortrait) return;
    if (window.innerWidth <= 600) {
      introPortrait.style.removeProperty('--aligned-portrait-width');
      return;
    }
    const navStyle = introNavigation ? getComputedStyle(introNavigation) : null;
    const navigationHeight = introNavigation ? introNavigation.getBoundingClientRect().height + parseFloat(navStyle.marginTop) : 0;
    const imageHeight = Math.max(0, introCopy.getBoundingClientRect().height - navigationHeight);
    introPortrait.style.setProperty('--aligned-portrait-width', (imageHeight * 2 / 3) + 'px');
  });
}
if (introCopy && introPortrait) {
  const introResizeObserver = new ResizeObserver(alignIntroPortrait);
  introResizeObserver.observe(introCopy);
  if (introNavigation) introResizeObserver.observe(introNavigation);
  window.addEventListener('resize', alignIntroPortrait);
  document.fonts.ready.then(alignIntroPortrait);
  alignIntroPortrait();
}



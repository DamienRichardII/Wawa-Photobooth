import { $, $$, prefersReducedMotion, saveData } from './lib/dom.js';

const hero = $('.hero');
const video = $('.hero__video');
if (hero && video) {
  const SLIDES = [
    { slug: 'miroir-fleurs-blanches', label: 'Photobooth WAWA avec fleurs blanches et crème' },
    { slug: 'miroir-logo-led', label: 'Photobooth WAWA, gros plan sur le cadre lumineux' },
    { slug: 'miroir-ecran-fete', label: 'Photobooth WAWA en soirée avec écran festif' },
    { slug: 'miroir-fleurs-jaunes', label: 'Photobooth WAWA avec fleurs jaunes' }
  ];
  const dots = $$('.hero__dot');
  const live = $('.hero__live');
  const toggle = $('[data-hero-toggle]');
  const still = prefersReducedMotion() || saveData();
  let index = 0; let userPaused = still; let visible = true;

  const setToggle = () => {
    const playing = !video.paused;
    toggle.setAttribute('aria-label', playing ? 'Mettre la vidéo en pause' : 'Lire la vidéo');
    toggle.querySelector('use').setAttribute('href', `/media/icons/sprite.svg#i-${playing ? 'pause' : 'play'}`);
  };
  const play = () => { if (userPaused || !visible) return; video.play().then(setToggle).catch(setToggle); };

  function go(i, { announce = true } = {}) {
    index = (i + SLIDES.length) % SLIDES.length;
    const s = SLIDES[index];
    hero.dataset.slide = String(index);
    video.setAttribute('aria-label', s.label);
    video.poster = `/media/img/${s.slug}-poster.webp`;
    video.src = `/media/video/${s.slug}.mp4`;
    video.load();
    dots.forEach((d, n) => { d.setAttribute('aria-current', n === index ? 'true' : 'false'); });
    if (announce && live) live.textContent = `Vidéo ${index + 1} sur ${SLIDES.length} : ${s.label}`;
    play();
  }

  video.loop = false;
  video.removeAttribute('autoplay');
  video.addEventListener('ended', () => go(index + 1, { announce: false }));
  video.addEventListener('play', setToggle); video.addEventListener('pause', setToggle);
  $$('[data-hero-prev]').forEach((b) => b.addEventListener('click', () => go(index - 1)));
  $$('[data-hero-next]').forEach((b) => b.addEventListener('click', () => go(index + 1)));
  dots.forEach((d, n) => d.addEventListener('click', () => go(n)));
  toggle.addEventListener('click', () => {
    if (video.paused) { userPaused = false; video.play(); } else { userPaused = true; video.pause(); }
    setToggle();
  });

  // La vidéo ne tourne que lorsqu'elle est visible (économie de batterie / données)
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) play(); else video.pause(); }, { threshold: 0.2 }).observe(hero);
  document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); else play(); });

  if (still) { video.pause(); setToggle(); } else { video.muted = true; play(); }
  hero.dataset.slide = '0';
}

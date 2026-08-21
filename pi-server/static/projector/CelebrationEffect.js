import { arrivalEffectForTheme, normalizeTheme } from './ThemeRegistry.js';

const COPY = {
  en: {
    badge: 'Kids Galaxy Projector',
    waiting: 'Waiting for a planet…',
    drawHint: 'Draw on the tablet and launch into space!',
    orbitHint: '✨ Your planet orbits the sun and spins in space',
    textureFailed: 'One planet is still finding its way here…',
    newPlanet: 'A new planet',
    joinedSky: (name) => `${name} joined the sky!`,
  },
  fr: {
    badge: 'Projecteur Kids Galaxy',
    waiting: 'En attente d’une planète…',
    drawHint: 'Dessine sur la tablette et lance ta planète dans l’espace!',
    orbitHint: '✨ Ta planète tourne autour du soleil et sur elle-même',
    textureFailed: 'Une planète cherche encore son chemin jusqu’ici…',
    newPlanet: 'Une nouvelle planète',
    joinedSky: (name) => `${name} a rejoint le ciel!`,
  },
};

const FIREWORK_THEMES = new Set(['canada-day', 'fete-nationale', 'new-year']);

/** Owns the projector's DOM feedback for arrivals, localization and empty state. */
export class CelebrationEffect {
  constructor({ planetNameEl, statusEl, celebrationEl, sparklesEl, badgeLabelEl, hintEl }) {
    this.planetNameEl = planetNameEl;
    this.statusEl = statusEl;
    this.celebrationEl = celebrationEl;
    this.sparklesEl = sparklesEl;
    this.badgeLabelEl = badgeLabelEl;
    this.hintEl = hintEl;
    this.timer = null;
    this.language = 'en';
    this.theme = 'default';
    this.state = 'waiting';
    this.lastName = null;
  }

  copy() {
    return COPY[this.language] || COPY.en;
  }

  arrivalEffect() {
    return arrivalEffectForTheme(this.theme);
  }

  setTheme(theme) {
    this.theme = normalizeTheme(theme);
    if (this.arrivalEffect().celebrate) return;
    this.clearCelebration();
  }

  clearCelebration() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.celebrationEl?.classList.remove('show');
    this.sparklesEl?.replaceChildren();
    this.planetNameEl?.classList.remove('celebrate');
  }

  setLanguage(language) {
    this.language = language === 'fr' ? 'fr' : 'en';
    document.documentElement.lang = this.language;
    const copy = this.copy();
    if (this.badgeLabelEl) this.badgeLabelEl.textContent = copy.badge;
    if (this.hintEl) this.hintEl.textContent = copy.orbitHint;

    if (this.state === 'waiting') {
      if (this.planetNameEl) this.planetNameEl.textContent = copy.waiting;
      this.setStatus(copy.drawHint);
    } else if (this.state === 'texture-failed') {
      this.setStatus(copy.textureFailed);
    } else {
      this.setStatus(copy.drawHint);
    }

    if (this.celebrationEl?.classList.contains('show') && this.lastName) {
      const msg = this.celebrationEl.querySelector('.msg');
      if (msg) msg.textContent = copy.joinedSky(this.lastName);
    }
  }

  displayName(payload) {
    return payload.name || payload.display_name || this.copy().newPlanet;
  }

  setPlanetName(name, celebrate = false) {
    this.state = 'planet';
    this.lastName = name;
    if (!this.planetNameEl) return;
    this.planetNameEl.textContent = '🌍 ' + name;
    this.planetNameEl.classList.add('visible');
    if (!celebrate) return;

    this.planetNameEl.classList.remove('celebrate');
    void this.planetNameEl.offsetWidth;
    this.planetNameEl.classList.add('celebrate');
  }

  setStatus(message) {
    if (this.statusEl) this.statusEl.textContent = message;
  }

  resetWaiting() {
    this.state = 'waiting';
    this.lastName = null;
    if (this.planetNameEl) {
      this.planetNameEl.textContent = this.copy().waiting;
      this.planetNameEl.classList.remove('celebrate');
    }
    this.setStatus(this.copy().drawHint);
  }

  textureLoadFailed() {
    this.state = 'texture-failed';
    this.setStatus(this.copy().textureFailed);
  }

  sparkleShape(el, index) {
    if (this.theme === 'thanksgiving') {
      el.style.width = `${6 + Math.random() * 6}px`;
      el.style.height = `${11 + Math.random() * 8}px`;
      el.style.borderRadius = '70% 20% 70% 20%';
      el.style.transform = `rotate(${index * 37}deg)`;
      return;
    }
    if (this.theme === 'christmas') {
      const size = 5 + Math.random() * 8;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.borderRadius = '50%';
      return;
    }
    if (this.theme === 'halloween') {
      const size = 7 + Math.random() * 9;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.borderRadius = index % 3 === 0 ? '2px' : '50%';
      el.style.transform = index % 3 === 0 ? 'rotate(45deg)' : '';
      return;
    }
    const size = 8 + Math.random() * 10;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.borderRadius = '50%';
  }

  burstSparkles(count, colors, originX = 0.5, originY = 0.35) {
    if (!this.sparklesEl || !colors?.length) return;
    const cx = window.innerWidth * originX;
    const cy = window.innerHeight * originY;

    for (let i = 0; i < count; i += 1) {
      const el = document.createElement('div');
      el.className = 'sparkle';
      el.dataset.theme = this.theme;
      const color = colors[i % colors.length];
      el.style.background = color;
      el.style.color = color;
      el.style.left = `${cx}px`;
      el.style.top = `${cy}px`;
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const dist = 80 + Math.random() * 180;
      el.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      el.style.setProperty('--dy', `${Math.sin(angle) * dist - 40}px`);
      this.sparkleShape(el, i);
      this.sparklesEl.appendChild(el);
      setTimeout(() => el.remove(), 1900);
    }
  }

  show(payload) {
    const name = this.displayName(payload);
    const effect = this.arrivalEffect();
    this.setPlanetName(name, effect.celebrate);
    if (!effect.celebrate) return;

    if (FIREWORK_THEMES.has(this.theme)) {
      const first = Math.ceil(effect.count * 0.58);
      this.burstSparkles(first, effect.colors, 0.43, 0.34);
      this.burstSparkles(effect.count - first, effect.colors, 0.58, 0.3);
    } else {
      this.burstSparkles(effect.count, effect.colors);
    }

    if (!this.celebrationEl) return;
    const msg = this.celebrationEl.querySelector('.msg');
    if (msg) msg.textContent = this.copy().joinedSky(name);
    this.celebrationEl.classList.add('show');

    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.celebrationEl.classList.remove('show');
      this.timer = null;
    }, 2800);
  }
}

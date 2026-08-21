const SPARKLE_COLORS = [
  '#FFD54F',
  '#4FC3F7',
  '#FF8A65',
  '#CE93D8',
  '#A5D6A7',
  '#FFF59D',
  '#F48FB1',
];

const REMEMBRANCE_DAY_THEME = 'remembrance-day';

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

  setTheme(theme) {
    this.theme = typeof theme === 'string' ? theme : 'default';
    if (this.theme !== REMEMBRANCE_DAY_THEME) return;

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

  burstSparkles(count = 36) {
    if (!this.sparklesEl) return;
    const cx = window.innerWidth * 0.5;
    const cy = window.innerHeight * 0.35;

    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'sparkle';
      const color = SPARKLE_COLORS[i % SPARKLE_COLORS.length];
      el.style.background = color;
      el.style.color = color;
      el.style.left = cx + 'px';
      el.style.top = cy + 'px';
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const dist = 80 + Math.random() * 180;
      el.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      el.style.setProperty('--dy', Math.sin(angle) * dist - 40 + 'px');
      el.style.width = el.style.height = 8 + Math.random() * 10 + 'px';
      this.sparklesEl.appendChild(el);
      setTimeout(() => el.remove(), 1900);
    }
  }

  show(payload) {
    const name = this.displayName(payload);
    const celebrateArrival = this.theme !== REMEMBRANCE_DAY_THEME;
    this.setPlanetName(name, celebrateArrival);
    if (!celebrateArrival) return;

    this.burstSparkles();
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

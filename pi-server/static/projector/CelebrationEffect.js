const SPARKLE_COLORS = [
  '#FFD54F',
  '#4FC3F7',
  '#FF8A65',
  '#CE93D8',
  '#A5D6A7',
  '#FFF59D',
  '#F48FB1',
];

/** Owns the projector's DOM feedback for arrivals and empty state. */
export class CelebrationEffect {
  constructor({ planetNameEl, statusEl, celebrationEl, sparklesEl }) {
    this.planetNameEl = planetNameEl;
    this.statusEl = statusEl;
    this.celebrationEl = celebrationEl;
    this.sparklesEl = sparklesEl;
    this.timer = null;
  }

  displayName(payload) {
    return payload.name || payload.display_name || 'A new planet';
  }

  setPlanetName(name, celebrate = false) {
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
    if (this.planetNameEl) {
      this.planetNameEl.textContent = 'Waiting for a planet…';
      this.planetNameEl.classList.remove('celebrate');
    }
    this.setStatus('Draw on the tablet and launch into space!');
  }

  textureLoadFailed() {
    this.setStatus('One planet is still finding its way here…');
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
    this.setPlanetName(name, true);
    this.burstSparkles();
    if (!this.celebrationEl) return;

    const msg = this.celebrationEl.querySelector('.msg');
    if (msg) msg.textContent = name + ' joined the sky!';
    this.celebrationEl.classList.add('show');

    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.celebrationEl.classList.remove('show');
      this.timer = null;
    }, 2800);
  }
}

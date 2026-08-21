const DEFAULT_ARRIVAL = Object.freeze({
  celebrate: true,
  colors: ['#FFD54F', '#4FC3F7', '#FF8A65', '#CE93D8', '#A5D6A7', '#FFF59D', '#F48FB1'],
  count: 36,
});

const THEMES = Object.freeze({
  default: Object.freeze({
    background: 0x050818,
    ambient: 0x8fa2d2,
    ambientIntensity: 0.18,
    fill: 0x8298cd,
    fillIntensity: 0.13,
    particles: null,
    particleCount: 0,
    particleSize: 0.28,
    particleOpacity: 0.78,
    starRotationSpeed: 0.00035,
    dustColor: 0xaaa094,
    asteroidMix: [['rock', 1]],
    arrival: DEFAULT_ARRIVAL,
  }),
  halloween: Object.freeze({
    background: 0x10051d,
    ambient: 0x9d79cc,
    ambientIntensity: 0.18,
    fill: 0x9b6eaf,
    fillIntensity: 0.14,
    particles: [0xff8a2b, 0xa66cff, 0x75ff76],
    particleCount: 420,
    particleSize: 0.28,
    particleOpacity: 0.72,
    starRotationSpeed: 0.00038,
    dustColor: 0xf2a04e,
    asteroidMix: [['rock', 0.55], ['pumpkin', 0.3], ['jack-o-lantern', 0.15]],
    arrival: Object.freeze({
      celebrate: true,
      colors: ['#FF8A2B', '#A66CFF', '#75FF76', '#F3B35F'],
      count: 42,
    }),
  }),
  easter: Object.freeze({
    background: 0x11172f,
    ambient: 0xc9c8ff,
    ambientIntensity: 0.21,
    fill: 0xa7b5ed,
    fillIntensity: 0.15,
    particles: [0xffb7d9, 0xffe69a, 0xaeefff, 0xc8f7b2],
    particleCount: 420,
    particleSize: 0.25,
    particleOpacity: 0.7,
    starRotationSpeed: 0.00034,
    dustColor: 0xf2c7e5,
    asteroidMix: [['rock', 0.5], ['easter-egg', 0.4], ['golden-egg', 0.1]],
    arrival: Object.freeze({
      celebrate: true,
      colors: ['#FFB7D9', '#FFE69A', '#AEEFFF', '#C8F7B2', '#D7C4FF'],
      count: 44,
    }),
  }),
  christmas: Object.freeze({
    background: 0x03120f,
    ambient: 0x9fdbc0,
    ambientIntensity: 0.19,
    fill: 0x7eaf9f,
    fillIntensity: 0.14,
    particles: [0xff4f4f, 0x63df84, 0xffd66b, 0xf4f8ff],
    particleCount: 500,
    particleSize: 0.23,
    particleOpacity: 0.68,
    starRotationSpeed: 0.0003,
    dustColor: 0xeaf5ff,
    asteroidMix: [['rock', 0.45], ['snowball', 0.4], ['ornament', 0.15]],
    arrival: Object.freeze({
      celebrate: true,
      colors: ['#F4F8FF', '#FF4F4F', '#63DF84', '#FFD66B'],
      count: 48,
    }),
  }),
  'remembrance-day': Object.freeze({
    background: 0x030711,
    ambient: 0x8d93a3,
    ambientIntensity: 0.13,
    fill: 0x746e72,
    fillIntensity: 0.09,
    particles: [0xb51f2e, 0xd12b3d, 0x8d1724, 0xe05a61],
    particleCount: 120,
    particleSize: 0.17,
    particleOpacity: 0.46,
    starRotationSpeed: 0.00012,
    dustColor: 0x8b8182,
    asteroidMix: [['rock', 1]],
    arrival: Object.freeze({ celebrate: false, colors: [], count: 0 }),
  }),
  'canada-day': Object.freeze({
    background: 0x070b18,
    ambient: 0xd8e3f5,
    ambientIntensity: 0.2,
    fill: 0xe7edf7,
    fillIntensity: 0.15,
    particles: [0xff3131, 0xffffff, 0xd9182b],
    particleCount: 520,
    particleSize: 0.27,
    particleOpacity: 0.74,
    starRotationSpeed: 0.0004,
    dustColor: 0xe8d9da,
    asteroidMix: [['rock', 0.45], ['red-rock', 0.2], ['white-rock', 0.2], ['maple-leaf', 0.15]],
    arrival: Object.freeze({
      celebrate: true,
      colors: ['#FF3131', '#FFFFFF', '#D9182B'],
      count: 58,
    }),
  }),
  'fete-nationale': Object.freeze({
    background: 0x020d2b,
    ambient: 0x9bc8ff,
    ambientIntensity: 0.2,
    fill: 0xdcecff,
    fillIntensity: 0.15,
    particles: [0x2f72d8, 0xffffff, 0x79b5ff],
    particleCount: 500,
    particleSize: 0.26,
    particleOpacity: 0.72,
    starRotationSpeed: 0.00038,
    dustColor: 0xb8d3f5,
    asteroidMix: [['rock', 0.5], ['blue-rock', 0.25], ['white-rock', 0.15], ['fleur-de-lis', 0.1]],
    arrival: Object.freeze({
      celebrate: true,
      colors: ['#2F72D8', '#FFFFFF', '#79B5FF'],
      count: 56,
    }),
  }),
  thanksgiving: Object.freeze({
    background: 0x160b08,
    ambient: 0xe3b17c,
    ambientIntensity: 0.19,
    fill: 0xc98954,
    fillIntensity: 0.14,
    particles: [0xe87924, 0xd9a441, 0xa64b2a, 0x8f713c],
    particleCount: 440,
    particleSize: 0.27,
    particleOpacity: 0.68,
    starRotationSpeed: 0.0003,
    dustColor: 0xb87742,
    asteroidMix: [['rock', 0.5], ['autumn-rock', 0.25], ['pumpkin', 0.15], ['maple-leaf', 0.1]],
    arrival: Object.freeze({
      celebrate: true,
      colors: ['#E87924', '#D9A441', '#A64B2A', '#F0C36E'],
      count: 44,
    }),
  }),
  'new-year': Object.freeze({
    background: 0x050611,
    ambient: 0xc7d4e8,
    ambientIntensity: 0.21,
    fill: 0xb7c6dc,
    fillIntensity: 0.15,
    particles: [0xffd76a, 0xf7fbff, 0x9fc7ff, 0xc8b4ff],
    particleCount: 620,
    particleSize: 0.29,
    particleOpacity: 0.78,
    starRotationSpeed: 0.00046,
    dustColor: 0xd9dce4,
    asteroidMix: [['rock', 0.4], ['gold-orb', 0.3], ['silver-orb', 0.3]],
    arrival: Object.freeze({
      celebrate: true,
      colors: ['#FFD76A', '#F7FBFF', '#9FC7FF', '#C8B4FF'],
      count: 68,
    }),
  }),
  'family-day': Object.freeze({
    background: 0x0b1027,
    ambient: 0xbecbf4,
    ambientIntensity: 0.2,
    fill: 0xa7b8e5,
    fillIntensity: 0.15,
    particles: [0xffabc8, 0xaedcff, 0xffffff, 0xcbb9ff],
    particleCount: 430,
    particleSize: 0.25,
    particleOpacity: 0.69,
    starRotationSpeed: 0.00032,
    dustColor: 0xd3d8eb,
    asteroidMix: [['rock', 0.45], ['snowball', 0.3], ['heart', 0.25]],
    arrival: Object.freeze({
      celebrate: true,
      colors: ['#FFABC8', '#AEDCFF', '#FFFFFF', '#CBB9FF'],
      count: 46,
    }),
  }),
});

export const THEME_NAMES = Object.freeze(Object.keys(THEMES));

export function normalizeTheme(theme) {
  return Object.prototype.hasOwnProperty.call(THEMES, theme) ? theme : 'default';
}

export function themeDefinition(theme) {
  return THEMES[normalizeTheme(theme)];
}

export function arrivalEffectForTheme(theme) {
  return themeDefinition(theme).arrival || DEFAULT_ARRIVAL;
}

export function pickAsteroidStyle(theme, unit) {
  const mix = themeDefinition(theme).asteroidMix;
  const value = Math.max(0, Math.min(0.999999, Number(unit) || 0));
  let cursor = 0;
  for (const [style, weight] of mix) {
    cursor += weight;
    if (value < cursor) return style;
  }
  return mix[mix.length - 1][0];
}

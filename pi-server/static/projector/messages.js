/** Projector copy for English and Canadian French. Keys must match in both locales. */
export const PROJECTOR_MESSAGES = {
  en: {
    title: 'Kids Galaxy Projector',
    badge: 'Kids Galaxy Projector',
    waiting: 'Waiting for a planet…',
    drawHint: 'Draw on the tablet and launch into space!',
    orbitHint: '✨ Your planet orbits the sun and spins in space',
    textureFailed: 'One planet is still finding its way here…',
    newPlanet: 'A new planet',
    joinedSky: '{name} joined the sky!',
  },
  fr: {
    title: 'Projecteur Kids Galaxy',
    badge: 'Projecteur Kids Galaxy',
    waiting: 'En attente d’une planète…',
    drawHint: 'Dessine sur la tablette et lance ta planète dans l’espace\u00a0!',
    orbitHint: '✨ Ta planète tourne autour du soleil et sur elle-même',
    textureFailed: 'Une planète cherche encore son chemin jusqu’ici…',
    newPlanet: 'Une nouvelle planète',
    joinedSky: '{name} a rejoint le ciel\u00a0!',
  },
};

export function projectorCopy(language) {
  return PROJECTOR_MESSAGES[language] || PROJECTOR_MESSAGES.en;
}

export function formatProjectorMessage(language, key, params = {}) {
  const catalog = projectorCopy(language);
  const template = catalog[key] ?? PROJECTOR_MESSAGES.en[key] ?? key;
  return String(template).replaceAll('{name}', params.name ?? '');
}

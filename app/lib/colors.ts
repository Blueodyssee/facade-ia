// Nuancier Gooweb Color — source unique (serveur + analyse).
// Hex mesurés sur les échantillons du dossier /couleurs.
// `recolorPrompt` = description anglaise pour l'IA de recoloriage (jamais exposée au client).

export type PaletteColor = {
  id: string;
  name: string;
  fullName: string;
  hex: string;
  /** Description pour le modèle image — côté serveur uniquement */
  recolorPrompt: string;
};

export const COLORS: PaletteColor[] = [
  {
    id: 'G10',
    name: 'Blanc Lumière',
    fullName: 'G10 Blanc Lumière',
    hex: '#F6F5F3',
    recolorPrompt:
      'opaque bright clean white facade paint, crisp full-coverage white exactly #F6F5F3',
  },
  {
    id: '320',
    name: 'Blanc Cassé',
    fullName: '320 Blanc Cassé',
    hex: '#E2DCD4',
    recolorPrompt:
      'opaque warm off-white cream facade paint, full coverage exactly #E2DCD4, not pure white',
  },
  {
    id: 'J50',
    name: 'Jaune Paille',
    fullName: 'J50 Jaune Paille',
    hex: '#F0CD75',
    recolorPrompt:
      'opaque warm straw yellow facade paint, golden sunny full coverage exactly #F0CD75, not pale',
  },
  {
    id: 'T20',
    name: 'Sable Clair',
    fullName: 'T20 Sable Clair',
    hex: '#DCBE98',
    recolorPrompt:
      'opaque light sandy beige facade paint, warm full coverage exactly #DCBE98',
  },
  {
    id: '190',
    name: 'Beige',
    fullName: '190 Beige',
    hex: '#D6BB9E',
    recolorPrompt:
      'opaque natural warm beige facade paint, full coverage tan tone exactly #D6BB9E',
  },
  {
    id: 'G37',
    name: 'Sable Rosé',
    fullName: 'G37 Sable Rosé',
    hex: '#D8B4A1',
    recolorPrompt:
      'opaque pinkish rosy beige facade paint, sandy pink full coverage exactly #D8B4A1',
  },
  {
    id: 'G16',
    name: 'Gris Nuage',
    fullName: 'G16 Gris Nuage',
    hex: '#BAB8B5',
    recolorPrompt:
      'opaque neutral cloud grey facade paint, medium-light full coverage exactly #BAB8B5, not whitewashed',
  },
  {
    id: 'V59',
    name: 'Vert Sauge',
    fullName: 'V59 Vert Sauge',
    hex: '#ACB28E',
    recolorPrompt:
      'opaque sage green facade paint, dusty grey-green full coverage exactly #ACB28E, keep the green visible and saturated enough, not washed-out',
  },
  {
    id: 'R80',
    name: 'Terre de Sienne',
    fullName: 'R80 Terre de Sienne',
    hex: '#BB633D',
    recolorPrompt:
      'opaque terracotta sienna facade paint, rich earthy brick orange-red full coverage exactly #BB633D, deep and saturated, NOT lightened or pastel',
  },
  {
    id: '0147',
    name: 'Brun Doux',
    fullName: '0147 Brun Doux',
    hex: '#A46B3F',
    recolorPrompt:
      'opaque warm soft brown facade paint, caramel earthy brown full coverage exactly #A46B3F, keep the depth, NOT lightened',
  },
];

export function getColorById(id: string | undefined | null): PaletteColor | undefined {
  if (!id) return undefined;
  return COLORS.find((c) => c.id === id);
}

/** Champs exposés au client (sans recolorPrompt). */
export function toPublicColor(c: PaletteColor, reason: string) {
  return {
    id: c.id,
    name: c.name,
    fullName: c.fullName,
    hex: c.hex,
    reason,
  };
}

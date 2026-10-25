/**
 * Le rythme du Pitch de Notak. Xmind fait tout en multiples de 400 ms, sur des courbes qui démarrent lentement
 * (easeInQuad, easeInOutQuart) et des étapes qui s'attendent : une transition y dure de 1,4 à 2,7 s et rien ne bouge
 * pendant le premier quart de seconde. Notak garde sa grammaire (ce qui bouge, dans quel ordre) mais pas son tempo :
 * des durées plus courtes, des courbes qui partent tout de suite et se posent en douceur, des étapes qui se chevauchent.
 *
 * Toutes les durées et les courbes des transitions viennent d'ici : c'est le seul endroit où régler le mouvement.
 */
export const RYTHME = {
  /** L'unité des entrées des gabarits (la durée de base de Xmind vaut 400). */
  unite: 240,
  /** Le fondu entre deux diapositives sans rapport, et le démarrage. */
  fondu: 300,
  /** L'arrivée sur le sujet central (Xmind : 600). */
  central: 360,
  /** Un pas dans la même diapositive (Xmind : 600). */
  dansLaDiapo: 380,
  /** Le morphing d'une diapositive à l'autre (Xmind : 1 000). */
  morphing: 620,
  /** L'écran de fin paraît, puis s'efface. */
  fin: { apparition: 600, disparition: 240 },
  /** Les entrées qui suivent l'effet commencent quand il en est à cette part, pas à sa fin. */
  chevauchement: 0.6,
  /** Les durées et délais que Xmind donne en ms aux décors des thèmes : on les raccourcit d'autant. */
  facteur: 0.6,
} as const

/** Les courbes, en noms que `courbes.ts` sait lire. */
export const COURBES = {
  /** Ce qui glisse d'une place à l'autre : part vite, se pose longuement. */
  glisse: 'cubicBezier(0.2, 0, 0, 1)',
  /** Le morphing : un rien plus d'élan au départ, pour que le changement de forme se lise. */
  morphing: 'cubicBezier(0.3, 0, 0, 1)',
  /** Ce qui paraît. */
  entree: 'easeOutCubic',
  /** Ce qui s'efface. */
  sortie: 'easeOutQuad',
  /** Deux exemplaires d'un même mot qui se relaient (une graisse, une police qui change). */
  relais: 'easeInOutSine',
  /** Un trait qui se dessine. */
  trait: 'cubicBezier(0.4, 0, 0.2, 1)',
} as const

/**
 * Les courbes lentes de Xmind, telles que les décors des thèmes les nomment, remplacées par les nôtres ; les ressorts,
 * les rebonds et le linéaire restent les leurs.
 */
export function courbeVive(nom: string): string {
  if (/^easeInOut(Quad|Cubic|Quart|Quint|Expo|Sine)$/.test(nom)) return COURBES.glisse
  if (/^easeIn(Quad|Cubic|Quart|Quint|Expo|Sine)$/.test(nom)) return COURBES.entree
  return nom
}

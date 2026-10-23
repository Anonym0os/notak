import { type Point, type Rect, hauteur, largeur } from "../../coeur/geometrie";
import { GUIDES, pointAncre } from "../../coeur/lignes";

/** Un guide s'allume quand le pointeur entre dans cette part de la largeur et de la hauteur autour de lui. */
export const ZONE_GUIDE = 0.3;

/** Les guides qui s'allument pour un pointeur en `p` sur `r` (indices de `GUIDES`). */
export function guidesAllumes(r: Rect, p: Point): number[] {
  const [l, h] = [largeur(r), hauteur(r)];
  return GUIDES.flatMap((g, i) => {
    const c = pointAncre(r, g);
    return Math.abs(p.x - c.x) <= (l * ZONE_GUIDE) / 2 && Math.abs(p.y - c.y) <= (h * ZONE_GUIDE) / 2 ? [i] : [];
  });
}

/**
 * Les huit repères d'accroche d'un élément en mode dedans : un disque blanc de 8 px à anneau gris, éteint tant
 * que le pointeur n'est pas dans sa zone. `vers` place un point du tableau dans le dessin ; `inverse` garde leur
 * taille à l'écran quel que soit le zoom (1 quand le dessin est déjà en pixels d'écran).
 */
export function Guides({ rect, p, vers, inverse }: { rect: Rect; p: Point; vers(q: Point): Point; inverse: number }) {
  const allumes = new Set(guidesAllumes(rect, p));
  return (
    <g className="notak-ligne-guides" aria-hidden>
      {GUIDES.map((g, i) => {
        const c = vers(pointAncre(rect, g));
        return (
          <g
            key={`${g.x}:${g.y}`}
            className="notak-ligne-guide"
            data-allume={allumes.has(i) || undefined}
            style={{ transform: `translate(${c.x}px, ${c.y}px) scale(${inverse})` }}
          >
            <circle r={4} />
          </g>
        );
      })}
    </g>
  );
}

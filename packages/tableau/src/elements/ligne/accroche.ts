import type { Id } from "../../coeur/tableau";
import { definition } from "../registre";
import type { ContexteToile } from "../types";

/**
 * Le premier élément (hors lignes) sous le pointeur, sauf la ligne elle-même et l'élément de l'autre bout.
 * Un élément verrouillé refuse l'accroche (`acceptes` : ceux qui l'ont déjà, pour la ligne qui lui est reliée).
 */
export function elementSous(
  x: number,
  y: number,
  interdits: (Id | null)[],
  contexte: ContexteToile,
  acceptes: (Id | null)[] = [],
): Id | null {
  const tableau = contexte.magasin.lire();
  for (const n of document.elementsFromPoint(x, y)) {
    if (!n.closest(".notak-toile")) continue;
    const id = n.closest("[data-id]")?.getAttribute("data-id");
    if (!id || interdits.includes(id)) continue;
    const el = tableau.elements.find((e) => e.id === id);
    if (!el || definition(el.contenu.type)?.calque === "lignes") continue;
    if (el.verrou && !acceptes.includes(id)) continue;
    return id;
  }
  return null;
}

/** Un bout tenu immobile ce temps (ms) au-dessus d'un élément entre dans le « mode dedans ». */
export const DELAI_DEDANS = 500;

/**
 * Le « mode dedans » : un bout tenu immobile ~0,5 s au-dessus d'un élément s'y pose au point précis, au lieu
 * du centre. Le mode reste tant que le bout survole le même élément ; en changer le relance. `quand` est
 * appelé au passage dans le mode, pour redessiner.
 */
export function suiviDedans(quand: () => void) {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  let cible: Id | null = null;
  let actif = false;
  return {
    /** Le bout vient de bouger au-dessus de `sur` (ou du vide). */
    bouger(sur: Id | null) {
      if (sur !== cible) {
        actif = false;
        cible = sur;
      }
      clearTimeout(minuteur);
      if (cible && !actif)
        minuteur = setTimeout(() => {
          actif = true;
          quand();
        }, DELAI_DEDANS);
    },
    actif: () => actif && cible !== null,
    arreter() {
      clearTimeout(minuteur);
      actif = false;
      cible = null;
    },
  };
}

/**
 * Met en valeur l'élément visé par un bout qu'on tire : contour foncé, gris en mode dedans. Un seul à la fois ;
 * `null` éteint.
 */
export function surbrillance(toile: Element | null, id: Id | null, dedans = false): void {
  if (!toile) return;
  for (const n of toile.querySelectorAll("[data-cible-ligne]")) {
    if (id && n.getAttribute("data-id") === id) continue;
    n.removeAttribute("data-cible-ligne");
  }
  if (!id) return;
  for (const n of toile.querySelectorAll(".notak-carte[data-id]"))
    if (n.getAttribute("data-id") === id) n.setAttribute("data-cible-ligne", dedans ? "dedans" : "");
}

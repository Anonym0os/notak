import type { Id } from "../../coeur/tableau";
import { definition } from "../registre";
import type { ContexteToile } from "../types";

/** Le premier élément (hors lignes) sous le pointeur, sauf la ligne elle-même et l'élément de l'autre bout. */
export function elementSous(
  x: number,
  y: number,
  interdits: (Id | null)[],
  contexte: ContexteToile,
): Id | null {
  const tableau = contexte.magasin.lire();
  for (const n of document.elementsFromPoint(x, y)) {
    if (!n.closest(".notak-toile")) continue;
    const id = n.closest("[data-id]")?.getAttribute("data-id");
    if (!id || interdits.includes(id)) continue;
    const el = tableau.elements.find((e) => e.id === id);
    if (el && definition(el.contenu.type)?.calque !== "lignes") return id;
  }
  return null;
}

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PX_PAR_UG, versEcran } from "../../coeur/camera";
import { type Point, centre, point } from "../../coeur/geometrie";
import { TAILLE_POINTE, sommetsFleche, tracer } from "../../coeur/lignes";
import type { Element } from "../../coeur/tableau";
import { definition } from "../registre";
import type { ContexteToile } from "../types";
import { elementSous } from "./accroche";
import { GRIS_LIGNE } from "./couleur";
import { nouvelleLigne } from "./creation";
import { SEUIL_TIRAGE, type Arrivee, arriveeDe, coinPoignee } from "./rapide";

/** Ce qu'on voit pendant le tirage : le trait et sa pointe, en pixels de la toile. */
interface Apercu {
  d: string;
  pointe: string;
}

/**
 * La poignée de la ligne rapide, au coin haut droit de l'élément seul choisi. Posée comme outil commun de la
 * barre de sélection : elle ne paraît donc que lorsque la barre paraît (rien en édition, en glisser, en lecture
 * seule), mais se dessine sur la toile, par un portail, car la barre se centre par une transformation.
 */
export function LigneRapide({ elements, contexte }: { elements: Element[]; contexte: ContexteToile }) {
  const repere = useRef<HTMLSpanElement>(null);
  const [toile, setToile] = useState<HTMLElement | null>(null);
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const fin = useRef<(() => void) | null>(null);
  useLayoutEffect(() => setToile(repere.current?.closest<HTMLElement>(".notak-toile") ?? null), []);
  // Une poignée emportée par un changement de sélection ne laisse pas d'écouteurs derrière elle.
  useEffect(() => () => fin.current?.(), []);

  const source = elements.length === 1 && definition(elements[0]!.contenu.type)?.calque !== "lignes" ? elements[0]! : null;
  const rect = source ? contexte.rect(source.id) : null;

  const commencer = (e: React.PointerEvent) => {
    if (e.button !== 0 || !source || !rect || !toile) return;
    e.preventDefault();
    e.stopPropagation();
    const depart = point(e.clientX, e.clientY);
    let parti = false;
    let arrivee: Arrivee | null = null;
    const ou = (m: { clientX: number; clientY: number }): Point => {
      const t = toile.getBoundingClientRect();
      return contexte.versTableau(point(m.clientX - t.left, m.clientY - t.top));
    };
    const viser = (m: PointerEvent) => {
      const p = ou(m);
      const id = elementSous(m.clientX, m.clientY, [source.id], contexte);
      const rectCible = id ? contexte.rect(id) : null;
      arrivee = arriveeDe(rect, p, id && rectCible ? { id, rect: rectCible } : null, m.shiftKey);
      const taille = TAILLE_POINTE[2] / PX_PAR_UG;
      const trace = arrivee && tracer({ a: centre(rect), b: arrivee.vise, rectA: rect, rectB: arrivee.rect, reculB: taille * 0.85 });
      if (!trace) return setApercu(null);
      const ecran = (q: Point) => {
        const s = versEcran(contexte.camera, q);
        return `${s.x} ${s.y}`;
      };
      setApercu({
        d: `M ${ecran(trace.chemin.a)} L ${ecran(trace.chemin.b)}`,
        pointe: sommetsFleche(trace.fin, trace.versFin, taille).map(ecran).join(", "),
      });
    };
    const bouge = (m: PointerEvent) => {
      if (!parti && Math.hypot(m.clientX - depart.x, m.clientY - depart.y) < SEUIL_TIRAGE) return;
      parti = true;
      viser(m);
    };
    const arreter = () => {
      document.removeEventListener("pointermove", bouge, true);
      document.removeEventListener("pointerup", lache, true);
      document.removeEventListener("keydown", touche, true);
      fin.current = null;
      setApercu(null);
    };
    const lache = () => {
      const pose = parti ? arrivee : null;
      arreter();
      if (!pose) return;
      // La ligne naît choisie, comme celle de l'outil : ses poignées sont tout de suite à portée.
      const ligne = nouvelleLigne({ element: source.id }, pose.extremite);
      contexte.magasin.faire([{ type: "creer", element: ligne }]);
      contexte.choisir([ligne.id]);
    };
    const touche = (k: KeyboardEvent) => {
      if (k.key !== "Escape") return;
      k.stopPropagation();
      arreter();
    };
    document.addEventListener("pointermove", bouge, true);
    document.addEventListener("pointerup", lache, true);
    document.addEventListener("keydown", touche, true);
    fin.current = arreter;
  };

  const coin = rect && versEcran(contexte.camera, coinPoignee(rect));
  return (
    <span ref={repere} hidden>
      {toile &&
        coin &&
        createPortal(
          <>
            <div
              className="notak-ligne-rapide"
              data-tirage={apercu ? "" : undefined}
              style={{ left: coin.x, top: coin.y }}
              title="Glisser pour tirer une ligne"
              onPointerDown={commencer}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <path d="M3 9 L9 3 M4.5 3 H9 V7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </div>
            {apercu && (
              <svg className="notak-ligne-rapide-apercu" aria-hidden>
                <path d={apercu.d} stroke={GRIS_LIGNE} strokeWidth={2} fill="none" />
                <polygon points={apercu.pointe} fill={GRIS_LIGNE} strokeLinejoin="round" />
              </svg>
            )}
          </>,
          toile,
        )}
    </span>
  );
}

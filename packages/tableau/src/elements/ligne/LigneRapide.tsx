import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "../../langue";
import { PX_PAR_UG, versEcran } from "../../coeur/camera";
import { type Point, type Rect, centre, point } from "../../coeur/geometrie";
import { TAILLE_POINTE, sommetsFleche, tracer } from "../../coeur/lignes";
import type { Element, Id } from "../../coeur/tableau";
import { definition } from "../registre";
import type { ContexteToile } from "../types";
import { elementSous, suiviDedans, surbrillance } from "./accroche";
import { GRIS_LIGNE, GRIS_LIGNE_SOMBRE } from "./couleur";
import { Guides } from "./Guides";
import { nouvelleLigne } from "./creation";
import { SEUIL_TIRAGE, type Arrivee, arriveeDe, coinPoignee } from "./rapide";
import { Icone } from '../../icones'

/** Ce qu'on voit pendant le tirage : le trait et sa pointe, en pixels de la toile. */
interface Apercu {
  d: string;
  pointe: string;
  /** Le mode dedans : les repères de l'élément visé, et le pointeur pour allumer le bon. */
  guides: { rect: Rect; p: Point } | null;
  /** Le gris du trait selon le thème. */
  couleur: string;
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

  const estColonne = (id: Id) => contexte.magasin.lire().elements.find((x) => x.id === id)?.contenu.type === "colonne";
  const commencer = (e: React.PointerEvent) => {
    if (e.button !== 0 || !source || !rect || !toile) return;
    e.preventDefault();
    e.stopPropagation();
    const depart = point(e.clientX, e.clientY);
    let parti = false;
    let arrivee: Arrivee | null = null;
    let cibleId: Id | null = null;
    let dernier: { clientX: number; clientY: number; shiftKey: boolean } | null = null;
    const sombre = toile.closest("[data-theme]")?.getAttribute("data-theme") === "sombre";
    const gris = sombre ? GRIS_LIGNE_SOMBRE : GRIS_LIGNE;
    // Tenu immobile ~0,5 s au-dessus d'un élément, le bout entre dans le « mode dedans » (point précis).
    const suivi = suiviDedans(() => dernier && viser(dernier));
    const ou = (m: { clientX: number; clientY: number }): Point => {
      const t = toile.getBoundingClientRect();
      return contexte.versTableau(point(m.clientX - t.left, m.clientY - t.top));
    };
    const viser = (m: { clientX: number; clientY: number; shiftKey: boolean }) => {
      const p = ou(m);
      const id = elementSous(m.clientX, m.clientY, [source.id], contexte);
      const rectCible = id ? contexte.rect(id) : null;
      cibleId = id && rectCible ? id : null;
      suivi.bouger(cibleId);
      const dedans = suivi.actif();
      surbrillance(toile, cibleId, dedans);
      arrivee = arriveeDe(rect, p, id && rectCible ? { id, rect: rectCible } : null, m.shiftKey, dedans);
      const taille = TAILLE_POINTE[2] / PX_PAR_UG;
      const trace = arrivee && tracer({ a: centre(rect), b: arrivee.vise, rectA: rect, rectB: arrivee.rect });
      if (!trace) return setApercu(null);
      const ecran = (q: Point) => {
        const s = versEcran(contexte.camera, q);
        return `${s.x} ${s.y}`;
      };
      // La flèche dépasse le point d'arrivée de l'épaisseur du trait, et le trait passe dessous.
      const dehors = 2 / 10;
      const bout = point(trace.fin.x + trace.versFin.x * dehors, trace.fin.y + trace.versFin.y * dehors);
      setApercu({
        d: `M ${ecran(trace.chemin.a)} L ${ecran(trace.chemin.b)}`,
        pointe: sommetsFleche(bout, trace.versFin, taille).map(ecran).join(", "),
        guides: dedans && cibleId && rectCible ? { rect: rectCible, p } : null,
        couleur: gris,
      });
    };
    const bouge = (m: PointerEvent) => {
      if (!parti && Math.hypot(m.clientX - depart.x, m.clientY - depart.y) < SEUIL_TIRAGE) return;
      parti = true;
      dernier = m;
      viser(m);
    };
    const arreter = () => {
      document.removeEventListener("pointermove", bouge, true);
      document.removeEventListener("pointerup", lache, true);
      document.removeEventListener("keydown", touche, true);
      fin.current = null;
      suivi.arreter();
      surbrillance(toile, null);
      setApercu(null);
    };
    const lache = () => {
      const pose = parti ? arrivee : null;
      const deuxColonnes = !!pose && "element" in pose.extremite && estColonne(source.id) && estColonne(pose.extremite.element);
      arreter();
      if (!pose) return;
      // La ligne naît choisie, comme celle de l'outil : ses poignées sont tout de suite à portée.
      const ligne = nouvelleLigne({ element: source.id }, pose.extremite);
      contexte.magasin.faire([{ type: "creer", element: ligne }]);
      // Entre deux colonnes, rien n'est choisi : la ligne se range d'elle-même entre les titres.
      if (!deuxColonnes) contexte.choisir([ligne.id]);
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
              title={t('ligne.glisser')}
              onPointerDown={commencer}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <span className="notak-ligne-rapide-point">
                <Icone nom="ligne" taille={10} trait={2.5} />
              </span>
            </div>
            {apercu && (
              <svg className="notak-ligne-rapide-apercu" aria-hidden>
                <path d={apercu.d} stroke={apercu.couleur} strokeWidth={2} fill="none" />
                <polygon points={apercu.pointe} fill={apercu.couleur} strokeLinejoin="round" />
                {apercu.guides && (
                  <Guides rect={apercu.guides.rect} p={apercu.guides.p} vers={(q) => versEcran(contexte.camera, q)} inverse={1} />
                )}
              </svg>
            )}
          </>,
          toile,
        )}
    </span>
  );
}

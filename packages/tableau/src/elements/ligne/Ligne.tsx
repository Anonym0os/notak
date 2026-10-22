import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { PX_PAR_UG } from "../../coeur/camera";
import { type Point, type Rect, centre, point } from "../../coeur/geometrie";
import {
  TAILLE_POINTE,
  courbeDepuisPoint,
  pointControle,
  sommetsFleche,
  tracer,
} from "../../coeur/lignes";
import {
  type Extremite,
  type Id,
  type Ligne,
  aimanter,
} from "../../coeur/tableau";
import { couleurTexteSur } from "../note/couleurs";
import { definition } from "../registre";
import type { PropsRendu } from "../types";
import { LIBELLE_MAX, couleurDeLigne } from "./couleur";
import { editionLibelle } from "./edition";

type Mesures = { depart: Rect | null; arrivee: Rect | null };
type Geste = { quoi: "depart" | "arrivee" | "courbe"; avant: Ligne };

const idAccroche = (x: Extremite) => ("element" in x ? x.element : null);
const memesRects = (a: Rect | null, b: Rect | null) =>
  a === b ||
  (!!a &&
    !!b &&
    [
      a.min.x - b.min.x,
      a.min.y - b.min.y,
      a.max.x - b.max.x,
      a.max.y - b.max.y,
    ].every((d) => Math.abs(d) < 1e-6));
const px = (p: Point) => `${p.x * PX_PAR_UG} ${p.y * PX_PAR_UG}`;

/** Le premier élément (hors lignes) sous le pointeur, sauf la ligne elle-même et l'élément de l'autre bout. */
function elementSous(
  x: number,
  y: number,
  interdits: (Id | null)[],
  contexte: PropsRendu<Ligne>["contexte"],
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

export function RenduLigne({
  element,
  choisie,
  contexte,
  changer,
}: PropsRendu<Ligne>) {
  const l = element.contenu;
  const [idD, idA] = [idAccroche(l.depart), idAccroche(l.arrivee)];
  const [mesures, setMesures] = useState<Mesures>({
    depart: null,
    arrivee: null,
  });
  const geste = useRef<Geste | null>(null);
  const cordes = useRef<{ a: Point; b: Point } | null>(null);
  const enLibelle = useSyncExternalStore(
    editionLibelle.ecouter,
    () => editionLibelle.courante() === element.id,
  );

  const mesurer = (): Mesures => ({
    depart: idD ? contexte.rect(idD) : null,
    arrivee: idA ? contexte.rect(idA) : null,
  });
  // Le DOM des éléments déplacés n'est à jour qu'après le rendu : on mesure ensuite, et on redessine avant la peinture.
  useLayoutEffect(() => {
    const m = mesurer();
    if (
      !memesRects(m.depart, mesures.depart) ||
      !memesRects(m.arrivee, mesures.arrivee)
    )
      setMesures(m);
  });
  // Une carte qui grandit (texte qui s'écrit) ne redessine pas la toile : on la suit.
  const ancre = useRef<SVGGElement>(null);
  useEffect(() => {
    const toile = ancre.current?.closest(".notak-toile");
    const noeuds = [idD, idA].flatMap((id) =>
      id ? (toile?.querySelector(`[data-id="${CSS.escape(id)}"]`) ?? []) : [],
    );
    if (noeuds.length === 0) return;
    const obs = new ResizeObserver(() => {
      const m = mesurer();
      setMesures((avant) =>
        memesRects(m.depart, avant.depart) &&
        memesRects(m.arrivee, avant.arrivee)
          ? avant
          : m,
      );
    });
    for (const n of noeuds) obs.observe(n);
    return () => obs.disconnect();
  }, [idD, idA]);

  const bout = (x: Extremite, r: Rect | null): Point | null =>
    "element" in x ? (r ? centre(r) : null) : point(x.x, x.y);
  const [a, b] = [
    bout(l.depart, mesures.depart),
    bout(l.arrivee, mesures.arrivee),
  ];
  cordes.current = a && b ? { a, b } : null;
  if (!a || !b) return <g ref={ancre} />;

  const couleur = couleurDeLigne(l);
  const taille = TAILLE_POINTE[l.epaisseur] / PX_PAR_UG;
  const recul = (p: Ligne["pointeDepart"]) =>
    p === "fleche" ? taille * 0.85 : p === "rond" ? taille / 2 : 0;
  const trace = tracer({
    a,
    b,
    rectA: idD ? mesures.depart : null,
    rectB: idA ? mesures.arrivee : null,
    courbe: l.courbe,
    reculA: recul(l.pointeDepart),
    reculB: recul(l.pointeArrivee),
  });
  if (!trace) return <g ref={ancre} />;

  const { chemin } = trace;
  const d = trace.droit
    ? `M ${px(chemin.a)} L ${px(chemin.b)}`
    : `M ${px(chemin.a)} Q ${px(chemin.c)} ${px(chemin.b)}`;
  const controle = pointControle(a, b, l.courbe) ?? trace.milieu;
  const dash =
    l.trait === "tirets"
      ? "5 5"
      : l.trait === "points"
        ? `0.1 ${l.epaisseur * 2 + 2}`
        : undefined;

  const pointe = (
    genre: Ligne["pointeDepart"],
    bout: Point,
    vers: Point,
    cle: string,
  ) => {
    if (genre === "fleche") {
      const pts = sommetsFleche(bout, vers, taille).map(px).join(", ");
      return (
        <polygon key={cle} points={pts} fill={couleur} strokeLinejoin="round" />
      );
    }
    if (genre === "rond") {
      const c = point(
        bout.x - vers.x * (taille / 2),
        bout.y - vers.y * (taille / 2),
      );
      return (
        <circle
          key={cle}
          cx={c.x * PX_PAR_UG}
          cy={c.y * PX_PAR_UG}
          r={(taille / 2) * PX_PAR_UG}
          fill={couleur}
        />
      );
    }
    return null;
  };

  const libelle = l.libelle;
  const enCours = () =>
    (contexte.magasin.lire().elements.find((x) => x.id === element.id)
      ?.contenu as Ligne | undefined) ?? l;

  const poser = (apres: Ligne) =>
    contexte.magasin.appliquerSeulement([
      { type: "contenu", id: element.id, avant: enCours(), apres },
    ]);
  const pointeur = (e: React.PointerEvent): Point => {
    const toile = (e.currentTarget as Element)
      .closest(".notak-toile")!
      .getBoundingClientRect();
    return contexte.versTableau(
      point(e.clientX - toile.left, e.clientY - toile.top),
    );
  };
  const commencer = (quoi: Geste["quoi"]) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    geste.current = { quoi, avant: enCours() };
  };
  const bouger = (e: React.PointerEvent) => {
    const g = geste.current;
    if (!g) return;
    e.stopPropagation();
    const p = pointeur(e);
    if (g.quoi === "courbe") {
      const c = cordes.current;
      if (!c) return;
      const { courbe: _, ...sans } = g.avant;
      const courbe = courbeDepuisPoint(c.a, c.b, p);
      return poser(courbe ? { ...sans, courbe } : sans);
    }
    const autre = idAccroche(
      g.quoi === "depart" ? g.avant.arrivee : g.avant.depart,
    );
    const cible = elementSous(
      e.clientX,
      e.clientY,
      [element.id, autre],
      contexte,
    );
    const [x, y] = aimanter(p);
    poser({ ...g.avant, [g.quoi]: cible ? { element: cible } : { x, y } });
  };
  const finir = (e: React.PointerEvent) => {
    const g = geste.current;
    if (!g) return;
    e.stopPropagation();
    geste.current = null;
    const apres = enCours();
    if (JSON.stringify(apres) !== JSON.stringify(g.avant)) {
      contexte.magasin.inscrire([
        { type: "contenu", id: element.id, avant: g.avant, apres },
      ]);
    }
  };
  const redresser = (e: React.MouseEvent) => {
    e.stopPropagation();
    const { courbe, ...sans } = l;
    if (courbe) changer(sans);
  };
  const prises = {
    onPointerMove: bouger,
    onPointerUp: finir,
    onPointerCancel: finir,
  };
  const [cx, cy] = [controle.x * PX_PAR_UG, controle.y * PX_PAR_UG];

  return (
    <g ref={ancre} className="notak-ligne" data-choisie={choisie || undefined}>
      {choisie && <path className="notak-ligne-halo" d={d} />}
      <path
        className="notak-ligne-trait"
        d={d}
        stroke={couleur}
        strokeWidth={l.epaisseur}
        strokeDasharray={dash}
        strokeLinecap={l.trait === "points" ? "round" : "butt"}
      />
      {pointe(l.pointeDepart, trace.debut, trace.versDebut, "depart")}
      {pointe(l.pointeArrivee, trace.fin, trace.versFin, "arrivee")}
      <path className="notak-ligne-clic" d={d} data-id={element.id} />
      {(libelle || enLibelle) && (
        <foreignObject
          x={cx - 150}
          y={cy - 20}
          width={300}
          height={40}
          className="notak-ligne-libelle-zone"
        >
          {enLibelle ? (
            <ChampLibelle
              ligne={l}
              fini={(texte) => {
                editionLibelle.fermer();
                const { libelle: _, ...sans } = l;
                const propre = texte.trim() ? texte.slice(0, LIBELLE_MAX) : "";
                const apres = propre ? { ...sans, libelle: propre } : sans;
                if (JSON.stringify(apres) !== JSON.stringify(l)) changer(apres);
              }}
            />
          ) : (
            <div className="notak-ligne-boite">
              <div
                className="notak-ligne-libelle"
                data-id={element.id}
                style={{ background: couleur, color: couleurTexteSur(couleur) }}
              >
                {libelle}
              </div>
            </div>
          )}
        </foreignObject>
      )}
      {choisie && (
        <>
          <rect
            className="notak-ligne-poignee"
            data-extremite="depart"
            x={trace.debut.x * PX_PAR_UG - 5}
            y={trace.debut.y * PX_PAR_UG - 5}
            width={10}
            height={10}
            onPointerDown={commencer("depart")}
            {...prises}
          />
          <rect
            className="notak-ligne-poignee"
            data-extremite="arrivee"
            x={trace.fin.x * PX_PAR_UG - 5}
            y={trace.fin.y * PX_PAR_UG - 5}
            width={10}
            height={10}
            onPointerDown={commencer("arrivee")}
            {...prises}
          />
          <circle
            className="notak-ligne-poignee"
            data-extremite="courbe"
            cx={cx}
            cy={cy}
            r={5}
            onPointerDown={commencer("courbe")}
            onDoubleClick={redresser}
            {...prises}
          />
        </>
      )}
    </g>
  );
}

/** Le champ du libellé, posé au point de contrôle. Entrée, Échap ou un clic ailleurs valident. */
function ChampLibelle({
  ligne,
  fini,
}: {
  ligne: Ligne;
  fini(texte: string): void;
}) {
  const [texte, setTexte] = useState(ligne.libelle ?? "");
  const champ = useRef<HTMLInputElement>(null);
  const rendu = useRef(false);
  const couleur = couleurDeLigne(ligne);
  useEffect(() => {
    champ.current?.focus({ preventScroll: true });
    champ.current?.select();
  }, []);
  const valider = (rendreLaMain: boolean) => {
    if (rendu.current) return;
    rendu.current = true;
    const toile = champ.current?.closest<HTMLElement>(".notak-toile");
    fini(texte);
    if (rendreLaMain) toile?.focus({ preventScroll: true });
  };
  return (
    <div className="notak-ligne-boite">
      <input
        ref={champ}
        className="notak-ligne-champ"
        data-edition
        value={texte}
        maxLength={LIBELLE_MAX}
        aria-label="Libellé"
        style={{ background: couleur, color: couleurTexteSur(couleur) }}
        onChange={(e) => setTexte(e.target.value)}
        onBlur={() => valider(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            valider(true);
          }
        }}
      />
    </div>
  );
}

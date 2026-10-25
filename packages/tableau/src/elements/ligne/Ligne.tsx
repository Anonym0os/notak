import { t } from "../../langue";
import { createPortal } from "react-dom";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { PX_PAR_UG } from "../../coeur/camera";
import { type Point, type Rect, contient, point } from "../../coeur/geometrie";
import {
  LONGUEUR_POSE,
  TAILLE_POINTE,
  aimanterAngle,
  aimanterAuto,
  ancreDedans,
  auMoins,
  courbeDepuisPoint,
  courbeGardee,
  elargir,
  longueurMin,
  pointCourbe,
  poserExact,
  quadratique,
  sommetsFleche,
  tracer,
  viser,
} from "../../coeur/lignes";
import type { Extremite, Id, Ligne } from "../../coeur/tableau";
import type { PropsRendu } from "../types";
import { LIBELLE_MAX, couleurDeLigne, couleurTexteLibelle, libelleVisible } from "./couleur";
import { elementSous, suiviDedans, surbrillance } from "./accroche";
import { editionLibelle } from "./edition";
import { Guides } from "./Guides";
import { suivreLesVols } from "../../envol";
import { useSombre } from "../../themeVivant";

type Mesures = { depart: Rect | null; arrivee: Rect | null };
type Geste = {
  quoi: "depart" | "arrivee" | "courbe";
  avant: Ligne;
  /** Le geste a pris le libellé : un simple clic (sans mouvement) ouvre alors son édition. */
  libelle?: boolean;
  bouge: boolean;
  depart: Point;
  /** Où le bout lâché s'accrochera, si le pointeur est sur un élément (hors mode dedans). */
  cible: Id | null;
};

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
  // Une carte qu'on glisse bouge sans rendu React : la ligne la suit à chaque image du vol.
  useEffect(
    () =>
      suivreLesVols((noeud) => {
        const porte = (id: Id | null) =>
          !!id && (noeud.dataset.id === id || !!noeud.querySelector(`[data-id="${CSS.escape(id)}"]`));
        if (!porte(idD) && !porte(idA)) return;
        const m = mesurer();
        setMesures((avant) =>
          memesRects(m.depart, avant.depart) && memesRects(m.arrivee, avant.arrivee) ? avant : m,
        );
      }),
    [idD, idA],
  );

  // Le thème sombre éclaircit le gris par défaut du trait.
  const sombre = useSombre(ancre, "[data-theme]");
  const [enGeste, setEnGeste] = useState(false);
  const [guides, setGuides] = useState<{ rect: Rect; p: Point } | null>(null);
  const dernier = useRef<{ x: number; y: number; maj: boolean } | null>(null);
  const rejouer = useRef<(() => void) | null>(null);
  // Le bout tenu immobile ~0,5 s au-dessus d'un élément entre dans le « mode dedans ».
  const suivi = useRef<ReturnType<typeof suiviDedans>>(null as never);
  suivi.current ??= suiviDedans(() => rejouer.current?.());
  useEffect(
    () => () => {
      suivi.current.arreter();
      contexte.arreterBord?.();
    },
    [],
  );
  // Les poignées vont dans le calque du dessus, pour qu'une ligne passée derrière une carte reste prenable.
  const [haut, setHaut] = useState<Element | null>(null);
  // Verrouillée ou en lecture seule, une ligne ne se remodèle pas.
  const inerte = !!element.verrou || !!contexte.services?.lectureSeule;
  useLayoutEffect(() => {
    const calque = ancre.current?.closest(".notak-plan")?.querySelector(".notak-calque-poignees") ?? null;
    if (calque !== haut) setHaut(calque);
  });

  const estColonne = (id: Id | null) =>
    !!id && contexte.magasin.lire().elements.find((e) => e.id === id)?.contenu.type === "colonne";
  // Les points visés : centres des éléments, ou le point précis où un bout s'accroche ; deux colonnes alignées
  // se relient d'un trait horizontal à la hauteur de leurs titres.
  const visee = viser(l.depart, l.arrivee, mesures, estColonne(idD) && estColonne(idA));
  cordes.current = visee && { a: visee.a, b: visee.b };
  if (!visee) return <g ref={ancre} />;
  // En présentation, une ligne reliée à un commentaire ne se montre pas.
  if (contexte.services?.presentation) {
    const tout = contexte.magasin.lire().elements;
    if ([idD, idA].some((id) => !!id && tout.find((x) => x.id === id)?.contenu.type === "commentaire"))
      return <g ref={ancre} />;
  }
  const { a, b } = visee;

  const couleur = couleurDeLigne(l, sombre);
  // Les épaisseurs suivent la grille : 1, 2 ou 4 px à la grande grille, un peu moins à la petite.
  const echelleGrille = PX_PAR_UG / 10;
  const epaisseur = l.epaisseur * echelleGrille;
  const taille = TAILLE_POINTE[l.epaisseur] / PX_PAR_UG;
  // Le trait s'arrête 1 px avant le bord de l'élément.
  const marge = 1 / PX_PAR_UG;
  const entree = {
    a,
    b,
    rectA: visee.rectA && elargir(visee.rectA, marge),
    rectB: visee.rectB && elargir(visee.rectB, marge),
    courbe: l.courbe,
  };
  // Un bout posé dans l'élément de l'autre (ou deux éléments l'un sur l'autre) : rien ne dépasse des bords.
  // La ligne se dessine alors de centre à centre, pour rester visible et se laisser prendre.
  const trace = tracer(entree) ?? tracer({ ...entree, rectA: null, rectB: null });
  if (!trace) return <g ref={ancre} />;
  // Trop courte pour loger ses pointes, une ligne reliée à un élément ne se montre pas.
  const visible = Math.hypot(trace.fin.x - trace.debut.x, trace.fin.y - trace.debut.y);
  if ((idD || idA) && visible < longueurMin(l.pointeDepart, l.pointeArrivee)) return <g ref={ancre} />;

  const { chemin } = trace;
  const d = trace.droit
    ? `M ${px(chemin.a)} L ${px(chemin.b)}`
    : `M ${px(chemin.a)} Q ${px(chemin.c)} ${px(chemin.b)}`;
  // La poignée de courbe est sur le trait : au milieu du parcours d'une courbe, au milieu du trait visible sinon.
  const controle = pointCourbe(a, b, l.courbe) ?? trace.milieu;
  const dash =
    l.trait === "tirets"
      ? "5 5"
      : l.trait === "points"
        ? `0.1 ${l.epaisseur * 2 + 2}`
        : undefined;
  // La partie du tracé cachée dans les éléments reliés réapparaît en points légers quand la ligne est choisie
  // ou qu'on la remodèle.
  const q = quadratique(a, b, l.courbe);
  const fantome = `M ${px(q.a)} Q ${px(q.c)} ${px(q.b)}`;

  // Une flèche est un triangle plein, aussi large que long, dont la pointe dépasse le point d'arrivée de
  // l'épaisseur du trait ; le trait n'est pas raccourci, il passe dessous. Sans pointe, le bout est arrondi.
  const pointe = (
    genre: Ligne["pointeDepart"],
    bout: Point,
    vers: Point,
    cle: string,
  ) => {
    if (genre === "fleche") {
      const dehors = l.epaisseur / 10;
      const pointeur = point(bout.x + vers.x * dehors, bout.y + vers.y * dehors);
      const pts = sommetsFleche(pointeur, vers, taille).map(px).join(", ");
      return <polygon key={cle} points={pts} fill={couleur} strokeLinejoin="round" />;
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
    return <circle key={cle} cx={bout.x * PX_PAR_UG} cy={bout.y * PX_PAR_UG} r={epaisseur / 2} fill={couleur} />;
  };

  const libelle = l.libelle;
  const montreLibelle = libelleVisible(l) && !enLibelle;
  const enCours = () =>
    (contexte.magasin.lire().elements.find((x) => x.id === element.id)
      ?.contenu as Ligne | undefined) ?? l;

  const poser = (apres: Ligne) =>
    contexte.magasin.appliquerSeulement([
      { type: "contenu", id: element.id, avant: enCours(), apres },
    ]);
  const toileDe = () => ancre.current?.closest<HTMLElement>(".notak-toile") ?? null;
  const ou = (clientX: number, clientY: number): Point => {
    const toile = toileDe()!.getBoundingClientRect();
    return contexte.versTableau(point(clientX - toile.left, clientY - toile.top));
  };
  const commencer = (quoi: Geste["quoi"], libelleGeste = false) => (e: React.PointerEvent) => {
    // Une ligne verrouillée, ou un tableau en lecture seule : les poignées sont inertes.
    if (inerte) return;
    // Le libellé ne se prend que sur une ligne déjà choisie : le premier clic la choisit.
    if (libelleGeste && !choisie) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    geste.current = {
      quoi,
      avant: enCours(),
      libelle: libelleGeste,
      bouge: false,
      depart: point(e.clientX, e.clientY),
      cible: null,
    };
    // Une ligne qu'on remodèle montre ses guides de fantôme jusqu'au lâcher.
    setEnGeste(true);
  };
  /** Déplace le bout ou la courbe tenus vers ce point de l'écran. */
  const deplacer = (clientX: number, clientY: number, maj: boolean) => {
    const g = geste.current;
    if (!g) return;
    const p = ou(clientX, clientY);
    if (g.quoi === "courbe") {
      const c = cordes.current;
      if (!c) return;
      const { courbe: _, ...sans } = g.avant;
      const courbe = courbeDepuisPoint(c.a, c.b, p);
      return poser(courbe ? { ...sans, courbe } : sans);
    }
    const fixeLibre = g.quoi === "depart" ? g.avant.arrivee : g.avant.depart;
    const autre = idAccroche(fixeLibre);
    let cible = elementSous(clientX, clientY, [element.id, autre], contexte, [idAccroche(g.avant[g.quoi])]);
    // Pas d'accroche à l'élément qui contient déjà l'autre bout : la ligne n'aurait rien à montrer.
    const rectCible = cible && "x" in fixeLibre ? contexte.rect(cible) : null;
    if (rectCible && "x" in fixeLibre && contient(rectCible, point(fixeLibre.x, fixeLibre.y))) cible = null;
    const rectSur = cible ? (rectCible ?? contexte.rect(cible)) : null;
    suivi.current.bouger(cible);
    const dedans = !!cible && !!rectSur && suivi.current.actif();
    surbrillance(toileDe(), cible, dedans);
    setGuides(dedans && rectSur ? { rect: rectSur, p } : null);
    g.cible = cible;
    // Mode dedans : le bout se pose au point précis, collé à l'élément, et la ligne part vraiment de là.
    if (dedans && cible && rectSur) {
      const ancrePrecise = ancreDedans(rectSur, p);
      return poser({ ...g.avant, [g.quoi]: { element: cible, ...(ancrePrecise ? { ancre: ancrePrecise } : {}) } });
    }
    // Sinon le bout suit le curseur à la lettre ; il ne s'accroche qu'au lâcher. L'autre bout, là où on le
    // voit : Maj cale la ligne sur 45°, et sans Maj un trait presque droit se redresse ; elle ne devient jamais
    // trop courte.
    const fixe = cordes.current && (g.quoi === "depart" ? cordes.current.b : cordes.current.a);
    let libre = p;
    if (fixe) {
      if (maj) libre = aimanterAngle(fixe, libre);
      else if (!cible && "x" in fixeLibre && !g.avant.courbe) libre = aimanterAuto(fixe, libre, PX_PAR_UG);
      libre = auMoins(fixe, libre, longueurMin(g.avant.pointeDepart, g.avant.pointeArrivee));
    }
    const { x, y } = poserExact(libre);
    poser({ ...g.avant, [g.quoi]: { x, y } });
  };
  rejouer.current = () => {
    const m = dernier.current;
    if (m) deplacer(m.x, m.y, m.maj);
  };
  const bouger = (e: React.PointerEvent) => {
    const g = geste.current;
    if (!g) return;
    e.stopPropagation();
    if (!g.bouge && Math.hypot(e.clientX - g.depart.x, e.clientY - g.depart.y) < 3) return;
    g.bouge = true;
    dernier.current = { x: e.clientX, y: e.clientY, maj: e.shiftKey };
    deplacer(e.clientX, e.clientY, e.shiftKey);
    // Près d'un bord de la vue, elle défile et le bout tenu suit.
    contexte.suivreBord?.({ clientX: e.clientX, clientY: e.clientY }, () => rejouer.current?.());
  };
  const finir = (e: React.PointerEvent) => {
    const g = geste.current;
    if (!g) return;
    e.stopPropagation();
    geste.current = null;
    contexte.arreterBord?.();
    setEnGeste(false);
    setGuides(null);
    surbrillance(toileDe(), null);
    const dedans = suivi.current.actif();
    suivi.current.arreter();
    dernier.current = null;
    // Un clic sur le libellé d'une ligne déjà choisie ouvre son édition.
    if (g.libelle && !g.bouge) return editionLibelle.ouvrir(element.id);
    if (g.quoi !== "courbe" && g.bouge) {
      let fin = enCours();
      // Lâché sur un élément (hors mode dedans), le bout s'accroche à son centre.
      if (g.cible && !dedans) {
        const vue = cordes.current;
        const avant = fin;
        fin = { ...fin, [g.quoi]: { element: g.cible } };
        // La courbe garde la forme qu'on voyait : sa poignée reste où elle était, la corde change.
        if (avant.courbe && vue) {
          const rects = {
            depart: "element" in fin.depart ? contexte.rect(fin.depart.element) : null,
            arrivee: "element" in fin.arrivee ? contexte.rect(fin.arrivee.element) : null,
          };
          const nouvelle = viser(fin.depart, fin.arrivee, rects);
          if (nouvelle) {
            const { courbe: _, ...sans } = fin;
            const courbe = courbeGardee(vue, avant.courbe, nouvelle);
            fin = courbe ? { ...sans, courbe } : sans;
          }
        }
      }
      // Deux bouts libres : la ligne fait au moins 4 UG, le bout tenu est repoussé s'il le faut.
      const [tenu, autre] = g.quoi === "depart" ? [fin.depart, fin.arrivee] : [fin.arrivee, fin.depart];
      if ("x" in tenu && "x" in autre) {
        const repousse = poserExact(auMoins(point(autre.x, autre.y), point(tenu.x, tenu.y), LONGUEUR_POSE));
        fin = { ...fin, [g.quoi]: { x: repousse.x, y: repousse.y } };
      }
      poser(fin);
    }
    const apres = enCours();
    if (JSON.stringify(apres) !== JSON.stringify(g.avant)) {
      contexte.magasin.inscrire([
        { type: "contenu", id: element.id, avant: g.avant, apres },
      ]);
    }
  };
  const redresser = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (inerte) return;
    const { courbe, ...sans } = l;
    if (courbe) changer(sans);
  };
  const prises = {
    onPointerMove: bouger,
    onPointerUp: finir,
    onPointerCancel: finir,
  };
  const [cx, cy] = [controle.x * PX_PAR_UG, controle.y * PX_PAR_UG];
  const accrocheD = !!idD;
  const accrocheA = !!idA;

  const surDessus = (
    <>
      {(choisie || enGeste) && guides && (
        <Guides rect={guides.rect} p={guides.p} vers={(q) => point(q.x * PX_PAR_UG, q.y * PX_PAR_UG)} inverse={1 / contexte.camera.echelle} />
      )}
      {choisie && (
        <>
          <Poignee quoi="depart" p={trace.debut} accrochee={accrocheD} couleur={couleur} inerte={inerte} onPointerDown={commencer("depart")} {...prises} />
          <Poignee quoi="arrivee" p={trace.fin} accrochee={accrocheA} couleur={couleur} inerte={inerte} onPointerDown={commencer("arrivee")} {...prises} />
          {!montreLibelle && !enLibelle && (
            <Poignee
              quoi="courbe"
              p={point(cx / PX_PAR_UG, cy / PX_PAR_UG)}
              couleur={couleur}
              inerte={inerte}
              onPointerDown={commencer("courbe")}
              onDoubleClick={redresser}
              {...prises}
            />
          )}
        </>
      )}
    </>
  );

  return (
    <g ref={ancre} className="notak-ligne" data-choisie={choisie || undefined} data-inerte={inerte || undefined}>
      {(choisie || enGeste) && (idD || idA) && <path className="notak-ligne-fantome" d={fantome} stroke={couleur} />}
      <path
        className="notak-ligne-trait"
        d={d}
        stroke={couleur}
        strokeWidth={epaisseur}
        strokeDasharray={dash}
        strokeLinecap={l.trait === "points" ? "round" : "butt"}
      />
      {pointe(l.pointeDepart, trace.debut, trace.versDebut, "depart")}
      {pointe(l.pointeArrivee, trace.fin, trace.versFin, "arrivee")}
      <path className="notak-ligne-clic" d={d} data-id={element.id} onDoubleClick={redresser} />
      {(montreLibelle || enLibelle) && (
        <foreignObject
          x={cx - 100}
          y={cy - 40}
          width={200}
          height={80}
          className="notak-ligne-libelle-zone"
        >
          {enLibelle ? (
            <ChampLibelle
              ligne={l}
              sombre={sombre}
              fini={(texte, deselectionner) => {
                editionLibelle.fermer();
                const propre = texte.trim() ? texte.slice(0, LIBELLE_MAX) : "";
                // Un texte vidé éteint l'étiquette sans perdre l'ancien texte ; un texte neuf la rallume.
                const { libelleMasque: _, ...sans } = l;
                const apres: Ligne = propre ? { ...sans, libelle: propre } : l.libelle ? { ...sans, libelleMasque: true } : sans;
                if (JSON.stringify(apres) !== JSON.stringify(l)) changer(apres);
                if (deselectionner) contexte.choisir([]);
              }}
            />
          ) : (
            <div className="notak-ligne-boite">
              <div
                className="notak-ligne-libelle"
                data-id={element.id}
                data-choisie={choisie || undefined}
                style={{ background: couleur, color: couleurTexteLibelle(couleur, sombre) }}
                onPointerDown={commencer("courbe", true)}
                onDoubleClick={redresser}
                {...prises}
              >
                {libelle}
              </div>
            </div>
          )}
        </foreignObject>
      )}
      {haut ? createPortal(surDessus, haut) : surDessus}
    </g>
  );
}

/**
 * Une poignée : un disque blanc de 8 px à contour léger, de taille constante à l'écran (échelle inverse du zoom),
 * dans une zone de prise de 30 px. Un bout accroché à un élément est plein de la couleur de la ligne, cerclé de
 * blanc ; sur une ligne verrouillée, elle est grise et ne se prend pas.
 */
function Poignee({
  quoi,
  p,
  accrochee = false,
  couleur,
  inerte,
  ...gestes
}: {
  quoi: Geste["quoi"];
  p: Point;
  accrochee?: boolean;
  couleur: string;
  inerte: boolean;
} & React.SVGProps<SVGGElement>) {
  const [x, y] = [p.x * PX_PAR_UG, p.y * PX_PAR_UG];
  return (
    <g
      className="notak-ligne-poignee"
      data-extremite={quoi}
      data-accrochee={accrochee || undefined}
      data-inerte={inerte || undefined}
      style={{ transform: `translate(${x}px, ${y}px) scale(var(--notak-zoom-inverse, 1))` }}
      {...gestes}
    >
      <circle className="notak-ligne-poignee-prise" r={15} />
      <circle className="notak-ligne-poignee-disque" r={4} style={accrochee && !inerte ? { fill: couleur } : undefined} />
    </g>
  );
}

/**
 * Le champ du libellé, en place : il garde la position et la taille de l'étiquette, sur fond blanc. Entrée valide
 * et désélectionne la ligne ; Alt, Cmd ou Ctrl + Entrée, Échap ou un clic ailleurs valident et la gardent
 * choisie ; Maj + Entrée passe à la ligne ; Retour arrière sur un champ vide en sort.
 */
function ChampLibelle({
  ligne,
  sombre,
  fini,
}: {
  ligne: Ligne;
  sombre: boolean;
  fini(texte: string, deselectionner: boolean): void;
}) {
  const [texte, setTexte] = useState(() => {
    const premiere = editionLibelle.prendrePremiere();
    return premiere ?? ligne.libelle ?? "";
  });
  const champ = useRef<HTMLTextAreaElement>(null);
  const rendu = useRef(false);
  const ajuster = () => {
    const c = champ.current;
    if (!c) return;
    c.style.height = "0";
    c.style.height = `${c.scrollHeight}px`;
  };
  useEffect(() => {
    const c = champ.current;
    c?.focus({ preventScroll: true });
    // Le caractère tapé pour ouvrir l'édition remplace le texte et s'écrit à la suite ; sinon tout est choisi.
    if (c && texte !== (ligne.libelle ?? "")) c.setSelectionRange(texte.length, texte.length);
    else c?.select();
  }, []);
  useLayoutEffect(ajuster, [texte]);
  const valider = (rendreLaMain: boolean, deselectionner = false) => {
    if (rendu.current) return;
    rendu.current = true;
    const toile = champ.current?.closest<HTMLElement>(".notak-toile");
    fini(texte, deselectionner);
    if (rendreLaMain) toile?.focus({ preventScroll: true });
  };
  return (
    <div className="notak-ligne-boite">
      <textarea
        ref={champ}
        className="notak-ligne-champ"
        data-edition
        data-sombre={sombre || undefined}
        rows={1}
        value={texte}
        maxLength={LIBELLE_MAX}
        placeholder={t('ligne.libelle')}
        aria-label={t('ligne.libelle')}
        onChange={(e) => setTexte(e.target.value)}
        onBlur={() => valider(false)}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && e.shiftKey) return;
          if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            valider(true, e.key === "Enter" && !(e.altKey || e.metaKey || e.ctrlKey));
          } else if (e.key === "Backspace" && texte === "") {
            e.preventDefault();
            valider(true);
          }
        }}
      />
    </div>
  );
}

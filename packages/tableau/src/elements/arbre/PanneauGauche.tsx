import { useMemo, useState } from 'react'
import { type Arbre, type Id } from '../../coeur/tableau'
import { Icone } from '../../icones'
import { t } from '../../langue'
import { Recherche, Segments } from '../../communs'
import { Case } from '../../communs'
import { Deroulant, Entree } from './Fenetre'
import { Marqueur } from './marqueurs'
import { type OptionsRecherche, contient, notesDe, notesFiltrees, reperesDe } from './modele/listes'
import { type Lecture, enfantsDe } from './modele/sujets'

/**
 * Le panneau de gauche de la carte ouverte, comme le panneau de navigation de Xmind (docs/XMIND.md § 11) : une carte
 * flottante de 378 de large, trois onglets en capsule. Le plan est l'arbre de la carte, qu'on cherche et où l'on
 * saute ; les notes listent celles de tous les sujets ; les étiquettes rassemblent marqueurs, étiquettes et tâches,
 * qu'on coche pour mettre leurs sujets en évidence dans la carte.
 */

export type OngletGauche = 'plan' | 'notes' | 'etiquettes'
export const ONGLETS_GAUCHE: readonly OngletGauche[] = ['plan', 'notes', 'etiquettes']

interface Props {
  onglet: OngletGauche
  choisirOnglet(o: OngletGauche): void
  fermer(): void
  arbre: Arbre
  lecture: Lecture
  /** Les sujets choisis dans la carte. */
  choisis: ReadonlySet<Id>
  /** Choisit ce sujet et y centre la carte. */
  aller(id: Id): void
  /** Les repères cochés (`marqueur:…`, `etiquette:…`, `tache:…`), dont les sujets sont mis en évidence. */
  coches: ReadonlySet<string>
  cocher(cle: string): void
}

/** Le panneau : l'en-tête (onglets et croix) et l'onglet ouvert. */
export function PanneauGauche({ onglet, choisirOnglet, fermer, arbre, lecture, choisis, aller, coches, cocher }: Props) {
  return (
    <aside
      className="notak-arbre-gauche"
      aria-label={t('arbre.gauche.titre')}
      onKeyDown={(e) => {
        // Les touches du panneau lui restent : la carte n'y voit pas des gestes. Échap le ferme sans fermer la carte.
        e.stopPropagation()
        if (e.key === 'Escape') {
          e.preventDefault()
          const champ = e.target instanceof HTMLInputElement && e.target.type === 'search' ? e.target : null
          if (champ?.value) return
          fermer()
        }
      }}
    >
      <header className="notak-arbre-gauche-entete">
        <Segments
          mode="onglets"
          large
          className="notak-arbre-gauche-onglets"
          options={ONGLETS_GAUCHE.map((o) => ({ valeur: o, libelle: t(`arbre.gauche.${o}`), titre: t(`arbre.gauche.${o}Info`) }))}
          valeur={onglet}
          onChange={choisirOnglet}
        />
        <button type="button" className="notak-arbre-gauche-fermer" aria-label={t('arbre.gauche.fermer')} title={t('arbre.gauche.fermer')} onClick={fermer}>
          <Icone nom="fermer" taille={18} trait={1.6} />
        </button>
      </header>
      <div className="notak-arbre-gauche-corps" role="tabpanel">
        {onglet === 'plan' && <OngletPlanGauche arbre={arbre} lecture={lecture} choisis={choisis} aller={aller} />}
        {onglet === 'notes' && <OngletNotes lecture={lecture} aller={aller} />}
        {onglet === 'etiquettes' && <OngletEtiquettes lecture={lecture} coches={coches} cocher={cocher} />}
      </div>
    </aside>
  )
}

/** Le champ de recherche des onglets : une loupe, le texte, et au besoin le bouton des options. */
function ChampRecherche({ valeur, change, info, options }: { valeur: string; change(v: string): void; info: string; options?: React.ReactNode }) {
  return (
    <Recherche className="notak-arbre-gauche-recherche" valeur={valeur} onChange={change} placeholder={info} aria-label={info} fin={options} />
  )
}

const aplatir = (s: string) => s.replace(/\n/g, ' ')

/** Une ligne de l'arbre du plan : sa profondeur, son sujet, et les lignes à icône sous son titre. */
interface LignePlan {
  id: Id
  niveau: number
  enfants: number
}

/** L'onglet Plan : le titre de la feuille, puis l'arbre de la carte, les relations et les limites. */
function OngletPlanGauche({ arbre, lecture: l, choisis, aller }: { arbre: Arbre; lecture: Lecture; choisis: ReadonlySet<Id>; aller(id: Id): void }) {
  const [requete, setRequete] = useState('')
  const [options, setOptions] = useState<OptionsRecherche>({})
  const [replies, setReplies] = useState<ReadonlySet<Id>>(new Set())
  const titre = aplatir(l.sujets.get(l.central)?.titre ?? '') || t('type.arbre')
  const cherche = requete.trim() !== ''

  const lignes = useMemo(() => {
    const sortie: LignePlan[] = []
    const texteDe = (id: Id) => {
      const s = l.sujets.get(id)!
      return [aplatir(s.titre), ...(s.etiquettes ?? []), s.lien ?? ''].join('\n')
    }
    // Avec une recherche, on garde les sujets qui répondent et leurs ancêtres, tout déplié.
    const retenus = new Set<Id>()
    if (cherche) {
      for (const id of l.sujets.keys()) {
        if (!contient(texteDe(id), requete, options)) continue
        for (let x: Id | undefined = id; x !== undefined && !retenus.has(x); x = l.sujets.get(x)?.parent) retenus.add(x)
      }
    }
    const parcourir = (id: Id, niveau: number) => {
      if (cherche && !retenus.has(id)) return
      const fils = [...enfantsDe(l, id), ...l.resumes.filter((r) => l.sujets.get(r)?.parent === id)]
      sortie.push({ id, niveau, enfants: fils.length })
      if (!cherche && replies.has(id)) return
      for (const e of fils) parcourir(e, niveau + 1)
    }
    if (l.central) parcourir(l.central, 0)
    for (const f of l.flottants) parcourir(f, 1)
    return sortie
  }, [l, cherche, requete, options, replies])

  const relations = Object.values(arbre.relations ?? {}).filter((r) => l.sujets.has(r.de) && l.sujets.has(r.vers) && (!cherche || contient(`${r.titre ?? ''}\n${l.sujets.get(r.de)!.titre}\n${l.sujets.get(r.vers)!.titre}`, requete, options)))
  const limites = Object.values(arbre.limites ?? {}).filter((x) => l.sujets.has(x.de) && (!cherche || contient(x.titre ?? '', requete, options)))

  return (
    <>
      <ChampRecherche valeur={requete} change={setRequete} info={t('arbre.gauche.chercherPlan')} options={<OptionsRecherchePanneau options={options} changer={setOptions} />} />
      <div className="notak-arbre-gauche-liste">
        <h2 className="notak-arbre-gauche-feuille">{titre}</h2>
        {cherche && lignes.length === 0 && <p className="notak-arbre-gauche-vide">{t('arbre.gauche.aucunResultat')}</p>}
        <div role="tree" aria-label={t('arbre.gauche.plan')}>
          {lignes.map(({ id, niveau, enfants }) => {
            const s = l.sujets.get(id)!
            const replie = !cherche && replies.has(id)
            return (
              <div key={id} className="notak-arbre-gauche-plan-noeud" role="treeitem" aria-level={niveau + 1} aria-expanded={enfants ? !replie : undefined} aria-selected={choisis.has(id)} style={{ paddingLeft: niveau * 16 }}>
                <div className="notak-arbre-gauche-plan-ligne" data-choisi={choisis.has(id) ? '' : undefined}>
                  <button
                    type="button"
                    className="notak-arbre-gauche-plan-pli"
                    tabIndex={-1}
                    disabled={!enfants || cherche}
                    aria-label={replie ? t('arbre.gauche.deplier') : t('arbre.gauche.replier')}
                    onClick={() => setReplies((r) => (r.has(id) ? new Set([...r].filter((x) => x !== id)) : new Set([...r, id])))}
                  >
                    {enfants ? <Icone nom="chevronBas" taille={12} trait={2} className={replie ? 'notak-arbre-plan-ferme' : undefined} /> : null}
                  </button>
                  <button type="button" className="notak-arbre-gauche-plan-titre" data-niveau={Math.min(niveau, 2)} onClick={() => aller(id)}>
                    {aplatir(s.titre) || t('arbre.vide')}
                  </button>
                  {s.note && <Icone nom="notes" taille={14} trait={1.6} className="notak-arbre-gauche-plan-picto" />}
                </div>
                {!!s.etiquettes?.length && (
                  <div className="notak-arbre-gauche-plan-detail">
                    <Icone nom="etiquette" taille={13} trait={1.6} />
                    <span>{s.etiquettes.join(', ')}</span>
                  </div>
                )}
                {s.lien && (
                  <div className="notak-arbre-gauche-plan-detail">
                    <Icone nom="lien" taille={13} trait={1.6} />
                    <span>{s.lien.startsWith('sujet:') ? aplatir(l.sujets.get(s.lien.slice(6))?.titre ?? '') : s.lien}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {relations.length > 0 && (
          <section className="notak-arbre-gauche-plan-groupe">
            <h3>{t('arbre.gauche.relations')}</h3>
            {relations.map((r, i) => (
              <button key={i} type="button" className="notak-arbre-gauche-plan-detail notak-arbre-gauche-plan-saut" onClick={() => aller(r.de)}>
                <Icone nom="arbreRelation" taille={14} trait={1.6} />
                <span>
                  {aplatir(l.sujets.get(r.de)!.titre)} → {aplatir(l.sujets.get(r.vers)!.titre)}
                  {r.titre ? ` (${r.titre})` : ''}
                </span>
              </button>
            ))}
          </section>
        )}
        {limites.length > 0 && (
          <section className="notak-arbre-gauche-plan-groupe">
            <h3>{t('arbre.gauche.limites')}</h3>
            {limites.map((x, i) => (
              <button key={i} type="button" className="notak-arbre-gauche-plan-detail notak-arbre-gauche-plan-saut" onClick={() => aller(x.de)}>
                <Icone nom="arbreLimite" taille={14} trait={1.6} />
                <span>{x.titre || aplatir(l.sujets.get(x.de)!.titre)}</span>
              </button>
            ))}
          </section>
        )}
      </div>
    </>
  )
}

/** Le bouton à engrenage du champ de recherche : « mots entiers » et « respecter la casse ». */
function OptionsRecherchePanneau({ options, changer }: { options: OptionsRecherche; changer(o: OptionsRecherche): void }) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <span className="notak-arbre-gauche-options">
      <button type="button" aria-haspopup="menu" aria-expanded={ouvert} aria-label={t('arbre.gauche.options')} title={t('arbre.gauche.options')} onClick={() => setOuvert((o) => !o)}>
        <Icone nom="reglages" taille={16} trait={1.6} />
      </button>
      <Deroulant ouvert={ouvert} fermer={() => setOuvert(false)} alignement="fin" className="notak-arbre-gauche-menu">
        <Entree icone="texte" libelle={t('arbre.gauche.motsEntiers')} coche={!!options.motsEntiers} onClick={() => changer({ ...options, motsEntiers: !options.motsEntiers })} />
        <Entree icone="gras" libelle={t('arbre.gauche.casse')} coche={!!options.casse} onClick={() => changer({ ...options, casse: !options.casse })} />
      </Deroulant>
    </span>
  )
}

/** L'onglet Notes : toutes les notes de la carte, sous le titre de la feuille ; un clic va au sujet. */
function OngletNotes({ lecture: l, aller }: { lecture: Lecture; aller(id: Id): void }) {
  const [requete, setRequete] = useState('')
  const [options, setOptions] = useState<OptionsRecherche>({})
  const toutes = useMemo(() => notesDe(l), [l])
  const notes = useMemo(() => notesFiltrees(toutes, requete, options), [toutes, requete, options])
  return (
    <>
      <ChampRecherche valeur={requete} change={setRequete} info={t('arbre.gauche.chercherNotes')} options={<OptionsRecherchePanneau options={options} changer={setOptions} />} />
      <div className="notak-arbre-gauche-liste">
        {toutes.length === 0 ? (
          <Vide icone="notes" texte={t('arbre.gauche.aucuneNote')} />
        ) : notes.length === 0 ? (
          <Vide icone="recherche" texte={t('arbre.gauche.aucunResultat')} />
        ) : (
          <>
            <div className="notak-arbre-gauche-feuille-bandeau">
              <span>{aplatir(l.sujets.get(l.central)?.titre ?? '') || t('type.arbre')}</span>
            </div>
            {notes.map((n) => (
              <button key={n.id} type="button" className="notak-arbre-note-ligne" onClick={() => aller(n.id)}>
                <strong>{n.titre || t('arbre.vide')}</strong>
                <span>{n.texte}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </>
  )
}

function Vide({ icone, texte }: { icone: 'notes' | 'recherche' | 'etiquette'; texte: string }) {
  return (
    <div className="notak-arbre-gauche-vide-grand">
      <Icone nom={icone} taille={60} trait={1} />
      <p>{texte}</p>
    </div>
  )
}

/**
 * L'onglet Étiquettes : les marqueurs, étiquettes et tâches de la carte, chacun avec le nombre de sujets qui le
 * portent. Cocher un repère met ses sujets en évidence dans la carte (le reste s'estompe).
 */
function OngletEtiquettes({ lecture: l, coches, cocher }: { lecture: Lecture; coches: ReadonlySet<string>; cocher(cle: string): void }) {
  const reperes = useMemo(() => reperesDe(l), [l])
  const total = reperes.marqueurs.length + reperes.etiquettes.length + reperes.taches.length
  const ligne = (cle: string, contenu: React.ReactNode, n: number) => (
    <label key={cle} className="notak-arbre-gauche-repere" data-coche={coches.has(cle) ? '' : undefined}>
      <Case option cochee={coches.has(cle)} onChange={() => cocher(cle)} />
      <span className="notak-arbre-gauche-repere-contenu">{contenu}</span>
      <span className="notak-arbre-gauche-repere-nombre">{n}</span>
    </label>
  )
  const groupe = (titre: string, lignes: React.ReactNode[]) => lignes.length > 0 && <section className="notak-arbre-gauche-plan-groupe">
      <h3>{titre}</h3>
      {lignes}
    </section>
  return (
    <div className="notak-arbre-gauche-liste">
      <p className="notak-arbre-gauche-aide">{t('arbre.gauche.etiquettesAide')}</p>
      {total === 0 && <Vide icone="etiquette" texte={t('arbre.gauche.aucunRepere')} />}
      {groupe(
        t('arbre.marqueurs'),
        reperes.marqueurs.map((g) =>
          ligne(
            `marqueur:${g.cle}`,
            <svg width={18} height={18} viewBox="0 0 16 16" aria-label={g.cle}>
              <Marqueur id={g.cle} />
            </svg>,
            g.ids.length,
          ),
        ),
      )}
      {groupe(
        t('arbre.etiquettes'),
        reperes.etiquettes.map((g) => ligne(`etiquette:${g.cle}`, <span>{g.cle}</span>, g.ids.length)),
      )}
      {groupe(
        t('arbre.gauche.taches'),
        reperes.taches.map((g) => ligne(`tache:${g.cle}`, <span>{t(g.cle === 'faite' ? 'arbre.gauche.tacheFaite' : 'arbre.gauche.tacheAFaire')}</span>, g.ids.length)),
      )}
    </div>
  )
}

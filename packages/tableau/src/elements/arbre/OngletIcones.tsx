import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { annoncer } from '../../avis'
import { type Arbre, type Id, nouvelId } from '../../coeur/tableau'
import { Icone } from '../../icones'
import { t } from '../../langue'
import type { ContexteToile } from '../types'
import { AUTOCOLLANTS, DessinIllustration, ILLUSTRATIONS, type GroupeIllustrations, TAILLE_VIGNETTE } from './catalogue'
import { choisirFichiers } from './Insertions'
import { GROUPES_MARQUEURS, Marqueur } from './marqueurs'
import { MenuContextuel } from './MenuContextuel'
import type { Item } from './menus'
import type { Geste } from './modele/gestes'
import { groupesDe, marqueursUtilises } from './modele/insertions'
import type { Lecture } from './modele/sujets'
import type { OngletIcone } from './onglets'

/**
 * Le panneau d'icônes (docs/XMIND.md § 9.1), ouvert par le smiley : Marqueur | Autocollant | Illustration. Les mesures
 * sont celles de Xmind (grille de 7 colonnes de 26 px pour les marqueurs, 4 de 40 pour les autocollants, 3 de 68 pour
 * les illustrations). Cliquer pose sur les sujets choisis, sans fermer le panneau.
 */

interface Props {
  onglet: OngletIcone
  arbre: Arbre
  lecture: Lecture
  /** Les sujets sur lesquels on pose. */
  ids: Id[]
  faire(g: Geste): void
  contexte: ContexteToile
  adresse(fichier: Id): string | undefined
}

/** Les dessins d'icônes de Xmind pèsent 20 Mo au plus : un marqueur à soi aussi. */
const TAILLE_MAX_IMPORT = 20 * 1024 * 1024

export function OngletIcones({ onglet, ...reste }: Props) {
  return (
    <div className="notak-arbre-icones" data-onglet={onglet}>
      {onglet === 'marqueurs' ? <Marqueurs {...reste} /> : onglet === 'autocollants' ? <Autocollants {...reste} /> : <Illustrations {...reste} />}
    </div>
  )
}

/** Un groupe qui se replie : son titre, et sa grille. */
function Repliable({ titre, ouvert, basculer, droite, children, surMenu }: { titre: ReactNode; ouvert: boolean; basculer(): void; droite?: ReactNode; children: ReactNode; surMenu?: (e: React.MouseEvent) => void }) {
  return (
    <section className="notak-arbre-icones-groupe" data-ouvert={ouvert ? '' : undefined}>
      <div className="notak-arbre-icones-entete" onContextMenu={surMenu}>
        <button type="button" aria-expanded={ouvert} onClick={basculer}>
          <span aria-hidden className="notak-arbre-icones-chevron" />
          {titre}
        </button>
        {droite}
      </div>
      {ouvert && children}
    </section>
  )
}

/** L'étiquette d'un marqueur pour qui ne le voit pas : « Priorité 3 », « Drapeau rouge ». Xmind n'a pas d'infobulle ici. */
export function libelleMarqueur(m: string): string {
  const [groupe, reste] = [m.split('-')[0]!, m.slice(m.indexOf('-') + 1)]
  if (groupe === 'priority') return `${t('arbre.icones.g.priority')} ${reste}`
  if (groupe === 'task') return `${t('arbre.icones.g.task')} ${t(`arbre.icones.avancement.${reste}`)}`
  if (groupe === 'symbol') return t(`arbre.icones.symbole.${reste}`)
  return `${t(`arbre.icones.g.${groupe}`)} ${t(`arbre.icones.couleur.${reste}`)}`
}

function Cellule({ marqueur, actif, surClic, surMenu, perso, titre, coche, estompe }: { marqueur: string; actif: boolean; surClic(): void; surMenu?: (e: React.MouseEvent) => void; perso?: (m: string) => string | undefined; titre?: string; coche?: boolean; estompe?: boolean }) {
  return (
    <button type="button" className="notak-arbre-icones-marqueur" aria-pressed={actif} aria-label={titre ?? libelleMarqueur(marqueur)} title={titre} data-perso={perso ? '' : undefined} data-coche={coche ? '' : undefined} data-estompe={estompe ? '' : undefined} onClick={surClic} onContextMenu={surMenu} onMouseDown={(e) => e.preventDefault()}>
      <svg width={22} height={22} viewBox="0 0 16 16" aria-hidden>
        <Marqueur id={marqueur} perso={perso} />
      </svg>
    </button>
  )
}

// — Marqueurs —

function Marqueurs({ arbre, lecture, ids, faire, contexte, adresse }: Omit<Props, 'onglet'>) {
  const sujets = ids.flatMap((x) => lecture.sujets.get(x) ?? [])
  const [replies, setReplies] = useState<ReadonlySet<string>>(new Set())
  const basculer = (cle: string) => setReplies((r) => (r.has(cle) ? new Set([...r].filter((x) => x !== cle)) : new Set([...r, cle])))
  const groupes = groupesDe(arbre)
  const [menu, setMenu] = useState<{ x: number; y: number; items: Item[]; agir(action: string): void } | null>(null)
  const [renommer, setRenommer] = useState<Id | null>(null)
  const [aSupprimer, setASupprimer] = useState<Id | null>(null)
  const [selection, setSelection] = useState<ReadonlySet<string> | null>(null)
  const visible = !!arbre.legende?.visible
  const perso = (m: string) => {
    const id = m.slice(6)
    for (const [, g] of groupes) {
      const x = g.marqueurs.find((y) => y.id === id)
      if (x) return adresse(x.fichier)
    }
    return undefined
  }
  useEffect(() => {
    if (!selection) return
    const echap = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setSelection(null)
    }
    document.addEventListener('keydown', echap, true)
    return () => document.removeEventListener('keydown', echap, true)
  }, [selection])

  const importer = async (groupe: Id) => {
    const fichiers = contexte.services.fichiers
    if (!fichiers) return
    for (const f of await choisirFichiers('image/png,image/jpeg,image/svg+xml', true)) {
      if (f.size > TAILLE_MAX_IMPORT) {
        annoncer({ texte: t('arbre.icones.echecImport') })
        continue
      }
      try {
        faire({ type: 'marqueurPerso', action: 'ajouter', groupe, nom: f.name.replace(/\.[^.]+$/, ''), fichier: await fichiers.enregistrer(f) })
      } catch {
        annoncer({ texte: t('arbre.icones.echecImport') })
      }
    }
  }
  const nouveauGroupe = () => {
    const id = nouvelId()
    faire({ type: 'groupe', action: 'creer', nom: t('arbre.icones.groupeSansTitre'), id })
    setRenommer(id)
  }
  const menuGroupe = (id: Id) => (e: React.MouseEvent) => {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [{ id: 'renommer', libelle: t('arbre.icones.renommer') }, { id: 'supprimer', libelle: t('arbre.icones.supprimer') }],
      agir: (a) => (a === 'renommer' ? setRenommer(id) : setASupprimer(id)),
    })
  }
  const menuMarqueur = (m: string, groupe: Id) => (e: React.MouseEvent) => {
    e.preventDefault()
    const cibles = selection && selection.has(m) ? [...selection] : [m]
    const autres = groupes.filter(([id]) => id !== groupe)
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { id: 'selectionner', libelle: t('arbre.icones.selectionner') },
        { id: 'deplacer', libelle: t('arbre.icones.deplacerVers'), sous: [...autres.map(([id, g]) => ({ id: `deplacer.${id}`, libelle: g.nom })), ...(autres.length ? ['sep' as const] : []), { id: 'deplacer.nouveau', libelle: t('arbre.icones.nouveauGroupe') }] },
        { id: 'supprimer', libelle: t('arbre.icones.supprimer') },
      ],
      agir: (a) => {
        if (a === 'selectionner') return setSelection(new Set([m]))
        if (a === 'supprimer') return (faire({ type: 'marqueurPerso', action: 'supprimer', marqueurs: cibles }), setSelection(null))
        if (a.startsWith('deplacer.')) {
          let vers = a.slice(9)
          if (vers === 'nouveau') {
            vers = nouvelId()
            faire({ type: 'groupe', action: 'creer', nom: t('arbre.icones.groupeSansTitre'), id: vers })
          }
          faire({ type: 'marqueurPerso', action: 'deplacer', marqueurs: cibles, vers })
          setSelection(null)
        }
      },
    })
  }

  return (
    <>
      <button type="button" className="notak-arbre-icones-legende" aria-pressed={visible} title={visible ? undefined : t('arbre.icones.legendeAide')} onClick={() => faire({ type: 'legende' })}>
        {visible ? t('arbre.icones.masquerLegende') : t('arbre.icones.afficherLegende')}
      </button>
      <div className="notak-arbre-icones-defile">
        {GROUPES_MARQUEURS.map((g) => (
          <Repliable key={g.cle} titre={t(`arbre.icones.g.${g.cle}`)} ouvert={!replies.has(g.cle)} basculer={() => basculer(g.cle)}>
            <div className="notak-arbre-icones-grille" data-genre="marqueurs" role="group" aria-label={t(`arbre.icones.g.${g.cle}`)}>
              {g.marqueurs.map((m) => (
                <Cellule key={m} marqueur={m} actif={sujets.length > 0 && sujets.every((s) => s.marqueurs?.includes(m))} surClic={() => faire({ type: 'marqueur', ids, marqueur: m })} />
              ))}
            </div>
          </Repliable>
        ))}
        {groupes.map(([gid, g]) => (
          <Repliable
            key={gid}
            surMenu={menuGroupe(gid)}
            titre={
              renommer === gid ? (
                <NomDeGroupe nom={g.nom} valider={(nom) => (faire({ type: 'groupe', action: 'renommer', id: gid, nom }), setRenommer(null))} annuler={() => setRenommer(null)} />
              ) : (
                <span className="notak-arbre-icones-nom">{g.nom}</span>
              )
            }
            ouvert={!replies.has(gid)}
            basculer={() => basculer(gid)}
            droite={
              <button type="button" className="notak-arbre-icones-plus" aria-label={t('arbre.icones.ajouterMarqueur')} title={t('arbre.icones.ajouterMarqueur')} onClick={() => void importer(gid)}>
                <Icone nom="ajouter" taille={14} />
              </button>
            }
          >
            {aSupprimer === gid && (
              <div className="notak-arbre-icones-confirme" role="alertdialog" aria-label={t('arbre.icones.supprimerGroupe', { nom: g.nom })}>
                <strong>{t('arbre.icones.supprimerGroupe', { nom: g.nom })}</strong>
                <p>{t('arbre.icones.supprimerGroupeAide')}</p>
                <div>
                  <button type="button" onClick={() => setASupprimer(null)}>
                    {t('arbre.icones.annuler')}
                  </button>
                  <button type="button" className="notak-arbre-icones-danger" onClick={() => (faire({ type: 'groupe', action: 'supprimer', id: gid }), setASupprimer(null))}>
                    {t('arbre.icones.supprimer')}
                  </button>
                </div>
              </div>
            )}
            {g.marqueurs.length === 0 ? (
              <p className="notak-arbre-icones-vide">{t('arbre.icones.groupeVide')}</p>
            ) : (
              <div className="notak-arbre-icones-grille" data-genre="marqueurs" role="group" aria-label={g.nom}>
                {g.marqueurs.map((m) => {
                  const id = `perso-${m.id}`
                  const choisi = selection?.has(id) ?? false
                  return (
                    <Cellule
                      key={id}
                      marqueur={id}
                      perso={perso}
                      titre={m.nom}
                      coche={choisi}
                      estompe={!!selection && !choisi}
                      actif={!selection && sujets.length > 0 && sujets.every((s) => s.marqueurs?.includes(id))}
                      surMenu={menuMarqueur(id, gid)}
                      surClic={() => (selection ? setSelection((s) => new Set(s?.has(id) ? [...s].filter((x) => x !== id) : [...(s ?? []), id])) : faire({ type: 'marqueur', ids, marqueur: id }))}
                    />
                  )
                })}
              </div>
            )}
          </Repliable>
        ))}
        {visible && <Legende arbre={arbre} lecture={lecture} faire={faire} perso={perso} />}
      </div>
      <button type="button" className="notak-arbre-icones-pied" onClick={nouveauGroupe}>
        {t('arbre.icones.nouveauGroupe')}
      </button>
      {menu && (
        <MenuContextuel
          x={menu.x}
          y={menu.y}
          items={menu.items}
          choisir={(a) => {
            const agir = menu.agir
            setMenu(null)
            agir(a)
          }}
          fermer={() => setMenu(null)}
        />
      )}
    </>
  )
}

/** Le nom d'un groupe, qu'on écrit sur place : Entrée valide, Échap annule. */
function NomDeGroupe({ nom, valider, annuler }: { nom: string; valider(n: string): void; annuler(): void }) {
  const [v, setV] = useState(nom)
  return (
    <input
      className="notak-arbre-icones-renomme"
      autoFocus
      value={v}
      aria-label={t('arbre.icones.renommer')}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => (v.trim() ? valider(v) : annuler())}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') valider(v)
        else if (e.key === 'Escape') annuler()
      }}
    />
  )
}

/** La légende : ce que veut dire chaque marqueur de la carte, à écrire en face. */
function Legende({ arbre, lecture, faire, perso }: { arbre: Arbre; lecture: Lecture; faire(g: Geste): void; perso(m: string): string | undefined }) {
  const marqueurs = marqueursUtilises(arbre, lecture)
  if (marqueurs.length === 0) return <p className="notak-arbre-icones-vide">{t('arbre.icones.legendeVide')}</p>
  return (
    <section className="notak-arbre-icones-groupe notak-arbre-icones-legende-liste" data-ouvert="">
      <h4>{t('arbre.icones.legende')}</h4>
      {marqueurs.map((m) => (
        <TexteDeLegende key={m} marqueur={m} texte={arbre.legende?.textes?.[m] ?? ''} perso={perso} valider={(texte) => faire({ type: 'legendeTexte', marqueur: m, texte })} />
      ))}
    </section>
  )
}

function TexteDeLegende({ marqueur, texte, perso, valider }: { marqueur: string; texte: string; perso(m: string): string | undefined; valider(t: string): void }) {
  const [v, setV] = useState(texte)
  useEffect(() => setV(texte), [texte])
  const ecrire = () => v !== texte && valider(v)
  return (
    <label className="notak-arbre-icones-ligne-legende">
      <svg width={18} height={18} viewBox="0 0 16 16" aria-hidden>
        <Marqueur id={marqueur} perso={perso} />
      </svg>
      <input
        type="text"
        value={v}
        placeholder={t('arbre.icones.legendeSens')}
        aria-label={`${libelleMarqueur(marqueur.startsWith('perso-') ? 'tag-gray' : marqueur)} : ${t('arbre.icones.legendeSens')}`}
        onChange={(e) => setV(e.target.value)}
        onBlur={ecrire}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') ecrire()
        }}
      />
    </label>
  )
}

// — Autocollants —

function Autocollants({ ids, faire }: Omit<Props, 'onglet'>) {
  const [categorie, setCategorie] = useState('')
  const [replies, setReplies] = useState<ReadonlySet<string>>(new Set())
  const poser = (emoji: string) => faire({ type: 'porter', ids, champ: 'vignette', valeur: { genre: 'autocollant', id: emoji, l: TAILLE_VIGNETTE, h: TAILLE_VIGNETTE } })
  return (
    <>
      <label className="notak-arbre-icones-categorie">
        <span>{t('arbre.icones.categorie')}</span>
        <select value={categorie} onChange={(e) => setCategorie(e.target.value)} aria-label={t('arbre.icones.categorie')}>
          <option value="">{t('arbre.icones.tout')}</option>
          {AUTOCOLLANTS.map((c) => (
            <option key={c.cle} value={c.cle}>
              {t(`arbre.icones.cat.${c.cle}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="notak-arbre-icones-defile">
        {AUTOCOLLANTS.filter((c) => !categorie || c.cle === categorie).map((c) => (
          <Repliable key={c.cle} titre={t(`arbre.icones.cat.${c.cle}`)} ouvert={!replies.has(c.cle)} basculer={() => setReplies((r) => (r.has(c.cle) ? new Set([...r].filter((x) => x !== c.cle)) : new Set([...r, c.cle])))}>
            <div className="notak-arbre-icones-grille" data-genre="autocollants" role="group" aria-label={t(`arbre.icones.cat.${c.cle}`)}>
              {c.emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="notak-arbre-icones-autocollant"
                  aria-label={emoji}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData(TYPE_GLISSE, JSON.stringify({ genre: 'autocollant', id: emoji, l: TAILLE_VIGNETTE, h: TAILLE_VIGNETTE }))}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => poser(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </Repliable>
        ))}
      </div>
    </>
  )
}

/** Le type de donnée qu'un autocollant ou une illustration glissés portent : la carte le reconnaît au lâcher. */
export const TYPE_GLISSE = 'application/x-notak-vignette'

// — Illustrations —

function Illustrations({ ids, faire }: Omit<Props, 'onglet'>) {
  const [recherche, setRecherche] = useState('')
  const [requete, setRequete] = useState('')
  const [groupe, setGroupe] = useState<string | null>(null)
  // La recherche part 200 ms après la dernière frappe.
  useEffect(() => {
    const i = setTimeout(() => setRequete(recherche.trim().toLowerCase()), 200)
    return () => clearTimeout(i)
  }, [recherche])
  const poser = (id: string) => faire({ type: 'porter', ids, champ: 'vignette', valeur: { genre: 'illustration', id, l: TAILLE_VIGNETTE, h: TAILLE_VIGNETTE } })
  const trouvees = useMemo(() => {
    if (!requete) return null
    return ILLUSTRATIONS.filter((g) => !groupe || g.cle === groupe)
      .map((g) => ({ g, illustrations: g.sous.flatMap((s) => s.illustrations.filter((x) => [t(`arbre.icones.ill.${g.cle}`), t(`arbre.icones.ill.${s.cle}`), x.icone.replace(/^ill/, '')].some((m) => m.toLowerCase().includes(requete)))) }))
      .filter((r) => r.illustrations.length > 0)
  }, [requete, groupe])
  const ouvert = groupe ? ILLUSTRATIONS.find((g) => g.cle === groupe) : undefined
  const vignette = (id: string) => (
    <button key={id} type="button" className="notak-arbre-icones-illustration" aria-label={id} draggable onDragStart={(e) => e.dataTransfer.setData(TYPE_GLISSE, JSON.stringify({ genre: 'illustration', id, l: TAILLE_VIGNETTE, h: TAILLE_VIGNETTE }))} onMouseDown={(e) => e.preventDefault()} onClick={() => poser(id)}>
      <svg width={68} height={68} viewBox="0 0 68 68" aria-hidden>
        <DessinIllustration id={id} l={68} h={68} />
      </svg>
    </button>
  )
  return (
    <>
      {ouvert && !requete && (
        <div className="notak-arbre-icones-retour">
          <button type="button" onClick={() => setGroupe(null)} aria-label={t('arbre.icones.retour')}>
            <Icone nom="precedent" taille={14} />
          </button>
          <strong>{t(`arbre.icones.ill.${ouvert.cle}`)}</strong>
        </div>
      )}
      <label className="notak-arbre-icones-recherche">
        <Icone nom="recherche" taille={14} />
        <input type="search" value={recherche} placeholder={t('arbre.icones.chercherIllustrations')} aria-label={t('arbre.icones.chercherIllustrations')} onChange={(e) => setRecherche(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </label>
      <div className="notak-arbre-icones-defile">
        {trouvees ? (
          trouvees.length === 0 ? (
            <p className="notak-arbre-icones-aucun">{t('arbre.icones.aucunResultat')}</p>
          ) : (
            trouvees.map(({ g, illustrations }) => (
              <section key={g.cle} className="notak-arbre-icones-groupe" data-ouvert="">
                <h4>{t(`arbre.icones.ill.${g.cle}`)}</h4>
                <div className="notak-arbre-icones-grille" data-genre="illustrations">
                  {illustrations.map((x) => vignette(x.id))}
                </div>
              </section>
            ))
          )
        ) : ouvert ? (
          <GroupeOuvert groupe={ouvert} vignette={vignette} />
        ) : (
          ILLUSTRATIONS.map((g) => {
            const toutes = g.sous.flatMap((s) => s.illustrations)
            return (
              <section key={g.cle} className="notak-arbre-icones-groupe" data-ouvert="">
                <button type="button" className="notak-arbre-icones-titre-groupe" onClick={() => setGroupe(g.cle)}>
                  <strong>{t(`arbre.icones.ill.${g.cle}`)}</strong>
                  <span>{toutes.length}</span>
                  <Icone nom="chevronDroite" taille={12} />
                </button>
                <div className="notak-arbre-icones-grille" data-genre="illustrations">
                  {toutes.slice(0, 3).map((x) => vignette(x.id))}
                </div>
              </section>
            )
          })
        )}
      </div>
    </>
  )
}

/** Un groupe d'illustrations ouvert : ses sous-catégories, chacune sa grille (le titre disparaît s'il n'y en a qu'une). */
function GroupeOuvert({ groupe, vignette }: { groupe: GroupeIllustrations; vignette(id: string): ReactNode }) {
  return (
    <>
      {groupe.sous.map((s) => (
        <section key={s.cle} className="notak-arbre-icones-groupe" data-ouvert="">
          {groupe.sous.length > 1 && <h4>{t(`arbre.icones.ill.${s.cle}`)}</h4>}
          <div className="notak-arbre-icones-grille" data-genre="illustrations">
            {s.illustrations.map((x) => vignette(x.id))}
          </div>
        </section>
      ))}
    </>
  )
}

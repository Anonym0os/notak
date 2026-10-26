import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { PanneauFlottant, horsPanneau } from '../../PanneauFlottant'
import { COULEURS_NOTE, type CouleurNote, type Element, type Etiquette, annoter } from '../../coeur/tableau'
import { LIBELLES_COULEUR } from '../note/couleurs'
import type { ContexteToile } from '../types'
import {
  NOM_ETIQUETTE_MAX,
  basculerEtiquette,
  colorerEtiquette,
  etatEtiquette,
  etiquetteNommee,
  etiquettesAReprendre,
  nouvelleEtiquette,
  renommerEtiquette,
  supprimerEtiquette,
  texteEtiquette,
} from './annotations'
import { basculerFiltre, useFiltre, viderFiltre } from './etat'
import { changerEtiquettes } from './ecriture'
import { t, tn } from '../../langue'
import { Champ } from '../../communs'
import { Icone } from '../../icones'
import { Case } from '../../communs'

/** Combien d'étiquettes « récentes » on met en tête de la liste. */
const RECENTES = 5

type SousMenu = 'principal' | 'couleur' | 'suppression'

/**
 * Les étiquettes du tableau : un champ cherche et crée (Entrée pose l'étiquette de ce nom, ou la crée et la pose),
 * puis la liste ; un appui n'importe où sur une ligne pose ou ôte l'étiquette (la case n'en est que le témoin). Le
 * « ••• » d'une ligne ouvre, à sa droite, un menu qui la renomme (sur place), la recolore, la supprime (après
 * confirmation) et dit combien d'éléments la portent, avec de quoi filtrer le tableau dessus. Sans sélection on
 * gère seulement ; en lecture seule on lit et on filtre.
 */
export function PanneauEtiquettes({ elements, contexte }: { elements: readonly Element[]; contexte: ContexteToile }) {
  const { magasin } = contexte
  const tableau = useSyncExternalStore(magasin.ecouter, magasin.lire)
  const filtre = useFiltre()
  const [requete, setRequete] = useState('')
  const [menuDe, setMenuDe] = useState<{ id: string; vue: SousMenu } | null>(null)
  const [renommerId, setRenommerId] = useState<string | null>(null)
  const boutons = useRef(new Map<string, HTMLButtonElement>())
  const liste = tableau.etiquettes ?? []
  const ecrire = !contexte.services.lectureSeule

  const changerListe = (vers: Etiquette[]) => changerEtiquettes(contexte, vers)
  const annoterTous = (f: (e: Element) => ReturnType<typeof annoter>) => elements.flatMap((e) => f(e) ?? [])
  const poserSur = (id: string) => annoterTous((e) => annoter(e, { etiquettes: basculerEtiquette(e.etiquettes, id) }))
  const creer = (nom: string) => {
    const et = nouvelleEtiquette(liste, nom)
    if (!et) return
    // Une étiquette créée avec des éléments choisis se pose aussitôt dessus.
    magasin.faire([{ type: 'etiquettes' as const, de: liste, vers: [...liste, et] }, ...poserSur(et.id)])
  }
  // Une étiquette d'un autre tableau de l'espace, reprise ici : même identifiant, donc la même étiquette partout.
  const reprendre = (et: Etiquette) => {
    magasin.faire([{ type: 'etiquettes' as const, de: liste, vers: [...liste, et] }, ...poserSur(et.id)])
  }
  // Tous l'ont : on la leur ôte. Sinon seuls ceux qui ne l'ont pas la reçoivent.
  const poser = (id: string) => {
    const tous = etatEtiquette(elements, id) === 'tous'
    magasin.faire(
      annoterTous((e) => {
        const a = e.etiquettes?.includes(id) ?? false
        return a === tous ? annoter(e, { etiquettes: basculerEtiquette(e.etiquettes, id) }) : null
      }),
    )
  }
  const retirer = (id: string) => {
    const { etiquettes, elements: portent } = supprimerEtiquette(liste, tableau.elements, id)
    magasin.faire([
      { type: 'etiquettes', de: liste, vers: etiquettes },
      ...portent.flatMap((e) => annoter(e, { etiquettes: (e.etiquettes ?? []).filter((x) => x !== id) }) ?? []),
    ])
    if (filtre.has(id)) basculerFiltre(id)
    setMenuDe(null)
  }
  // Entrée : l'étiquette de ce nom si elle existe (posée si elle ne l'est pas déjà partout), sinon une neuve.
  const valider = () => {
    const nom = requete.trim()
    if (!nom || !ecrire) return
    const existante = etiquetteNommee(liste, nom)
    if (existante) {
      if (elements.length > 0 && etatEtiquette(elements, existante.id) !== 'tous') poser(existante.id)
    } else creer(nom)
    setRequete('')
  }

  const cherche = requete.trim().length > 0
  const visibles = cherche ? liste.filter((e) => e.nom.toLocaleLowerCase('fr').includes(requete.trim().toLocaleLowerCase('fr'))) : liste
  // Hors recherche : les cinq dernières créées d'abord, puis le reste dans l'ordre de création.
  const recentes = cherche ? [] : [...liste].reverse().slice(0, RECENTES)
  const autres = cherche ? visibles : liste.filter((e) => !recentes.includes(e))
  const peutCreer = ecrire && cherche && !etiquetteNommee(liste, requete)
  // Celles des autres tableaux (le chemin d'abord) qu'on n'a pas encore ici.
  const ailleurs = ecrire ? etiquettesAReprendre(liste, contexte.services.etiquettesDesAutres?.() ?? [], requete) : []

  const ligne = (et: Etiquette) => {
    const etat = etatEtiquette(elements, et.id)
    const ouvert = menuDe?.id === et.id
    const posable = ecrire && elements.length > 0
    return (
      <li
        key={et.id}
        className="notak-etiquettes-ligne"
        data-ouvert={ouvert || undefined}
        data-posable={posable || undefined}
        onClick={(e) => {
          // La case, le « ••• », le champ du nom et le menu ont leur propre geste.
          if (!posable || renommerId === et.id || (e.target as HTMLElement).closest('input, button, .notak-panneau-flottant')) return
          poser(et.id)
        }}
      >
        {posable && (
          <Case
            option
            tabIndex={-1}
            aria-label={t('etiquettes.poser', { nom: et.nom })}
            cochee={etat === 'certains' ? 'mixte' : etat !== 'aucun'}
            onChange={() => poser(et.id)}
          />
        )}
        {renommerId === et.id ? (
          <Champ
            taille="p"
            className="notak-etiquettes-nom"
            autoFocus
            defaultValue={et.nom}
            maxLength={NOM_ETIQUETTE_MAX}
            aria-label={t('etiquettes.nom')}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => {
              const suite = renommerEtiquette(liste, et.id, e.target.value)
              if (suite.find((x) => x.id === et.id)!.nom !== et.nom) changerListe(suite)
              setRenommerId(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              else if (e.key === 'Escape') {
                e.stopPropagation()
                setRenommerId(null)
              }
            }}
          />
        ) : (
          <span className="notak-etiquette notak-etiquettes-chip" data-fond={et.couleur} style={{ color: texteEtiquette(et.couleur) }}>
            {et.nom}
          </span>
        )}
        <button
          ref={(n) => {
            if (n) boutons.current.set(et.id, n)
            else boutons.current.delete(et.id)
          }}
          type="button"
          className="notak-etiquettes-plus"
          aria-expanded={ouvert}
          aria-label={t('etiquettes.options', { nom: et.nom })}
          title={t('etiquettes.options', { nom: et.nom })}
          onClick={() => setMenuDe(ouvert ? null : { id: et.id, vue: 'principal' })}
        >
          <Icone nom="plus" taille={16} />
        </button>
        {ouvert && menuDe && <MenuEtiquette bouton={() => boutons.current.get(et.id)} fermer={() => setMenuDe(null)} etiquette={et} vue={menuDe.vue} ecrire={ecrire} tableau={tableau.elements} filtre={filtre.has(et.id)} aller={(vue) => setMenuDe({ id: et.id, vue })} renommer={() => { setMenuDe(null); setRenommerId(et.id) }} colorer={(c) => { changerListe(colorerEtiquette(liste, et.id, c)); setMenuDe(null) }} retirer={() => retirer(et.id)} filtrer={() => { basculerFiltre(et.id); setMenuDe(null) }} />}
      </li>
    )
  }

  return (
    <div className="notak-etiquettes" role="group" aria-label={t('etiquettes.titre')} onKeyDown={(e) => e.stopPropagation()}>
      {ecrire && (
        <Champ
          taille="p"
          className="notak-etiquettes-recherche"
          value={requete}
          maxLength={NOM_ETIQUETTE_MAX}
          placeholder={t('etiquettes.rechercher')}
          aria-label={t('etiquettes.nomNouvelle')}
          onChange={(e) => setRequete(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              valider()
            }
          }}
        />
      )}
      {peutCreer && (
        <button type="button" className="notak-etiquettes-creer" onClick={valider}>
          <Icone nom="ajouter" taille={14} /> {t('etiquettes.creerNom', { nom: requete.trim() })}
        </button>
      )}
      <div className="notak-etiquettes-liste">
        {liste.length === 0 && !cherche && ailleurs.length === 0 && <p className="notak-etiquettes-vide">{t('etiquettes.aucune')}</p>}
        {cherche && visibles.length === 0 && ailleurs.length === 0 && !peutCreer && <p className="notak-etiquettes-vide">{t('etiquettes.aucunResultat')}</p>}
        {recentes.length > 0 && (
          <>
            <span className="notak-decor-titre">{t('etiquettes.recentes')}</span>
            <ul>{recentes.map(ligne)}</ul>
          </>
        )}
        {autres.length > 0 && (
          <>
            {recentes.length > 0 && <span className="notak-decor-titre">{t('etiquettes.toutes')}</span>}
            <ul>{autres.map(ligne)}</ul>
          </>
        )}
        {ailleurs.map((section) => (
          <div key={section.id} className="notak-etiquettes-ailleurs">
            <span className="notak-decor-titre">{section.titre.trim() || t('etiquettes.sansTitre')}</span>
            <ul>
              {section.etiquettes.map((et) => (
                <li key={et.id} className="notak-etiquettes-ligne">
                  <button type="button" className="notak-etiquettes-reprendre" title={t('etiquettes.reprendre', { nom: et.nom })} aria-label={t('etiquettes.reprendre', { nom: et.nom })} onClick={() => reprendre(et)}>
                    <Icone nom="ajouter" taille={14} />
                  </button>
                  <span className="notak-etiquette notak-etiquettes-chip" data-fond={et.couleur} style={{ color: texteEtiquette(et.couleur) }}>
                    {et.nom}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {filtre.size > 0 && (
        <button type="button" className="notak-etiquettes-lien" onClick={viderFiltre}>
          {t('etiquettes.toutMontrer')}
        </button>
      )}
    </div>
  )
}

/**
 * Le menu d'une étiquette, à droite de son « ••• » : renommer, changer la couleur et supprimer, puis combien d'éléments
 * la portent. La palette et la confirmation de suppression s'ouvrent à leur tour à droite de leur entrée.
 */
function MenuEtiquette({
  bouton,
  fermer,
  etiquette,
  vue,
  ecrire,
  tableau,
  filtre,
  aller,
  renommer,
  colorer,
  retirer,
  filtrer,
}: {
  bouton(): HTMLButtonElement | undefined
  fermer(): void
  etiquette: Etiquette
  vue: SousMenu
  ecrire: boolean
  tableau: readonly Element[]
  filtre: boolean
  aller(vue: SousMenu): void
  renommer(): void
  colorer(c: CouleurNote): void
  retirer(): void
  filtrer(): void
}) {
  const n = tableau.filter((e) => e.etiquettes?.includes(etiquette.id)).length
  const entreeCouleur = useRef<HTMLButtonElement>(null)
  const entreeSuppression = useRef<HTMLButtonElement>(null)
  // Un appui hors du menu (et de ce qu'il a ouvert) le referme ; le « ••• » garde son propre geste.
  useEffect(() => {
    const dehors = (e: PointerEvent) => {
      const b = bouton()
      if (b && !b.contains(horsPanneau(e.target as Node))) fermer()
    }
    document.addEventListener('pointerdown', dehors, true)
    return () => document.removeEventListener('pointerdown', dehors, true)
  }, [bouton, fermer])
  const echap = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    if (vue === 'principal') fermer()
    else aller('principal')
  }
  return (
    <PanneauFlottant cible={bouton} cote="droite" alignement="debut" distance={4} fleche={false} className="notak-etiquettes-menu" role="menu" onKeyDown={echap}>
      {ecrire && (
        <div className="notak-etiquettes-entrees">
          <button type="button" role="menuitem" onClick={renommer}>
            {t('etiquettes.renommer')}
          </button>
          <button ref={entreeCouleur} type="button" role="menuitem" aria-expanded={vue === 'couleur'} data-ouvert={vue === 'couleur' || undefined} onClick={() => aller(vue === 'couleur' ? 'principal' : 'couleur')}>
            {t('etiquettes.changerCouleur')}
          </button>
          <button ref={entreeSuppression} type="button" role="menuitem" className="notak-etiquettes-danger" aria-expanded={vue === 'suppression'} data-ouvert={vue === 'suppression' || undefined} onClick={() => aller(vue === 'suppression' ? 'principal' : 'suppression')}>
            {t('etiquettes.supprimerBouton')}
          </button>
        </div>
      )}
      <button type="button" role="menuitem" className="notak-etiquettes-usage" aria-pressed={filtre} title={filtre ? t('etiquettes.nePlusFiltrer') : t('etiquettes.filtrer')} onClick={filtrer}>
        {tn('etiquettes.utilisee', n)}
      </button>
      {vue === 'couleur' && (
        <PanneauFlottant cible={() => entreeCouleur.current} cote="droite" alignement="debut" distance={4} fleche={false} className="notak-etiquettes-sousmenu" onKeyDown={echap}>
          <div className="notak-note-pastilles notak-etiquettes-palette">
            {COULEURS_NOTE.map((c: CouleurNote) => (
              <button key={c} type="button" data-fond={c} title={LIBELLES_COULEUR[c]} aria-label={LIBELLES_COULEUR[c]} aria-pressed={etiquette.couleur === c} onClick={() => colorer(c)} />
            ))}
          </div>
        </PanneauFlottant>
      )}
      {vue === 'suppression' && (
        <PanneauFlottant cible={() => entreeSuppression.current} cote="droite" alignement="debut" distance={4} fleche={false} className="notak-etiquettes-sousmenu notak-etiquettes-confirmer" role="alertdialog" onKeyDown={echap}>
          <p>{t('etiquettes.confirmer', { nom: etiquette.nom })}</p>
          <div>
            <button type="button" onClick={() => aller('principal')}>
              {t('etiquettes.annuler')}
            </button>
            <button type="button" className="notak-etiquettes-danger" onClick={retirer}>
              {t('etiquettes.supprimerBouton')}
            </button>
          </div>
        </PanneauFlottant>
      )}
    </PanneauFlottant>
  )
}

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { type Cible, PanneauFlottant } from '../../PanneauFlottant'
import {
  type GenrePuce,
  type Personne,
  type Rappel,
  assigneDe,
  attrsEteints,
  attrsHeure,
  attrsJour,
  attrsPersonne,
  echeanceDe,
  heureDe,
  jourDe,
  optionsRappel,
  rappelDe,
  teinteDe,
} from './puces'
import { t } from '../../langue'
import { Icone } from '../../icones'
import { Calendrier, Choix, ChoixHeure } from '../../communs'
import { PastillePersonne } from '../../pastille'

/** Où le menu s'ouvre : accroché à la puce touchée, qu'il suit quand la toile bouge. */
export interface OuverturePuce {
  genre: GenrePuce
  /** La puce, relue à chaque image (en écriture, l'éditeur la redessine à chaque changement). */
  cible: Cible
  /** Le nœud qui porte la toile, où le menu se range pour garder ses couleurs. */
  hote: HTMLElement
}

/**
 * La fenêtre d'une puce, accrochée sous elle (au-dessus s'il n'y a pas la place). L'échéance : un calendrier mensuel, une heure facultative, un rappel.
 * La personne : une recherche et les collaborateurs du tableau. Elle se ferme d'un clic ailleurs ou d'Échap.
 * `regler` reçoit les attributs de la tâche à écrire ; `attrs` est ce que la tâche porte à présent.
 */
export function MenuPuce({ ouverture, attrs, personnes, regler, fermer }: {
  ouverture: OuverturePuce
  attrs: Record<string, unknown> | undefined
  /** Ceux qu'on propose d'assigner. */
  personnes: Personne[]
  regler(attrs: Record<string, unknown>): void
  fermer(): void
}) {
  const racine = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const hors = (e: PointerEvent) => {
      if (!racine.current?.contains(e.target as Node)) fermer()
    }
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      fermer()
    }
    document.addEventListener('pointerdown', hors, true)
    document.addEventListener('keydown', touche, true)
    return () => {
      document.removeEventListener('pointerdown', hors, true)
      document.removeEventListener('keydown', touche, true)
    }
  }, [fermer])
  return (
    <PanneauFlottant
      panneau={racine}
      cible={ouverture.cible}
      hote={ouverture.hote}
      className="notak-menu-puce"
      data-genre={ouverture.genre}
      role="dialog"
      tabIndex={-1}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        // Suppr sur la puce : elle s'éteint (hors d'un champ de saisie).
        if ((e.key === 'Delete' || e.key === 'Backspace') && !(e.target as HTMLElement).closest('input, select')) {
          regler(attrsEteints(ouverture.genre))
          fermer()
        }
      }}
    >
      {ouverture.genre === 'echeance' ? (
        <PanneauEcheance attrs={attrs} regler={regler} />
      ) : (
        <PanneauPersonne valeur={assigneDe(attrs)} personnes={personnes} regler={regler} fermer={fermer} />
      )}
    </PanneauFlottant>
  )
}

// ———— L'échéance ————

function PanneauEcheance({ attrs, regler }: { attrs: Record<string, unknown> | undefined; regler(attrs: Record<string, unknown>): void }) {
  const maintenant = new Date()
  const jour = echeanceDe(attrs)
  const heure = heureDe(attrs)
  const options = useMemo(() => (jour ? optionsRappel(jour, heure, maintenant) : []), [jour, heure]) // eslint-disable-line react-hooks/exhaustive-deps
  const rappel = jour ? (rappelDe(attrs) ?? 'aucun') : 'aucun'
  return (
    <Calendrier valeur={jour} aujourdhui={jourDe(maintenant)} min={jourDe(maintenant)} effacable autoFocus choisir={(j) => regler(attrsJour(attrs, j, maintenant))}>
      <ChoixHeure valeur={heure} desactive={jour === null} changer={(h) => regler(attrsHeure(attrs, h, maintenant))} />
      <div className="notak-menu-rappel">
        <Icone nom="cloche" taille={20} />
        <Choix
          large
          haut
          libelle={t('taches.rappel')}
          inactif={jour === null}
          valeur={options.includes(rappel) ? rappel : 'aucun'}
          onChange={(r) => regler({ rappel: r as Rappel })}
          options={(jour ? options : (['aucun'] as Rappel[])).map((r) => ({ valeur: r, libelle: t(`taches.rappel.${r}`) }))}
        />
      </div>
    </Calendrier>
  )
}

// ———— La personne ————

/** Le nom, avec ce qui correspond à la recherche en gras. */
function surligner(nom: string, recherche: string): ReactNode {
  const i = recherche ? nom.toLowerCase().indexOf(recherche.toLowerCase()) : -1
  if (i < 0) return nom
  return (
    <>
      {nom.slice(0, i)}
      <mark>{nom.slice(i, i + recherche.length)}</mark>
      {nom.slice(i + recherche.length)}
    </>
  )
}

function PanneauPersonne({ valeur, personnes, regler, fermer }: { valeur: string | null; personnes: Personne[]; regler(attrs: Record<string, unknown>): void; fermer(): void }) {
  const [recherche, setRecherche] = useState('')
  const [actif, setActif] = useState(0)
  const trouvees = useMemo(() => personnes.filter((p) => p.nom.toLowerCase().includes(recherche.trim().toLowerCase())), [personnes, recherche])
  const choisir = (nom: string | null) => {
    regler(attrsPersonne(nom))
    fermer()
  }
  return (
    <>
      <input
        className="notak-menu-recherche"
        type="text"
        aria-label={t('taches.nom')}
        placeholder={t('taches.chercherPersonne')}
        value={recherche}
        autoFocus
        onChange={(e) => {
          setRecherche(e.target.value)
          setActif(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            if (trouvees.length > 0) setActif((a) => (a + (e.key === 'ArrowDown' ? 1 : trouvees.length - 1)) % trouvees.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            // Sans collaborateur à proposer (tableau seul), un nom tapé se pose tel quel.
            if (trouvees[actif]) choisir(trouvees[actif]!.nom)
            else if (personnes.length === 0 && recherche.trim() !== '') choisir(recherche.trim())
          } else if (e.key === 'Backspace' && recherche === '') {
            e.preventDefault()
            choisir(null)
          }
        }}
      />
      <div className="notak-menu-liste" role="listbox" aria-label={t('taches.assignerA')}>
        {trouvees.map((p, i) => (
          <button
            key={p.nom}
            type="button"
            role="option"
            aria-selected={p.nom === valeur}
            data-actif={i === actif ? '' : undefined}
            onMouseEnter={() => setActif(i)}
            onClick={() => choisir(p.nom)}
          >
            <PastillePersonne taille={24} nom={p.nom} couleur={p.couleur ?? teinteDe(p.nom)} titre="" />
            <span className="notak-menu-liste-nom">{surligner(p.nom, recherche.trim())}</span>
            {p.nom === valeur && <Icone nom="coche" taille={16} />}
          </button>
        ))}
        {trouvees.length === 0 && personnes.length > 0 && <p className="notak-menu-vide">{t('taches.personneAucune')}</p>}
      </div>
    </>
  )
}

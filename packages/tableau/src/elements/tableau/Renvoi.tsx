import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { RenvoiTableau } from '../../coeur/tableau'
import { FOND_NOTE } from '../note/couleurs'
import type { PropsRendu } from '../types'
import { pastilleDe } from './icones'
import { initiale, libelleContenu } from './libelles'
import { PlanTableau, useApercuAuSurvol } from './Apercu'
import { ChoixModele } from './ChoixModele'
import { demanderModele, ecouterModele, modeleEnCours } from './modele'
import { poserModele } from './poserModele'
import { demanderRenommage, ecouterRenommage, renommageEnCours } from './renommage'

const sans = () => () => {}

/** L'adresse de l'image d'un tableau, quand il en a une ; rien tant qu'elle n'est pas connue. */
function useImage(fichier: string | undefined, contexte: PropsRendu<RenvoiTableau>['contexte']) {
  const [adresse, setAdresse] = useState<string | null>(null)
  const depot = contexte.services.fichiers
  useEffect(() => {
    setAdresse(null)
    if (!fichier || !depot) return
    let vivant = true
    depot.adresse(fichier).then((a) => vivant && setAdresse(a), () => {})
    return () => {
      vivant = false
    }
  }, [fichier, depot])
  return adresse
}

export function RenduRenvoi({ element, choisie, contexte }: PropsRendu<RenvoiTableau>) {
  const { cible, titre: nomDonne } = element.contenu
  const { tableau, ecouterEspace, ouvrirTableau, renommerTableau } = contexte.services
  // Une chaîne comme instantané : React compare par valeur, la carte ne se redessine que si elle change.
  const cle = useSyncExternalStore(ecouterEspace ?? sans, () => {
    const t = tableau?.(cible)
    return t ? JSON.stringify([t.titre, t.couleur, libelleContenu(t)]) : ''
  })
  const [titre = '', couleur, contenu = ''] = cle ? (JSON.parse(cle) as [string, string?, string?]) : []
  const pastille = pastilleDe(element.contenu)
  const image = useImage(pastille.genre === 'image' ? pastille.fichier : undefined, contexte)
  const enRenommage = useSyncExternalStore(ecouterRenommage, renommageEnCours) === element.id
  const choixModele = useSyncExternalStore(ecouterModele, modeleEnCours) === element.id
  const apercu = useApercuAuSurvol()
  const plan = apercu.vu ? tableau?.(cible) : undefined
  // Un clic sur un tableau déjà choisi : sur le titre, on le renomme ; sur l'icône, une bulle dit de double-cliquer.
  const dejaChoisie = useRef(false)
  const [bulle, setBulle] = useState(false)
  const minuteur = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(minuteur.current), [])
  const apresClic = (sur: 'titre' | 'icone') => {
    if (!dejaChoisie.current || contexte.services.lectureSeule) return
    clearTimeout(minuteur.current)
    if (sur === 'titre') minuteur.current = setTimeout(() => demanderRenommage(element.id), 100)
    else
      minuteur.current = setTimeout(() => {
        setBulle(true)
        minuteur.current = setTimeout(() => setBulle(false), 2000)
      }, 500)
  }

  // Annuler ou rétablir un renommage change `titre` dans le renvoi : on en reporte la valeur sur le tableau.
  const vu = useRef(nomDonne)
  useEffect(() => {
    if (vu.current === nomDonne) return
    vu.current = nomDonne
    if (nomDonne !== undefined && nomDonne !== titre) renommerTableau?.(cible, nomDonne)
  })

  const valider = (valeur: string) => {
    demanderRenommage(null)
    const nom = valeur.trim()
    if (!nom || nom === titre) return
    // `avant` porte l'ancien nom : sans lui, annuler ne saurait pas quoi remettre.
    const actuel = contexte.magasin.lire().elements.find((e) => e.id === element.id)?.contenu
    if (actuel?.type !== 'tableau') return
    contexte.magasin.faire([
      { type: 'contenu', id: element.id, avant: { ...actuel, titre }, apres: { ...actuel, titre: nom } },
    ])
  }

  return (
    <div
      className="notak-renvoi"
      data-raccourci={element.contenu.raccourci || undefined}
      onPointerDownCapture={() => {
        dejaChoisie.current = choisie
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        clearTimeout(minuteur.current)
        setBulle(false)
        if ((e.metaKey || e.ctrlKey) && contexte.services.ouvrirDansOnglet) contexte.services.ouvrirDansOnglet(cible)
        else ouvrirTableau?.(cible)
      }}
    >
      {choixModele && (
        <ChoixModele
          choisir={(m) => {
            demanderModele(null)
            poserModele(m, cible, contexte.services)
          }}
          laisser={() => {
            demanderModele(null)
            demanderRenommage(element.id)
          }}
        />
      )}
      {bulle && <div className="notak-renvoi-bulle">Double-cliquez pour ouvrir</div>}
      {plan && !enRenommage && (
        <div className="notak-renvoi-apercu" role="tooltip">
          <PlanTableau tableau={plan} />
        </div>
      )}
      <div
        {...apercu.proprietes}
        onClick={() => apresClic('icone')}
        className="notak-renvoi-carre"
        style={{ background: FOND_NOTE[couleur && couleur !== 'transparent' ? (couleur as keyof typeof FOND_NOTE) : 'gris'] }}
      >
        {pastille.genre === 'image' ? (
          image && <img className="notak-renvoi-image" src={image} alt="" draggable={false} />
        ) : pastille.genre === 'icone' ? (
          <span className="notak-renvoi-signe" role="img" aria-label={pastille.libelle}>
            {pastille.signe}
          </span>
        ) : (
          initiale(titre)
        )}
        {element.contenu.raccourci && (
          <span className="notak-renvoi-raccourci" title="Raccourci vers ce tableau" aria-label="Raccourci">
            <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 3h7v7M13 3 4 12" />
            </svg>
          </span>
        )}
      </div>
      {enRenommage ? (
        <Saisie depart={titre} valider={valider} />
      ) : (
        <div className="notak-renvoi-titre" onClick={() => apresClic('titre')}>
          {titre}
        </div>
      )}
      <div className="notak-renvoi-info">{contenu}</div>
    </div>
  )
}

/** Le titre en place. Entrée, Échap et la sortie du champ valident. */
function Saisie({ depart, valider }: { depart: string; valider(v: string): void }) {
  const champ = useRef<HTMLInputElement>(null)
  const fini = useRef(false)
  useEffect(() => {
    champ.current?.focus()
    champ.current?.select()
  }, [])
  const sortir = () => {
    if (fini.current) return
    fini.current = true
    valider(champ.current?.value ?? depart)
    champ.current?.closest<HTMLElement>('.notak-toile')?.focus({ preventScroll: true })
  }
  return (
    <input
      ref={champ}
      className="notak-renvoi-saisie"
      defaultValue={depart}
      aria-label="Titre du tableau"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          sortir()
        }
      }}
      onBlur={sortir}
    />
  )
}

import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { RenvoiTableau } from '../../coeur/tableau'
import { FOND_NOTE } from '../note/couleurs'
import type { PropsRendu } from '../types'
import { initiale, libelleContenu } from './libelles'
import { demanderRenommage, ecouterRenommage, renommageEnCours } from './renommage'

const sans = () => () => {}

export function RenduRenvoi({ element, contexte }: PropsRendu<RenvoiTableau>) {
  const { cible, titre: nomDonne } = element.contenu
  const { tableau, ecouterEspace, ouvrirTableau, renommerTableau } = contexte.services
  // Une chaîne comme instantané : React compare par valeur, la carte ne se redessine que si elle change.
  const cle = useSyncExternalStore(ecouterEspace ?? sans, () => {
    const t = tableau?.(cible)
    return t ? JSON.stringify([t.titre, t.couleur, libelleContenu(t)]) : ''
  })
  const [titre = '', couleur, contenu = ''] = cle ? (JSON.parse(cle) as [string, string?, string?]) : []
  const enRenommage = useSyncExternalStore(ecouterRenommage, renommageEnCours) === element.id

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
      onDoubleClick={(e) => {
        e.stopPropagation()
        if ((e.metaKey || e.ctrlKey) && contexte.services.ouvrirDansOnglet) contexte.services.ouvrirDansOnglet(cible)
        else ouvrirTableau?.(cible)
      }}
    >
      <div
        className="notak-renvoi-carre"
        style={{ background: FOND_NOTE[couleur && couleur !== 'transparent' ? (couleur as keyof typeof FOND_NOTE) : 'gris'] }}
      >
        {initiale(titre)}
      </div>
      {enRenommage ? (
        <Saisie depart={titre} valider={valider} />
      ) : (
        <div className="notak-renvoi-titre">{titre}</div>
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

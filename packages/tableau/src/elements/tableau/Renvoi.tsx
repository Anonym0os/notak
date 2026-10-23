import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { RenvoiTableau } from '../../coeur/tableau'
import { FOND_NOTE, couleurTexteSur } from '../note/couleurs'
import type { PropsRendu } from '../types'
import { avecIcone, pastilleDe } from './icones'
import { couleurDuTitre, iconeDuTitre } from './initialisation'
import { initiale, libelleContenu } from './libelles'
import { PlanTableau, useApercuAuSurvol } from './Apercu'
import { ChoixModele } from './ChoixModele'
import { demanderModele, ecouterModele, modeleEnCours } from './modele'
import { poserModele } from './poserModele'
import { demanderRenommage, ecouterRenommage, renommageEnCours } from './renommage'
import { t } from '../../langue'
import { Icone } from '../../icones'

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
  const [titreCible = '', couleurCible, contenu = ''] = cle ? (JSON.parse(cle) as [string, string?, string?]) : []
  // Un raccourci a son titre et sa couleur : ils suivent le tableau tant qu'on ne lui en a pas donné.
  const raccourci = !!element.contenu.raccourci
  const titre = raccourci ? (nomDonne ?? titreCible) : titreCible
  const couleur = raccourci ? (element.contenu.couleur ?? couleurCible) : couleurCible
  const fond = FOND_NOTE[couleur && couleur !== 'transparent' ? (couleur as keyof typeof FOND_NOTE) : 'gris']
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
    if (!raccourci && nomDonne !== undefined && nomDonne !== titre) renommerTableau?.(cible, nomDonne)
  })

  const valider = (valeur: string) => {
    demanderRenommage(null)
    const nom = valeur.trim()
    if (!nom || nom === titre) return
    // `avant` porte l'ancien nom : sans lui, annuler ne saurait pas quoi remettre.
    const actuel = contexte.magasin.lire().elements.find((e) => e.id === element.id)?.contenu
    if (actuel?.type !== 'tableau') return
    // Le titre d'un raccourci lui appartient : le tableau d'origine n'est pas renommé.
    // Le premier vrai nom d'un tableau neuf lui trouve une couleur (si le titre en parle) et une icône (jamais celle d'un voisin).
    const premierNom = !raccourci && titre === t('tableau.nouveau') && !actuel.icone && !actuel.image
    const voisines = new Set(contexte.magasin.lire().elements.flatMap((e) => (e.contenu.type === 'tableau' && e.contenu.icone ? [e.contenu.icone] : [])))
    const icone = premierNom ? iconeDuTitre(nom, voisines) : undefined
    const teinte = premierNom ? couleurDuTitre(nom) : undefined
    const apres = { ...actuel, titre: nom }
    contexte.magasin.faire([
      { type: 'contenu', id: element.id, avant: raccourci ? actuel : { ...actuel, titre }, apres: icone ? avecIcone(apres, icone) : apres },
    ])
    if (teinte) contexte.services.colorerTableau?.(cible, teinte)
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
      {bulle && <div className="notak-renvoi-bulle">{t('tableau.doubleClic')}</div>}
      {plan && !enRenommage && (
        <div className="notak-renvoi-apercu" role="tooltip">
          <PlanTableau tableau={plan} />
        </div>
      )}
      <div
        {...apercu.proprietes}
        onClick={() => apresClic('icone')}
        className="notak-renvoi-carre"
        style={{ background: fond, color: couleurTexteSur(fond) }}
      >
        {pastille.genre === 'image' ? (
          image && <img className="notak-renvoi-image" src={image} alt="" draggable={false} />
        ) : pastille.genre === 'icone' ? (
          <span className="notak-renvoi-signe" role="img" aria-label={pastille.libelle}>
            <Icone nom={pastille.icone} taille={35} trait={1.5} />
          </span>
        ) : // Sans icône ni image, la tuile reste unie : l'initiale ne vient qu'avec une couleur choisie.
        couleur && couleur !== 'transparent' ? (
          initiale(titre)
        ) : null}
        {element.contenu.raccourci && (
          <span className="notak-renvoi-raccourci" title={t('tableau.raccourci.titre')} aria-label={t('tableau.raccourci')}>
            <Icone nom="ligne" taille={16} trait={2} />
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
      aria-label={t('tableau.titreChamp')}
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

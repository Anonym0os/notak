import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type Entree, FeuilleMenu, MenuEntrees } from '../../communs'
import { enFeuille } from '../../communs/Feuille'
import { PanneauFlottant } from '../../PanneauFlottant'
import { Icone } from '../../icones'
import { t } from '../../langue'

/** Le menu d'un message, posé hors du fil : un appui dedans n'est pas un appui « dehors » pour le fil qui l'a ouvert. */
export const CLASSE_MENU_MESSAGE = 'notak-commentaire-menu'

/**
 * « Plus d'actions » d'un message, le « ⋯ » que Notion pose dans la barre de chaque commentaire : Modifier, Supprimer,
 * et ce que le fil y ajoute. Le menu s'ouvre sous le bouton, aux couleurs de l'espace ; au téléphone, il monte en feuille,
 * par-dessus le fil. Les flèches y circulent, Entrée choisit ; Échap le ferme et rend le clavier au bouton, un appui
 * ailleurs le ferme.
 */
export function MenuMessage({ entrees, className }: { entrees: Entree[]; className: string }) {
  const [ouvert, setOuvert] = useState(false)
  const bouton = useRef<HTMLButtonElement>(null)
  if (entrees.length === 0) return null
  return (
    <>
      <button
        ref={bouton}
        type="button"
        className={className}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={t('commentaire.plus')}
        title={t('commentaire.plus')}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOuvert((o) => !o)}
      >
        <Icone nom="plus" taille={16} />
      </button>
      {ouvert &&
        (enFeuille() ? (
          <FeuilleMenu entrees={entrees} fermer={() => setOuvert(false)} />
        ) : (
          <MenuFlottant entrees={entrees} bouton={bouton} fermer={() => setOuvert(false)} />
        ))}
    </>
  )
}

function MenuFlottant({ entrees, bouton, fermer }: { entrees: Entree[]; bouton: React.RefObject<HTMLButtonElement | null>; fermer(): void }) {
  const panneau = useRef<HTMLDivElement>(null)
  const dernier = useRef(fermer)
  dernier.current = fermer
  // Le menu prend le clavier dès qu'il paraît : sa première ligne, comme le menu du clic droit.
  useLayoutEffect(() => {
    panneau.current?.querySelector<HTMLButtonElement>('.notak-e:not(:disabled)')?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    const dehors = (e: PointerEvent) => {
      const cible = e.target as Node
      if (panneau.current?.contains(cible) || bouton.current?.contains(cible)) return
      dernier.current()
    }
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      dernier.current()
      bouton.current?.focus({ preventScroll: true })
    }
    document.addEventListener('pointerdown', dehors, true)
    document.addEventListener('keydown', touche, true)
    return () => {
      document.removeEventListener('pointerdown', dehors, true)
      document.removeEventListener('keydown', touche, true)
    }
  }, [bouton])
  // Rangé dans l'espace, pour en prendre le thème (clair, sombre, habillage), hors du plan qui zoome.
  const hote = bouton.current?.closest<HTMLElement>('.notak-espace') ?? null
  return (
    <PanneauFlottant
      panneau={panneau}
      cible={() => bouton.current}
      hote={hote}
      cote="bas"
      distance={4}
      fleche={false}
      className={CLASSE_MENU_MESSAGE}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <MenuEntrees entrees={entrees} fermer={fermer} className="notak-commentaire-menu-liste" onKeyDown={(e) => e.stopPropagation()} />
    </PanneauFlottant>
  )
}

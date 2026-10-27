import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icone } from './icones'
import { t } from './langue'
import { Case } from './communs'
import { Feuille, enFeuille } from './communs/Feuille'
import { ApercuModele } from './elements/tableau/ApercuModele'
import type { ModeleTableau } from './modeles/construire'

/** Les modèles que le panneau propose d'emblée, dans cet ordre : le premier porte la mention « le plus utilisé ». */
export const MODELES_PROPOSES = ['planning', 'humeur', 'lecture', 'reunion', 'idees'] as const

/** Les modèles du panneau, pris dans le catalogue de la langue. */
export const modelesProposes = (catalogue: readonly ModeleTableau[]): ModeleTableau[] =>
  MODELES_PROPOSES.flatMap((id) => catalogue.find((m) => m.id === id) ?? [])

/** Ce que dit le bouton principal : « Continuer » tant que le tableau reste vide, « Utiliser le modèle » sinon. */
export const libelleContinuer = (choisi: string | null): string => (choisi === null ? t('modele.continuer') : t('modele.utiliserCe'))

interface PropsPanneau {
  modeles: readonly ModeleTableau[]
  /** Tout le catalogue : la sous-page « Tout voir » de la feuille, au téléphone. */
  catalogue: readonly ModeleTableau[]
  /** L'identifiant du modèle choisi, `null` : tableau vide. */
  choisi: string | null
  surChoix(id: string | null): void
  garder: boolean
  surGarder(garder: boolean): void
  continuer(): void
  plus(): void
  fermer(): void
  /** Change à chaque clic dans la toile voilée : le bouton principal clignote pour dire « utilisez-le ». */
  signal: number
  /** Au téléphone, un toucher au-dessus de la feuille : il ne la ferme pas, il compte comme un clic dans la toile voilée. */
  toucherDehors?(): void
  /** Au téléphone, la place que la feuille prend en bas de l'écran (px), `null` une fois fermée : l'aperçu cadre au-dessus. */
  surHauteur?(px: number | null): void
}

/**
 * Le choix d'un modèle à l'ouverture d'un tableau vide : un panneau sombre en bas à droite de la toile, sans fenêtre.
 * « Tableau vide » est choisi d'emblée ; choisir un modèle le montre dans la toile (l'aperçu est celui de l'espace),
 * « Continuer » l'écrit. Les flèches changent de ligne, Échap ferme.
 * Au téléphone, une feuille du bas à la place (`FeuilleModeles`).
 */
export function PanneauModeles(props: PropsPanneau) {
  return enFeuille() ? <FeuilleModeles {...props} /> : <PanneauBureau {...props} />
}

function PanneauBureau({ modeles, choisi, surChoix, garder, surGarder, continuer, plus, fermer, signal }: PropsPanneau) {
  const liste = useRef<HTMLUListElement>(null)
  const ids: (string | null)[] = [null, ...modeles.map((m) => m.id)]
  const touche = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      return fermer()
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const rang = ids.indexOf(choisi) + (e.key === 'ArrowDown' ? 1 : -1)
    surChoix(ids[Math.max(0, Math.min(ids.length - 1, rang))]!)
  }
  return (
    <aside className="notak-choix-modele" aria-label={t('modele.panneau')} onKeyDown={touche} onPointerDown={(e) => e.stopPropagation()}>
      <div className="notak-choix-modele-tete">
        <strong>{t('modele.panneau')}</strong>
        <button type="button" aria-label={t('modele.fermerPanneau')} onClick={fermer}>
          <Icone nom="fermer" taille={16} />
        </button>
      </div>
      <div className="notak-choix-modele-corps">
        <ul ref={liste} role="listbox" aria-label={t('modele.liste')}>
          <li>
            <button type="button" role="option" aria-selected={choisi === null} data-vide onClick={() => surChoix(null)}>
              {t('modele.vide')}
            </button>
          </li>
          {modeles.map((m, i) => (
            <li key={m.id}>
              <button type="button" role="option" aria-selected={choisi === m.id} onClick={() => surChoix(m.id)}>
                {m.titre}
                {i === 0 && <span className="notak-choix-modele-badge">{t('modele.top')}</span>}
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="notak-choix-modele-plus" onClick={plus}>
              {t('modele.plus')}
              <Icone nom="chevronDroite" taille={14} />
            </button>
          </li>
        </ul>
      </div>
      <div className="notak-choix-modele-pied">
        <button key={signal} type="button" className="notak-choix-modele-continuer" data-clignote={signal > 0 || undefined} onClick={continuer}>
          {libelleContinuer(choisi)}
        </button>
        <label data-desactive={choisi === null || undefined}>
          <Case option cochee={garder && choisi !== null} disabled={choisi === null} onChange={surGarder} />
          {t('modele.garder')}
        </label>
      </div>
    </aside>
  )
}

/**
 * Au téléphone, le choix monte du bas en feuille claire, la plus basse possible : l'aperçu du modèle reste visible
 * au-dessus, cadré en entier. Une rangée de cartes qui défile (« Toile vide » d'abord), « Tout voir » à droite du titre
 * pour la sous-page du catalogue, la case puis le bouton principal au plus près du pouce. Le X vaut « Toile vide ».
 */
function FeuilleModeles({ modeles, catalogue, choisi, surChoix, garder, surGarder, continuer, fermer, signal, toucherDehors, surHauteur }: PropsPanneau) {
  const [tous, setTous] = useState(false)
  const boite = useRef<HTMLDivElement>(null)
  const rangee = useRef<HTMLDivElement>(null)
  // La hauteur de la feuille, marges comprises, mesurée sur sa place et non sur son glissement d'entrée. La sous-page,
  // qui couvre presque tout, ne la change pas : l'aperçu garde son cadrage pour le retour.
  useLayoutEffect(() => {
    const feuille = boite.current?.closest<HTMLElement>('.notak-tiroir-bas')
    const calque = feuille?.parentElement
    if (!feuille || !calque || !surHauteur || tous) return
    const mesurer = () => surHauteur(calque.clientHeight - feuille.offsetTop)
    mesurer()
    const obs = typeof ResizeObserver === 'function' ? new ResizeObserver(mesurer) : null
    obs?.observe(feuille)
    obs?.observe(calque)
    return () => obs?.disconnect()
  }, [surHauteur, tous])
  useEffect(() => () => surHauteur?.(null), [surHauteur])
  // Le modèle pris dans le catalogue rejoint la rangée, en tête, et la carte choisie se montre.
  const choix = catalogue.find((m) => m.id === choisi)
  const cartes = choix && !modeles.includes(choix) ? [choix, ...modeles] : modeles
  useLayoutEffect(() => {
    rangee.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [choisi, tous])
  const titre = tous ? (
    <div className="notak-feuille-modeles-tete">
      <button type="button" className="notak-feuille-modeles-retour" aria-label={t('modele.retour')} onClick={() => setTous(false)}>
        <Icone nom="precedent" taille={22} />
      </button>
      <strong>{t('modele.tous')}</strong>
    </div>
  ) : (
    <div className="notak-feuille-modeles-tete">
      <strong>{t('modele.panneau')}</strong>
      <button type="button" className="notak-feuille-modeles-voir" onClick={() => setTous(true)}>
        {t('modele.toutVoir')}
      </button>
      <button type="button" className="notak-feuille-modeles-fermer" aria-label={t('modele.fermerPanneau')} onClick={fermer}>
        <Icone nom="fermer" taille={16} />
      </button>
    </div>
  )
  const pied = tous ? (
    <></>
  ) : (
    <div className="notak-feuille-modeles-pied">
      {choisi !== null && (
        <label>
          <Case option cochee={garder} onChange={surGarder} />
          {t('modele.garder')}
        </label>
      )}
      <button key={signal} type="button" className="notak-feuille-modeles-continuer" data-clignote={signal > 0 || undefined} onClick={continuer}>
        {libelleContinuer(choisi)}
      </button>
    </div>
  )
  return (
    <Feuille titre={titre} fermer={fermer} className="notak-feuille-modeles" pied={pied} surVoile={toucherDehors}>
      <div ref={boite}>
        {tous ? (
          <ul className="notak-feuille-modeles-liste" role="listbox" aria-label={t('modele.tous')}>
            {catalogue.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={choisi === m.id}
                  onClick={() => {
                    surChoix(m.id)
                    setTous(false)
                  }}
                >
                  <span className="notak-feuille-modeles-vignette">
                    <ApercuModele modele={m} />
                  </span>
                  <span className="notak-feuille-modeles-texte">
                    <strong>{m.titre}</strong>
                    <span>{m.resume}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div ref={rangee} className="notak-feuille-modeles-cartes" role="listbox" aria-orientation="horizontal" aria-label={t('modele.liste')}>
            <button type="button" role="option" aria-selected={choisi === null} onClick={() => surChoix(null)}>
              <span className="notak-feuille-modeles-vignette" data-vide />
              {t('modele.vide')}
            </button>
            {cartes.map((m) => (
              <button key={m.id} type="button" role="option" aria-selected={choisi === m.id} onClick={() => surChoix(m.id)}>
                <span className="notak-feuille-modeles-vignette">
                  <ApercuModele modele={m} />
                </span>
                {m.titre}
              </button>
            ))}
          </div>
        )}
      </div>
    </Feuille>
  )
}

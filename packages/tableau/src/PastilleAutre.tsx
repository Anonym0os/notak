import { createPortal } from 'react-dom'
import { Icone } from './icones'
import { t } from './langue'
import { PastillePersonne } from './pastille'
import type { Presence } from './elements/types'

/** Les types dont l'autre ne se laisse pas déloger : on y écrit ou on y dessine, la croix n'y est pas. */
const SANS_CROIX: ReadonlySet<string> = new Set(['croquis', 'document'])

/** Le prénom : le premier mot du nom. */
const prenomDe = (nom: string) => nom.trim().split(/\s+/)[0] ?? nom

/**
 * La pastille d'un élément choisi par une autre personne, posée dans sa carte au coin haut droit : son avatar, son
 * prénom et, sauf pour un croquis ou un document, la croix qui lui fait lâcher l'élément.
 */
export function PastilleAutre({
  noeud,
  presence,
  type,
  adressePhoto,
  lacher,
}: {
  noeud: HTMLElement
  presence: Presence
  type: string
  adressePhoto?: ((fichier: string) => string) | undefined
  /** Fait lâcher cet élément à cette personne ; absent en lecture seule. */
  lacher?: (() => void) | undefined
}) {
  const { nom, photo } = presence.utilisateur
  return createPortal(
    <span className="notak-pastille-autre" role="status">
      <PastillePersonne nom={nom} couleur="rgb(255 255 255 / 0.28)" adresse={photo ? adressePhoto?.(photo) : undefined} taille={24} titre={nom} />
      <span className="notak-pastille-autre-nom">{prenomDe(nom)}</span>
      {lacher && !SANS_CROIX.has(type) && (
        <button
          type="button"
          className="notak-pastille-autre-croix"
          aria-label={t('pastille.lacher', { nom: prenomDe(nom) })}
          title={t('pastille.lacher', { nom: prenomDe(nom) })}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            lacher()
          }}
        >
          <Icone nom="fermer" taille={12} />
        </button>
      )}
    </span>,
    noeud,
  )
}

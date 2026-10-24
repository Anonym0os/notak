import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { Icone } from '../icones'
import { t } from '../langue'
import { lireAdresse } from './bulleAdresse'
import { BulleFixe } from './bulleFixe'
import type { AncreFigee } from './menuAncre'
import { IconeAdresse } from './menuIcones'
import type { Plage } from './bullePosition'

/**
 * L'éditeur de lien de la bulle (docs/NOTION.md § 5) : un panneau de 330 px à la place de la bulle, avec un champ
 * d'adresse, la ligne « lien vers l'adresse » (Entrée la valide) et, sur un passage déjà lié, « supprimer le lien ».
 * ⌘K l'ouvre sur la sélection ; Échap le ferme sans quitter le texte.
 */

interface Props {
  editeur: Editor
  /** Le passage à lier, gardé à l'ouverture : le champ prend le focus, l'éditeur ne montre plus sa sélection. */
  plage: Plage
  ancre: AncreFigee
  hote: HTMLElement | null
  fermer(): void
}

/** Pose, ou retire avec `null`, le lien sur la plage ; le passage lié déjà en entier est étendu à tout son lien. */
export function poserLien(editeur: Editor, plage: Plage, href: string | null): boolean {
  const c = editeur.chain().focus().setTextSelection({ from: plage.de, to: plage.a }).extendMarkRange('link')
  return (href === null ? c.unsetLink() : c.setLink({ href })).run()
}

export function BulleLien({ editeur, plage, ancre, hote, fermer }: Props) {
  const depart = useRef((editeur.getAttributes('link').href as string | undefined) ?? '')
  const [valeur, setValeur] = useState(depart.current)
  const [rang, setRang] = useState(0)
  const champ = useRef<HTMLInputElement>(null)
  useEffect(() => {
    // À l'ouverture le champ prend le focus : une adresse déjà posée est choisie, on tape par-dessus.
    champ.current?.focus()
    champ.current?.select()
  }, [])
  const adresse = lireAdresse(valeur)
  const existe = !!depart.current
  // Les lignes qu'on peut atteindre aux flèches : l'adresse (dès qu'on a tapé quelque chose), puis « supprimer ».
  const lignes = [...(valeur.trim() ? (['adresse'] as const) : []), ...(existe ? (['retirer'] as const) : [])]
  const actif = lignes[Math.min(rang, lignes.length - 1)]

  const valider = (quoi: 'adresse' | 'retirer' | undefined) => {
    if (quoi === 'retirer') {
      poserLien(editeur, plage, null)
      return fermer()
    }
    if (quoi === 'adresse' && adresse.genre !== 'invalide') {
      poserLien(editeur, plage, adresse.url)
      fermer()
    }
  }
  const rendre = (quoi: 'adresse' | 'retirer') => (
    <div
      key={quoi}
      role="option"
      aria-selected={actif === quoi}
      data-actif={actif === quoi || undefined}
      className="notak-menu-blocs-entree"
      onPointerEnter={() => setRang(lignes.indexOf(quoi))}
      onClick={() => valider(quoi)}
    >
      <span className="notak-menu-blocs-icone">{quoi === 'adresse' ? <IconeAdresse /> : <Icone nom="corbeille" taille={20} />}</span>
      <span className="notak-menu-blocs-nom">{t(quoi === 'adresse' ? 'menus.lien.versAdresse' : 'menus.lien.retirer')}</span>
      {quoi === 'adresse' && (
        <span className="notak-bulle-lien-legende" {...(adresse.genre === 'invalide' ? { 'data-erreur': true } : {})}>
          {t(adresse.genre === 'invalide' ? 'menus.lien.urlComplete' : 'menus.lien.pageWeb')}
        </span>
      )}
    </div>
  )

  return (
    <BulleFixe
      ancre={ancre}
      racine={editeur.view.dom}
      hote={hote}
      className="notak-bulle-sous notak-bulle-lien notak-bulle-panneau"
      role="dialog"
      aria-label={t('barre.lien')}
      onPointerDown={(e) => {
        // Un appui dans le panneau ne doit pas faire perdre sa sélection à l'éditeur, sauf pour poser le curseur dans le champ.
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault()
      }}
    >
      <input
        ref={champ}
        className="notak-bulle-lien-champ"
        value={valeur}
        placeholder={t(existe ? 'menus.lien.inviteModifier' : 'menus.lien.invite')}
        aria-label={t('barre.adresseLien')}
        onChange={(e) => {
          setValeur(e.target.value)
          setRang(0)
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter') {
            e.preventDefault()
            valider(actif)
          } else if (e.key === 'Escape' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
            // Échap ferme le panneau ; la sélection du texte revient.
            e.preventDefault()
            e.stopPropagation()
            editeur.chain().focus().setTextSelection({ from: plage.de, to: plage.a }).run()
            fermer()
          } else if (e.key === 'ArrowDown' && lignes.length) {
            e.preventDefault()
            setRang((r) => (r + 1) % lignes.length)
          } else if (e.key === 'ArrowUp' && lignes.length) {
            e.preventDefault()
            setRang((r) => (r + lignes.length - 1) % lignes.length)
          }
        }}
      />
      {valeur.trim() && rendre('adresse')}
      {existe && (
        <>
          <div className="notak-menu-blocs-trait" aria-hidden />
          {rendre('retirer')}
        </>
      )}
    </BulleFixe>
  )
}

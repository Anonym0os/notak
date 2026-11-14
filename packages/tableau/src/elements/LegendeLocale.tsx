import { useState } from 'react'
import { t } from '../langue'
import { BoutonOutil } from '../BoutonOutil'
import type { Contenu } from '../coeur/tableau'
import type { PropsOutils } from './types'
import { useChampOuvert } from './champOuvert'

/**
 * La légende d'une carte (croquis, document en vue carte) : un texte sous la carte. Choisie, un clic sur la légende
 * l'écrit sur place ; Entrée ou un appui ailleurs valide, Échap laisse. Le texte part d'un seul pas à la validation.
 *
 * Le double-clic, lui, ouvre la carte, légende comprise : le second clic d'un double-clic n'écrit rien, et le double-clic
 * dont le premier clic vient d'ouvrir le champ le referme et passe à la toile. Seul le champ où l'on écrivait déjà le
 * garde, pour y choisir un mot.
 */
export function LegendeLocale({ texte, choisie, modifiable, valider, classe }: { texte: string; choisie: boolean; modifiable: boolean; valider(texte: string): void; classe: string }) {
  const [edition, setEdition] = useState(false)
  const champ = useChampOuvert()
  if (!edition) {
    return (
      <p
        className={classe}
        data-vide={texte ? undefined : ''}
        data-ecrire="legende"
        onPointerDown={(e) => choisie && modifiable && e.stopPropagation()}
        onClick={(e) => {
          if (!choisie || !modifiable || e.detail > 1) return
          champ.ouvert()
          setEdition(true)
        }}
      >
        {texte || t('note.legende')}
      </p>
    )
  }
  let annule = false
  return (
    <textarea
      className={`${classe} ${classe}-champ`}
      rows={1}
      autoFocus
      defaultValue={texte}
      placeholder={t('note.legende')}
      ref={(c) => {
        if (!c) return
        c.style.height = 'auto'
        c.style.height = `${c.scrollHeight}px`
      }}
      onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
      // Le premier clic d'un double-clic l'a ouvert : il se referme, et la toile ouvre la carte (`useChampOuvert`).
      {...champ.proprietes}
      onInput={(e) => {
        e.currentTarget.style.height = 'auto'
        e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          annule = e.key === 'Escape'
          e.currentTarget.blur()
        }
      }}
      onBlur={(e) => {
        if (!annule) valider(e.target.value.replace(/\s+/g, ' ').trim())
        setEdition(false)
      }}
    />
  )
}

type AvecLegende = Contenu & { legende?: string; avecLegende?: boolean }

/** « Légende » : montre ou cache la légende de la sélection, d'un seul pas. */
export function OutilLegende({ elements, contexte }: PropsOutils<AvecLegende>) {
  const tous = elements.every((e) => e.contenu.avecLegende)
  const basculer = () =>
    contexte.magasin.faire(
      elements.map((e) => {
        const { avecLegende: _, ...reste } = e.contenu
        return { type: 'contenu' as const, id: e.id, avant: e.contenu, apres: (tous ? reste : { ...reste, avecLegende: true }) as AvecLegende }
      }),
    )
  return <BoutonOutil icone="legende" titre={t('image.ajouterLegende')} libelle={t('note.legende')} actif={tous} onClick={basculer} />
}

/** Le contenu avec sa légende, ou sans la clé si elle est vide. */
export function avecTexteLegende<C extends AvecLegende>(c: C, texte: string): C {
  const { legende: _, ...reste } = c
  return (texte ? { ...reste, legende: texte } : reste) as C
}

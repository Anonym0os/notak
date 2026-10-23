import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { YTextEvent } from 'yjs'
import type { Id } from '../coeur/tableau'
import type { ContexteToile } from './types'

/**
 * Une ligne d'un élément écrite à plusieurs dans un simple champ (le titre d'une liste de tâches) : chaque frappe
 * devient une insertion ou une suppression dans un texte Yjs, et celles des autres reviennent sans déplacer le
 * curseur. Le contenu de l'élément en garde une copie, comme pour le texte d'une note.
 */

const ORIGINE = 'notak:ligne'

/** Ce qui change de `avant` à `apres` : à partir de `pos`, `retire` caractères ôtés et `insere` posé. */
export function ecart(avant: string, apres: string): { pos: number; retire: number; insere: string } {
  let debut = 0
  const court = Math.min(avant.length, apres.length)
  while (debut < court && avant[debut] === apres[debut]) debut++
  let fin = 0
  while (fin < court - debut && avant[avant.length - 1 - fin] === apres[apres.length - 1 - fin]) fin++
  return { pos: debut, retire: avant.length - debut - fin, insere: apres.slice(debut, apres.length - fin) }
}

/** Où se retrouve la position `p` après les changements `delta` d'un autre (format delta de Yjs). */
export function decaler(p: number, delta: YTextEvent['delta']): number {
  let lu = 0
  let nouveau = p
  for (const d of delta) {
    if (lu >= p) break
    if (d.retain !== undefined) lu += d.retain
    else if (typeof d.insert === 'string') nouveau += d.insert.length
    else if (d.delete !== undefined) {
      const ote = Math.min(d.delete, p - lu)
      nouveau -= ote
      lu += d.delete
    }
  }
  return Math.max(0, nouveau)
}

/**
 * Relie le champ `champ` à la ligne partagée de l'élément. Si personne d'autre n'y écrit, la ligne repart de
 * `initiale` (qu'une annulation a pu changer). `recu` est appelé quand un autre l'a changée.
 * Rend la fonction qui inscrit une frappe ; sans magasin partagé, elle ne fait rien.
 */
export function useLignePartagee(
  contexte: ContexteToile,
  id: Id,
  initiale: string | undefined,
  champ: RefObject<HTMLInputElement | null>,
  recu: (valeur: string) => void,
): (valeur: string) => void {
  const ligne = useMemo(() => {
    const l = contexte.magasin.ligne?.(id)
    if (!l) return null
    const ailleurs = contexte.services.presence?.autres().some((p) => p.edition === id)
    const voulu = initiale ?? ''
    if (!ailleurs && l.toString() !== voulu) {
      l.doc!.transact(() => {
        l.delete(0, l.length)
        l.insert(0, voulu)
      }, ORIGINE)
    }
    return l
  }, [])
  const recuRef = useRef(recu)
  recuRef.current = recu
  // Le curseur à remettre une fois la valeur d'un autre posée dans le champ, au rendu suivant.
  const curseur = useRef<[number, number] | null>(null)
  useLayoutEffect(() => {
    if (!curseur.current) return
    champ.current?.setSelectionRange(...curseur.current)
    curseur.current = null
  })

  useEffect(() => {
    if (!ligne) return
    const observer = (e: YTextEvent) => {
      if (e.transaction.origin === ORIGINE) return
      const c = champ.current
      const debut = c?.selectionStart ?? null
      const fin = c?.selectionEnd ?? null
      if (c && debut !== null && fin !== null && document.activeElement === c) curseur.current = [decaler(debut, e.delta), decaler(fin, e.delta)]
      recuRef.current(ligne.toString())
    }
    ligne.observe(observer)
    return () => ligne.unobserve(observer)
  }, [ligne])

  return (valeur: string) => {
    if (!ligne) return
    const { pos, retire, insere } = ecart(ligne.toString(), valeur)
    if (retire === 0 && !insere) return
    ligne.doc!.transact(() => {
      if (retire) ligne.delete(pos, retire)
      if (insere) ligne.insert(pos, insere)
    }, ORIGINE)
  }
}

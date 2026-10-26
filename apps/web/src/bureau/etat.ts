import { useEffect, useSyncExternalStore } from 'react'
import { type Acces, acces as lireDeLaCoque, estBureau } from '../bureau'

/**
 * Ce que la page sait des réglages de la coque (le serveur mémorisé, où s'ouvre Notak), partagé par les écrans qui le
 * montrent : la section « Où sont mes toiles ? », les réglages de l'app, la fenêtre « Se connecter à un serveur ».
 * `null` tant qu'on ne l'a pas lu, et pour une coque d'avant les serveurs qui ne répond pas.
 */
export interface EtatAcces {
  acces: Acces | null
  /** La coque a répondu (ou refusé) au moins une fois. */
  charge: boolean
}

let etat: EtatAcces = { acces: null, charge: false }
const abonnes = new Set<() => void>()
const ecouter = (f: () => void) => {
  abonnes.add(f)
  return () => void abonnes.delete(f)
}
const poser = (e: EtatAcces) => {
  etat = e
  for (const f of abonnes) f()
}

const lireEtatAcces = () => etat

/** Relit les réglages de la coque ; les rend, ou `null` si elle ne les donne pas. */
export async function relireAcces(): Promise<Acces | null> {
  if (!estBureau()) return null
  try {
    const a = await lireDeLaCoque()
    poser({ acces: a, charge: true })
    return a
  } catch {
    poser({ acces: null, charge: true })
    return null
  }
}

/** Les réglages de la coque, relus à chaque fois que l'écran qui les montre s'ouvre. */
export function useAcces(): EtatAcces {
  const e = useSyncExternalStore(ecouter, lireEtatAcces)
  useEffect(() => {
    void relireAcces()
  }, [])
  return e
}

/** La fenêtre « Se connecter à un serveur Notak », ouverte depuis l'édition locale. */
let dialogueOuvert = false
const abonnesDialogue = new Set<() => void>()
const ecouterDialogue = (f: () => void) => {
  abonnesDialogue.add(f)
  return () => void abonnesDialogue.delete(f)
}
const poserDialogue = (ouvert: boolean) => {
  if (dialogueOuvert === ouvert) return
  dialogueOuvert = ouvert
  for (const f of abonnesDialogue) f()
}

/** L'ouvre sur des réglages frais : le serveur retenu s'y lit tel qu'il est maintenant. */
export async function ouvrirDialogueAcces(): Promise<void> {
  await relireAcces()
  poserDialogue(true)
}
export const fermerDialogueAcces = () => poserDialogue(false)
export const useDialogueAcces = () => useSyncExternalStore(ecouterDialogue, () => dialogueOuvert)

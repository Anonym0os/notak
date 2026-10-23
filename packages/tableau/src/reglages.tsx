import { useCallback, useEffect, useRef, useState } from 'react'
import { PastillePersonne } from './pastille'

/**
 * Les réglages de l'interface, gardés par navigateur : thème, taille de l'interface, et ce que fait un double-clic
 * sur le vide. Cmd+, ouvre la fenêtre ; Cmd+Maj+D bascule le thème sans l'ouvrir.
 */
export interface Reglages {
  theme: 'clair' | 'sombre'
  taille: 'petite' | 'moyenne' | 'grande'
  /** Un double-clic sur le vide crée une note. */
  doubleClic: boolean
}

/**
 * Ce que l'application prête à la section « Compte » des réglages : qui est connecté, et de quoi changer sa photo
 * et sa couleur. Un refus (réseau, serveur) se dit en levant une erreur, dont le message est montré.
 */
export interface ServiceCompte {
  nom: string
  email?: string
  /** `#rrggbb` : celle du curseur et de la pastille. */
  couleur: string
  /** L'adresse affichable de la photo, ou `null`. */
  photo: string | null
  changerCouleur(couleur: string): Promise<void>
  /** `null` retire la photo. */
  changerPhoto(fichier: File | null): Promise<void>
}

/** Les couleurs qu'on propose à un compte. */
export const COULEURS_COMPTE = ['#e03131', '#f08c00', '#2f9e44', '#0c8599', '#1971c2', '#6741d9', '#c2255c', '#5c940d'] as const
export const TYPES_PHOTO = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
/** Une photo plus lourde est refusée avant l'envoi : elle ne sert qu'en pastille. */
export const PHOTO_MAX = 5 * 1024 * 1024

/** Pourquoi une photo est refusée, avec des mots ; `null` si elle convient. */
export function refusDePhoto(f: { type: string; size: number }): string | null {
  if (!TYPES_PHOTO.includes(f.type)) return 'Choisissez une image PNG, JPEG, WebP ou GIF.'
  if (f.size > PHOTO_MAX) return 'Cette image dépasse 5 Mo.'
  return null
}

const CLE = 'notak:reglages'
const DEFAUT: Reglages = { theme: 'clair', taille: 'moyenne', doubleClic: true }

function lire(): Reglages {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? '{}') as Partial<Reglages>
    // L'ancienne clé du thème seul, d'avant la fenêtre des réglages.
    const theme = brut.theme ?? (localStorage.getItem('notak:theme') === 'sombre' ? 'sombre' : undefined)
    return {
      theme: theme === 'sombre' ? 'sombre' : 'clair',
      taille: brut.taille === 'petite' || brut.taille === 'grande' ? brut.taille : 'moyenne',
      doubleClic: brut.doubleClic !== false,
    }
  } catch {
    return DEFAUT
  }
}

export function useReglages() {
  const [reglages, setReglages] = useState(lire)
  useEffect(() => {
    try {
      localStorage.setItem(CLE, JSON.stringify(reglages))
    } catch {
      // Sans stockage (navigation privée), les réglages valent pour la page.
    }
  }, [reglages])
  const changer = useCallback((r: Partial<Reglages>) => setReglages((v) => ({ ...v, ...r })), [])
  return [reglages, changer] as const
}

export function SectionCompte({ compte }: { compte: ServiceCompte }) {
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const champ = useRef<HTMLInputElement>(null)
  const faire = async (travail: () => Promise<void>) => {
    setOccupe(true)
    setErreur(null)
    try {
      await travail()
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'Le changement a échoué.')
    } finally {
      setOccupe(false)
    }
  }
  const choisirPhoto = (f: File | undefined) => {
    if (champ.current) champ.current.value = ''
    if (!f) return
    const refus = refusDePhoto(f)
    if (refus) return setErreur(refus)
    void faire(() => compte.changerPhoto(f))
  }
  return (
    <section className="notak-reglages-compte" aria-label="Compte">
      <div className="notak-reglages-identite">
        <PastillePersonne className="notak-reglages-avatar" nom={compte.nom} couleur={compte.couleur} adresse={compte.photo ?? undefined} />
        <div>
          <strong>{compte.nom}</strong>
          {compte.email && <small>{compte.email}</small>}
        </div>
      </div>
      <div className="notak-reglages-choix">
        <button type="button" disabled={occupe} onClick={() => champ.current?.click()}>
          {compte.photo ? 'Changer la photo' : 'Choisir une photo'}
        </button>
        {compte.photo && (
          <button type="button" disabled={occupe} onClick={() => void faire(() => compte.changerPhoto(null))}>
            Retirer la photo
          </button>
        )}
        <input ref={champ} type="file" accept={TYPES_PHOTO.join(',')} hidden aria-label="Photo du compte" onChange={(e) => choisirPhoto(e.target.files?.[0])} />
      </div>
      <label>Couleur du compte</label>
      <div className="notak-reglages-couleurs" role="radiogroup" aria-label="Couleur du compte">
        {COULEURS_COMPTE.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={compte.couleur.toLowerCase() === c}
            aria-label={c}
            disabled={occupe}
            style={{ background: c }}
            onClick={() => void faire(() => compte.changerCouleur(c))}
          />
        ))}
      </div>
      {erreur && (
        <p className="notak-reglages-erreur" role="alert">
          {erreur}
        </p>
      )}
    </section>
  )
}

export function FenetreReglages({
  reglages,
  changer,
  fermer,
  compte,
}: {
  reglages: Reglages
  changer(r: Partial<Reglages>): void
  fermer(): void
  compte?: ServiceCompte
}) {
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      fermer()
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [fermer])
  const choix = <K extends keyof Reglages>(cle: K, valeurs: [Reglages[K], string][]) => (
    <div className="notak-reglages-choix" role="radiogroup">
      {valeurs.map(([v, libelle]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={reglages[cle] === v} onClick={() => changer({ [cle]: v } as Partial<Reglages>)}>
          {libelle}
        </button>
      ))}
    </div>
  )
  return (
    <div className="notak-raccourcis-fond" onPointerDown={(e) => (e.stopPropagation(), e.target === e.currentTarget && fermer())}>
      <div className="notak-raccourcis notak-reglages" role="dialog" aria-label="Réglages">
        <div className="notak-raccourcis-tete">
          <strong>Réglages</strong>
          <button type="button" aria-label="Fermer" onClick={fermer}>
            ×
          </button>
        </div>
        <div className="notak-reglages-corps">
          {compte && <SectionCompte compte={compte} />}
          <label>Thème</label>
          {choix('theme', [
            ['clair', 'Clair'],
            ['sombre', 'Sombre'],
          ])}
          <label>Taille de l’interface</label>
          {choix('taille', [
            ['petite', 'Petite'],
            ['moyenne', 'Moyenne'],
            ['grande', 'Grande'],
          ])}
          <label>Double-clic sur le vide</label>
          {choix('doubleClic', [
            [true, 'Crée une note'],
            [false, 'Ne fait rien'],
          ])}
        </div>
      </div>
    </div>
  )
}

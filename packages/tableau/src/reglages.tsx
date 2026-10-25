import { useCallback, useEffect, useRef, useState } from 'react'
import { type ChoixLangue, definirLangue, t } from './langue'
import { PastillePersonne } from './pastille'
import type { Habillages } from './habillage/appliquer'
import { ErreurHabillage, HABILLAGE_NOTAK } from './habillage/format'

/**
 * Les réglages de l'interface, gardés par navigateur : thème, taille de l'interface, et ce que fait un double-clic
 * sur le vide. Cmd+, ouvre la fenêtre ; Cmd+Maj+D bascule le thème sans l'ouvrir.
 */
export interface Reglages {
  /** `systeme` suit le thème de macOS (ou du navigateur), en direct. */
  theme: 'clair' | 'sombre' | 'systeme'
  taille: 'petite' | 'moyenne' | 'grande'
  /** Un double-clic sur le vide crée une note. */
  doubleClic: boolean
  /** La taille d'une UG, en pixels (Cmd+Maj+, et Cmd+Maj+.). */
  grille: 8 | 9 | 10
  /** Où paraissent les outils d'une sélection : au-dessus d'elle, ou à la place de la barre de gauche. */
  barre: 'flottante' | 'gauche'
  /** La barre a été choisie dans les réglages (et pas seulement enregistrée par défaut). */
  barreChoisie?: true
  /** La langue de l'interface ; `auto` suit le navigateur. Absente : `auto`. */
  langue?: ChoixLangue
  /** L'habillage choisi sur cet appareil (`notak` : celui d'origine). Absent : celui que propose le serveur. */
  habillage?: string
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
  if (!TYPES_PHOTO.includes(f.type)) return t('reglages.photo.type')
  if (f.size > PHOTO_MAX) return t('reglages.photo.poids')
  return null
}

const CLE = 'notak:reglages'
export const DEFAUT: Reglages = { theme: 'clair', taille: 'moyenne', doubleClic: true, grille: 10, barre: 'gauche', langue: 'auto' }

/** Les réglages gardés dans ce navigateur, relus champ par champ. */
export function lireReglages(): Reglages {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? '{}') as Partial<Reglages>
    // L'ancienne clé du thème seul, d'avant la fenêtre des réglages.
    const theme = brut.theme ?? (localStorage.getItem('notak:theme') === 'sombre' ? 'sombre' : undefined)
    return {
      theme: theme === 'sombre' || theme === 'systeme' ? theme : 'clair',
      taille: brut.taille === 'petite' || brut.taille === 'grande' ? brut.taille : 'moyenne',
      doubleClic: brut.doubleClic !== false,
      grille: brut.grille === 8 || brut.grille === 9 ? brut.grille : 10,
      // Avant le 23/10, « flottante » était la valeur par défaut et s'enregistrait seule : elle ne compte que choisie.
      barre: brut.barreChoisie && brut.barre === 'flottante' ? 'flottante' : 'gauche',
      ...(brut.barreChoisie ? { barreChoisie: true } : {}),
      langue: brut.langue === 'fr' || brut.langue === 'en' ? brut.langue : 'auto',
      ...(typeof brut.habillage === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(brut.habillage) ? { habillage: brut.habillage } : {}),
    }
  } catch {
    return DEFAUT
  }
}

export function useReglages() {
  const [reglages, setReglages] = useState(lireReglages)
  useEffect(() => {
    try {
      localStorage.setItem(CLE, JSON.stringify(reglages))
    } catch {
      // Sans stockage (navigation privée), les réglages valent pour la page.
    }
  }, [reglages])
  // Un autre onglet change les réglages : celui-ci les reprend aussitôt (thème, langue, taille…).
  useEffect(() => {
    const ailleurs = (e: StorageEvent) => {
      if (e.key !== CLE) return
      const r = lireReglages()
      definirLangue(r.langue)
      setReglages((v) => (JSON.stringify(v) === JSON.stringify(r) ? v : r))
    }
    window.addEventListener('storage', ailleurs)
    return () => window.removeEventListener('storage', ailleurs)
  }, [])
  const changer = useCallback((r: Partial<Reglages>) => {
    // La langue change avant le rendu : tout ce qui se redessine ensuite parle déjà la nouvelle.
    if (r.langue) definirLangue(r.langue)
    setReglages((v) => ({ ...v, ...r, ...(r.barre ? { barreChoisie: true } : {}) }))
  }, [])
  return [reglages, changer] as const
}

/** Une option d'une pilule de choix : son libellé, et un détail plus pâle (« 8 px », la langue du navigateur). */
export interface OptionChoix {
  valeur: unknown
  libelle: string
  detail?: string
  lang?: string
}

/** La pilule de choix des réglages : un seul bouton enfoncé, blanc sur le gris de la pilule. */
export function Pilule({ libelle, options, actuelle, choisir, desactive }: { libelle: string; options: OptionChoix[]; actuelle: unknown; choisir(v: unknown): void; desactive?: boolean }) {
  return (
    <div className="notak-rg-pilule" role="radiogroup" aria-label={libelle}>
      {options.map((o) => (
        <button key={String(o.valeur)} type="button" role="radio" aria-checked={o.valeur === actuelle} disabled={desactive} lang={o.lang} onClick={() => choisir(o.valeur)}>
          {o.libelle}
          {o.detail && <small>{o.detail}</small>}
        </button>
      ))}
    </div>
  )
}

/** Un changement du compte en cours : le temps qu'il passe au serveur, et pourquoi il a échoué. */
function useTravail() {
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const faire = async (travail: () => Promise<void>) => {
    setOccupe(true)
    setErreur(null)
    try {
      await travail()
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : t('reglages.compte.echec'))
    } finally {
      setOccupe(false)
    }
  }
  return { occupe, erreur, setErreur, faire }
}

function Erreur({ texte }: { texte: string | null }) {
  return texte ? (
    <p className="notak-rg-erreur" role="alert">
      {texte}
    </p>
  ) : null
}

/** La photo du compte : la pastille telle que les autres la voient, de quoi la choisir et la retirer. */
export function ChoixPhoto({ compte }: { compte: ServiceCompte }) {
  const { occupe, erreur, setErreur, faire } = useTravail()
  const champ = useRef<HTMLInputElement>(null)
  const choisirPhoto = (f: File | undefined) => {
    if (champ.current) champ.current.value = ''
    if (!f) return
    const refus = refusDePhoto(f)
    if (refus) return setErreur(refus)
    void faire(() => compte.changerPhoto(f))
  }
  return (
    <div className="notak-rg-controle">
      <div className="notak-rg-rang">
        <PastillePersonne className="notak-reglages-avatar" nom={compte.nom} couleur={compte.couleur} adresse={compte.photo ?? undefined} />
        <button type="button" className="notak-rg-bouton" disabled={occupe} onClick={() => champ.current?.click()}>
          {compte.photo ? t('reglages.compte.photoChanger') : t('reglages.compte.photoChoisir')}
        </button>
        {compte.photo && (
          <button type="button" className="notak-rg-bouton" disabled={occupe} onClick={() => void faire(() => compte.changerPhoto(null))}>
            {t('reglages.compte.photoRetirer')}
          </button>
        )}
        <input ref={champ} type="file" accept={TYPES_PHOTO.join(',')} hidden aria-label={t('reglages.compte.photoChamp')} onChange={(e) => choisirPhoto(e.target.files?.[0])} />
      </div>
      <Erreur texte={erreur} />
    </div>
  )
}

/** La couleur du compte, parmi celles qu'on propose. */
export function ChoixCouleur({ compte }: { compte: ServiceCompte }) {
  const { occupe, erreur, faire } = useTravail()
  return (
    <div className="notak-rg-controle">
      <div className="notak-rg-couleurs" role="radiogroup" aria-label={t('reglages.compte.couleur')}>
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
      <Erreur texte={erreur} />
    </div>
  )
}

/** Clair, sombre, ou comme le système : chacun en petit aperçu de la toile (le système, moitié l'un, moitié l'autre). */
export function ChoixMode({ reglages, changer }: { reglages: Reglages; changer(r: Partial<Reglages>): void }) {
  return (
    <div className="notak-rg-modes" role="radiogroup" aria-label={t('reglages.mode')}>
      {(['clair', 'sombre', 'systeme'] as const).map((m) => (
        <button key={m} type="button" role="radio" className="notak-rg-tuile" aria-checked={reglages.theme === m} onClick={() => changer({ theme: m })}>
          <span className="notak-rg-apercu" data-mode={m} aria-hidden>
            <span />
            <span />
            <span />
          </span>
          {t(`reglages.theme.${m}`)}
        </button>
      ))}
    </div>
  )
}

/** Pourquoi un fichier de thème est refusé, avec des mots. */
function refusDeHabillage(e: unknown): string {
  if (!(e instanceof ErreurHabillage)) return t('reglages.habillage.refus.lecture')
  return t(`reglages.habillage.refus.${e.raison}`, { champ: e.champ ?? '' })
}

/** Le thème (l'habillage) : Notak ou un thème importé, et l'import d'un fichier. */
export function ChoixHabillage({ habillages, changer }: { habillages: Habillages; changer(r: Partial<Reglages>): void }) {
  const [erreur, setErreur] = useState<string | null>(null)
  const champ = useRef<HTMLInputElement>(null)
  const { liste, actif, impose } = habillages
  const actuel = actif?.id ?? HABILLAGE_NOTAK
  const importe = liste.find((d) => d.habillage.id === actuel && d.origine === 'importe')
  const choisirFichier = async (f: File | undefined) => {
    if (champ.current) champ.current.value = ''
    if (!f) return
    setErreur(null)
    try {
      const h = habillages.importer(await f.text())
      changer({ habillage: h.id })
    } catch (e) {
      setErreur(refusDeHabillage(e))
    }
  }
  const options: OptionChoix[] = [{ valeur: HABILLAGE_NOTAK, libelle: t('reglages.habillage.notak') }, ...liste.map((d) => ({ valeur: d.habillage.id, libelle: d.habillage.nom }))]
  return (
    <div className="notak-rg-controle">
      <div className="notak-rg-rang">
        <Pilule libelle={t('reglages.habillage')} options={options} actuelle={actuel} choisir={(id) => changer({ habillage: id as string })} desactive={impose} />
        {!impose && (
          <>
            <button type="button" className="notak-rg-bouton" onClick={() => champ.current?.click()}>
              {t('reglages.habillage.importer')}
            </button>
            <input ref={champ} type="file" accept=".json,application/json" hidden aria-label={t('reglages.habillage.champ')} onChange={(e) => void choisirFichier(e.target.files?.[0])} />
          </>
        )}
      </div>
      {impose && actif && <p className="notak-rg-note">{t('reglages.habillage.impose', { nom: actif.nom })}</p>}
      {!impose && importe && (
        <button type="button" className="notak-rg-retirer" onClick={() => (habillages.retirer(importe.habillage.id), changer({ habillage: HABILLAGE_NOTAK }))}>
          {t('reglages.habillage.retirer', { nom: importe.habillage.nom })}
        </button>
      )}
      <Erreur texte={erreur} />
    </div>
  )
}

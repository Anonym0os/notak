import { useCallback, useEffect, useRef, useState } from 'react'
import { Bouton } from './communs'
import { enFeuille } from './communs/Feuille'
import { type ChoixLangue, definirLangue, t } from './langue'
import { PastillePersonne } from './pastille'
import { Segments } from './communs'
import type { Habillages } from './habillage/appliquer'
import { ErreurHabillage, HABILLAGE_NOTAK } from './habillage/format'
import { AFFICHAGES_MINICARTE, type AffichageMinicarte } from './minicarteModele'

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
  /** Quand paraît la mini-carte du tableau et de la carte. Absente : pendant qu'on déplace ou qu'on zoome la vue. */
  minicarte?: AffichageMinicarte
  /** L'habillage choisi sur cet appareil (`notak` : celui d'origine). Absent : celui que propose le serveur. */
  habillage?: string
  /**
   * L'Apple Pencil sur la toile : `dessine` (absent) trace directement, sans passer par l'outil Dessin ; `doigt` choisit,
   * déplace et mène la vue comme le doigt. Dans la couche de dessin, il dessine toujours.
   */
  crayon?: 'dessine' | 'doigt'
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
      ...(brut.minicarte && brut.minicarte !== 'mouvement' && AFFICHAGES_MINICARTE.includes(brut.minicarte) ? { minicarte: brut.minicarte } : {}),
      ...(typeof brut.habillage === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(brut.habillage) ? { habillage: brut.habillage } : {}),
      ...(brut.crayon === 'doigt' ? { crayon: 'doigt' as const } : {}),
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

/** Une option d'un contrôle segmenté de choix : son libellé, et un détail plus pâle (« 8 px », la langue du navigateur). */
export interface OptionChoix {
  valeur: unknown
  libelle: string
  detail?: string
  lang?: string
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
        <PastillePersonne taille={36} nom={compte.nom} couleur={compte.couleur} adresse={compte.photo ?? undefined} />
        <Bouton variante="second" disabled={occupe} onClick={() => champ.current?.click()}>
          {compte.photo ? t('reglages.compte.photoChanger') : t('reglages.compte.photoChoisir')}
        </Bouton>
        {compte.photo && (
          <Bouton variante="second" disabled={occupe} onClick={() => void faire(() => compte.changerPhoto(null))}>
            {t('reglages.compte.photoRetirer')}
          </Bouton>
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

/** La coche d'une rangée choisie, dans les listes groupées du téléphone (ReglagesTelephone.tsx). */
export const Coche = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
)

/**
 * Le thème (l'habillage) : Notak ou un thème importé, et l'import d'un fichier. Sur un téléphone, en rangées comme les
 * autres choix : une coche sur le thème porté, « Importer… » et « Retirer » en rangées d'action dessous.
 */
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
  const fichier = <input ref={champ} type="file" accept=".json,application/json" hidden aria-label={t('reglages.habillage.champ')} onChange={(e) => void choisirFichier(e.target.files?.[0])} />
  const retirer = () => importe && (habillages.retirer(importe.habillage.id), changer({ habillage: HABILLAGE_NOTAK }))
  if (enFeuille()) {
    return (
      <div className="notak-rgt-rangees">
        <div role="radiogroup" aria-label={t('reglages.habillage')}>
          {options.map((o) => (
            <button key={String(o.valeur)} type="button" role="radio" aria-checked={o.valeur === actuel} className="notak-rgt-rangee" disabled={impose} onClick={() => changer({ habillage: o.valeur as string })}>
              <span className="notak-rgt-libelle">{o.libelle}</span>
              <span className="notak-rgt-coche">{o.valeur === actuel && <Coche />}</span>
            </button>
          ))}
        </div>
        {!impose && (
          <button type="button" className="notak-rgt-rangee notak-rgt-action" onClick={() => champ.current?.click()}>
            {t('reglages.habillage.importer')}
          </button>
        )}
        {!impose && importe && (
          <button type="button" className="notak-rgt-rangee notak-rgt-action" data-danger="" onClick={retirer}>
            {t('reglages.habillage.retirer', { nom: importe.habillage.nom })}
          </button>
        )}
        {!impose && fichier}
        {impose && actif && <p className="notak-rgt-note">{t('reglages.habillage.impose', { nom: actif.nom })}</p>}
        {erreur && (
          <div className="notak-rgt-note">
            <Erreur texte={erreur} />
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="notak-rg-controle">
      <div className="notak-rg-rang">
        <Segments libelle={t('reglages.habillage')} options={options} valeur={actuel} onChange={(id) => changer({ habillage: id as string })} inactif={impose} />
        {!impose && (
          <>
            <Bouton variante="second" onClick={() => champ.current?.click()}>
              {t('reglages.habillage.importer')}
            </Bouton>
            {fichier}
          </>
        )}
      </div>
      {impose && actif && <p className="notak-rg-note">{t('reglages.habillage.impose', { nom: actif.nom })}</p>}
      {!impose && importe && (
        <button type="button" className="notak-rg-retirer" onClick={retirer}>
          {t('reglages.habillage.retirer', { nom: importe.habillage.nom })}
        </button>
      )}
      <Erreur texte={erreur} />
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { FormeBranche, FormeSujet, Id, StyleSujet, Sujet } from '../../coeur/tableau'
import { t } from '../../langue'
import type { ContexteToile } from '../types'
import { GROUPES_MARQUEURS, Marqueur } from './marqueurs'
import type { Geste } from './modele/gestes'
import type { Lecture } from './modele/sujets'

export type Section = 'note' | 'etiquettes' | 'lien' | 'image' | 'marqueurs'

interface Props {
  lecture: Lecture
  /** Les sujets choisis (au moins un). */
  ids: Id[]
  /** La section où mettre le focus à l'ouverture. */
  section?: Section | undefined
  faire(g: Geste): void
  contexte: ContexteToile
  fermer(): void
}

/** La plus grande largeur d'une image posée sur un sujet, en px. */
const IMAGE_MAX = 200

/**
 * Le panneau d'un sujet (Cmd+], ou les raccourcis de docs/XMIND.md § 4) : ce que le sujet porte. Marqueurs, rang et
 * tâche valent pour tous les sujets choisis ; étiquettes, lien, note et image pour un seul.
 */
export function Panneau({ lecture: l, ids, section, faire, contexte, fermer }: Props) {
  const sujets = ids.map((x) => l.sujets.get(x)).filter((s): s is Sujet => !!s)
  const un = ids.length === 1 ? sujets[0] : undefined
  const id = ids[0]!
  const porter = (champ: Extract<Geste, { type: 'porter' }>['champ'], valeur: unknown, sur = ids) => faire({ type: 'porter', ids: sur, champ, valeur })
  const racine = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!section) return
    racine.current?.querySelector<HTMLElement>(`[data-section="${section}"] input, [data-section="${section}"] [contenteditable], [data-section="${section}"] button`)?.focus()
  }, [section, id])
  if (sujets.length === 0) return null
  const classe = sujets.every((s) => s.classe === sujets[0]!.classe) ? (sujets[0]!.classe ?? 'ordinaire') : null

  return (
    <aside ref={racine} className="notak-arbre-panneau" aria-label={t('arbre.panneau')} onKeyDown={(e) => (e.key === 'Escape' ? fermer() : e.stopPropagation())}>
      <header>
        <strong>{un ? un.titre || t('arbre.panneau') : `${sujets.length} × ${t('arbre.panneau')}`}</strong>
        <button type="button" aria-label={t('commun.fermer')} onClick={fermer}>
          ×
        </button>
      </header>

      <section data-section="marqueurs">
        <h3>{t('arbre.marqueurs')}</h3>
        {GROUPES_MARQUEURS.map((g) => (
          <div key={g.cle} className="notak-arbre-marqueurs" role="group">
            {g.marqueurs.map((m) => (
              <button key={m} type="button" title={m} aria-label={m} aria-pressed={sujets.every((s) => s.marqueurs?.includes(m))} onClick={() => faire({ type: 'marqueur', ids, marqueur: m })}>
                <svg width={18} height={18} viewBox="0 0 16 16">
                  <Marqueur id={m} />
                </svg>
              </button>
            ))}
          </div>
        ))}
      </section>

      <section>
        <h3>{t('arbre.rang')}</h3>
        <div className="notak-arbre-choix-ligne" role="radiogroup" aria-label={t('arbre.rang')}>
          {(['ordinaire', 'important', 'secondaire', 'barre'] as const).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={classe === c} onClick={() => porter('classe', c === 'ordinaire' ? undefined : c)}>
              {t(`arbre.${c}`)}
            </button>
          ))}
        </div>
        <label className="notak-arbre-case">
          <input type="checkbox" checked={sujets.every((s) => !!s.tache)} onChange={() => faire({ type: 'tache', ids })} />
          {t('arbre.tache')}
        </label>
      </section>

      <SectionStyle sujets={sujets} ids={ids} faire={faire} />

      {un && (
        <>
          <section>
            <h3>{t('arbre.numerotation')}</h3>
            <select
              value={un.numerotation?.motif ?? ''}
              onChange={(e) => porter('numerotation', e.target.value ? { ...un.numerotation, motif: e.target.value } : undefined)}
            >
              <option value="">{t('arbre.sansNumero')}</option>
              <option value="arabe">1, 2, 3</option>
              <option value="romain">I, II, III</option>
              <option value="majuscule">A, B, C</option>
              <option value="minuscule">a, b, c</option>
            </select>
            {un.numerotation && (
              <label className="notak-arbre-case">
                <input type="checkbox" checked={!!un.numerotation.paliers} onChange={(e) => porter('numerotation', { motif: un.numerotation!.motif, ...(e.target.checked ? { paliers: true } : {}) })} />
                {t('arbre.paliers')}
              </label>
            )}
          </section>

          <section data-section="etiquettes">
            <h3>{t('arbre.etiquettes')}</h3>
            <ChampValide
              key={`e${id}`}
              valeur={(un.etiquettes ?? []).join(', ')}
              aide={t('arbre.etiquettesAide')}
              valider={(v) =>
                porter(
                  'etiquettes',
                  v
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                )
              }
            />
          </section>

          <section data-section="lien">
            <h3>{t('arbre.lien')}</h3>
            <ChampValide key={`l${id}`} valeur={un.lien?.startsWith('sujet:') ? '' : (un.lien ?? '')} aide={t('arbre.lienAide')} valider={(v) => porter('lien', v.trim() || undefined)} />
            <select value={un.lien?.startsWith('sujet:') ? un.lien.slice(6) : ''} onChange={(e) => porter('lien', e.target.value ? `sujet:${e.target.value}` : undefined)} aria-label={t('arbre.lienSujet')}>
              <option value="">{t('arbre.lienSujet')}</option>
              {[...l.sujets].filter(([x]) => x !== id).map(([x, s]) => (
                <option key={x} value={x}>
                  {s.titre.replace(/\n/g, ' ').slice(0, 60)}
                </option>
              ))}
            </select>
          </section>

          <section data-section="image">
            <h3>{t('arbre.image')}</h3>
            {contexte.services.fichiers && (
              <ChoixImage
                aImage={!!un.image}
                choisir={async (f) => {
                  const fichier = await contexte.services.fichiers!.enregistrer(f)
                  const { l: lo, h: ho } = await tailleDe(f)
                  const k = Math.min(1, IMAGE_MAX / lo)
                  porter('image', { fichier, l: Math.round(lo * k), h: Math.round(ho * k) }, [id])
                }}
                retirer={() => porter('image', undefined, [id])}
              />
            )}
          </section>
        </>
      )}
    </aside>
  )
}

/** Un champ qui ne s'écrit dans la carte qu'à Entrée ou quand on le quitte : un seul pas d'historique. */
function ChampValide({ valeur, aide, valider }: { valeur: string; aide: string; valider(v: string): void }) {
  const [v, setV] = useState(valeur)
  useEffect(() => setV(valeur), [valeur])
  const ecrire = () => v !== valeur && valider(v)
  return (
    <input
      type="text"
      value={v}
      placeholder={aide}
      aria-label={aide}
      onChange={(e) => setV(e.target.value)}
      onBlur={ecrire}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ecrire()
        }
      }}
    />
  )
}

function ChoixImage({ aImage, choisir, retirer }: { aImage: boolean; choisir(f: File): Promise<void>; retirer(): void }) {
  const champ = useRef<HTMLInputElement>(null)
  return (
    <div className="notak-arbre-choix-ligne">
      <input ref={champ} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void choisir(e.target.files[0])} />
      <button type="button" onClick={() => champ.current?.click()}>
        {t('arbre.ajouterImage')}
      </button>
      {aImage && (
        <button type="button" onClick={retirer}>
          {t('arbre.retirerImage')}
        </button>
      )}
    </div>
  )
}

/** La taille d'origine d'une image, en px. */
async function tailleDe(f: Blob): Promise<{ l: number; h: number }> {
  try {
    const b = await createImageBitmap(f)
    const r = { l: b.width, h: b.height }
    b.close()
    return r
  } catch {
    return { l: IMAGE_MAX, h: IMAGE_MAX * 0.75 }
  }
}

const FORMES: FormeSujet[] = ['rectangle', 'arrondi', 'capsule', 'ellipse', 'souligne', 'double-souligne', 'losange', 'hexagone', 'parallelogramme', 'aucune']
const BRANCHES: FormeBranche[] = ['courbe', 'droite', 'coudee', 'coudee-arrondie', 'aucune']
const POLICES = [
  { nom: 'Inter', valeur: '' },
  { nom: 'Georgia', valeur: 'Georgia, serif' },
  { nom: 'Helvetica', valeur: 'Helvetica, Arial, sans-serif' },
  { nom: 'Menlo', valeur: 'Menlo, ui-monospace, monospace' },
]

/**
 * Le style des sujets choisis (docs/XMIND.md § 5) : forme, remplissage, bordure, texte, et la branche qui part d'eux.
 * Une valeur vide rend la main au thème. Copier, coller, appliquer au même rang et réinitialiser ont aussi leurs touches.
 */
function SectionStyle({ sujets, ids, faire }: { sujets: Sujet[]; ids: Id[]; faire(g: Geste): void }) {
  const commun = <K extends keyof StyleSujet>(k: K): StyleSujet[K] | undefined => {
    const v = sujets[0]?.style?.[k]
    return sujets.every((s) => s.style?.[k] === v) ? v : undefined
  }
  const poser = (style: Partial<StyleSujet>) => faire({ type: 'style', ids, style })
  const couleur = (k: 'remplissage' | 'bordure' | 'couleurTexte' | 'couleurBranche', libelle: string) => (
    <label className="notak-arbre-couleur">
      <input type="color" value={commun(k) ?? '#888888'} onChange={(e) => poser({ [k]: e.target.value })} />
      {libelle}
      {commun(k) && (
        <button type="button" aria-label={t('arbre.duTheme')} title={t('arbre.duTheme')} onClick={() => poser({ [k]: undefined })}>
          ×
        </button>
      )}
    </label>
  )
  return (
    <section data-section="style">
      <h3>{t('arbre.style')}</h3>
      <label>
        {t('arbre.forme')}
        <select value={commun('forme') ?? ''} onChange={(e) => poser({ forme: (e.target.value || undefined) as FormeSujet | undefined })}>
          <option value="">{t('arbre.duTheme')}</option>
          {FORMES.map((f) => (
            <option key={f} value={f}>
              {t(`arbre.f.${f}`)}
            </option>
          ))}
        </select>
      </label>
      {couleur('remplissage', t('arbre.remplissage'))}
      {couleur('bordure', t('arbre.bordure'))}
      <label>
        {t('arbre.police')}
        <select value={commun('police') ?? ''} onChange={(e) => poser({ police: e.target.value || undefined })}>
          {POLICES.map((p) => (
            <option key={p.nom} value={p.valeur}>
              {p.nom}
            </option>
          ))}
        </select>
      </label>
      <div className="notak-arbre-choix-ligne">
        <input
          type="number"
          min={8}
          max={64}
          aria-label={t('arbre.taille')}
          value={commun('taille') ?? ''}
          placeholder={t('arbre.taille')}
          onChange={(e) => poser({ taille: e.target.value ? Math.max(8, Math.min(64, Number(e.target.value))) : undefined })}
        />
        <button type="button" aria-pressed={commun('gras') === true} onClick={() => poser({ gras: commun('gras') === true ? undefined : true })}>
          <b>{t('arbre.gras')}</b>
        </button>
        <button type="button" aria-pressed={commun('italique') === true} onClick={() => poser({ italique: commun('italique') ? undefined : true })}>
          <i>{t('arbre.italique')}</i>
        </button>
      </div>
      {couleur('couleurTexte', t('arbre.couleurTexte'))}
      <h3>{t('arbre.branche')}</h3>
      <select value={commun('branche') ?? ''} onChange={(e) => poser({ branche: (e.target.value || undefined) as FormeBranche | undefined })} aria-label={t('arbre.branche')}>
        <option value="">{t('arbre.duTheme')}</option>
        {BRANCHES.map((b) => (
          <option key={b} value={b}>
            {t(`arbre.b.${b}`)}
          </option>
        ))}
      </select>
      {couleur('couleurBranche', t('arbre.couleurBranche'))}
      <label>
        {t('arbre.epaisseur')}
        <input type="range" min={1} max={8} step={0.5} value={commun('epaisseurBranche') ?? 1.75} onChange={(e) => poser({ epaisseurBranche: Number(e.target.value) })} />
      </label>
      <label className="notak-arbre-case">
        <input type="checkbox" checked={commun('effilee') === true} onChange={(e) => poser({ effilee: e.target.checked || undefined })} />
        {t('arbre.effilee')}
      </label>
      <select value={commun('motif') ?? 'plein'} onChange={(e) => poser({ motif: e.target.value === 'plein' ? undefined : (e.target.value as 'tirets' | 'points') })} aria-label={t('arbre.motif')}>
        <option value="plein">{t('arbre.m.plein')}</option>
        <option value="tirets">{t('arbre.m.tirets')}</option>
        <option value="points">{t('arbre.m.points')}</option>
      </select>
      <div className="notak-arbre-choix-ligne">
        {ids.length === 1 && (
          <button type="button" title="⌥⌘U" onClick={() => faire({ type: 'styleMemeRang', id: ids[0]! })}>
            {t('arbre.memeRang')}
          </button>
        )}
        <button type="button" title="⌥⌘0" onClick={() => faire({ type: 'style', ids, style: null })}>
          {t('arbre.reinitialiser')}
        </button>
      </div>
    </section>
  )
}

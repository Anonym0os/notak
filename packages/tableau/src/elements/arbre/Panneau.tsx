import { useEffect, useRef, useState } from 'react'
import type { Id, Sujet } from '../../coeur/tableau'
import { t } from '../../langue'
import { Case } from '../../communs'
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
  /** Dans l'onglet Style : sans son en-tête, ni le style et la numérotation (l'onglet les règle lui-même). */
  integre?: boolean
}

/** La plus grande largeur d'une image posée sur un sujet, en px. */
const IMAGE_MAX = 200

/**
 * Ce que le sujet porte (Cmd+], ou les raccourcis de docs/XMIND.md § 4), en bas de l'onglet Style. Marqueurs, rang et
 * tâche valent pour tous les sujets choisis ; étiquettes, lien, note et image pour un seul. Le style et la numérotation
 * se règlent dans l'onglet Style lui-même.
 */
export function Panneau({ lecture: l, ids, section, faire, contexte, fermer, integre }: Props) {
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
    <aside ref={racine} className={integre ? 'notak-arbre-contenu' : 'notak-arbre-panneau'} aria-label={t('arbre.panneau')} onKeyDown={(e) => (e.key === 'Escape' ? fermer() : e.stopPropagation())}>
      {!integre && (
        <header>
          <strong>{un ? un.titre || t('arbre.panneau') : `${sujets.length} × ${t('arbre.panneau')}`}</strong>
          <button type="button" aria-label={t('commun.fermer')} onClick={fermer}>
            ×
          </button>
        </header>
      )}

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
          <Case option cochee={sujets.every((s) => !!s.tache)} onChange={() => faire({ type: 'tache', ids })} />
          {t('arbre.tache')}
        </label>
      </section>

      {un && (
        <>
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

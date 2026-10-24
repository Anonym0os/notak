import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import type { Id, NoeudTexte, Sujet } from '../../coeur/tableau'
import { texteBrut } from '../../coeur/tableau'
import { t } from '../../langue'
import { EXTENSIONS_NOTE } from '../note/extensions'
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

          <section data-section="note">
            <h3>{t('arbre.note')}</h3>
            <EditeurNote key={`n${id}`} note={un.note} valider={(n) => porter('note', n)} />
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

/** La note d'un sujet, en texte riche : écrite dans la carte quand on quitte l'éditeur. */
function EditeurNote({ note, valider }: { note: NoeudTexte | undefined; valider(n: NoeudTexte | undefined): void }) {
  const editeur = useEditor({ extensions: EXTENSIONS_NOTE, content: note ?? '', editorProps: { attributes: { class: 'notak-texte notak-arbre-note', 'aria-label': t('arbre.note') } } })
  useEffect(() => {
    if (!editeur) return
    const quitter = () => {
      const doc = editeur.getJSON() as NoeudTexte
      const vide = texteBrut(doc).trim() === ''
      if (JSON.stringify(vide ? undefined : doc) !== JSON.stringify(note)) valider(vide ? undefined : doc)
    }
    editeur.on('blur', quitter)
    return () => {
      editeur.off('blur', quitter)
    }
  }, [editeur, note, valider])
  return <EditorContent editor={editeur} />
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

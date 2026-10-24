import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Id } from '../../coeur/tableau'
import { Icone } from '../../icones'
import { t } from '../../langue'
import type { ContexteToile } from '../types'
import type { ActionsInsertion } from './actionsMenu'
import { enMathml } from './equation'
import { Flottant } from './Flottant'
import type { Geste } from './modele/gestes'
import type { Planning } from './modele/insertions'
import type { Lecture } from './modele/sujets'
import type { OngletIcone } from './onglets'

/**
 * Ce que posent la barre d'outils et le menu « + » (docs/XMIND.md § 15) : les éditeurs en popover près du sujet
 * (étiquettes, tâche, lien, équation, note audio) et les sélecteurs de fichier (pièce jointe, image locale). Un seul
 * crochet, `useInsertions`, que la carte ouverte appelle ; il rend les actions et ce qu'il faut afficher.
 */

/** Où est un sujet à l'écran (px de la fenêtre) : le popover se pose dessous. */
export interface Ancre {
  x: number
  y: number
  l: number
  h: number
}

/** La plus grande largeur d'une image posée sur un sujet, en px. */
const IMAGE_MAX = 200

type Edition = { genre: 'etiquettes' | 'tache' | 'lienWeb' | 'lienSujet' | 'equation' | 'audio'; id: Id }

/** Ouvre le sélecteur de fichiers du système, et rend ce qui est choisi. */
export function choisirFichiers(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const champ = document.createElement('input')
    champ.type = 'file'
    champ.accept = accept
    champ.multiple = multiple
    champ.onchange = () => resolve([...(champ.files ?? [])])
    champ.oncancel = () => resolve([])
    champ.click()
  })
}

/** La taille d'origine d'une image, en px. */
export async function tailleImage(f: Blob): Promise<{ l: number; h: number }> {
  try {
    const b = await createImageBitmap(f)
    const r = { l: b.width, h: b.height }
    b.close()
    return r
  } catch {
    return { l: IMAGE_MAX, h: IMAGE_MAX * 0.75 }
  }
}

interface Props {
  lecture: Lecture
  /** Les sujets choisis. */
  ids: Id[]
  faire(g: Geste): void
  contexte: ContexteToile
  ancre(id: Id): Ancre | null
  ouvrirIcones(onglet: OngletIcone): void
  ouvrirNote(): void
  zone(): void
  adresse(fichier: Id): string | undefined
}

export function useInsertions({ lecture, ids, faire, contexte, ancre, ouvrirIcones, ouvrirNote, zone, adresse }: Props): { actions: ActionsInsertion; rendu: ReactNode; ouvrirAudio(id: Id): void } {
  const [edition, setEdition] = useState<Edition | null>(null)
  const cibles = ids.filter((x) => lecture.sujets.has(x))
  const un = cibles.length === 1 ? cibles[0]! : null
  const fichiers = contexte.services.fichiers

  const actions = useMemo<ActionsInsertion>(() => {
    const sur = (genre: Edition['genre'], seul: boolean) => () => {
      const cible = seul ? un : (cibles.at(-1) ?? null)
      if (cible) setEdition({ genre, id: cible })
    }
    return {
      zone,
      etiquettes: sur('etiquettes', false),
      tache: sur('tache', true),
      aFaire: () => cibles.length > 0 && faire({ type: 'tache', ids: cibles }),
      note: () => un && ouvrirNote(),
      lienWeb: sur('lienWeb', false),
      lienSujet: sur('lienSujet', true),
      pieceJointe: () => {
        if (!un || !fichiers) return
        void choisirFichiers('*/*').then(async ([f]) => {
          if (!f) return
          const fichier = await fichiers.enregistrer(f)
          faire({ type: 'porter', ids: [un], champ: 'piece', valeur: { fichier, nom: f.name, type: f.type || 'application/octet-stream', taille: f.size } })
        })
      },
      noteAudio: sur('audio', true),
      marqueur: () => ouvrirIcones('marqueurs'),
      autocollant: () => cibles.length > 0 && ouvrirIcones('autocollants'),
      illustration: () => cibles.length > 0 && ouvrirIcones('illustrations'),
      imageLocale: () => {
        if (!un || !fichiers) return
        void choisirFichiers('image/*').then(async ([f]) => {
          if (!f) return
          const fichier = await fichiers.enregistrer(f)
          const { l, h } = await tailleImage(f)
          const k = Math.min(1, IMAGE_MAX / l)
          faire({ type: 'porter', ids: [un], champ: 'image', valeur: { fichier, l: Math.round(l * k), h: Math.round(h * k) } })
        })
      },
      equation: sur('equation', true),
    }
  }, [cibles.join(','), un, faire, fichiers, ouvrirIcones, ouvrirNote, zone])

  const fermer = useCallback(() => setEdition(null), [])
  const sujet = edition ? lecture.sujets.get(edition.id) : undefined
  const place = edition && sujet ? ancre(edition.id) : null
  let corps: ReactNode = null
  if (edition && sujet && place) {
    const pour = cibles.length > 1 && edition.genre !== 'tache' ? cibles : [edition.id]
    switch (edition.genre) {
      case 'etiquettes':
        corps = (
          <Popover ancre={place} titre={t('arbre.inserer.etiquettes')} fermer={fermer}>
            <EditeurEtiquettes
              noms={pour.length === 1 ? (sujet.etiquettes ?? []) : []}
              ajouter={(nom) => faire({ type: 'etiquettes', ids: pour, ajouter: [nom] })}
              retirer={(nom) => faire({ type: 'etiquettes', ids: pour, retirer: [nom] })}
              multiple={pour.length > 1}
            />
          </Popover>
        )
        break
      case 'tache':
        corps = (
          <Popover ancre={place} titre={t('arbre.inserer.tache')} fermer={fermer}>
            <EditeurTache planning={sujet.planning} changer={(planning, change) => faire({ type: 'planning', ids: [edition.id], planning, ...(change ? { change } : {}) })} fermer={fermer} />
          </Popover>
        )
        break
      case 'lienWeb':
        corps = (
          <Popover ancre={place} titre={t('arbre.inserer.lienWeb')} fermer={fermer}>
            <EditeurLienWeb
              adresse={sujet.lien && !sujet.lien.startsWith('sujet:') ? sujet.lien : ''}
              valider={(v) => (faire({ type: 'porter', ids: pour, champ: 'lien', valeur: v || undefined }), fermer())}
            />
          </Popover>
        )
        break
      case 'lienSujet':
        corps = (
          <Popover ancre={place} titre={t('arbre.inserer.lienSujet')} fermer={fermer}>
            <EditeurLienSujet lecture={lecture} depuis={edition.id} choisi={sujet.lien?.startsWith('sujet:') ? sujet.lien.slice(6) : null} valider={(x) => (faire({ type: 'porter', ids: [edition.id], champ: 'lien', valeur: x ? `sujet:${x}` : undefined }), fermer())} />
          </Popover>
        )
        break
      case 'equation':
        corps = (
          <Popover ancre={place} titre={t('arbre.inserer.equation')} fermer={fermer} largeur={340}>
            <EditeurEquation
              latex={sujet.equation ?? ''}
              valider={(v) => (faire({ type: 'porter', ids: [edition.id], champ: 'equation', valeur: v.trim() || undefined }), fermer())}
            />
          </Popover>
        )
        break
      case 'audio':
        corps = (
          <Popover ancre={place} titre={t('arbre.inserer.noteAudio')} fermer={fermer}>
            <EditeurAudio
              existante={sujet.piece?.audio ? (adresse(sujet.piece.fichier) ?? null) : null}
              enregistrer={async (blob) => {
                if (!fichiers) return
                const fichier = await fichiers.enregistrer(blob)
                const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
                faire({ type: 'porter', ids: [edition.id], champ: 'piece', valeur: { fichier, nom: `${t('arbre.inserer.noteAudio')}.${extension}`, type: blob.type || 'audio/webm', taille: blob.size, audio: true } })
                fermer()
              }}
              retirer={() => (faire({ type: 'oter', ids: [edition.id], champs: ['piece'] }), fermer())}
            />
          </Popover>
        )
        break
    }
  }
  const ouvrirAudio = useCallback((id: Id) => setEdition({ genre: 'audio', id }), [])
  // Le sujet choisi a changé : l'éditeur ouvert sur un autre sujet se ferme.
  useEffect(() => {
    if (edition && !cibles.includes(edition.id) && edition.genre !== 'audio') setEdition(null)
  }, [cibles.join(','), edition])
  return { actions, rendu: corps, ouvrirAudio }
}

/**
 * Une bulle près d'un sujet : elle se pose dessous (dessus si la place manque), reste dans la fenêtre (Flottant), garde
 * le focus sur son premier champ, se ferme à Échap ou au clic dehors. Les touches qu'on tape dedans ne vont pas à la carte.
 */
export function Popover({ ancre, titre, fermer, children, largeur = 300 }: { ancre: Ancre; titre: string; fermer(): void; children: ReactNode; largeur?: number }) {
  const racine = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Le premier champ du corps ; à défaut son premier bouton. Jamais la croix de l'en-tête.
    const corps = racine.current?.querySelector<HTMLElement>(':scope > :not(header)')
    ;(corps?.querySelector<HTMLElement>('input:not([type=range]), textarea') ?? corps?.querySelector<HTMLElement>('button, audio'))?.focus({ preventScroll: true })
    const dehors = (e: PointerEvent) => {
      if (!racine.current?.contains(e.target as Node)) fermer()
    }
    const echap = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      fermer()
    }
    document.addEventListener('pointerdown', dehors, true)
    document.addEventListener('keydown', echap, true)
    return () => {
      document.removeEventListener('pointerdown', dehors, true)
      document.removeEventListener('keydown', echap, true)
    }
  }, [fermer])
  return (
    <Flottant
      racine={racine}
      ancre={ancre}
      cote="bas"
      alignement="centre"
      ecart={10}
      largeur={largeur}
      className="notak-arbre-popover notak-arbre-menu"
      role="dialog"
      aria-label={titre}
      onKeyDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <header>
        <strong>{titre}</strong>
        <button type="button" aria-label={t('commun.fermer')} onClick={fermer}>
          <Icone nom="fermer" taille={14} />
        </button>
      </header>
      {children}
    </Flottant>
  )
}

/** Les étiquettes d'un sujet : des pastilles à retirer, et un champ où l'on ajoute (Entrée ou virgule). */
export function EditeurEtiquettes({ noms, ajouter, retirer, multiple }: { noms: string[]; ajouter(nom: string): void; retirer(nom: string): void; multiple: boolean }) {
  const [texte, setTexte] = useState('')
  const valider = () => {
    for (const nom of texte.split(',').map((x) => x.trim()).filter(Boolean)) ajouter(nom)
    setTexte('')
  }
  return (
    <div className="notak-arbre-popover-corps">
      {noms.length > 0 && (
        <ul className="notak-arbre-pastilles" aria-label={t('arbre.etiquettes')}>
          {noms.map((nom) => (
            <li key={nom}>
              <span>{nom}</span>
              <button type="button" aria-label={`${t('arbre.inserer.retirer')} ${nom}`} onClick={() => retirer(nom)}>
                <Icone nom="fermer" taille={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        type="text"
        value={texte}
        placeholder={multiple ? t('arbre.inserer.etiquettesPlusieurs') : t('arbre.inserer.etiquettesAide')}
        aria-label={t('arbre.etiquettes')}
        onChange={(e) => setTexte(e.target.value)}
        onBlur={() => texte.trim() && valider()}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            valider()
          } else if (e.key === 'Backspace' && texte === '' && noms.length > 0 && !multiple) retirer(noms.at(-1)!)
        }}
      />
    </div>
  )
}

/** La tâche d'un sujet : début, fin, durée, avancement. Chaque champ remet les autres d'accord (`normaliserPlanning`). */
export function EditeurTache({ planning, changer, fermer }: { planning: Planning | undefined; changer(p: Planning | undefined, change?: 'debut' | 'fin' | 'duree'): void; fermer(): void }) {
  const p = planning ?? {}
  const champ = (k: 'debut' | 'fin') => (e: React.ChangeEvent<HTMLInputElement>) => changer({ ...p, [k]: e.target.value || undefined }, k)
  return (
    <div className="notak-arbre-popover-corps">
      <label>
        {t('arbre.inserer.debut')}
        <input type="date" value={p.debut ?? ''} onChange={champ('debut')} />
      </label>
      <label>
        {t('arbre.inserer.fin')}
        <input type="date" value={p.fin ?? ''} min={p.debut} onChange={champ('fin')} />
      </label>
      <label>
        {t('arbre.inserer.duree')}
        <input type="number" min={1} step={1} value={p.duree ?? ''} placeholder={t('arbre.inserer.joursUnite')} onChange={(e) => changer({ ...p, duree: e.target.value ? Number(e.target.value) : undefined }, 'duree')} />
      </label>
      <label>
        {t('arbre.inserer.progression')}
        <span className="notak-arbre-curseur">
          <input type="range" min={0} max={100} step={5} value={p.progression ?? 0} onChange={(e) => changer({ ...p, progression: Number(e.target.value) })} />
          <output>{p.progression ?? 0} %</output>
        </span>
      </label>
      <div className="notak-arbre-popover-actions">
        {planning && (
          <button type="button" onClick={() => (changer(undefined), fermer())}>
            {t('arbre.menu.planning.oter')}
          </button>
        )}
        <button type="button" className="notak-arbre-principal" onClick={fermer}>
          {t('arbre.inserer.ok')}
        </button>
      </div>
    </div>
  )
}

/** L'adresse web d'un sujet. */
export function EditeurLienWeb({ adresse, valider }: { adresse: string; valider(v: string): void }) {
  const [v, setV] = useState(adresse)
  return (
    <div className="notak-arbre-popover-corps">
      <input
        type="text"
        inputMode="url"
        value={v}
        placeholder="https://"
        aria-label={t('arbre.lienAide')}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            valider(v.trim())
          }
        }}
      />
      <div className="notak-arbre-popover-actions">
        {adresse && (
          <button type="button" onClick={() => valider('')}>
            {t('arbre.menu.oter.lien')}
          </button>
        )}
        <button type="button" className="notak-arbre-principal" onClick={() => valider(v.trim())}>
          {t('arbre.inserer.ok')}
        </button>
      </div>
    </div>
  )
}

/** Le lien d'un sujet vers un autre sujet de la carte : une liste qu'on filtre. */
export function EditeurLienSujet({ lecture, depuis, choisi, valider }: { lecture: Lecture; depuis: Id; choisi: Id | null; valider(x: Id | null): void }) {
  const [filtre, setFiltre] = useState('')
  const options = [...lecture.sujets]
    .filter(([x, s]) => x !== depuis && (s.titre || ' ').toLowerCase().includes(filtre.trim().toLowerCase()))
    .slice(0, 60)
  return (
    <div className="notak-arbre-popover-corps">
      <input type="text" value={filtre} placeholder={t('arbre.chercher')} aria-label={t('arbre.chercher')} onChange={(e) => setFiltre(e.target.value)} />
      <ul className="notak-arbre-liste" role="listbox" aria-label={t('arbre.inserer.lienSujet')}>
        {options.map(([x, s]) => (
          <li key={x}>
            <button type="button" role="option" aria-selected={x === choisi} onClick={() => valider(x)}>
              {s.titre.replace(/\n/g, ' ').trim() || t('arbre.inserer.sansTitre')}
            </button>
          </li>
        ))}
      </ul>
      {choisi && (
        <div className="notak-arbre-popover-actions">
          <button type="button" onClick={() => valider(null)}>
            {t('arbre.menu.oter.lien')}
          </button>
        </div>
      )}
    </div>
  )
}

/** Une équation en LaTeX, avec son aperçu à mesure qu'on écrit. Cmd+Entrée valide. */
export function EditeurEquation({ latex, valider }: { latex: string; valider(v: string): void }) {
  const [v, setV] = useState(latex)
  const mathml = useMemo(() => (v.trim() ? enMathml(v) : ''), [v])
  return (
    <div className="notak-arbre-popover-corps">
      <textarea
        value={v}
        rows={3}
        spellCheck={false}
        placeholder="\frac{a}{b} + \sqrt{x}"
        aria-label={t('arbre.inserer.equation')}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            if (mathml !== null) valider(v)
          }
        }}
      />
      <div className="notak-arbre-apercu-equation" aria-live="polite">
        {mathml === null ? <span className="notak-arbre-erreur">{t('arbre.inserer.latexInvalide')}</span> : mathml ? <span dangerouslySetInnerHTML={{ __html: mathml }} /> : <span className="notak-arbre-vide">{t('arbre.inserer.apercu')}</span>}
      </div>
      <div className="notak-arbre-popover-actions">
        {latex && (
          <button type="button" onClick={() => valider('')}>
            {t('arbre.inserer.retirer')}
          </button>
        )}
        <button type="button" className="notak-arbre-principal" disabled={mathml === null || !v.trim()} onClick={() => valider(v)}>
          {t('arbre.inserer.ok')}
        </button>
      </div>
    </div>
  )
}

type EtatAudio = { genre: 'repos' } | { genre: 'enregistre'; depuis: number } | { genre: 'fait'; blob: Blob; adresse: string } | { genre: 'refuse' }

/** Une note audio : le micro du navigateur, un bouton pour commencer et finir, l'écoute avant de garder. */
export function EditeurAudio({ existante, enregistrer, retirer }: { existante: string | null; enregistrer(b: Blob): void | Promise<void>; retirer(): void }) {
  const [etat, setEtat] = useState<EtatAudio>({ genre: 'repos' })
  const [seconde, setSeconde] = useState(0)
  const enregistreur = useRef<MediaRecorder | null>(null)
  const flux = useRef<MediaStream | null>(null)
  const morceaux = useRef<Blob[]>([])
  const possible = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

  useEffect(() => {
    if (etat.genre !== 'enregistre') return
    const i = setInterval(() => setSeconde(Math.floor((Date.now() - etat.depuis) / 1000)), 250)
    return () => clearInterval(i)
  }, [etat])
  useEffect(
    () => () => {
      flux.current?.getTracks().forEach((p) => p.stop())
    },
    [],
  )

  const commencer = async () => {
    try {
      const f = await navigator.mediaDevices.getUserMedia({ audio: true })
      flux.current = f
      const r = new MediaRecorder(f)
      morceaux.current = []
      r.ondataavailable = (e) => e.data.size > 0 && morceaux.current.push(e.data)
      r.onstop = () => {
        f.getTracks().forEach((p) => p.stop())
        const blob = new Blob(morceaux.current, { type: r.mimeType || 'audio/webm' })
        setEtat({ genre: 'fait', blob, adresse: URL.createObjectURL(blob) })
      }
      enregistreur.current = r
      r.start()
      setSeconde(0)
      setEtat({ genre: 'enregistre', depuis: Date.now() })
    } catch {
      setEtat({ genre: 'refuse' })
    }
  }
  useEffect(() => () => (etat.genre === 'fait' ? URL.revokeObjectURL(etat.adresse) : undefined), [etat])
  const minutes = `${Math.floor(seconde / 60)}:${String(seconde % 60).padStart(2, '0')}`
  return (
    <div className="notak-arbre-popover-corps">
      {existante && etat.genre === 'repos' && <audio controls src={existante} aria-label={t('arbre.inserer.noteAudio')} />}
      {!possible && <p className="notak-arbre-erreur">{t('arbre.inserer.micAbsent')}</p>}
      {etat.genre === 'refuse' && <p className="notak-arbre-erreur">{t('arbre.inserer.micRefuse')}</p>}
      {etat.genre === 'enregistre' && (
        <p className="notak-arbre-enregistrement" role="status">
          <span aria-hidden className="notak-arbre-point" /> {t('arbre.inserer.enregistrement')} {minutes}
        </p>
      )}
      {etat.genre === 'fait' && <audio controls src={etat.adresse} aria-label={t('arbre.inserer.noteAudio')} />}
      <div className="notak-arbre-popover-actions">
        {existante && etat.genre === 'repos' && (
          <button type="button" onClick={retirer}>
            {t('arbre.inserer.retirer')}
          </button>
        )}
        {possible && (etat.genre === 'repos' || etat.genre === 'refuse') && (
          <button type="button" className="notak-arbre-principal" onClick={() => void commencer()}>
            <Icone nom="micro" taille={14} /> {existante ? t('arbre.inserer.recommencer') : t('arbre.inserer.enregistrer')}
          </button>
        )}
        {etat.genre === 'enregistre' && (
          <button type="button" className="notak-arbre-principal" onClick={() => enregistreur.current?.stop()}>
            {t('arbre.inserer.arreter')}
          </button>
        )}
        {etat.genre === 'fait' && (
          <>
            <button type="button" onClick={() => setEtat({ genre: 'repos' })}>
              {t('arbre.inserer.recommencer')}
            </button>
            <button type="button" className="notak-arbre-principal" onClick={() => void enregistrer(etat.blob)}>
              {t('arbre.inserer.garder')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

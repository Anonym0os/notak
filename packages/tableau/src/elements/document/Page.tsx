import { useEffect, useRef, useState } from 'react'
import type { Id, PageDocument } from '../../coeur/tableau'
import { Icone } from '../../icones'
import { t } from '../../langue'
import { Interrupteur } from '../../communs'
import { useMenu } from '../../menuUnique'
import type { DepotFichiers } from '../types'

/**
 * La page d'un document ouvert en grand (docs/NOTION.md § 9) : la couverture en bandeau, l'icône au-dessus du texte,
 * et les options de la page (police, petit texte, pleine largeur).
 */

/** L'habillage lu d'un contenu venu d'ailleurs : ce qui est de travers est ignoré. */
export function pageDe(v: unknown): PageDocument {
  if (!v || typeof v !== 'object') return {}
  const p = v as Record<string, unknown>
  return {
    ...(typeof p.icone === 'string' && p.icone ? { icone: p.icone.slice(0, 16) } : {}),
    ...(typeof p.couverture === 'string' && p.couverture ? { couverture: p.couverture } : {}),
    ...(typeof p.cadrage === 'number' && Number.isFinite(p.cadrage) ? { cadrage: Math.min(100, Math.max(0, p.cadrage)) } : {}),
    ...(p.police === 'serif' || p.police === 'mono' ? { police: p.police } : {}),
    ...(p.petitTexte === true ? { petitTexte: true } : {}),
    ...(p.pleineLargeur === true ? { pleineLargeur: true } : {}),
  }
}

/** Les attributs que la boîte du document porte, et que `document.css` décline. */
export const attributsPage = (p: PageDocument) => ({
  'data-police': p.police,
  'data-petit': p.petitTexte || undefined,
  'data-large': p.pleineLargeur || undefined,
})

/** Les émojis qu'on propose pour l'icône. */
export const EMOJIS = [
  '📄', '📝', '📌', '📎', '📚', '📖', '🗂️', '📁', '📅', '🗓️', '✅', '☑️',
  '💡', '⭐', '🔥', '🎯', '🚀', '⚡', '🧭', '🔑', '🔒', '🛠️', '⚙️', '🧪',
  '🏠', '🏢', '🌍', '✈️', '🚗', '🍽️', '☕', '🎨', '🎵', '🎬', '📷', '🎮',
  '❤️', '😀', '🤝', '👋', '👀', '🧠', '🌱', '🌸', '☀️', '🌙', '❄️', '🌊',
]

/** Le choix d'une icône : une grille d'émojis, et « Retirer ». */
function ChoixIcone({ choisir, retirer }: { choisir(e: string): void; retirer?: () => void }) {
  return (
    <div className="notak-page-emojis" role="menu" aria-label={t('page.icone')}>
      <div className="notak-page-emojis-grille">
        {EMOJIS.map((e) => (
          <button key={e} type="button" role="menuitem" onClick={() => choisir(e)}>
            {e}
          </button>
        ))}
      </div>
      {retirer && (
        <button type="button" className="notak-page-lien" onClick={retirer}>
          {t('page.retirer')}
        </button>
      )}
    </div>
  )
}

interface PropsEntete {
  page: PageDocument
  changer(p: PageDocument): void
  fichiers?: DepotFichiers | undefined
  lectureSeule?: boolean
  /** Le titre de la page, sous l'icône et les boutons fantômes. */
  children?: React.ReactNode
}

/** Choisit une image sur l'appareil et la range avec les fichiers du tableau. */
function choisirImage(fichiers: DepotFichiers, fait: (id: Id) => void) {
  const champ = document.createElement('input')
  champ.type = 'file'
  champ.accept = 'image/*'
  champ.onchange = async () => {
    const f = champ.files?.[0]
    if (f) fait(await fichiers.enregistrer(f))
  }
  champ.click()
}

/** Le haut de la page : couverture, icône, et au survol « Ajouter une icône » et « Ajouter une couverture ». */
export function EntetePage({ page, changer, fichiers, lectureSeule, children }: PropsEntete) {
  const [emojis, setEmojis, ancre] = useMenu()
  const [adresse, setAdresse] = useState<string | null>(null)
  const [cadrage, setCadrage] = useState<number | null>(null)
  const bandeau = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let vivant = true
    setAdresse(null)
    if (page.couverture && fichiers) void fichiers.adresse(page.couverture).then((u) => vivant && setAdresse(u))
    return () => {
      vivant = false
    }
  }, [page.couverture, fichiers])
  const sans = <K extends keyof PageDocument>(cle: K): PageDocument => {
    const { [cle]: _, ...reste } = page
    return reste
  }
  // Tirer la couverture la recadre verticalement ; on écrit au lâcher.
  const recadrer = (e: React.PointerEvent) => {
    if (lectureSeule || e.button !== 0 || (e.target as Element).closest('button')) return
    e.preventDefault()
    const h = bandeau.current?.getBoundingClientRect().height ?? 200
    const y0 = e.clientY
    const depart = page.cadrage ?? 50
    let ici = depart
    const bouger = (m: PointerEvent) => {
      ici = Math.min(100, Math.max(0, depart - ((m.clientY - y0) / h) * 100))
      setCadrage(ici)
    }
    const lacher = () => {
      window.removeEventListener('pointermove', bouger)
      window.removeEventListener('pointerup', lacher)
      setCadrage(null)
      if (Math.round(ici) !== Math.round(depart)) changer({ ...page, cadrage: Math.round(ici) })
    }
    window.addEventListener('pointermove', bouger)
    window.addEventListener('pointerup', lacher)
  }
  const couverture = page.couverture && fichiers
  return (
    <div className="notak-page-entete" data-couverture={couverture ? '' : undefined}>
      {couverture && (
        <div
          ref={bandeau}
          className="notak-page-couverture"
          style={{ backgroundImage: adresse ? `url("${adresse}")` : undefined, backgroundPositionY: `${cadrage ?? page.cadrage ?? 50}%` }}
          onPointerDown={recadrer}
        >
          {!lectureSeule && (
            <div className="notak-page-couverture-actions">
              <button type="button" onClick={() => choisirImage(fichiers, (id) => changer({ ...page, couverture: id }))}>
                {t('page.changerCouverture')}
              </button>
              <button type="button" onClick={() => changer(sans('couverture'))}>
                {t('page.retirer')}
              </button>
            </div>
          )}
        </div>
      )}
      <div className="notak-page-tete notak-note-menu-ancre" ref={ancre}>
        {page.icone && (
          <button type="button" className="notak-page-icone" aria-label={t('page.icone')} disabled={lectureSeule} onClick={() => setEmojis(!emojis)}>
            {page.icone}
          </button>
        )}
        {!lectureSeule && (
          <div className="notak-page-ajouts">
            {!page.icone && (
              <button type="button" className="notak-page-lien" onClick={() => setEmojis(!emojis)}>
                <Icone nom="reaction" taille={16} /> {t('page.ajouterIcone')}
              </button>
            )}
            {!page.couverture && fichiers && (
              <button type="button" className="notak-page-lien" onClick={() => choisirImage(fichiers, (id) => changer({ ...page, couverture: id }))}>
                <Icone nom="image" taille={16} /> {t('page.ajouterCouverture')}
              </button>
            )}
          </div>
        )}
        {children}
        {emojis && (
          <ChoixIcone
            choisir={(e) => {
              changer({ ...page, icone: e })
              setEmojis(false)
            }}
            {...(page.icone
              ? {
                  retirer: () => {
                    changer(sans('icone'))
                    setEmojis(false)
                  },
                }
              : {})}
          />
        )}
      </div>
    </div>
  )
}

/** « ••• » dans l'en-tête : la police, le petit texte et la pleine largeur de la page. */
export function OptionsPage({ page, changer }: { page: PageDocument; changer(p: PageDocument): void }) {
  const [ouvert, setOuvert, ancre] = useMenu()
  const police = page.police ?? 'defaut'
  const basculer = (cle: 'petitTexte' | 'pleineLargeur') => {
    const { [cle]: actif, ...reste } = page
    changer(actif ? reste : { ...reste, [cle]: true })
  }
  return (
    <div className="notak-note-menu-ancre notak-page-options" ref={ancre}>
      <button type="button" className="notak-document-export-bouton" aria-label={t('page.options')} title={t('page.options')} aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        <Icone nom="plus" taille={20} trait={1.5} />
      </button>
      {ouvert && (
        <div className="notak-note-menu notak-page-options-menu" role="menu">
          <div className="notak-page-polices">
            {(['defaut', 'serif', 'mono'] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="menuitemradio"
                aria-checked={police === p}
                data-police={p}
                onClick={() => {
                  const { police: _, ...reste } = page
                  changer(p === 'defaut' ? reste : { ...reste, police: p })
                }}
              >
                <span className="notak-page-police-ag">Ag</span>
                {t(`page.police.${p}`)}
              </button>
            ))}
          </div>
          <button type="button" role="menuitemcheckbox" aria-checked={!!page.petitTexte} className="notak-page-option" onClick={() => basculer('petitTexte')}>
            {t('page.petitTexte')}
            <Interrupteur decor actif={!!page.petitTexte} />
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={!!page.pleineLargeur} className="notak-page-option" onClick={() => basculer('pleineLargeur')}>
            {t('page.pleineLargeur')}
            <Interrupteur decor actif={!!page.pleineLargeur} />
          </button>
        </div>
      )}
    </div>
  )
}

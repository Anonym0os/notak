import type { Editor } from '@tiptap/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PanneauFlottant } from '../PanneauFlottant'
import { LigneMenu, Menu, TitreMenu } from '../communs'
import type { NomIcone } from '../icones'
import { t } from '../langue'
import { insererSignet, normaliserAdresse } from './apercu'
import { CLE_APERCU, type EtatApercu, choisirApercu, fermerApercu, ouvrirApercu } from './collerComme'
import { blocA } from './gestes'

/**
 * Les deux petits menus de l'aperçu de lien (docs/NOTION.md § 10.3) : « coller comme », sous la fin d'un lien tout juste
 * collé, et le champ « Collez le lien… » que le menu « / » ouvre sous le bloc. Ils lisent leur état dans l'éditeur
 * (`collerComme.ts`) ; le clavier du premier est le sien (↑ ↓ Entrée Échap), celui du second est le champ.
 */


export function ApercuMenus({ editeur }: { editeur: Editor }) {
  const [etat, setEtat] = useState<EtatApercu>(() => CLE_APERCU.getState(editeur.state) ?? null)
  useEffect(() => {
    const lire = () => setEtat(CLE_APERCU.getState(editeur.state) ?? null)
    lire()
    editeur.on('transaction', lire)
    return () => void editeur.off('transaction', lire)
  }, [editeur])
  if (!etat) return null
  const hote = editeur.view.dom.closest<HTMLElement>('[aria-modal], .notak-espace')
  return etat.genre === 'coller' ? <MenuCollerComme editeur={editeur} etat={etat} hote={hote} /> : <ChampApercu editeur={editeur} hote={hote} />
}

/**
 * « Coller en tant que » (mesuré dans Notion) : « Aperçu » (en faire une carte, choisi d'avance) ou « URL » (garder le
 * lien collé), sous la fin du lien ; des lignes de texte seul, sous un titre.
 */
function MenuCollerComme({ editeur, etat, hote }: { editeur: Editor; etat: Extract<EtatApercu, { genre: 'coller' }>; hote: HTMLElement | null }) {
  const choix: { cle: string; icone: NomIcone; libelle: string }[] = [
    { cle: 'apercu', icone: 'vueCarte', libelle: t('menus.collerComme.apercu') },
    { cle: 'lien', icone: 'lien', libelle: t('menus.collerComme.lien') },
  ]
  // Sous le point où finit le lien, relu à chaque image : le menu suit la page qui défile.
  const cible = () => {
    try {
      const { left, right, top, bottom } = editeur.view.coordsAtPos(etat.a)
      return { left, right, top, bottom }
    } catch {
      return null
    }
  }
  const agir = (rang: number) => {
    if (rang === 0) choisirApercu(editeur.view)
    else fermerApercu(editeur.view)
    editeur.commands.focus()
  }
  return (
    <PanneauFlottant cible={cible} hote={hote} cote="bas" alignement="debut" distance={4} fleche={false} className="notak-menu-blocs-panneau" onPointerDown={(e) => e.preventDefault()}>
      <Menu className="notak-menu-blocs notak-apercu-coller" data-genre="coller" role="listbox" aria-label={t('menus.collerComme.titre')}>
        <TitreMenu>{t('menus.collerComme.titre')}</TitreMenu>
        {choix.map((c, i) => (
          <LigneMenu
            key={c.cle}
            as="div"
            role="option"
            aria-selected={i === etat.rang}
            data-id={c.cle}
            actif={i === etat.rang}
            icone={c.icone}
            libelle={c.libelle}
            onPointerEnter={() => i !== etat.rang && ouvrirApercu(editeur.view, { ...etat, rang: i })}
            onClick={() => agir(i)}
          />
        ))}
      </Menu>
    </PanneauFlottant>
  )
}

/** Le champ du menu « / » : l'adresse à coller, puis Entrée ou « Créer l'aperçu » ; Échap ou un clic dehors annulent. */
function ChampApercu({ editeur, hote }: { editeur: Editor; hote: HTMLElement | null }) {
  const [saisie, setSaisie] = useState('')
  const [invalide, setInvalide] = useState(false)
  const champ = useRef<HTMLInputElement>(null)
  const panneau = useRef<HTMLDivElement>(null)
  // Le bloc du curseur au moment de l'ouverture : le champ se pose sous lui.
  const bloc = useMemo(() => {
    const pos = blocA(editeur.state.selection.$from)
    const dom = pos === null ? null : editeur.view.nodeDOM(pos)
    return dom instanceof HTMLElement ? dom : null
  }, [editeur])

  // Le champ prend le focus une fois le panneau placé : caché, il ne le prendrait pas.
  useEffect(() => {
    let image = 0
    let essais = 0
    const viser = () => {
      champ.current?.focus()
      if (document.activeElement !== champ.current && ++essais < 20) image = requestAnimationFrame(viser)
    }
    image = requestAnimationFrame(viser)
    return () => cancelAnimationFrame(image)
  }, [])

  const annuler = (rendreLeFocus: boolean) => {
    fermerApercu(editeur.view)
    if (rendreLeFocus) editeur.commands.focus()
  }
  useEffect(() => {
    const dehors = (e: PointerEvent) => {
      if (!panneau.current?.contains(e.target as Node)) annuler(false)
    }
    document.addEventListener('pointerdown', dehors, true)
    return () => document.removeEventListener('pointerdown', dehors, true)
  }, [editeur])

  const creer = () => {
    const url = normaliserAdresse(saisie)
    if (!url) return setInvalide(true)
    fermerApercu(editeur.view)
    insererSignet(editeur, url)
  }

  return (
    <PanneauFlottant
      cible={() => bloc}
      hote={hote}
      cote="bas"
      alignement="debut"
      distance={4}
      fleche={false}
      className="notak-menu-blocs-panneau"
      panneau={panneau}
      onPointerDown={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault()
      }}
    >
      <div className="notak-pop notak-menu-blocs notak-apercu-champ" data-genre="lien" role="dialog" aria-label={t('blocs.apercuLien')}>
        <input
          ref={champ}
          className="notak-menu-blocs-filtre"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={saisie}
          placeholder={t('menus.lien.invite')}
          aria-label={t('menus.lien.invite')}
          aria-invalid={invalide || undefined}
          onChange={(e) => {
            setSaisie(e.target.value)
            setInvalide(false)
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') {
              e.preventDefault()
              e.stopPropagation()
              creer()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              annuler(true)
            }
          }}
        />
        {invalide && (
          <div className="notak-apercu-erreur" role="alert">
            {t('menus.lien.urlComplete')}
          </div>
        )}
        <button type="button" className="notak-apercu-creer" disabled={!saisie.trim()} onClick={creer}>
          {t('menus.apercu.creer')}
        </button>
      </div>
    </PanneauFlottant>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { Nuancier } from '../../coeur/tableau'
import { couleurTexteSur } from '../note/couleurs'
import type { PropsOutils, PropsRendu } from '../types'
import { FORMATS_CODE, type FormatCode, codeAffiche, normaliserHex, piocherCouleur, pipetteDisponible } from './couleur'
import { t } from '../../langue'
import { BoutonOutil, OutilAvecMenu } from '../../BoutonOutil'
import { Icone } from '../../icones'
import { useMenu } from '../../menuUnique'

/** Les champs de la carte ne lancent pas de glisser. */
const garder = (e: React.PointerEvent) => e.stopPropagation()

export function RenduNuancier({ element, enEdition, contexte, brouillon }: PropsRendu<Nuancier>) {
  const c = element.contenu
  return (
    <div className="notak-nuancier" style={{ background: c.couleur, color: couleurTexteSur(c.couleur) }}>
      {!c.sansCode && <span className="notak-nuancier-code">{codeAffiche(c.couleur, c.format)}</span>}
      {enEdition && <Reglage contenu={c} ecrire={brouillon} finir={contexte.finirEdition} />}
    </div>
  )
}

/**
 * Sous le nuancier en édition : le sélecteur du système, le code à taper et la pipette. Un code qui n'est pas
 * encore valide reste dans le champ sans toucher la couleur ; Entrée ou Échap ferment.
 */
function Reglage({ contenu, ecrire, finir }: { contenu: Nuancier; ecrire(c: Nuancier): void; finir(): void }) {
  const [texte, setTexte] = useState(codeAffiche(contenu.couleur))
  const champ = useRef<HTMLInputElement>(null)
  useEffect(() => {
    champ.current?.focus()
    champ.current?.select()
  }, [])
  const poser = (couleur: string) => {
    setTexte(codeAffiche(couleur))
    ecrire({ ...contenu, couleur })
  }
  return (
    <div className="notak-nuancier-reglage" onPointerDown={garder} onDoubleClick={(e) => e.stopPropagation()}>
      <input type="color" aria-label={t('nuancier.choisir')} value={contenu.couleur} onChange={(e) => poser(e.target.value)} />
      <input
        ref={champ}
        type="text"
        aria-label={t('nuancier.codeCouleur')}
        spellCheck={false}
        maxLength={7}
        value={texte}
        data-invalide={normaliserHex(texte) ? undefined : ''}
        onChange={(e) => {
          setTexte(e.target.value)
          const hex = normaliserHex(e.target.value)
          if (hex) ecrire({ ...contenu, couleur: hex })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            finir()
          }
        }}
      />
      {pipetteDisponible() && (
        <button type="button" title={t('nuancier.pipette.titre')} onClick={() => void piocherCouleur().then((h) => h && poser(h))}>
          {t('nuancier.pipette')}
        </button>
      )}
    </div>
  )
}

/** « Couleur » : la tuile ouvre tout de suite le sélecteur du système ; la teinte se pose quand on le referme. */
export function OutilsNuancier({ elements, contexte }: PropsOutils<Nuancier>) {
  const champ = useRef<HTMLInputElement>(null)
  const appliquerRef = useRef<(hex: string) => void>(() => {})
  appliquerRef.current = (hex) => contexte.magasin.faire(elements.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: { ...e.contenu, couleur: hex } })))
  useEffect(() => {
    const c = champ.current
    if (!c) return
    const fin = () => {
      const hex = normaliserHex(c.value)
      if (hex) appliquerRef.current(hex)
    }
    c.addEventListener('change', fin)
    return () => c.removeEventListener('change', fin)
  }, [])
  if (contexte.services.lectureSeule) return null
  const commune = elements.every((e) => e.contenu.couleur === elements[0]!.contenu.couleur) ? elements[0]!.contenu.couleur : undefined
  const ouvrir = () => {
    const c = champ.current
    if (!c) return
    if (commune) c.value = commune
    if (typeof c.showPicker === 'function') c.showPicker()
    else c.click()
  }
  return (
    <>
      <BoutonOutil icone="palette" pastille={commune} titre={t('nuancier.changer')} libelle={t('couleur.titre')} onClick={ouvrir} />
      <input ref={champ} type="color" className="notak-nuancier-natif" tabIndex={-1} aria-label={t('nuancier.choisir')} defaultValue={commune ?? '#000000'} />
    </>
  )
}

/** Affichage du code (HEX, RGB, HSL, rien), puis la pipette dans « ••• ». */
export function OutilsNuancierApres({ elements, contexte }: PropsOutils<Nuancier>) {
  const menu = useMenu()
  if (contexte.services.lectureSeule) return null
  const appliquer = (f: (e: PropsOutils<Nuancier>['elements'][number]) => Nuancier) => {
    contexte.magasin.faire(elements.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: f(e) })))
    menu[1](false)
  }
  const choix = (e: PropsOutils<Nuancier>['elements'][number]): FormatCode | 'rien' => (e.contenu.sansCode ? 'rien' : e.contenu.format ?? 'hex')
  const commun = elements.every((e) => choix(e) === choix(elements[0]!)) ? choix(elements[0]!) : undefined
  const poser = (c: Nuancier, vers: FormatCode | 'rien'): Nuancier => {
    const { sansCode: _, format: __, ...reste } = c
    return vers === 'rien' ? { ...reste, sansCode: true } : vers === 'hex' ? reste : { ...reste, format: vers }
  }
  const libelles: Record<FormatCode | 'rien', string> = { hex: 'HEX', rgb: 'RGB', hsl: 'HSL', rien: t('nuancier.sansCode') }
  return (
    <>
      <OutilAvecMenu menu={menu} icone="diese" titre={t('nuancier.affichage')} libelle={commun ? libelles[commun] : t('nuancier.code')}>
        <div className="notak-note-palette notak-decor-menu" role="menu">
          {([...FORMATS_CODE, 'rien'] as const).map((f) => (
            <button key={f} type="button" className="notak-menu-rang" role="menuitemradio" aria-checked={commun === f} onClick={() => appliquer((e) => poser(e.contenu, f))}>
              <span className="notak-menu-rang-texte">{libelles[f]}</span>
              {commun === f && <Icone nom="coche" taille={14} />}
            </button>
          ))}
        </div>
      </OutilAvecMenu>
      {elements.length === 1 && pipetteDisponible() && (
        <BoutonOutil
          icone="pipette"
          secondaire
          titre={t('nuancier.pipette.titre')}
          libelle={t('nuancier.pipette')}
          onClick={() => void piocherCouleur().then((h) => h && appliquer((e) => ({ ...e.contenu, couleur: h })))}
        />
      )}
    </>
  )
}

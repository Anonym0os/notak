import { useEffect, useRef, useState } from 'react'
import type { Nuancier } from '../../coeur/tableau'
import { couleurTexteSur } from '../note/couleurs'
import type { PropsOutils, PropsRendu } from '../types'
import { codeAffiche, normaliserHex, piocherCouleur, pipetteDisponible } from './couleur'
import { t } from '../../langue'

/** Les champs de la carte ne lancent pas de glisser. */
const garder = (e: React.PointerEvent) => e.stopPropagation()

export function RenduNuancier({ element, enEdition, contexte, brouillon }: PropsRendu<Nuancier>) {
  const c = element.contenu
  return (
    <div className="notak-nuancier" style={{ background: c.couleur, color: couleurTexteSur(c.couleur) }}>
      {!c.sansCode && <span className="notak-nuancier-code">{codeAffiche(c.couleur)}</span>}
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

export function OutilsNuancier({ elements, contexte }: PropsOutils<Nuancier>) {
  if (contexte.services.lectureSeule) return null
  const appliquer = (f: (e: PropsOutils<Nuancier>['elements'][number]) => Nuancier) =>
    contexte.magasin.faire(elements.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: f(e) })))
  const avecCode = elements.every((e) => !e.contenu.sansCode)
  return (
    <>
      {elements.length === 1 && (
        <button type="button" title={t('nuancier.changer')} onClick={() => contexte.commencerEdition(elements[0]!.id)}>
          {t('couleur.titre')}
        </button>
      )}
      {elements.length === 1 && pipetteDisponible() && (
        <button
          type="button"
          title={t('nuancier.pipette.titre')}
          onClick={() => void piocherCouleur().then((h) => h && appliquer((e) => ({ ...e.contenu, couleur: h })))}
        >
          {t('nuancier.pipette')}
        </button>
      )}
      <button
        type="button"
        title={avecCode ? t('nuancier.cacherCode') : t('nuancier.montrerCode')}
        aria-pressed={avecCode}
        onClick={() => appliquer(({ contenu: { sansCode: _, ...reste } }) => (avecCode ? { ...reste, sansCode: true } : reste))}
      >
        {t('nuancier.code')}
      </button>
    </>
  )
}

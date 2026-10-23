import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Nuancier } from '../../coeur/tableau'
import { couleurTexteSur } from '../note/couleurs'
import type { PropsOutils, PropsRendu } from '../types'
import { FORMATS_CODE, type FormatCode, LARGEUR_SANS_CODE, analyserCode, codeAffiche, nomDeCouleur, normaliserHex, retenirFormat } from './couleur'
import { PX_PAR_UG } from '../../coeur/camera'
import { langue, t } from '../../langue'
import { BoutonOutil, OutilAvecMenu } from '../../BoutonOutil'
import { useMenu } from '../../menuUnique'

/** Les champs de la carte ne lancent pas de glisser. */
const garder = (e: React.PointerEvent) => e.stopPropagation()

/** Ce que l'édition doit viser en premier : le code (par défaut) ou la légende, quand on a cliqué dessus. */
let viser: 'code' | 'legende' = 'code'

export function RenduNuancier({ element, choisie, seule, enEdition, contexte, brouillon }: PropsRendu<Nuancier>) {
  const c = element.contenu
  // Libre en hauteur : celle qu'on a tirée (en UG) remplace le rapport 17 : 12.
  const h = element.hauteur ? ('min' in element.hauteur ? element.hauteur.min : element.hauteur.max) : undefined
  const style = { background: c.couleur, color: couleurTexteSur(c.couleur), ...(h ? { height: h * PX_PAR_UG, aspectRatio: 'auto' } : {}) }
  // Sur un nuancier étroit, le code se tait, sauf pendant qu'on l'écrit.
  const montrer = enEdition || (!c.sansCode && element.largeur > LARGEUR_SANS_CODE)
  const modifiable = !contexte.services.lectureSeule
  const but = enEdition ? viser : 'code'
  return (
    <div className="notak-nuancier-carte" data-legende={c.avecLegende || undefined}>
      <div className="notak-nuancier" style={style}>
        {montrer && (enEdition ? <CodeEnPlace contenu={c} ecrire={brouillon} finir={contexte.finirEdition} focus={but === 'code'} /> : <span
            className="notak-nuancier-code"
            // Le code d'un nuancier choisi seul s'écrit d'un clic ; ailleurs un appui le glisse comme le reste.
            onPointerDown={(e) => seule && modifiable && e.stopPropagation()}
            onClick={() => {
              if (!seule || !modifiable) return
              viser = 'code'
              contexte.commencerEdition(element.id)
            }}
          >
            {codeAffiche(c.couleur, c.format)}
          </span>)}
      </div>
      {c.avecLegende &&
        (enEdition ? (
          <LegendeEnPlace contenu={c} ecrire={brouillon} finir={contexte.finirEdition} focus={but === 'legende'} />
        ) : (
          <p
            className="notak-nuancier-legende"
            data-vide={c.legende ? undefined : ''}
            onPointerDown={(e) => choisie && modifiable && e.stopPropagation()}
            onClick={() => {
              if (!choisie || !modifiable) return
              viser = 'legende'
              contexte.commencerEdition(element.id)
            }}
          >
            {c.legende || t('note.legende')}
          </p>
        ))}
    </div>
  )
}

/** La légende s'écrit sous l'aplat, sur une ligne qui grandit avec son texte ; Entrée valide. */
function LegendeEnPlace({ contenu, ecrire, finir, focus }: { contenu: Nuancier; ecrire(c: Nuancier): void; finir(): void; focus: boolean }) {
  const [valeur, setValeur] = useState(contenu.legende ?? '')
  const champ = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!focus) return
    champ.current?.focus({ preventScroll: true })
    champ.current?.setSelectionRange(valeur.length, valeur.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])
  useLayoutEffect(() => {
    const c = champ.current!
    c.style.height = 'auto'
    c.style.height = `${c.scrollHeight}px`
  }, [valeur])
  return (
    <textarea
      ref={champ}
      className="notak-nuancier-legende notak-nuancier-legende-champ"
      rows={1}
      value={valeur}
      placeholder={t('note.legende')}
      onPointerDown={garder}
      onDoubleClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const v = e.target.value.replace(/\n/g, ' ')
        setValeur(v)
        const { legende: _, ...reste } = contenu
        ecrire(v.trim() ? { ...reste, legende: v } : reste)
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          viser = 'code'
          finir()
        }
      }}
    />
  )
}

/**
 * Le code s'écrit à sa place, sur l'aplat, tout sélectionné : hexadécimal (avec ou sans dièse, 3 ou 6 chiffres),
 * `rgb(…)`, `hsl(…)` ou « R,G,B ». Un code pas encore valide reste dans le champ sans toucher la couleur ;
 * Entrée, Échap ou un appui ailleurs finissent, et le nuancier n'est plus choisi.
 */
function CodeEnPlace({ contenu, ecrire, finir, focus }: { contenu: Nuancier; ecrire(c: Nuancier): void; finir(): void; focus: boolean }) {
  const [texte, setTexte] = useState(codeAffiche(contenu.couleur, contenu.format))
  const champ = useRef<HTMLInputElement>(null)
  const fini = useRef(false)
  useEffect(() => {
    if (!focus) return
    champ.current?.focus({ preventScroll: true })
    champ.current?.select()
  }, [focus])
  const terminer = (e?: React.FocusEvent) => {
    if (fini.current) return
    // Passer du code à la légende (Tab ou un appui) garde l'édition ouverte.
    if (e?.relatedTarget instanceof HTMLElement && e.relatedTarget.closest('.notak-nuancier-carte')) return
    fini.current = true
    viser = 'code'
    finir()
  }
  return (
    <input
      ref={champ}
      type="text"
      className="notak-nuancier-saisie"
      aria-label={t('nuancier.codeCouleur')}
      spellCheck={false}
      maxLength={32}
      value={texte}
      data-invalide={analyserCode(texte) ? undefined : ''}
      onPointerDown={garder}
      onDoubleClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        setTexte(e.target.value)
        const hex = analyserCode(e.target.value)
        if (hex) ecrire({ ...contenu, couleur: hex })
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          terminer()
        }
      }}
      onBlur={terminer}
    />
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

/** « Légende » : montre ou cache la légende sous l'aplat (le nom de la couleur, quand elle est vide). */
function OutilLegende({ elements, contexte }: PropsOutils<Nuancier>) {
  const tous = elements.every((e) => e.contenu.avecLegende)
  const basculer = () =>
    contexte.magasin.faire(
      elements.map((e) => {
        const { avecLegende: _, ...reste } = e.contenu
        const apres: Nuancier = tous ? reste : { ...reste, avecLegende: true, legende: e.contenu.legende || nomDeCouleur(e.contenu.couleur, langue()) }
        return { type: 'contenu' as const, id: e.id, avant: e.contenu, apres }
      }),
    )
  return <BoutonOutil icone="legende" titre={t('image.ajouterLegende')} libelle={t('note.legende')} actif={tous} onClick={basculer} />
}

/** Affichage du code : une rangée de quatre boutons carrés (HEX, RGB, HSL, Off) ; le choix est retenu pour les nuanciers suivants. */
export function OutilsNuancierApres({ elements, contexte }: PropsOutils<Nuancier>) {
  const menu = useMenu()
  if (contexte.services.lectureSeule) return null
  const choix = (e: PropsOutils<Nuancier>['elements'][number]): FormatCode | 'rien' => (e.contenu.sansCode ? 'rien' : e.contenu.format ?? 'hex')
  const commun = elements.every((e) => choix(e) === choix(elements[0]!)) ? choix(elements[0]!) : undefined
  const poser = (c: Nuancier, vers: FormatCode | 'rien'): Nuancier => {
    const { sansCode: _, format: __, ...reste } = c
    return vers === 'rien' ? { ...reste, sansCode: true } : vers === 'hex' ? reste : { ...reste, format: vers }
  }
  const appliquer = (vers: FormatCode | 'rien') => {
    contexte.magasin.faire(elements.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: poser(e.contenu, vers) })))
    retenirFormat(vers)
    menu[1](false)
  }
  const libelles: Record<FormatCode | 'rien', string> = { hex: 'HEX', rgb: 'RGB', hsl: 'HSL', rien: t('nuancier.sansCode') }
  return (
    <>
      <OutilAvecMenu menu={menu} icone="diese" titre={t('nuancier.affichage')} libelle={commun ? libelles[commun] : t('nuancier.code')}>
        <div className="notak-nuancier-formats notak-decor-menu" role="radiogroup" aria-label={t('nuancier.affichage')}>
          {([...FORMATS_CODE, 'rien'] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={commun === f} data-rien={f === 'rien' || undefined} onClick={() => appliquer(f)}>
              {libelles[f]}
            </button>
          ))}
        </div>
      </OutilAvecMenu>
      <OutilLegende elements={elements} contexte={contexte} />
    </>
  )
}

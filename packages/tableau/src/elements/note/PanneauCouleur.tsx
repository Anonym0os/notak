import { useEffect, useRef, useState } from 'react'
import { t } from '../../langue'
import { type NomIcone, Icone } from '../../icones'
import { lireHex } from './couleurs'

/** Une pastille de la grille : « Aucune » (barrée), « Transparent » (damier) ou une teinte. */
export interface Pastille {
  cle: string
  libelle: string
  genre?: 'aucune' | 'transparente'
  /** La teinte à montrer (`#rrggbb`), pour une pastille ordinaire. */
  teinte?: string
  actif: boolean
  choisir(): void
}

/** Un onglet du panneau : sa grille, ce qu'il pose quand on prend une couleur libre, et la couleur d'à présent. */
export interface OngletCouleur {
  cle: string
  libelle: string
  icone: NomIcone
  pastilles: Pastille[]
  /** La couleur libre d'à présent (`#rrggbb`), si c'en est une. */
  libre?: string | undefined
  poserLibre(hex: string): void
}

/** La grille : cinq colonnes, 24 × 20, huit pixels entre les pastilles. */
export function GrillePastilles({ pastilles, nom }: { pastilles: Pastille[]; nom?: string }) {
  return (
    <div className="notak-pastilles-grille" role="group" aria-label={nom}>
      {pastilles.map((p) => (
        <button
          key={p.cle}
          type="button"
          role="menuitem"
          className={p.genre === 'aucune' ? 'notak-pastille-aucune' : p.genre === 'transparente' ? 'notak-pastille-transparente' : undefined}
          title={p.libelle}
          aria-label={p.libelle}
          aria-pressed={p.actif}
          data-pastille={p.cle}
          style={p.teinte ? { background: p.teinte } : undefined}
          onClick={p.choisir}
        />
      ))}
    </div>
  )
}

/**
 * « Couleur personnalisée » : la roue ouvre le sélecteur du navigateur. La teinte se pose quand on le referme
 * (événement `change`), pas à chaque déplacement du curseur : un seul pas d'historique.
 */
export function CouleurPersonnalisee({ actuelle, choisir }: { actuelle: string | undefined; choisir(hex: string): void }) {
  const champ = useRef<HTMLInputElement>(null)
  const [valeur, setValeur] = useState(lireHex(actuelle ?? '') ?? '#4ebafd')
  const poser = useRef(choisir)
  poser.current = choisir
  useEffect(() => setValeur(lireHex(actuelle ?? '') ?? '#4ebafd'), [actuelle])
  useEffect(() => {
    const c = champ.current
    if (!c) return
    const fin = () => {
      const hex = lireHex(c.value)
      if (hex) poser.current(hex)
    }
    c.addEventListener('change', fin)
    return () => c.removeEventListener('change', fin)
  }, [])
  return (
    <label className="notak-couleur-libre">
      <Icone nom="roue" taille={18} />
      <span>{t('couleur.personnalisee')}</span>
      <input ref={champ} type="color" value={valeur} aria-label={t('couleur.personnalisee')} onChange={(e) => setValeur(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
    </label>
  )
}

/**
 * Le panneau « Couleur » : des onglets (Fond, Bande du haut) quand il y en a plusieurs, la grille de l'onglet,
 * les teintes déjà employées sur le tableau, puis « Couleur personnalisée ».
 */
export function PanneauCouleur({ onglets, depart = 0, suggerees = [] }: { onglets: OngletCouleur[]; depart?: number; suggerees?: string[] }) {
  const [rang, setRang] = useState(depart)
  const onglet = onglets[Math.min(rang, onglets.length - 1)]!
  return (
    <div className="notak-note-palette notak-panneau-couleur" role="menu">
      {onglets.length > 1 && (
        <div className="notak-couleur-onglets" role="tablist">
          {onglets.map((o, i) => (
            <button key={o.cle} type="button" role="tab" aria-selected={o === onglet} data-onglet={o.cle} onClick={() => setRang(i)}>
              <Icone nom={o.icone} taille={18} />
              <span>{o.libelle}</span>
            </button>
          ))}
        </div>
      )}
      <GrillePastilles pastilles={onglet.pastilles} nom={onglet.libelle} />
      {suggerees.length > 0 && (
        <>
          <span className="notak-decor-titre">{t('couleur.recentes')}</span>
          <GrillePastilles
            nom={t('note.couleursTableau')}
            pastilles={suggerees.map((c) => ({ cle: c, libelle: c, teinte: c, actif: onglet.libre === c, choisir: () => onglet.poserLibre(c) }))}
          />
        </>
      )}
      <CouleurPersonnalisee actuelle={onglet.libre} choisir={onglet.poserLibre} />
    </div>
  )
}

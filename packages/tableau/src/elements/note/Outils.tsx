import { useState, useSyncExternalStore } from 'react'
import { COULEURS_NOTE, type CouleurNote, type Note } from '../../coeur/tableau'
import type { PropsOutils } from '../types'
import { FOND_NOTE, LIBELLES_COULEUR, couleursSuggerees, lireHex, teinteDe } from './couleurs'
import { OutilAvecMenu } from '../../BoutonOutil'
import { fermerMenus, useMenu } from '../../menuUnique'
import { t } from '../../langue'

type Cle = 'fond' | 'barre' | 'couleurTexte'

/** Ce que les outils de la note changent, un seul pas d'historique quel que soit le nombre de notes. */
type Changement = (c: Note) => Note

const sans = (c: Note, cle: keyof Note) => {
  const { [cle]: _, ...reste } = c
  return reste as Note
}

/** « Couleur », « Barre », « Texte », « Légende » : la mise en forme de la note choisie. */
export function OutilsNote({ elements, contexte }: PropsOutils<Note>) {
  // Chaque palette est un menu de la barre : en ouvrir une referme les autres, et les menus des autres outils.
  const couleur = useMenu()
  const barre = useMenu()
  const texte = useMenu()
  const legende = useMenu()
  const appliquer = (f: Changement) => {
    contexte.magasin.faire(elements.map((e) => ({ type: 'contenu', id: e.id, avant: e.contenu, apres: f(e.contenu) })))
    fermerMenus()
  }
  const commun = <T,>(lire: (c: Note) => T): T | undefined =>
    elements.every((e) => lire(e.contenu) === lire(elements[0]!.contenu)) ? lire(elements[0]!.contenu) : undefined
  // Les teintes déjà employées sur le tableau, relues à chaque changement.
  const tableau = useSyncExternalStore(contexte.magasin.ecouter, contexte.magasin.lire)
  const suggerees = couleursSuggerees(tableau.elements)
  const fond = commun((c) => c.fond ?? c.couleur)

  return (
    <>
      <OutilAvecMenu menu={couleur} icone="palette" titre={t('couleur.titre')} libelle={t('couleur.titre')} pastille={teinteDe(fond)}>
        <PaletteFond
          actuelle={fond}
          suggerees={suggerees}
          choisir={(couleur, fond) =>
            appliquer((c) => {
              const nu = sans(sans(c, 'couleur'), 'fond')
              return couleur ? { ...nu, couleur } : fond ? { ...nu, fond } : nu
            })
          }
        />
      </OutilAvecMenu>
      <OutilAvecMenu menu={barre} icone="barreNote" titre={t('note.barre')} libelle={t('note.barre')} pastille={teinteDe(commun((c) => c.barre))} secondaire>
        <PaletteHex cle="barre" actuelle={commun((c) => c.barre)} suggerees={suggerees} appliquer={appliquer} />
      </OutilAvecMenu>
      <OutilAvecMenu menu={texte} icone="texte" titre={t('note.texte')} libelle={t('note.texte')} pastille={teinteDe(commun((c) => c.couleurTexte))} secondaire>
        <PaletteHex cle="couleurTexte" actuelle={commun((c) => c.couleurTexte)} suggerees={suggerees} appliquer={appliquer} />
      </OutilAvecMenu>
      <OutilAvecMenu menu={legende} icone="legende" titre={t('note.legende')} libelle={t('note.legende')} secondaire>
        <ChampLegende depart={commun((c) => c.legende) ?? ''} appliquer={appliquer} />
      </OutilAvecMenu>
    </>
  )
}

/** Le fond : les couleurs nommées, transparent, puis une couleur libre. */
function PaletteFond({ actuelle, suggerees, choisir }: { actuelle: string | undefined; suggerees: string[]; choisir(couleur?: CouleurNote, fond?: string): void }) {
  return (
    <div className="notak-note-palette" role="menu">
      <div className="notak-note-pastilles">
        <button type="button" role="menuitem" className="notak-pastille-aucune" title={t('couleur.aucune')} aria-label={t('couleur.aucune')} aria-pressed={actuelle === undefined} onClick={() => choisir()} />
        <button type="button" role="menuitem" className="notak-pastille-transparente" title={t('couleur.transparent')} aria-label={t('couleur.transparent')} aria-pressed={actuelle === 'transparent'} onClick={() => choisir('transparent')} />
        {COULEURS_NOTE.map((c) => (
          <button key={c} type="button" role="menuitem" title={LIBELLES_COULEUR[c]} aria-label={LIBELLES_COULEUR[c]} aria-pressed={actuelle === c} data-fond={c} onClick={() => choisir(c)} />
        ))}
      </div>
      <Libre actuelle={actuelle} suggerees={suggerees} choisir={(hex) => choisir(undefined, hex)} />
    </div>
  )
}

/** La barre ou le texte : une couleur de la palette, une suggérée ou libre. */
function PaletteHex({ cle, actuelle, suggerees, appliquer }: { cle: Cle; actuelle: string | undefined; suggerees: string[]; appliquer(f: Changement): void }) {
  const poser = (hex?: string) => appliquer((c) => (hex ? { ...c, [cle]: hex } : sans(c, cle)))
  return (
    <div className="notak-note-palette" role="menu">
      <div className="notak-note-pastilles">
        <button type="button" role="menuitem" className="notak-pastille-aucune" title={t('couleur.aucune')} aria-label={t('couleur.aucune')} aria-pressed={actuelle === undefined} onClick={() => poser()} />
        {COULEURS_NOTE.map((c) => (
          <button key={c} type="button" role="menuitem" title={LIBELLES_COULEUR[c]} aria-label={LIBELLES_COULEUR[c]} aria-pressed={actuelle === FOND_NOTE[c]} data-fond={c} onClick={() => poser(FOND_NOTE[c])} />
        ))}
      </div>
      <Libre actuelle={actuelle} suggerees={suggerees} choisir={poser} />
    </div>
  )
}

/** Les couleurs déjà employées sur le tableau, et un champ pour une couleur en hexadécimal. */
function Libre({ actuelle, suggerees, choisir }: { actuelle: string | undefined; suggerees: string[]; choisir(hex: string): void }) {
  const [saisie, setSaisie] = useState(actuelle?.startsWith('#') ? actuelle : '')
  const hex = lireHex(saisie)
  return (
    <>
      {suggerees.length > 0 && (
        <>
          <span className="notak-decor-titre">{t('couleur.recentes')}</span>
          <div className="notak-note-pastilles" aria-label={t('note.couleursTableau')}>
            {suggerees.map((c) => (
              <button key={c} type="button" role="menuitem" title={c} aria-label={c} aria-pressed={actuelle === c} style={{ background: c }} onClick={() => choisir(c)} />
            ))}
          </div>
        </>
      )}
      <input
        className="notak-note-hex"
        value={saisie}
        placeholder="#a1b2c3"
        aria-label={t('note.hex')}
        aria-invalid={saisie !== '' && !hex}
        onChange={(e) => setSaisie(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter' && hex) choisir(hex)
        }}
      />
    </>
  )
}

function ChampLegende({ depart, appliquer }: { depart: string; appliquer(f: Changement): void }) {
  const [texte, setTexte] = useState(depart)
  return (
    <div className="notak-note-palette" role="menu">
      <input
        className="notak-note-hex"
        autoFocus
        value={texte}
        placeholder={t('note.legende')}
        aria-label={t('note.legendeSous')}
        onChange={(e) => setTexte(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') appliquer((c) => (texte.trim() ? { ...c, legende: texte.trim() } : sans(c, 'legende')))
        }}
      />
    </div>
  )
}

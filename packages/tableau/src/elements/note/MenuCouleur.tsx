import { COULEURS_NOTE, type CouleurNote } from '../../coeur/tableau'
import { LIBELLES_COULEUR, teinteDe } from './couleurs'
import { OutilAvecMenu } from '../../BoutonOutil'
import { t } from '../../langue'
import { useMenu } from '../../menuUnique'

/**
 * « Couleur » : la palette des notes, en menu. Partagée par tout ce qui se colore comme une note.
 * `transparent` ajoute le choix sans fond, qui n'a de sens que pour une note.
 */
export function MenuCouleur({ actuelle, choisir, transparent = false, secondaire }: { actuelle: CouleurNote | undefined; choisir(c: CouleurNote | undefined): void; transparent?: boolean; secondaire?: boolean }) {
  const menu = useMenu()
  const poser = (c: CouleurNote | undefined) => {
    choisir(c)
    menu[1](false)
  }
  return (
    <OutilAvecMenu menu={menu} icone="palette" titre={t('couleur.titre')} libelle={t('couleur.titre')} pastille={teinteDe(actuelle)} secondaire={secondaire}>
      <div className="notak-note-palette" role="menu">
        <div className="notak-note-pastilles">
          <button type="button" role="menuitem" className="notak-pastille-aucune" title={t('couleur.aucune')} aria-label={t('couleur.aucune')} aria-pressed={actuelle === undefined} onClick={() => poser(undefined)} />
          {transparent && (
            <button type="button" role="menuitem" className="notak-pastille-transparente" title={t('couleur.transparent')} aria-label={t('couleur.transparent')} aria-pressed={actuelle === 'transparent'} onClick={() => poser('transparent')} />
          )}
          {COULEURS_NOTE.map((c) => (
            <button key={c} type="button" role="menuitem" title={LIBELLES_COULEUR[c]} aria-label={LIBELLES_COULEUR[c]} aria-pressed={actuelle === c} data-fond={c} onClick={() => poser(c)} />
          ))}
        </div>
      </div>
    </OutilAvecMenu>
  )
}

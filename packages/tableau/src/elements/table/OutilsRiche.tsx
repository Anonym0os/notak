import { useEffect, useRef, useState } from 'react'
import { BoutonOutil, OutilAvecMenu } from '../../BoutonOutil'
import type { Id } from '../../coeur/tableau'
import { t } from '../../langue'
import { Champ } from '../../communs'
import { useMenu } from '../../menuUnique'
import { normaliserUrl } from '../note/conversion'
import type { EditionCellule } from './etat'
import { COULEURS_TEXTE, SURLIGNAGES, couleurSurlignage, couleurTexte } from './formats'
import { type Marque, marquesCommunes } from './riche'
import { piloteDe } from './richePilote'

const nuance = (nom: string) => t(`table.nuance.${nom}`)
const enCss = (nom: string) => nom.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)

/**
 * Les outils d'une sélection de mots dans une cellule en cours d'écriture : le style de texte (couleur, surlignage),
 * gras, italique, barré et lien. Ils ne prennent jamais le focus au texte : l'appui sur un bouton est retenu, seul
 * le champ d'adresse du lien le prend (la sélection est gardée dans l'état de la table).
 */
export function OutilsRiche({ id, edition }: { id: Id; edition: EditionCellule }) {
  const sel = edition.selection!
  const commun = marquesCommunes(edition.passages ?? [], edition.texte.length, sel.de, sel.a)
  const pilote = piloteDe(id)
  return (
    <div style={{ display: 'contents' }} onMouseDown={(e) => !(e.target as HTMLElement).closest('input') && e.preventDefault()}>
      <OutilCouleurPassage id={id} commun={commun} />
      <BoutonOutil icone="gras" titre={`${t('barre.gras')} (⌘B)`} libelle={t('barre.gras')} actif={!!commun.gras} onClick={() => pilote?.basculer('gras')} />
      <BoutonOutil icone="italique" titre={`${t('barre.italique')} (⌘I)`} libelle={t('barre.italique')} actif={!!commun.italique} onClick={() => pilote?.basculer('italique')} />
      <BoutonOutil icone="barre" titre={`${t('barre.barre')} (⌘⇧X)`} libelle={t('barre.barre')} actif={!!commun.barre} onClick={() => pilote?.basculer('barre')} />
      <OutilLienPassage id={id} commun={commun} />
    </div>
  )
}

/** La couleur du texte et le surlignage du passage choisi ; choisir celle qui est posée l'ôte. */
function OutilCouleurPassage({ id, commun }: { id: Id; commun: Marque }) {
  const menu = useMenu()
  const pilote = () => piloteDe(id)
  const couleur = commun.couleur ?? ''
  const surligne = commun.surligne ?? ''
  const pastille = commun.surligne ? couleurSurlignage(commun.surligne) : commun.couleur ? couleurTexte(commun.couleur) : undefined
  const effacer = () => {
    pilote()?.couleur(null)
    pilote()?.surlignage(null)
  }
  return (
    <OutilAvecMenu menu={menu} icone="texte" titre={t('table.texte.titre')} libelle={t('table.texte')} pastille={pastille}>
      <div className="notak-note-palette notak-table-palette-texte" role="menu">
        <span className="notak-decor-titre">{t('table.texte.couleur')}</span>
        <div className="notak-note-pastilles">
          <button type="button" role="menuitemradio" data-vide title={nuance('defaut')} aria-label={nuance('defaut')} aria-checked={couleur === '' && surligne === ''} onClick={effacer}>
            A
          </button>
          {COULEURS_TEXTE.map((x) => (
            <button key={x.nom} type="button" role="menuitemradio" data-texte={x.nom} title={nuance(x.nom)} aria-label={nuance(x.nom)} aria-checked={couleur === x.nom} onClick={() => pilote()?.couleur(couleur === x.nom ? null : x.nom)}>
              A
            </button>
          ))}
        </div>
        <span className="notak-decor-titre">{t('table.texte.surlignage')}</span>
        <div className="notak-note-pastilles">
          {SURLIGNAGES.map((x) => (
            <button key={x.nom} type="button" role="menuitemradio" data-surligne={enCss(x.nom)} title={nuance(x.nom)} aria-label={nuance(x.nom)} aria-checked={surligne === x.nom} onClick={() => pilote()?.surlignage(surligne === x.nom ? null : x.nom)}>
              A
            </button>
          ))}
        </div>
      </div>
    </OutilAvecMenu>
  )
}

/** Le lien du passage : un champ d'adresse sous le bouton ; une adresse vide ôte le lien. */
function OutilLienPassage({ id, commun }: { id: Id; commun: Marque }) {
  const menu = useMenu()
  const [ouvert, setOuvert] = menu
  const [adresse, setAdresse] = useState('')
  // Fermer le champ le retire du DOM, ce qui peut lui faire perdre le focus : ce blur-là n'est pas un départ.
  const ferme = useRef(false)
  useEffect(() => {
    if (ouvert) {
      ferme.current = false
      setAdresse(commun.lien ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert])
  const finir = (poser: boolean) => {
    const p = piloteDe(id)
    ferme.current = true
    if (poser) p?.lien(normaliserUrl(adresse) || null)
    setOuvert(false)
    p?.focaliser()
  }
  return (
    <OutilAvecMenu menu={menu} icone="lien" titre={t('barre.lien')} libelle={t('barre.lien')}>
      <div className="notak-note-palette notak-table-lien" role="dialog" aria-label={t('barre.lien')}>
        <Champ
          autoFocus
          data-garde-focus
          taille="p"
          className="notak-note-lien"
          value={adresse}
          placeholder={t('barre.lienPlaceholder')}
          aria-label={t('barre.adresseLien')}
          spellCheck={false}
          // Une adresse n'a ni espace, ni saut de ligne, ni virgule : ils sont retirés à la saisie.
          onChange={(e) => setAdresse(e.target.value.replace(/[\s,]+/g, ''))}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
              e.preventDefault()
              finir(true)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              finir(false)
            }
          }}
          onBlur={(e) => {
            // Le focus quitte le champ pour autre chose que le texte ou les outils : la cellule se range.
            const vers = e.relatedTarget
            if (ferme.current) return
            if (vers instanceof Element && (vers.closest('.notak-table-riche') || vers.closest('[data-garde-focus]'))) return
            piloteDe(id)?.finir()
          }}
        />
      </div>
    </OutilAvecMenu>
  )
}

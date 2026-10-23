import { Fragment, useLayoutEffect, useRef } from 'react'
import type { FormatCellule, Id } from '../../coeur/tableau'
import { t } from '../../langue'
import { moitiesIso } from './dates'
import { type EditionCellule, majEdition } from './etat'
import { COULEURS_REFERENCES, alignementDe } from './formats'
import { citerReferences, requeteAutocompletion, suggererFonctions } from './formules'

/** Où va la sélection quand l'écriture est validée. */
export type Deplacement = 'bas' | 'haut' | 'droite' | 'gauche' | 'aucun'

interface Props {
  id: Id
  edition: EditionCellule
  format: FormatCellule | null
  valider(deplacement: Deplacement): void
  abandonner(): void
}

/** Le texte, avec chaque référence d'une formule dans sa couleur ; le reste tel quel. */
function Colore({ texte }: { texte: string }) {
  const citations = citerReferences(texte)
  if (!citations.length) return <>{texte}</>
  const morceaux: React.ReactNode[] = []
  let fin = 0
  citations.forEach((c, i) => {
    morceaux.push(<Fragment key={`t${i}`}>{texte.slice(fin, c.debut)}</Fragment>)
    morceaux.push(
      <span key={`r${i}`} style={{ color: COULEURS_REFERENCES[i % COULEURS_REFERENCES.length]! }}>
        {texte.slice(c.debut, c.fin)}
      </span>,
    )
    fin = c.fin
  })
  morceaux.push(<Fragment key="fin">{texte.slice(fin)}</Fragment>)
  return <>{morceaux}</>
}

/**
 * L'éditeur d'une cellule : un champ posé sur la cellule, qui grandit avec le texte (un double dessous lui donne sa
 * hauteur, et la ligne de la table grandit avec lui). Entrée valide et descend, Tab valide et passe à droite,
 * Échap abandonne, Maj ou Alt+Entrée va à la ligne. Une formule propose ses fonctions et colore ses références.
 */
export function Editeur({ id, edition, format, valider, abandonner }: Props) {
  const champ = useRef<HTMLTextAreaElement>(null)
  const racine = useRef<HTMLDivElement>(null)
  const formule = edition.texte.startsWith('=')
  const auto = formule ? requeteAutocompletion(edition.texte, edition.curseur) : null
  const liste = auto ? suggererFonctions(auto.requete) : []
  const choisie = liste.length ? ((edition.suggestion % liste.length) + liste.length) % liste.length : 0

  // Le champ prend le focus à l'ouverture, et le curseur que le programme lui donne (citation, autocomplétion).
  useLayoutEffect(() => {
    const n = champ.current
    if (!n) return
    n.focus({ preventScroll: true })
    n.setSelectionRange(edition.curseur, edition.curseur)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edition.maj])

  const poser = (texte: string, curseur: number) =>
    majEdition(id, (e) => ({ ...e, texte, curseur, maj: e.maj + 1, suggestion: 0, citation: null, depuisCalendrier: false }))

  const inserer = (nom: string) => {
    if (!auto) return
    const avant = edition.texte.slice(0, auto.debut)
    const apres = edition.texte.slice(edition.curseur)
    poser(`${avant}${nom}(${apres}`, auto.debut + nom.length + 1)
  }

  const retourALaLigne = () => {
    const n = champ.current
    if (!n) return
    const [a, b] = [n.selectionStart, n.selectionEnd]
    poser(`${edition.texte.slice(0, a)}\n${edition.texte.slice(b)}`, a + 1)
  }

  const touche = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation()
    if (e.nativeEvent.isComposing) return
    if (liste.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      const pas = e.key === 'ArrowDown' ? 1 : -1
      majEdition(id, (x) => ({ ...x, suggestion: (((choisie + pas) % liste.length) + liste.length) % liste.length }))
    } else if (liste.length && (e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && !e.altKey) {
      e.preventDefault()
      inserer(liste[choisie]!)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey || e.altKey) retourALaLigne()
      else valider('bas')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      valider(e.shiftKey ? 'gauche' : 'droite')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      abandonner()
    }
  }

  const alignement = alignementDe(format, formule)
  const style = {
    textAlign: alignement === 'gauche' ? 'left' : alignement === 'droite' ? 'right' : 'center',
    fontWeight: format?.gras ? 700 : undefined,
    fontStyle: format?.italique ? 'italic' : undefined,
    textDecoration: format?.barre ? 'line-through' : undefined,
  } as const

  return (
    <div
      ref={racine}
      className="notak-table-editeur"
      onBlur={(e) => {
        // Le focus passe au calendrier ou à la liste des fonctions : l'écriture continue.
        if (e.relatedTarget instanceof Node && racine.current?.contains(e.relatedTarget)) return
        valider('aucun')
      }}
    >
      <div className="notak-table-miroir" style={style} aria-hidden>
        {formule ? <Colore texte={edition.texte} /> : edition.texte}
        {'​'}
      </div>
      <textarea
        ref={champ}
        className="notak-table-champ"
        style={style}
        value={edition.texte}
        rows={1}
        maxLength={2000}
        spellCheck={false}
        aria-label={t('table.cellule', { ligne: edition.l + 1, colonne: edition.c + 1 })}
        onChange={(e) =>
          majEdition(id, (x) => ({ ...x, texte: e.target.value, curseur: e.target.selectionStart, suggestion: 0, citation: null, depuisCalendrier: false }))
        }
        onSelect={(e) => {
          // React relaie aussi la sélection au keydown : après une insertion, le champ a encore l'ancien texte et
          // l'ancien curseur, qu'il ne faut pas reprendre.
          const { value, selectionStart: pos } = e.currentTarget
          majEdition(id, (x) =>
            x.curseur === pos || value !== x.texte
              ? undefined
              : { ...x, curseur: pos, citation: x.citation && x.citation.fin === pos ? x.citation : null },
          )
        }}
        onKeyDown={touche}
      />
      {liste.length > 0 && (
        <ul className="notak-table-fonctions" role="listbox" aria-label={t('table.fonctions')} onPointerDown={(e) => e.preventDefault()}>
          {liste.map((nom, i) => (
            <li key={nom} role="option" aria-selected={i === choisie} data-choisie={i === choisie || undefined} onClick={() => inserer(nom)}>
              <b>{nom.slice(0, auto!.requete.length)}</b>
              {nom.slice(auto!.requete.length)}
            </li>
          ))}
        </ul>
      )}
      {format?.type === 'date' && !formule && <Calendrier id={id} edition={edition} format={format} valider={valider} abandonner={abandonner} />}
    </div>
  )
}

/** Un calendrier sous l'éditeur d'une date : un jour, et une heure si la cellule en porte une. */
function Calendrier({ id, edition, format, valider, abandonner }: Omit<Props, 'format'> & { format: FormatCellule }) {
  const moities = moitiesIso(edition.texte)
  const avecHeure = edition.avecHeure ?? (moities ? moities.heure !== '' : (format.heure ?? 'aucune') !== 'aucune')
  const choisir = (jour: string, heure: string, avec: boolean) =>
    majEdition(id, (e) => ({
      ...e,
      texte: jour ? (avec ? `${jour} ${heure || '00:00'}` : jour) : '',
      avecHeure: avec,
      depuisCalendrier: !!jour,
    }))
  const touche = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      valider('bas')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      abandonner()
    }
  }
  return (
    <div className="notak-table-popup notak-table-calendrier" onKeyDown={touche}>
      <label>
        <span>{t('table.calendrier.jour')}</span>
        <input type="date" value={moities?.jour ?? ''} onChange={(e) => choisir(e.target.value, moities?.heure ?? '', avecHeure)} />
      </label>
      <label className="notak-table-calendrier-coche">
        <input type="checkbox" checked={avecHeure} onChange={(e) => choisir(moities?.jour ?? '', moities?.heure ?? '', e.target.checked)} />
        <span>{t('table.calendrier.avecHeure')}</span>
      </label>
      {avecHeure && (
        <label>
          <span>{t('table.calendrier.heure')}</span>
          <input type="time" value={moities?.heure.slice(0, 5) ?? ''} onChange={(e) => choisir(moities?.jour ?? '', e.target.value, true)} />
        </label>
      )}
    </div>
  )
}

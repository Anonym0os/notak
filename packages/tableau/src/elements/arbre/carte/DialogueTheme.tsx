import { useState } from 'react'
import type { StructureArbre } from '../../../coeur/tableau'
import { Bouton, Dialogue } from '../../../communs'
import { Icone } from '../../../icones'
import { t } from '../../../langue'
import { themePerso, variantesDe } from '../themes'
import { ApercuStructure } from './apercu'
import { type ThemeCouleurPerso, idCouleurPerso, nomSuivant } from './preferences'

/** La couleur de départ d'une case neuve, tant qu'on n'en a pas pris d'autre : une teinte claire. */
const COULEUR_DE_DEPART = '#cad7fd'

/**
 * La boîte « Créer un nouveau thème de couleur » (bouton « + » de l'onglet Carte) : six cases de couleur qui se
 * remplissent dans l'ordre, un nom, l'aperçu des variantes que ces couleurs donnent, Annuler et Enregistrer. Avec
 * `edition`, elle modifie un thème existant (même identifiant : il le remplace).
 */
export function DialogueTheme({
  hote,
  edition,
  noms,
  structure,
  fermer,
  enregistrer,
}: {
  /** Un élément de la carte ouverte, pour y poser la boîte (elle hérite alors des variables de thème). */
  hote: HTMLElement | null
  edition?: ThemeCouleurPerso | null
  /** Les noms déjà pris, pour proposer le suivant. */
  noms: readonly string[]
  structure: StructureArbre
  fermer(): void
  enregistrer(theme: ThemeCouleurPerso): void
}) {
  const [couleurs, setCouleurs] = useState<string[]>(() => [...(edition?.palette ?? [])])
  const [nom, setNom] = useState(() => edition?.nom ?? nomSuivant(t('arbre.carte.dlg.perso'), noms))
  const [derniere, setDerniere] = useState(COULEUR_DE_DEPART)
  if (!hote) return null
  const complet = couleurs.length === 6
  const poser = (i: number, c: string) => {
    setCouleurs((cs) => cs.map((x, k) => (k === i ? c : x)).concat(i === cs.length ? [c] : []).slice(0, 6))
    setDerniere(c)
  }
  const variantes = complet ? variantesDe(themePerso('perso:apercu', couleurs)) : []
  const pret = complet && nom.trim() !== ''
  return (
    <Dialogue
      titre={edition ? t('arbre.carte.dlg.modifier') : t('arbre.carte.dlg.creer')}
      fermer={fermer}
      hote={hote}
      largeur={540}
      className="notak-arbre-reglages-dialogue"
      actions={
        <>
          <Bouton variante="second" onClick={fermer}>
            {t('arbre.carte.dlg.annuler')}
          </Bouton>
          <Bouton variante="principal" disabled={!pret} onClick={() => enregistrer({ id: edition?.id ?? idCouleurPerso(), nom: nom.trim(), palette: couleurs })}>
            {t('arbre.carte.dlg.enregistrer')}
          </Bouton>
        </>
      }
    >
      <p className="notak-dialogue-texte notak-arbre-reglages-dlg-sous">{edition ? t('arbre.carte.dlg.modifierAide') : t('arbre.carte.dlg.creerAide')}</p>
      <div className="notak-arbre-reglages-dlg-rangee">
        <div className="notak-arbre-reglages-cases" role="group" aria-label={t('arbre.carte.dlg.cases')}>
          {Array.from({ length: 6 }, (_, i) => {
            const rempli = i < couleurs.length
            const ouvert = rempli || i === couleurs.length
            return (
              <span key={i} className="notak-arbre-reglages-case-theme" data-vide={rempli ? undefined : ''} data-inactif={ouvert ? undefined : ''}>
                {!rempli && <Icone nom="ajouter" taille={16} trait={2} />}
                <input
                  type="color"
                  aria-label={t('arbre.carte.dlg.case', { n: i + 1 })}
                  disabled={!ouvert}
                  value={couleurs[i] ?? derniere}
                  style={rempli ? { background: couleurs[i] } : undefined}
                  onClick={() => !rempli && i === couleurs.length && poser(i, derniere)}
                  onChange={(e) => poser(i, e.target.value)}
                />
              </span>
            )
          })}
        </div>
        <input type="text" className="notak-arbre-reglages-dlg-nom" value={nom} aria-label={t('arbre.carte.dlg.nom')} onChange={(e) => setNom(e.target.value)} />
      </div>
      <div className="notak-arbre-reglages-dlg-apercu" data-vide={complet ? undefined : ''}>
        {complet ? (
          <div className="notak-arbre-reglages-dlg-variantes">
            {variantes.map((accent, i) => (
              <ApercuStructure key={i} structure={structure} couleurs={accent ? [accent] : couleurs} fond="var(--notak-arbre-fond)" />
            ))}
          </div>
        ) : (
          <p>{t('arbre.carte.dlg.apercu')}</p>
        )}
      </div>
    </Dialogue>
  )
}

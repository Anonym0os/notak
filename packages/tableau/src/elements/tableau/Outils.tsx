import { useState, useSyncExternalStore } from 'react'
import { COULEURS_NOTE, type CouleurNote, type RenvoiTableau } from '../../coeur/tableau'
import { ICONES_TABLEAU, avecIcone, avecImage } from './icones'
import { FOND_NOTE, LIBELLES_COULEUR } from '../note/couleurs'
import type { PropsOutils } from '../types'
import { demanderModele } from './modele'
import { peutPoserModele } from './poserModele'
import { demanderRenommage } from './renommage'
import { t } from '../../langue'

const sans = () => () => {}

/** Un seul pas d'historique pour tous les tableaux choisis. */
function changerIcone(elements: PropsOutils<RenvoiTableau>['elements'], contexte: PropsOutils<RenvoiTableau>['contexte'], faire: (c: RenvoiTableau) => RenvoiTableau) {
  contexte.magasin.faire(elements.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: faire(e.contenu) })))
}

/** « Icône » : la bibliothèque, aucune (retour à l'initiale), ou une image à envoyer. */
function ChoixIcone({ elements, contexte }: PropsOutils<RenvoiTableau>) {
  const [ouvert, setOuvert] = useState(false)
  const depot = contexte.services.fichiers
  const commune = elements.every((e) => e.contenu.icone === elements[0]!.contenu.icone && !e.contenu.image) ? elements[0]!.contenu.icone : undefined
  const envoyer = () => {
    const champ = document.createElement('input')
    champ.type = 'file'
    champ.accept = 'image/*'
    champ.addEventListener('change', () => {
      const f = champ.files?.[0]
      if (!f || !depot) return
      depot.enregistrer(f).then((id) => changerIcone(elements, contexte, (c) => avecImage(c, id)), () => {})
    })
    champ.click()
  }
  return (
    <div className="notak-colonne-menu-ancre">
      <button type="button" title={t('tableau.icone.titre')} aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        {t('tableau.icone')}
      </button>
      {ouvert && (
        <div className="notak-colonne-palette" role="menu">
          <div className="notak-renvoi-icones">
            {Object.entries(ICONES_TABLEAU).map(([nom, { signe, libelle }]) => (
              <button
                key={nom}
                type="button"
                role="menuitem"
                title={libelle}
                aria-label={libelle}
                aria-pressed={commune === nom}
                onClick={() => {
                  changerIcone(elements, contexte, (c) => avecIcone(c, nom))
                  setOuvert(false)
                }}
              >
                {signe}
              </button>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              changerIcone(elements, contexte, (c) => avecIcone(c, undefined))
              setOuvert(false)
            }}
          >
            {t('tableau.initiale')}
          </button>
          {depot && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOuvert(false)
                envoyer()
              }}
            >
              {t('tableau.uneImage')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function OutilsRenvoi({ elements, contexte }: PropsOutils<RenvoiTableau>) {
  const [ouvert, setOuvert] = useState(false)
  const { tableau, ecouterEspace, colorerTableau } = contexte.services
  const cibles = elements.map((e) => e.contenu.cible)
  const actuelle = useSyncExternalStore(ecouterEspace ?? sans, () => {
    const couleurs = new Set(cibles.map((c) => tableau?.(c)?.couleur))
    return couleurs.size === 1 ? [...couleurs][0] : undefined
  })
  const choisir = (couleur: CouleurNote) => {
    for (const c of cibles) colorerTableau?.(c, couleur)
    setOuvert(false)
  }
  return (
    <>
      {colorerTableau && (
        <div className="notak-colonne-menu-ancre">
          <button type="button" title={t('tableau.couleur')} aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
            {t('couleur.titre')}
          </button>
          {ouvert && (
            <div className="notak-colonne-palette" role="menu">
              <div className="notak-colonne-pastilles">
                {COULEURS_NOTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="menuitem"
                    title={LIBELLES_COULEUR[c]}
                    aria-label={LIBELLES_COULEUR[c]}
                    aria-pressed={actuelle === c}
                    style={{ background: FOND_NOTE[c] }}
                    onClick={() => choisir(c)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {!contexte.services.lectureSeule && <ChoixIcone elements={elements} contexte={contexte} />}
      {elements.length === 1 && peutPoserModele(elements[0]!.contenu.cible, contexte.services) && (
        <button type="button" title={t('tableau.modele.titre')} onClick={() => demanderModele(elements[0]!.id)}>
          {t('tableau.modele')}
        </button>
      )}
      {elements.length === 1 && (
        <button type="button" title={t('tableau.renommer.titre')} onClick={() => demanderRenommage(elements[0]!.id)}>
          {t('menu.renommer')}
        </button>
      )}
    </>
  )
}

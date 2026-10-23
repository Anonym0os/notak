import { useSyncExternalStore } from 'react'
import { COULEURS_NOTE, type CouleurNote, type RenvoiTableau } from '../../coeur/tableau'
import { ICONES_TABLEAU, avecIcone, avecImage } from './icones'
import { FOND_NOTE, LIBELLES_COULEUR, teinteDe } from '../note/couleurs'
import type { PropsOutils } from '../types'
import { demanderModele } from './modele'
import { peutPoserModele } from './poserModele'
import { demanderRenommage } from './renommage'
import { t } from '../../langue'
import { Icone } from '../../icones'
import { useMenu } from '../../menuUnique'
import { BoutonOutil, OutilAvecMenu } from '../../BoutonOutil'

const sans = () => () => {}

/** Un seul pas d'historique pour tous les tableaux choisis. */
function changerIcone(elements: PropsOutils<RenvoiTableau>['elements'], contexte: PropsOutils<RenvoiTableau>['contexte'], faire: (c: RenvoiTableau) => RenvoiTableau) {
  contexte.magasin.faire(elements.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: faire(e.contenu) })))
}

/** « Icône » : la bibliothèque, aucune (retour à l'initiale), ou une image à envoyer. */
function ChoixIcone({ elements, contexte }: PropsOutils<RenvoiTableau>) {
  const [ouvert, setOuvert, ancre] = useMenu()
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
    <OutilAvecMenu menu={[ouvert, setOuvert, ancre]} classeAncre="notak-colonne-menu-ancre" icone="tableau" titre={t('tableau.icone.titre')} libelle={t('tableau.icone')}>
      <div className="notak-colonne-palette" role="menu">
          <div className="notak-renvoi-icones">
            {Object.entries(ICONES_TABLEAU).map(([nom, { icone, libelle }]) => (
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
                <Icone nom={icone} />
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
    </OutilAvecMenu>
  )
}

export function OutilsRenvoi({ elements, contexte }: PropsOutils<RenvoiTableau>) {
  const [ouvert, setOuvert, ancre] = useMenu()
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
        <OutilAvecMenu menu={[ouvert, setOuvert, ancre]} classeAncre="notak-colonne-menu-ancre" icone="palette" titre={t('tableau.couleur')} libelle={t('couleur.titre')} pastille={teinteDe(actuelle)}>
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
        </OutilAvecMenu>
      )}
      {!contexte.services.lectureSeule && <ChoixIcone elements={elements} contexte={contexte} />}
      {elements.length === 1 && peutPoserModele(elements[0]!.contenu.cible, contexte.services) && (
        <BoutonOutil icone="modele" secondaire titre={t('tableau.modele.titre')} libelle={t('tableau.modele')} onClick={() => demanderModele(elements[0]!.id)} />
      )}
      {elements.length === 1 && (
        <BoutonOutil icone="modifier" titre={t('tableau.renommer.titre')} libelle={t('menu.renommer')} onClick={() => demanderRenommage(elements[0]!.id)} />
      )}
    </>
  )
}

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { COULEURS_NOTE, type CouleurNote, type Operation, type RenvoiTableau } from '../../coeur/tableau'
import { avecIcone, avecImage, pastilleDe } from './icones'
import { Glyphe } from './Glyphe'
import { chercherIcones } from './rechercheIcones'
import { fondsDeTableaux, pairesDuTableau } from './paires'
import { CouleurPersonnalisee, GrillePastilles } from '../note/PanneauCouleur'
import { FOND_NOTE, LIBELLES_COULEUR, SUGGEREES_MAX, couleurTexteSur, couleursSuggerees, lireHex, teinteDe } from '../note/couleurs'
import type { PropsOutils } from '../types'
import { demanderModele } from './modele'
import { peutPoserModele } from './poserModele'
import { demanderRenommage } from './renommage'
import { t } from '../../langue'
import { Recherche } from '../../communs'
import { Icone } from '../../icones'
import { useMenu } from '../../menuUnique'
import { BoutonOutil, OutilAvecMenu } from '../../BoutonOutil'

const sans = () => () => {}

/** Un seul pas d'historique pour tous les tableaux choisis. */
function changerIcone(elements: PropsOutils<RenvoiTableau>['elements'], contexte: PropsOutils<RenvoiTableau>['contexte'], faire: (c: RenvoiTableau) => RenvoiTableau) {
  contexte.magasin.faire(elements.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: faire(e.contenu) })))
}

/** « Icône » : une recherche dans la bibliothèque et le catalogue, aucune (retour à l'initiale), ou une image à envoyer. */
function ChoixIcone({ elements, contexte }: PropsOutils<RenvoiTableau>) {
  const [ouvert, setOuvert, ancre] = useMenu()
  const depot = contexte.services.fichiers
  const commune = elements.every((e) => e.contenu.icone === elements[0]!.contenu.icone && !e.contenu.image) ? elements[0]!.contenu.icone : undefined
  const [requete, setRequete] = useState('')
  const trouvees = useMemo(() => (ouvert ? chercherIcones(requete) : []), [ouvert, requete])
  const champ = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ouvert) champ.current?.focus({ preventScroll: true })
    else setRequete('')
  }, [ouvert])
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
      <div className="notak-colonne-palette notak-renvoi-choix" role="menu">
          <Recherche
            ref={champ}
            className="notak-renvoi-recherche"
            valeur={requete}
            placeholder={t('tableau.rechercheIcone')}
            aria-label={t('tableau.rechercheIcone')}
            onChange={setRequete}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <div className="notak-renvoi-icones">
            {trouvees.map(({ nom, libelle }) => {
              const p = pastilleDe({ icone: nom })
              return (
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
                  {(p.genre === 'icone' || p.genre === 'catalogue') && <Glyphe pastille={p} taille={20} trait={1.75} />}
                </button>
              )
            })}
          </div>
          {trouvees.length === 0 && <p className="notak-renvoi-aucune">{t('tableau.aucuneIcone')}</p>}
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

/** « Couleur de l'icône… » : le sélecteur du navigateur ; la couleur se pose quand on le referme (un pas d'historique). */
function CouleurGlyphe({ actuelle, choisir }: { actuelle: string | undefined; choisir(hex: string): void }) {
  const champ = useRef<HTMLInputElement>(null)
  const [valeur, setValeur] = useState(lireHex(actuelle ?? '') ?? '#ffffff')
  const poser = useRef(choisir)
  poser.current = choisir
  useEffect(() => setValeur(lireHex(actuelle ?? '') ?? '#ffffff'), [actuelle])
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
      <span>{t('tableau.couleurGlyphe')}</span>
      <input ref={champ} type="color" value={valeur} aria-label={t('tableau.couleurGlyphe')} onChange={(e) => setValeur(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
    </label>
  )
}

export function OutilsRenvoi({ elements, contexte }: PropsOutils<RenvoiTableau>) {
  const [ouvert, setOuvert, ancre] = useMenu()
  const { tableau, ecouterEspace, colorerTableau } = contexte.services
  const actuelle = useSyncExternalStore(ecouterEspace ?? sans, () => {
    // La couleur d'un raccourci est la sienne, sinon celle du tableau.
    const couleurs = new Set(elements.map((e) => (e.contenu.raccourci && e.contenu.couleur) || tableau?.(e.contenu.cible)?.couleur))
    return couleurs.size === 1 ? [...couleurs][0] : undefined
  })
  const fondCommun = elements.every((e) => e.contenu.fond === elements[0]!.contenu.fond) ? elements[0]!.contenu.fond : undefined
  const glypheCommun = elements.every((e) => e.contenu.glyphe === elements[0]!.contenu.glyphe) ? elements[0]!.contenu.glyphe : undefined
  /** Une teinte nommée (le fond libre part), ou un fond libre avec, s'il y en a une, la couleur de son glyphe. */
  const appliquer = (choix: { couleur: CouleurNote } | { fond: string; glyphe?: string }) => {
    const pas: Operation[] = []
    for (const e of elements) {
      const { fond: _f, glyphe: _g, ...base } = e.contenu
      let apres: RenvoiTableau = base
      if ('couleur' in choix) {
        // Un raccourci se colore lui seul ; un tableau, pour toutes les cartes qui le montrent.
        if (e.contenu.raccourci) apres = { ...base, couleur: choix.couleur }
        else colorerTableau?.(e.contenu.cible, choix.couleur)
      } else apres = { ...base, fond: choix.fond, ...(choix.glyphe ? { glyphe: choix.glyphe } : {}) }
      if (JSON.stringify(apres) !== JSON.stringify(e.contenu)) pas.push({ type: 'contenu', id: e.id, avant: e.contenu, apres })
    }
    if (pas.length > 0) contexte.magasin.faire(pas)
    setOuvert(false)
  }
  const poserGlyphe = (glyphe: string) => {
    contexte.magasin.faire(elements.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: { ...e.contenu, glyphe } })))
    setOuvert(false)
  }
  // Les couleurs déjà employées sur le tableau : fonds libres des cartes, couleurs des notes, et les paires fond/glyphe.
  const tous = contexte.magasin.lire().elements
  const suggerees = ouvert ? [...new Set([...fondsDeTableaux(tous), ...couleursSuggerees(tous)])].slice(0, SUGGEREES_MAX) : []
  const paires = ouvert ? pairesDuTableau(tous) : []
  return (
    <>
      {colorerTableau && (
        <OutilAvecMenu menu={[ouvert, setOuvert, ancre]} classeAncre="notak-colonne-menu-ancre" icone="palette" titre={t('tableau.couleur')} libelle={t('couleur.titre')} pastille={fondCommun ?? teinteDe(actuelle)}>
            <div className="notak-note-palette notak-panneau-couleur" role="menu">
              <GrillePastilles
                nom={t('couleur.titre')}
                pastilles={COULEURS_NOTE.map((c) => ({ cle: c, libelle: LIBELLES_COULEUR[c], teinte: FOND_NOTE[c], actif: !fondCommun && actuelle === c, choisir: () => appliquer({ couleur: c }) }))}
              />
              {paires.length > 0 && (
                <>
                  <span className="notak-decor-titre">{t('tableau.paires')}</span>
                  <div className="notak-pastilles-grille" role="group" aria-label={t('tableau.paires')}>
                    {paires.map((p) => (
                      <button
                        key={`${p.fond}/${p.glyphe}`}
                        type="button"
                        role="menuitem"
                        className="notak-paire"
                        title={`${p.fond} / ${p.glyphe}`}
                        aria-label={`${p.fond} / ${p.glyphe}`}
                        aria-pressed={fondCommun === p.fond && (glypheCommun ?? couleurTexteSur(p.fond)) === p.glyphe}
                        style={{ background: p.fond, color: p.glyphe }}
                        onClick={() => appliquer({ fond: p.fond, glyphe: p.glyphe })}
                      />
                    ))}
                  </div>
                </>
              )}
              {suggerees.length > 0 && (
                <>
                  <span className="notak-decor-titre">{t('couleur.recentes')}</span>
                  <GrillePastilles
                    nom={t('note.couleursTableau')}
                    pastilles={suggerees.map((c) => ({ cle: c, libelle: c, teinte: c, actif: fondCommun === c, choisir: () => appliquer({ fond: c }) }))}
                  />
                </>
              )}
              <CouleurPersonnalisee actuelle={fondCommun} choisir={(hex) => appliquer({ fond: hex, ...(glypheCommun ? { glyphe: glypheCommun } : {}) })} />
              <CouleurGlyphe actuelle={glypheCommun} choisir={poserGlyphe} />
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

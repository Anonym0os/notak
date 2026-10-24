import { useEffect, useRef } from 'react'
import type { Id } from '../../coeur/tableau'
import { t } from '../../langue'
import type { Geste } from './modele/gestes'
import { Icone } from '../../icones'
import { texteBrut } from '../../coeur/tableau'
import { type Lecture, branche, enfantsDe } from './modele/sujets'

interface Props {
  lecture: Lecture
  /** Le sujet où est le curseur. */
  courant: Id
  choisir(id: Id): void
  faire(g: Geste): void
  lectureSeule: boolean
  /** Le zoom de la page (1 = 100 %), que règle le menu du zoom de la barre du bas. */
  zoom?: number
}

/** Les lignes du plan : chaque sujet visible, avec sa profondeur, dans l'ordre de lecture (les flottants après). */
export function lignesDuPlan(l: Lecture): { id: Id; niveau: number }[] {
  const sortie: { id: Id; niveau: number }[] = []
  const parcourir = (id: Id, niveau: number) => {
    sortie.push({ id, niveau })
    if (l.sujets.get(id)?.replie) return
    for (const e of enfantsDe(l, id)) parcourir(e, niveau + 1)
  }
  if (l.central) parcourir(l.central, 0)
  for (const f of l.flottants) parcourir(f, 1)
  return sortie
}

/**
 * La carte en plan (Maj+Cmd+M, docs/XMIND.md § 6) : une liste indentée qu'on écrit au clavier. Entrée crée un frère,
 * Tab range le sujet sous celui d'au-dessus, Maj+Tab le remonte, Cmd+/ replie ; les flèches passent d'une ligne à
 * l'autre. Chaque titre s'écrit dans la carte quand on quitte sa ligne.
 */
export function Plan({ lecture: l, courant, choisir, faire, lectureSeule, zoom = 1 }: Props) {
  const lignes = lignesDuPlan(l)
  const racine = useRef<HTMLDivElement>(null)
  // Le curseur suit le sujet courant : un sujet créé par Entrée prend la main aussitôt.
  useEffect(() => {
    const champ = racine.current?.querySelector<HTMLInputElement>(`[data-ligne="${courant}"] input`)
    if (champ && document.activeElement !== champ) {
      champ.focus({ preventScroll: false })
      champ.select()
    }
  }, [courant, lignes.length])
  const premierFlottant = l.flottants[0] === undefined ? -1 : lignes.findIndex((x) => x.id === l.flottants[0])
  return (
    <div ref={racine} className="notak-arbre-plan" role="tree" aria-label={t('arbre.plan')} style={zoom === 1 ? undefined : { zoom }}>
      <div className="notak-plan-page">
        {lignes.map(({ id, niveau }, i) => {
          const s = l.sujets.get(id)!
          const enfants = enfantsDe(l, id).length
          const masques = s.replie ? branche(l, id).length - 1 : 0
          const note = s.note ? texteBrut(s.note).trim() : ''
          return (
            <div key={id}>
              {i === premierFlottant && <hr className="notak-plan-flottants" />}
              <div
                className="notak-arbre-plan-ligne"
                data-ligne={id}
                data-niveau={Math.min(niveau, 2)}
                data-choisi={id === courant ? '' : undefined}
                role="treeitem"
                aria-level={niveau + 1}
                aria-expanded={enfants ? !s.replie : undefined}
                style={{ marginLeft: Math.max(0, niveau - 1) * 24 }}
              >
                <button type="button" className="notak-arbre-plan-puce" tabIndex={-1} aria-label={s.replie ? t('arbre.gauche.deplier') : t('arbre.gauche.replier')} disabled={!enfants} onClick={() => faire({ type: 'replier', id })}>
                  {enfants ? <Icone nom="chevronBas" taille={12} trait={2.2} className={s.replie ? 'notak-plan-ferme' : undefined} /> : <span className="notak-plan-point" />}
                </button>
                <ChampLigne
                  titre={s.titre}
                  central={niveau === 0}
                  lectureSeule={lectureSeule}
                  focus={() => choisir(id)}
                  valider={(titre) => titre !== s.titre && faire({ type: 'renommer', id, titre })}
                  touche={(e, valeur) => {
                    const cmd = e.metaKey || e.ctrlKey
                    const ecrire = () => valeur !== s.titre && faire({ type: 'renommer', id, titre: valeur })
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      ecrire()
                      faire(cmd ? { type: 'parent', id } : { type: 'frere', id, avant: e.shiftKey })
                    } else if (e.key === 'Tab') {
                      e.preventDefault()
                      ecrire()
                      faire(e.shiftKey ? { type: 'desindenter', id } : { type: 'indenter', id })
                    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      if (e.altKey) {
                        e.preventDefault()
                        ecrire()
                        faire({ type: 'echanger', id, sens: e.key === 'ArrowUp' ? -1 : 1 })
                        return
                      }
                      const autre = lignes[i + (e.key === 'ArrowUp' ? -1 : 1)]
                      if (!autre) return
                      e.preventDefault()
                      ecrire()
                      choisir(autre.id)
                    } else if (e.key === 'Backspace' && valeur === '' && niveau > 0) {
                      e.preventDefault()
                      faire({ type: 'supprimer', ids: [id] })
                      const avant = lignes[i - 1]
                      if (avant) choisir(avant.id)
                    } else if (cmd && e.key === '/') {
                      e.preventDefault()
                      faire({ type: 'replier', id })
                    } else return
                    e.stopPropagation()
                  }}
                />
                {masques > 0 && <span className="notak-plan-compte" title={t('arbre.gauche.masques', { n: masques })}>{masques}</span>}
              </div>
              {(note || !!s.etiquettes?.length) && (
                <div className="notak-plan-sous" style={{ marginLeft: Math.max(0, niveau - 1) * 24 }}>
                  {!!s.etiquettes?.length && (
                    <p className="notak-plan-etiquettes">
                      {s.etiquettes.map((e) => (
                        <span key={e}>{e}</span>
                      ))}
                    </p>
                  )}
                  {note && <p className="notak-plan-note">{note}</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Une ligne du plan : le titre, sur une ligne (un retour à la ligne s'y lit comme une espace). */
function ChampLigne({
  titre,
  central,
  lectureSeule,
  focus,
  valider,
  touche,
}: {
  titre: string
  central: boolean
  lectureSeule: boolean
  focus(): void
  valider(t: string): void
  touche(e: React.KeyboardEvent<HTMLInputElement>, valeur: string): void
}) {
  const champ = useRef<HTMLInputElement>(null)
  const affiche = titre.replace(/\n/g, ' ')
  // Un titre changé ailleurs (par un autre, dans la carte) remplace ce qu'affiche la ligne, sauf pendant qu'on l'écrit.
  useEffect(() => {
    const c = champ.current
    if (c && document.activeElement !== c) c.value = affiche
  }, [affiche])
  return (
    <input
      ref={champ}
      className={central ? 'notak-arbre-plan-titre notak-arbre-plan-central' : 'notak-arbre-plan-titre'}
      defaultValue={affiche}
      readOnly={lectureSeule}
      aria-label={t('arbre.titre')}
      onFocus={focus}
      onBlur={(e) => e.target.value !== affiche && valider(e.target.value)}
      onKeyDown={(e) => touche(e, e.currentTarget.value === affiche ? titre : e.currentTarget.value)}
    />
  )
}

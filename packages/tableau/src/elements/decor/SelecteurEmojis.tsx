import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../langue'
import { type GroupeEmojis, avecTeinte, chargerEmojis, chercherEmojis, frequents, groupesEmojis, retenirEmoji, retenirTeinte, teinteRetenue } from './emojis'

/** Les neuf groupes d'Unicode, avec leur titre. */
const TITRES = ['emojis.g0', 'emojis.g1', 'emojis.g2', 'emojis.g3', 'emojis.g4', 'emojis.g5', 'emojis.g6', 'emojis.g7', 'emojis.g8']

/** La main qui sert de témoin pour les teintes de peau. */
const MAIN = '👍'
const TEINTES = ['', '🏻', '🏼', '🏽', '🏾', '🏿']

/**
 * Le sélecteur d'émojis : à gauche les catégories (la courante suit le défilement), la teinte de peau et la
 * recherche ; à droite les émojis d'Unicode par sections, huit par rangée. Les fréquents (les vingt-quatre les plus
 * employés) ouvrent la liste ; ceux que j'ai déjà posés sont surlignés.
 */
export function SelecteurEmojis({ choisir, posees }: { choisir(emoji: string): void; /** Les émojis que j'ai déjà posés : ils se détachent dans la grille. */ posees?: ReadonlySet<string> }) {
  const [requete, setRequete] = useState('')
  const [courante, setCourante] = useState('frequents')
  const [teinte, setTeinte] = useState(teinteRetenue)
  const [teintesVues, setTeintesVues] = useState(false)
  const liste = useRef<HTMLDivElement>(null)
  // Le catalogue (250 Ko) arrive à l'ouverture du sélecteur, pas avec la toile.
  const [groupes, setGroupes] = useState<GroupeEmojis[]>(groupesEmojis)
  useEffect(() => {
    let vivant = true
    if (groupes.length === 0) void chargerEmojis().then((g) => vivant && setGroupes(g))
    return () => {
      vivant = false
    }
  }, [groupes.length])
  const [favoris, setFavoris] = useState(frequents)
  const cherche = requete.trim().length > 0
  const trouves = useMemo(() => (cherche ? chercherEmojis(requete) : []), [cherche, requete, groupes])
  const parGroupe = useMemo(() => new Set(trouves.map((m) => m.e)), [trouves])

  const poser = (e: string, base: string) => {
    retenirEmoji(base)
    setFavoris(frequents())
    choisir(e)
  }
  const aller = (cle: string) => {
    setCourante(cle)
    const section = liste.current?.querySelector<HTMLElement>(`[data-section="${cle}"]`)
    if (section && liste.current) liste.current.scrollTop = section.offsetTop - liste.current.offsetTop
  }
  // La catégorie courante suit le défilement : la dernière section dont le haut est passé (à 150 px près).
  const suivre = () => {
    const l = liste.current
    if (!l || cherche) return
    let cle = 'frequents'
    for (const s of l.querySelectorAll<HTMLElement>('[data-section]')) if (s.offsetTop - l.offsetTop <= l.scrollTop + 150) cle = s.dataset.section!
    setCourante(cle)
  }
  useEffect(() => {
    if (liste.current) liste.current.scrollTop = 0
  }, [cherche])

  const bouton = (e: string, nom: string, base: string) => (
    <button key={`${e}${nom}`} type="button" role="menuitem" title={nom} aria-pressed={posees?.has(e) || undefined} aria-label={t('decor.reagirAvec', { emoji: e })} onClick={() => poser(e, base)}>
      {e}
    </button>
  )
  const parBase = useMemo(() => new Map(groupes.flatMap((g) => g.emojis).map((m) => [m.e, m])), [groupes])
  const categories = [{ cle: 'frequents', titre: t('emojis.frequents') }, ...groupes.map((g) => ({ cle: String(g.cle), titre: t(TITRES[g.cle]!) }))]
  const vide = (cle: string) => cherche && !groupes.find((g) => String(g.cle) === cle)?.emojis.some((m) => parGroupe.has(m.e))

  return (
    <div className="notak-emojis">
      <div className="notak-emojis-menu">
        <div className="notak-emojis-categories" role="tablist" aria-orientation="vertical">
          {categories.map((c) => (
            <button key={c.cle} type="button" role="tab" aria-selected={c.cle === courante} data-categorie={c.cle} data-vide={vide(c.cle) || undefined} onClick={() => aller(c.cle)}>
              {c.titre}
            </button>
          ))}
        </div>
        <div className="notak-emojis-teinte">
          <button type="button" className="notak-emojis-teinte-lien" aria-expanded={teintesVues} onClick={() => setTeintesVues(!teintesVues)}>
            <span aria-hidden>{MAIN + TEINTES[teinte]}</span> {t('emojis.teinte')}
          </button>
          {teintesVues && (
            <div className="notak-emojis-teintes" role="radiogroup" aria-label={t('emojis.teinte')}>
              {TEINTES.map((m, i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={teinte === i}
                  onClick={() => {
                    setTeinte(i)
                    retenirTeinte(i)
                    setTeintesVues(false)
                  }}
                >
                  {MAIN + m}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          type="text"
          className="notak-emojis-recherche"
          value={requete}
          placeholder={t('emojis.chercher')}
          aria-label={t('emojis.chercher')}
          onChange={(e) => setRequete(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>
      <div ref={liste} className="notak-emojis-liste" onScroll={suivre}>
        {cherche ? (
          trouves.length > 0 ? (
            <div className="notak-emojis-grille" role="group" aria-label={t('emojis.resultats')}>
              {trouves.map((m) => bouton(avecTeinte(m, teinte), m.fr, m.e))}
            </div>
          ) : groupes.length === 0 ? (
            <p className="notak-emojis-vide" aria-busy>
              …
            </p>
          ) : (
            <p className="notak-emojis-vide">
              {t('emojis.aucun')} <span aria-hidden>😔</span>
            </p>
          )
        ) : (
          <>
            <section data-section="frequents">
              <h2>{t('emojis.frequents')}</h2>
              <div className="notak-emojis-grille" role="group" aria-label={t('emojis.frequents')}>
                {favoris.map((e) => bouton(parBase.get(e) ? avecTeinte(parBase.get(e)!, teinte) : e, parBase.get(e)?.fr ?? e, e))}
              </div>
            </section>
            {groupes.map((g) => (
              <section key={g.cle} data-section={String(g.cle)}>
                <h2>{t(TITRES[g.cle]!)}</h2>
                <div className="notak-emojis-grille" role="group" aria-label={t(TITRES[g.cle]!)}>
                  {g.emojis.map((m) => bouton(avecTeinte(m, teinte), m.fr, m.e))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

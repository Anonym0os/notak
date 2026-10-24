import { useMemo, useState } from 'react'
import type { Arbre, StructureArbre } from '../../../coeur/tableau'
import { Icone } from '../../../icones'
import { t } from '../../../langue'
import { CarteVignette, MenuContextuel, Popover, useOuvrable } from '../controles'
import type { Geste } from '../modele/gestes'
import { themeDuGroupe, groupeCourant, groupesThemes, type GroupeTheme, choixDe, varianteActive, varianteSuivante } from './groupes'
import { variantesDe } from '../themes'
import { ApercuStructure } from './apercu'
import { DialogueTheme } from './DialogueTheme'
import { type Preferences, type ThemeCouleurPerso, basculerFavori, cleFavori, dernieresVariantes, idCouleurPerso, modifierPreferences, usePreferences } from './preferences'

type OngletTheme = 'favoris' | 'perso' | 'colore' | 'classique'

/** Les six couleurs d'un groupe, en pastille entièrement arrondie découpée en six segments égaux. */
function Segments({ palette }: { palette: readonly string[] }) {
  return (
    <span className="notak-carte-segments" aria-hidden>
      {palette.slice(0, 6).map((c, i) => (
        <i key={i} style={{ background: c }} />
      ))}
    </span>
  )
}

/** Une variante d'un thème, dessinée sur la structure de la carte : la sienne à branches de couleur, ou une seule couleur. */
function ApercuVariante({ groupe, accent, structure }: { groupe: GroupeTheme; accent: string | undefined; structure: StructureArbre }) {
  const th = themeDuGroupe(groupe)
  return <ApercuStructure structure={structure} couleurs={accent ? [accent] : groupe.palette} fond={th.fond ?? 'var(--notak-arbre-fond)'} encre={th.encre} />
}

/** Les groupes qui vont dans un onglet de la liste. */
export function groupesDeLOnglet(onglet: OngletTheme, groupes: readonly GroupeTheme[]): GroupeTheme[] {
  return onglet === 'perso' ? groupes.filter((g) => g.categorie === 'perso') : onglet === 'favoris' ? [] : groupes.filter((g) => g.categorie === onglet)
}

/** Les onglets de la liste, dans l'ordre : Favoris (s'il y en a), Ma couleur (s'il y en a), Coloré, Classique. */
export function ongletsDeTheme(prefs: Pick<Preferences, 'favoris' | 'couleursPerso'>, favorisValides: number): OngletTheme[] {
  return [...(favorisValides > 0 ? (['favoris'] as const) : []), ...(prefs.couleursPerso.length > 0 ? (['perso'] as const) : []), 'colore', 'classique']
}

/**
 * Le thème de couleur : le sélecteur (six segments, le nom du groupe), le bouton « + » qui crée un thème, puis la
 * grille des variantes du groupe courant. Un clic sur le sélecteur ouvre la liste des thèmes, à gauche du panneau.
 */
export function ThemeCouleur({ arbre, structure, faire }: { arbre: Arbre; structure: StructureArbre; faire(g: Geste): void }) {
  const prefs = usePreferences()
  const groupes = useMemo(() => groupesThemes(prefs.couleursPerso), [prefs.couleursPerso])
  const courant = groupeCourant(arbre, groupes)
  const liste = useOuvrable()
  const plus = useOuvrable()
  const [dialogue, setDialogue] = useState<{ edition: ThemeCouleurPerso | null } | null>(null)
  const appliquer = (g: GroupeTheme, accent: string | undefined) => {
    dernieresVariantes.set(g.id, accent)
    faire({ type: 'themeCouleur', choix: choixDe(g, accent) })
  }
  const favori = (g: GroupeTheme, accent: string | undefined) => prefs.favoris.includes(cleFavori(g.id, accent))
  return (
    <>
      <div className="notak-carte-rangee-theme">
        <button ref={liste.poser} type="button" className="notak-carte-select notak-carte-select-theme" aria-haspopup="dialog" aria-expanded={liste.ouvert} title={t('arbre.carte.themeAide')} onClick={liste.basculer}>
          <Segments palette={courant.palette} />
          <span className="notak-carte-select-texte">{courant.nom}</span>
          <Icone nom="chevronBas" taille={12} trait={2} />
        </button>
        <button ref={plus.poser} type="button" className="notak-carte-bouton-icone" title={t('arbre.carte.themeNouveau')} aria-label={t('arbre.carte.themeNouveau')} onClick={() => setDialogue({ edition: null })}>
          <Icone nom="ajouter" taille={16} trait={1.75} />
        </button>
      </div>
      <div className="notak-carte-variantes" role="group" aria-label={t('arbre.carte.themeCouleur')}>
        {variantesDe(themeDuGroupe(courant)).map((accent) => (
          <CarteVignette
            key={accent ?? 'couleurs'}
            taille="petite"
            actif={varianteActive(arbre, courant, accent)}
            titre={accent ? `${courant.nom} ${accent}` : courant.nom}
            onClick={() => appliquer(courant, accent)}
            coin={<EtoileFavori actif={favori(courant, accent)} basculer={() => basculerFavori(courant.id, accent)} />}
          >
            <ApercuVariante groupe={courant} accent={accent} structure={structure} />
          </CarteVignette>
        ))}
      </div>
      <ListeThemes ouvert={liste.ouvert} ancre={liste.ancre} fermer={liste.fermer} arbre={arbre} groupes={groupes} courant={courant} prefs={prefs} structure={structure} appliquer={appliquer} modifier={(edition) => setDialogue({ edition })} />
      {dialogue && (
        <DialogueTheme
          hote={plus.ancre?.closest<HTMLElement>('.notak-arbre-fond') ?? null}
          edition={dialogue.edition}
          noms={prefs.couleursPerso.map((p) => p.nom)}
          structure={structure}
          fermer={() => setDialogue(null)}
          enregistrer={(theme) => {
            modifierPreferences((p) => ({ ...p, couleursPerso: p.couleursPerso.some((x) => x.id === theme.id) ? p.couleursPerso.map((x) => (x.id === theme.id ? theme : x)) : [...p.couleursPerso, theme] }))
            setDialogue(null)
          }}
        />
      )}
    </>
  )
}

function EtoileFavori({ actif, basculer }: { actif: boolean; basculer(): void }) {
  return (
    <button type="button" className="notak-carte-etoile" aria-pressed={actif} aria-label={actif ? t('arbre.carte.favoriRetirer') : t('arbre.carte.favori')} title={actif ? t('arbre.carte.favoriRetirer') : t('arbre.carte.favori')} onClick={basculer}>
      <Icone nom={actif ? 'favoriPlein' : 'favori'} taille={12} trait={1.75} />
    </button>
  )
}

/**
 * La fenêtre des thèmes (316 × 370) : des onglets capsule, puis la liste. Un clic sur un groupe prend sa première
 * variante (ou la dernière qu'on y a prise) ; sur le groupe courant, la variante suivante. Elle ne se ferme pas au
 * choix : on enchaîne les essais.
 */
function ListeThemes({
  ouvert,
  ancre,
  fermer,
  arbre,
  groupes,
  courant,
  prefs,
  structure,
  appliquer,
  modifier,
}: {
  ouvert: boolean
  ancre: HTMLElement | null
  fermer(): void
  arbre: Arbre
  groupes: readonly GroupeTheme[]
  courant: GroupeTheme
  prefs: Preferences
  structure: StructureArbre
  appliquer(g: GroupeTheme, accent: string | undefined): void
  modifier(p: ThemeCouleurPerso): void
}) {
  const favoris = useMemo(
    () =>
      prefs.favoris.flatMap((cle) => {
        const [id, accent = ''] = cle.split('|')
        const g = groupes.find((x) => x.id === id)
        return g ? [{ g, accent: accent || undefined }] : []
      }),
    [prefs.favoris, groupes],
  )
  const onglets = ongletsDeTheme(prefs, favoris.length)
  const parDefaut: OngletTheme = courant.categorie === 'perso' ? 'perso' : courant.categorie === 'classique' ? 'classique' : 'colore'
  const [choisi, setChoisi] = useState<OngletTheme | undefined>(undefined)
  const actif: OngletTheme = [choisi, prefs.ongletThemes].find((o): o is OngletTheme => !!o && onglets.includes(o)) ?? (onglets.includes(parDefaut) ? parDefaut : 'colore')
  const [menu, setMenu] = useState<{ x: number; y: number; theme: ThemeCouleurPerso } | null>(null)
  const [renomme, setRenomme] = useState<string | null>(null)
  const changerOnglet = (o: OngletTheme) => {
    setChoisi(o)
    modifierPreferences((p) => ({ ...p, ongletThemes: o }))
  }
  const renommer = (id: string, nom: string) => {
    setRenomme(null)
    if (nom.trim()) modifierPreferences((p) => ({ ...p, couleursPerso: p.couleursPerso.map((x) => (x.id === id ? { ...x, nom: nom.trim() } : x)) }))
  }
  const supprimer = (p: ThemeCouleurPerso) => {
    if (!window.confirm(t('arbre.carte.themeSupprimer', { nom: p.nom }))) return
    modifierPreferences((x) => ({ ...x, couleursPerso: x.couleursPerso.filter((y) => y.id !== p.id), favoris: x.favoris.filter((f) => !f.startsWith(`${p.id}|`)) }))
  }
  const dupliquer = (p: ThemeCouleurPerso) =>
    modifierPreferences((x) => ({ ...x, couleursPerso: [...x.couleursPerso, { ...p, id: idCouleurPerso(), nom: `${p.nom} 2`, palette: [...p.palette] }] }))
  const clic = (g: GroupeTheme) => (g.id === courant.id ? appliquer(g, varianteSuivante(g, arbre)) : appliquer(g, dernieresVariantes.get(g.id)))
  return (
    <>
    <Popover ancre={ancre} ouvert={ouvert} fermer={fermer} cote="gauche" largeur={316} hauteur={370} className="notak-carte-popover-themes" etiquette={t('arbre.carte.themeCouleur')}>
      <div className="notak-carte-themes">
        <div className="notak-carte-capsules" role="tablist">
          {onglets.map((o) => (
            <button key={o} type="button" role="tab" aria-selected={o === actif} onClick={() => changerOnglet(o)}>
              {t(`arbre.carte.onglet.${o}`)}
            </button>
          ))}
        </div>
        {actif === 'favoris' ? (
          <div className="notak-carte-themes-favoris">
            {favoris.map(({ g, accent }) => (
              <CarteVignette
                key={cleFavori(g.id, accent)}
                actif={varianteActive(arbre, g, accent)}
                titre={g.nom}
                onClick={() => appliquer(g, accent)}
                coin={<EtoileFavori actif basculer={() => basculerFavori(g.id, accent)} />}
              >
                <ApercuVariante groupe={g} accent={accent} structure={structure} />
              </CarteVignette>
            ))}
          </div>
        ) : (
          <div className="notak-carte-themes-groupes">
            {groupesDeLOnglet(actif, groupes).map((g) => (
              <div key={g.id} className="notak-carte-groupe-theme">
                {renomme === g.id ? (
                  <input
                    autoFocus
                    className="notak-carte-renommer"
                    defaultValue={g.nom}
                    aria-label={t('arbre.carte.menu.renommer')}
                    onBlur={(e) => renommer(g.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') renommer(g.id, e.currentTarget.value)
                      else if (e.key === 'Escape') setRenomme(null)
                    }}
                  />
                ) : (
                  <span className="notak-carte-groupe-nom" onClick={() => g.perso && setRenomme(g.id)}>
                    {g.nom}
                  </span>
                )}
                <button
                  type="button"
                  className="notak-carte-bande"
                  data-actif={g.id === courant.id ? '' : undefined}
                  aria-pressed={g.id === courant.id}
                  aria-label={g.nom}
                  title={g.nom}
                  onClick={() => clic(g)}
                  onContextMenu={(e) => {
                    if (!g.perso) return
                    e.preventDefault()
                    setMenu({ x: e.clientX, y: e.clientY, theme: g.perso })
                  }}
                >
                  <Segments palette={g.palette} />
                  {g.id === courant.id && (
                    <span className="notak-carte-alterner">
                      <Icone nom="convertir" taille={12} trait={2} />
                      {t('arbre.carte.alterner')}
                    </span>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Popover>
      <MenuContextuel
        ancre={ancre}
        point={menu}
        fermer={() => setMenu(null)}
        entrees={
          menu
            ? [
                { libelle: t('arbre.carte.menu.modifier'), onClick: () => modifier(menu.theme) },
                { libelle: t('arbre.carte.menu.renommer'), onClick: () => setRenomme(menu.theme.id) },
                { libelle: t('arbre.carte.menu.dupliquer'), onClick: () => dupliquer(menu.theme), separateurAvant: true },
                { libelle: t('arbre.carte.menu.supprimer'), onClick: () => supprimer(menu.theme) },
              ]
            : []
        }
      />
    </>
  )
}

import { useState } from 'react'
import type { Arbre, StructureArbre } from '../../../coeur/tableau'
import { Icone } from '../../../icones'
import { t } from '../../../langue'
import { CarteVignette, MenuContextuel } from '../controles'
import type { Geste } from '../modele/gestes'
import { type StyleCarte, memeStyle, styleDeCarte } from '../modele/reglages'
import { themeBase } from '../themes'
import { ApercuStructure } from './apercu'
import { type ThemePersonnalise, idCouleurPerso, modifierPreferences, nomSuivant, usePreferences } from './preferences'

/** Les couleurs et le fond d'une vignette de thème personnalisé : ce que le style donne à une carte. */
export function couleursDeStyle(style: StyleCarte): { couleurs: string[]; fond: string | undefined; encre: string | undefined } {
  const th = themeBase({ theme: style.theme, ...(style.themePerso ? { themePerso: style.themePerso } : {}) })
  const couleurs = style.options?.uneCouleur ? [style.couleurLigne ?? th.encre ?? '#3b3f45'] : (style.jeuCouleurs?.length ? style.jeuCouleurs : th.palette)
  return { couleurs: [...couleurs], fond: style.fond ?? th.fond, encre: th.encre }
}

/**
 * La vue secondaire « Thèmes personnalisés » : une tuile « Créer un thème » (d'après le style actuel de la carte),
 * puis chaque thème gardé. Un clic en applique les couleurs, polices et largeurs à la carte ; un clic sur le nom le
 * renomme ; un clic droit ouvre « Mettre à jour » (le thème prend le style actuel), « Renommer », « Dupliquer »,
 * « Supprimer ».
 *
 * → Notak : pas d'éditeur de thème à part ; « Modifier » de Xmind devient « Mettre à jour d'après la carte ».
 */
export function ThemesPersonnalises({ arbre, structure, faire }: { arbre: Arbre; structure: StructureArbre; faire(g: Geste): void }) {
  const prefs = usePreferences()
  const [menu, setMenu] = useState<{ x: number; y: number; theme: ThemePersonnalise } | null>(null)
  const [renomme, setRenomme] = useState<string | null>(null)
  const [hote, setHote] = useState<HTMLElement | null>(null)
  const actuel = styleDeCarte(arbre)
  const noms = prefs.themesPerso.map((x) => x.nom)
  const changer = (id: string, f: (x: ThemePersonnalise) => ThemePersonnalise) => modifierPreferences((p) => ({ ...p, themesPerso: p.themesPerso.map((x) => (x.id === id ? f(x) : x)) }))
  const renommer = (id: string, nom: string) => {
    setRenomme(null)
    if (nom.trim()) changer(id, (x) => ({ ...x, nom: nom.trim() }))
  }
  return (
    <div className="notak-carte-themes-perso" ref={setHote}>
      <div className="notak-carte-tuile">
        <button type="button" className="notak-carte-tuile-image notak-carte-creer" title={t('arbre.carte.creerThemeAide')} onClick={() => modifierPreferences((p) => ({ ...p, themesPerso: [...p.themesPerso, { id: idCouleurPerso(), nom: nomSuivant(t('arbre.carte.themePerso'), noms), style: actuel }] }))}>
          <Icone nom="ajouter" taille={20} trait={1.5} />
        </button>
        <span className="notak-carte-tuile-nom">{t('arbre.carte.creerTheme')}</span>
      </div>
      {prefs.themesPerso.map((th) => {
        const c = couleursDeStyle(th.style)
        return (
          <div key={th.id} className="notak-carte-tuile">
            <CarteVignette
              actif={memeStyle(actuel, th.style)}
              titre={th.nom}
              onClick={() => faire({ type: 'styleCarte', style: th.style })}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ x: e.clientX, y: e.clientY, theme: th })
              }}
            >
              <ApercuStructure structure={structure} couleurs={c.couleurs} fond={c.fond ?? 'var(--notak-arbre-fond)'} encre={c.encre} />
            </CarteVignette>
            {renomme === th.id ? (
              <input
                autoFocus
                className="notak-carte-renommer"
                defaultValue={th.nom}
                aria-label={t('arbre.carte.menu.renommer')}
                onBlur={(e) => renommer(th.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renommer(th.id, e.currentTarget.value)
                  else if (e.key === 'Escape') setRenomme(null)
                }}
              />
            ) : (
              <button type="button" className="notak-carte-tuile-nom" onClick={() => setRenomme(th.id)}>
                {th.nom}
              </button>
            )}
          </div>
        )
      })}
      <MenuContextuel
        ancre={hote}
        point={menu}
        fermer={() => setMenu(null)}
        entrees={
          menu
            ? [
                { libelle: t('arbre.carte.menu.miseAJour'), onClick: () => changer(menu.theme.id, (x) => ({ ...x, style: actuel })) },
                { libelle: t('arbre.carte.menu.renommer'), onClick: () => setRenomme(menu.theme.id) },
                {
                  libelle: t('arbre.carte.menu.dupliquer'),
                  separateurAvant: true,
                  onClick: () => modifierPreferences((p) => ({ ...p, themesPerso: [...p.themesPerso, { ...menu.theme, id: idCouleurPerso(), nom: nomSuivant(menu.theme.nom, noms) }] })),
                },
                {
                  libelle: t('arbre.carte.menu.supprimer'),
                  onClick: () => window.confirm(t('arbre.carte.themeSupprimer', { nom: menu.theme.nom })) && modifierPreferences((p) => ({ ...p, themesPerso: p.themesPerso.filter((x) => x.id !== menu.theme.id) })),
                },
              ]
            : []
        }
      />
    </div>
  )
}

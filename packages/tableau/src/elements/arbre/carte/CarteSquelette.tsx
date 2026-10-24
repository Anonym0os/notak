import { useState } from 'react'
import type { Arbre, StructureArbre } from '../../../coeur/tableau'
import { Icone } from '../../../icones'
import { t } from '../../../langue'
import { CarteVignette, Popover, useOuvrable } from '../controles'
import type { Geste } from '../modele/gestes'
import { themeDeArbre } from '../themes'
import { ApercuStructure } from './apercu'
import { GROUPES_SQUELETTES, groupeDeStructure, nomDeSquelette, squeletteDeCarte } from './groupes'

/**
 * La carte du squelette : la vignette du squelette courant (sa structure et son style, aux couleurs de la carte), le nom
 * de son groupe (« Carte mentale »), un chevron. Elle ouvre, à gauche du panneau, la fenêtre des squelettes : des
 * groupes repliables, chacun une grille de trois vignettes. Choisir n'en ferme pas la fenêtre : on essaie plusieurs
 * squelettes à la suite. Une carte sans squelette (venue d'avant) montre la vignette de sa structure seule.
 *
 * → Notak : cinquante et un squelettes, ceux des huit groupes dont nous avons la structure ; il n'y a pas de « Tableau
 * arbre » ni de « Grille » (docs/XMIND.md § 2).
 */
export function CarteSquelette({ arbre, structure, faire }: { arbre: Arbre; structure: StructureArbre; faire(g: Geste): void }) {
  const o = useOuvrable()
  const [replies, setReplies] = useState<ReadonlySet<string>>(new Set())
  const actif = squeletteDeCarte(arbre)
  const theme = themeDeArbre(arbre)
  const coloration = { couleurs: theme.palette, fond: theme.fond ?? 'var(--notak-arbre-fond)', encre: theme.encre }
  return (
    <>
      <button ref={o.poser} type="button" className="notak-arbre-reglages-squelette" aria-haspopup="dialog" aria-expanded={o.ouvert} title={t('arbre.carte.squelette')} onClick={o.basculer}>
        <span className="notak-arbre-reglages-squelette-vignette">
          <ApercuStructure structure={structure} squelette={actif} {...coloration} />
        </span>
        <span className="notak-arbre-reglages-squelette-nom">{t(`arbre.carte.g.${actif?.groupe ?? groupeDeStructure(structure)}`)}</span>
        <Icone nom="chevronBas" taille={12} trait={2} />
      </button>
      <Popover ancre={o.ancre} ouvert={o.ouvert} fermer={o.fermer} cote="gauche" largeur={388} hauteur={450} className="notak-arbre-reglages-popover-squelettes" etiquette={t('arbre.carte.squelette')}>
        <div className="notak-arbre-reglages-squelettes">
          {GROUPES_SQUELETTES.map((g) => {
            const ferme = replies.has(g.id)
            return (
              <section key={g.id} className="notak-arbre-reglages-groupe-squelettes" data-replie={ferme ? '' : undefined}>
                <button
                  type="button"
                  className="notak-arbre-reglages-groupe-titre"
                  aria-expanded={!ferme}
                  onClick={() =>
                    setReplies((r) => {
                      const n = new Set(r)
                      if (!n.delete(g.id)) n.add(g.id)
                      return n
                    })
                  }
                >
                  <Icone nom="chevronBas" taille={12} trait={2.5} />
                  {t(`arbre.carte.g.${g.id}`)}
                </button>
                {!ferme && (
                  <div className="notak-arbre-reglages-grille-squelettes">
                    {g.squelettes.map((s) => (
                      <CarteVignette
                        key={s.id}
                        actif={s.id === actif?.id}
                        titre={nomDeSquelette(s)}
                        onClick={() => s.id !== actif?.id && faire({ type: 'squelette', squelette: s.id })}
                        coin={s.main ? <span className="notak-arbre-reglages-vignette-main" title={t('arbre.carte.sqMain')}><Icone nom="menuCrayon" taille={10} trait={2} /></span> : undefined}
                      >
                        <ApercuStructure structure={s.structure} squelette={s} {...coloration} />
                      </CarteVignette>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </Popover>
    </>
  )
}

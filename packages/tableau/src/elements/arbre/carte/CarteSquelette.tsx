import { useState } from 'react'
import type { StructureArbre } from '../../../coeur/tableau'
import { Icone } from '../../../icones'
import { t } from '../../../langue'
import { CarteVignette, Popover, useOuvrable } from '../controles'
import type { Geste } from '../modele/gestes'
import { ApercuStructure } from './apercu'
import { GROUPES_SQUELETTES, groupeDeStructure } from './groupes'

/**
 * La carte du squelette : la vignette de la structure courante, le nom de son groupe (« Carte mentale »), un chevron.
 * Elle ouvre, à gauche du panneau, la fenêtre des squelettes : des groupes repliables, chacun une grille de trois
 * vignettes. Choisir n'en ferme pas la fenêtre : on essaie plusieurs structures à la suite.
 *
 * → Notak : un squelette est une structure (celle du sujet central), sans le style que Xmind y joint ; il n'y a pas de
 * « Tableau arbre » ni de « Grille » (docs/XMIND.md § 2).
 */
export function CarteSquelette({ structure, faire }: { structure: StructureArbre; faire(g: Geste): void }) {
  const o = useOuvrable()
  const [replies, setReplies] = useState<ReadonlySet<string>>(new Set())
  return (
    <>
      <button ref={o.poser} type="button" className="notak-arbre-reglages-squelette" aria-haspopup="dialog" aria-expanded={o.ouvert} title={t('arbre.carte.squelette')} onClick={o.basculer}>
        <span className="notak-arbre-reglages-squelette-vignette">
          <ApercuStructure structure={structure} />
        </span>
        <span className="notak-arbre-reglages-squelette-nom">{t(`arbre.carte.g.${groupeDeStructure(structure)}`)}</span>
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
                    {g.structures.map((s) => (
                      <CarteVignette key={s} actif={s === structure} titre={t(`arbre.s.${s}`)} onClick={() => s !== structure && faire({ type: 'squelette', structure: s })}>
                        <ApercuStructure structure={s} />
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

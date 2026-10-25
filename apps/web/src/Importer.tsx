import { type DepotFichiers, ErreurNotak, type Element, type EspaceNavigable, type Id, nouvelId, type Operation, decoderNotak } from '@notak/tableau'
import { t, tn } from './langue'
import { useRef, useState } from 'react'
import { CIBLE_FICHIER, CIBLE_TABLEAU, ErreurImport, type PlanImport, lireExportMilanote } from './milanote'
import { Icone } from '@notak/tableau'
import { poserLeRenvoi, poserNotak } from './notak'
import { usePanneau } from './panneaux'

/** Les dimensions d'une image, lues dans ses pixels ; un format que le navigateur ne lit pas garde un 4:3. */
async function dimensions(blob: Blob): Promise<{ largeur: number; hauteur: number }> {
  try {
    const image = await createImageBitmap(blob)
    const d = { largeur: image.width, hauteur: image.height }
    image.close()
    return d
  } catch {
    return { largeur: 800, hauteur: 600 }
  }
}

/**
 * Pose un plan d'import dans l'espace : le premier tableau devient un tableau neuf sous `parent` (avec son renvoi,
 * à droite de ce qui s'y trouve), les autres des sous-tableaux. Les fichiers vont au dépôt de l'édition (le serveur, ou
 * l'appareil).
 * Rend l'id du tableau de tête et le nombre de fichiers qu'on n'a pas pu envoyer.
 */
export async function poserLePlan(plan: PlanImport, espace: EspaceNavigable, parent: Id, fichiers: DepotFichiers): Promise<{ tete: Id; perdus: number }> {
  // Qui renvoie à qui : un sous-tableau naît sous le tableau qui le cite, sinon sous la tête.
  const citeur = new Map<string, string>()
  for (const tb of plan.tableaux) {
    for (const e of tb.elements) {
      if (e.contenu.type === 'tableau' && e.contenu.cible.startsWith(CIBLE_TABLEAU)) {
        const cle = e.contenu.cible.slice(CIBLE_TABLEAU.length)
        if (!citeur.has(cle) && cle !== tb.cle) citeur.set(cle, tb.cle)
      }
    }
  }
  const ids = new Map<string, Id>()
  const racine = plan.tableaux[0]!
  ids.set(racine.cle, espace.creerTableau(racine.titre || t('importer.titreDefaut'), parent))
  for (let restants = plan.tableaux.length - 1, passes = 0; restants > 0 && passes < plan.tableaux.length; passes++) {
    for (const tb of plan.tableaux.slice(1)) {
      const pere = ids.get(citeur.get(tb.cle) ?? racine.cle)
      if (ids.has(tb.cle) || !pere) continue
      ids.set(tb.cle, espace.creerTableau(tb.titre || t('commun.sansTitre'), pere))
      restants--
    }
  }

  const envoyes = new Map<string, { id: Id; largeur: number; hauteur: number } | null>()
  const envoyer = async (chemin: string) => {
    if (!envoyes.has(chemin)) {
      const f = plan.fichiers.get(chemin)
      if (!f) envoyes.set(chemin, null)
      else {
        const blob = new Blob([f.octets as Uint8Array<ArrayBuffer>], { type: f.type })
        envoyes.set(
          chemin,
          await fichiers.enregistrer(blob).then(
            async (id) => ({ id, ...(f.type.startsWith('image/') ? await dimensions(blob) : { largeur: 0, hauteur: 0 }) }),
            () => null,
          ),
        )
      }
    }
    return envoyes.get(chemin)!
  }

  let perdus = 0
  for (const tb of plan.tableaux) {
    const ops: Operation[] = []
    for (const e of tb.elements) {
      let element: Element = e
      const c = e.contenu
      if (c.type === 'tableau' && c.cible.startsWith(CIBLE_TABLEAU)) {
        const cible = ids.get(c.cible.slice(CIBLE_TABLEAU.length))
        if (!cible) continue
        element = { ...element, contenu: { ...c, cible } }
      } else if ((c.type === 'image' || c.type === 'fichier') && c.fichier.startsWith(CIBLE_FICHIER)) {
        const f = await envoyer(c.fichier.slice(CIBLE_FICHIER.length))
        if (!f) {
          perdus++
          continue
        }
        element = {
          ...element,
          contenu: c.type === 'image' ? { ...c, fichier: f.id, largeurOrigine: f.largeur, hauteurOrigine: f.hauteur } : { ...c, fichier: f.id },
        }
      }
      ops.push({ type: 'creer', element })
    }
    if (ops.length > 0) espace.magasin(ids.get(tb.cle)!).faire(ops)
  }

  poserLeRenvoi(espace, parent, ids.get(racine.cle)!)
  return { tete: ids.get(racine.cle)!, perdus }
}

/** Le bouton « Importer » : un fichier `.notak`, ou un export Markdown de Milanote (zip), devient un tableau, ses sous-tableaux et ses fichiers. */
export function Importer({
  espace,
  tableau,
  ouvrir,
  fichiers,
  rouvrirNotak,
}: {
  espace: EspaceNavigable
  tableau: Id
  ouvrir(id: Id): void
  fichiers: DepotFichiers
  /** L'édition locale rouvre un `.notak` à sa façon : en le fusionnant à ce qu'elle a (local/copie.ts). */
  rouvrirNotak?(f: File): Promise<void>
}) {
  const { ouvert, regler, basculer, ancre, bouton, panneau } = usePanneau<HTMLDivElement, HTMLButtonElement>()
  const [etat, setEtat] = useState<{ type: 'repos' } | { type: 'cours' } | { type: 'fini'; texte: string } | { type: 'echec'; texte: string }>({ type: 'repos' })
  const choix = useRef<HTMLInputElement>(null)
  // Le sélecteur ne montre que le format choisi : `accept` est posé juste avant le clic.
  const choisir = (types: string) => {
    if (!choix.current) return
    choix.current.accept = types
    choix.current.click()
  }
  if (espace.lectureSeule?.(tableau)) return null

  const importerNotak = async (fichier: File) => {
    setEtat({ type: 'cours' })
    try {
      const { tete, tableaux, perdus } = await poserNotak(decoderNotak(new Uint8Array(await fichier.arrayBuffer())), espace, tableau, fichiers)
      setEtat({ type: 'fini', texte: tn('importer.tableaux', tableaux) + (perdus ? `, ${tn('importer.fichiersPerdus', perdus)}` : '') + '.' })
      ouvrir(tete)
    } catch (x) {
      const recent = x instanceof ErreurNotak && x.message.includes('récente')
      setEtat({ type: 'echec', texte: recent ? t('importer.notakRecent') : x instanceof ErreurNotak ? t('importer.pasNotak') : t('importer.impossible') })
    }
  }

  const importer = async (fichier: File) => {
    if (/\.notak$/i.test(fichier.name)) {
      if (!rouvrirNotak) return importerNotak(fichier)
      return rouvrirNotak(fichier)
    }
    setEtat({ type: 'cours' })
    try {
      const plan = lireExportMilanote(new Uint8Array(await fichier.arrayBuffer()), nouvelId)
      const { tete, perdus } = await poserLePlan(plan, espace, tableau, fichiers)
      const nombre = plan.tableaux.length
      const avertis = plan.avertissements.length + perdus
      setEtat({
        type: 'fini',
        texte: tn('importer.tableaux', nombre) + (avertis ? `, ${tn('importer.arevoir', avertis)}` : '') + '.',
      })
      ouvrir(tete)
    } catch (x) {
      setEtat({ type: 'echec', texte: x instanceof ErreurImport ? x.message : t('importer.impossible') })
    }
  }

  return (
    <div className="importer" ref={ancre}>
      <button type="button" ref={bouton} className="bouton" aria-expanded={ouvert} disabled={etat.type === 'cours'} onClick={basculer}>
        <Icone nom="importer" taille={16} />
        {etat.type === 'cours' ? t('importer.encours') : t('importer.titre')}
      </button>
      {ouvert && (
        <div className="compte-menu" ref={panneau} role="menu">
          <button type="button" role="menuitem" onClick={() => choisir('.notak')}>
            {t('importer.notak')}
          </button>
          <button type="button" role="menuitem" onClick={() => choisir('.zip,application/zip')}>
            {t('importer.milanote')}
          </button>
          <small>{t('importer.aide')}</small>
          <small>{t('importer.aideXmind')}</small>
        </div>
      )}
      <input
        ref={choix}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          regler(false)
          if (f) void importer(f)
        }}
      />
      {(etat.type === 'fini' || etat.type === 'echec') && (
        <div className="partage-panneau importer-etat" role="status">
          <p className="partage-note">{etat.texte}</p>
          <button type="button" className="bouton-lien" onClick={() => setEtat({ type: 'repos' })}>
            {t('commun.fermer')}
          </button>
        </div>
      )}
    </div>
  )
}

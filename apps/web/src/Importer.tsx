import { type Element, type EspaceNavigable, type Id, type Operation, nouvelId } from '@notak/tableau'
import { useEffect, useRef, useState } from 'react'
import { envoyerFichier } from './fichiers'
import { CIBLE_FICHIER, CIBLE_TABLEAU, ErreurImport, type PlanImport, lireExportMilanote } from './milanote'

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
 * à droite de ce qui s'y trouve), les autres des sous-tableaux. Les fichiers partent au serveur.
 * Rend l'id du tableau de tête et le nombre de fichiers qu'on n'a pas pu envoyer.
 */
export async function poserLePlan(plan: PlanImport, espace: EspaceNavigable, parent: Id): Promise<{ tete: Id; perdus: number }> {
  // Qui renvoie à qui : un sous-tableau naît sous le tableau qui le cite, sinon sous la tête.
  const citeur = new Map<string, string>()
  for (const t of plan.tableaux) {
    for (const e of t.elements) {
      if (e.contenu.type === 'tableau' && e.contenu.cible.startsWith(CIBLE_TABLEAU)) {
        const cle = e.contenu.cible.slice(CIBLE_TABLEAU.length)
        if (!citeur.has(cle) && cle !== t.cle) citeur.set(cle, t.cle)
      }
    }
  }
  const ids = new Map<string, Id>()
  const racine = plan.tableaux[0]!
  ids.set(racine.cle, espace.creerTableau(racine.titre || 'Import Milanote', parent))
  for (let restants = plan.tableaux.length - 1, passes = 0; restants > 0 && passes < plan.tableaux.length; passes++) {
    for (const t of plan.tableaux.slice(1)) {
      const pere = ids.get(citeur.get(t.cle) ?? racine.cle)
      if (ids.has(t.cle) || !pere) continue
      ids.set(t.cle, espace.creerTableau(t.titre || 'Sans titre', pere))
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
          await envoyerFichier(blob).then(
            async (id) => ({ id, ...(f.type.startsWith('image/') ? await dimensions(blob) : { largeur: 0, hauteur: 0 }) }),
            () => null,
          ),
        )
      }
    }
    return envoyes.get(chemin)!
  }

  let perdus = 0
  for (const t of plan.tableaux) {
    const ops: Operation[] = []
    for (const e of t.elements) {
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
    if (ops.length > 0) espace.magasin(ids.get(t.cle)!).faire(ops)
  }

  // Le renvoi dans le tableau d'où l'on importe : à droite de ce qui y est déjà.
  const m = espace.magasin(parent)
  const la = m.lire().elements.filter((e) => !e.parent && e.contenu.type !== 'ligne')
  const x = la.length ? Math.max(...la.map((e) => e.x + e.largeur)) + 4 : 5
  const y = la.length ? Math.min(...la.map((e) => e.y)) : 5
  m.faire([{ type: 'creer', element: { id: nouvelId(), x, y, largeur: 10, contenu: { type: 'tableau', cible: ids.get(racine.cle)! } } }])
  return { tete: ids.get(racine.cle)!, perdus }
}

/** Le bouton « Importer » : un export Markdown de Milanote (zip) devient un tableau, ses sous-tableaux et ses fichiers. */
export function Importer({ espace, tableau, ouvrir }: { espace: EspaceNavigable; tableau: Id; ouvrir(id: Id): void }) {
  const [ouvert, setOuvert] = useState(false)
  const [etat, setEtat] = useState<{ type: 'repos' } | { type: 'cours' } | { type: 'fini'; texte: string } | { type: 'echec'; texte: string }>({ type: 'repos' })
  const choix = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const hors = (e: PointerEvent) => !(e.target as HTMLElement).closest('.importer') && setOuvert(false)
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && setOuvert(false)
    document.addEventListener('pointerdown', hors)
    document.addEventListener('keydown', touche)
    return () => {
      document.removeEventListener('pointerdown', hors)
      document.removeEventListener('keydown', touche)
    }
  }, [ouvert])

  if (espace.lectureSeule?.(tableau)) return null

  const importer = async (fichier: File) => {
    setEtat({ type: 'cours' })
    try {
      const plan = lireExportMilanote(new Uint8Array(await fichier.arrayBuffer()), nouvelId)
      const { tete, perdus } = await poserLePlan(plan, espace, tableau)
      const nombre = plan.tableaux.length
      const avertis = plan.avertissements.length + perdus
      setEtat({
        type: 'fini',
        texte: `${nombre} tableau${nombre > 1 ? 'x' : ''} importé${nombre > 1 ? 's' : ''}${avertis ? `, ${avertis} élément${avertis > 1 ? 's' : ''} à revoir` : ''}.`,
      })
      ouvrir(tete)
    } catch (x) {
      setEtat({ type: 'echec', texte: x instanceof ErreurImport ? x.message : 'Import impossible' })
    }
  }

  return (
    <div className="importer">
      <button type="button" className="bouton" aria-expanded={ouvert} disabled={etat.type === 'cours'} onClick={() => setOuvert((o) => !o)}>
        {etat.type === 'cours' ? 'Import…' : 'Importer'}
      </button>
      {ouvert && (
        <div className="compte-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => choix.current?.click()}>
            Depuis Milanote (zip Markdown)
          </button>
          <small>Milanote : menu du tableau, Exporter, Markdown.</small>
        </div>
      )}
      <input
        ref={choix}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          setOuvert(false)
          if (f) void importer(f)
        }}
      />
      {(etat.type === 'fini' || etat.type === 'echec') && (
        <div className="partage-panneau importer-etat" role="status">
          <p className="partage-note">{etat.texte}</p>
          <button type="button" className="bouton-lien" onClick={() => setEtat({ type: 'repos' })}>
            Fermer
          </button>
        </div>
      )}
    </div>
  )
}

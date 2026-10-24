import { type Arbre, type Element, type Operation, nouvelId } from '../../coeur/tableau'
import { annoncer } from '../../avis'
import { porter } from './modele/elements'
import { MIME_IMAGE, exporterCartes } from './exporter'
import { lireXmind } from './xmind'
import { ico } from '../../icones'
import { t } from '../../langue'
import { registre } from '../registre'
import { RenduArbre } from './Arbre'
import { lire, nouvelArbre } from './modele/sujets'
import './arbre.css'
import './fenetre.css'
import './menus.css'
import './onglet-icones.css'

/** Largeur d'une carte mentale posée sur la toile, en UG. */
export const LARGEUR_ARBRE = 40

export function nouvelleCarteMentale(x: number, y: number): Element<Arbre> {
  return { id: nouvelId(), x, y, largeur: LARGEUR_ARBRE, contenu: nouvelArbre(t('arbre.central')) }
}

registre.type<Arbre>({
  type: 'arbre',
  get nom() {
    return t('type.arbre')
  },
  resume: (c) => {
    const l = lire(c)
    return l.sujets.get(l.central)?.titre ?? ''
  },
  Rendu: RenduArbre,
  editable: true,
  // Comme un document : un clic choisit la carte, le double-clic (ou Entrée) l'ouvre en grand.
  ouvreAuDoubleClic: true,
  ouvrir: (element, contexte) => contexte.commencerEdition(element.id),
  aLaCreation: 'choisir',
  hauteurParDefaut: 20,
  largeurMin: 17,
  largeurNaturelle: () => LARGEUR_ARBRE,
  suivant: () => null,
  outils: [
    {
      get libelle() {
        return t('type.arbre')
      },
      icone: ico('carteMentale'),
      rang: 290,
      vignette: 'arbre',
      tiroir: true,
      fantome: () => nouvelleCarteMentale(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouvelleCarteMentale(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})


/** Un `.xmind` déposé ou collé : chaque feuille devient une carte mentale, posées de gauche à droite. */
registre.recepteur({
  priorite: 40,
  recevoir(donnees, ou, contexte) {
    const fichiers = [...donnees.files].filter((f) => /\.xmind$/i.test(f.name))
    if (fichiers.length === 0) return null
    return (async () => {
      const ops: Operation[] = []
      let x = Math.round(ou.x)
      for (const f of fichiers) {
        let feuilles
        try {
          feuilles = lireXmind(new Uint8Array(await f.arrayBuffer()))
        } catch (e) {
          annoncer({ texte: t((e as Error).message === 'xmind-ancien' ? 'arbre.xmindAncien' : 'arbre.xmindIllisible', { nom: f.name }) })
          continue
        }
        for (const feuille of feuilles) {
          let arbre = feuille.arbre
          // Les images du fichier rejoignent les fichiers du tableau.
          for (const img of contexte.services.fichiers ? feuille.images : []) {
            const ext = img.nom.split('.').pop()?.toLowerCase() ?? ''
            const fichier = await contexte.services.fichiers!.enregistrer(new Blob([img.octets as BlobPart], { type: MIME_IMAGE[ext] ?? 'application/octet-stream' }))
            const k = Math.min(1, 200 / img.l)
            arbre = porter(arbre, [img.sujet], 'image', { fichier, l: Math.round(img.l * k), h: Math.round(img.h * k) })
          }
          // Ses pièces jointes, et les images de ses marqueurs à soi.
          for (const p of contexte.services.fichiers ? feuille.pieces : []) {
            const fichier = await contexte.services.fichiers!.enregistrer(new Blob([p.octets as BlobPart], { type: p.type }))
            arbre = porter(arbre, [p.sujet], 'piece', { fichier, nom: p.nom, type: p.type, taille: p.octets.length, ...(p.audio ? { audio: true } : {}) })
          }
          for (const m of contexte.services.fichiers ? feuille.marqueurs : []) {
            const g = arbre.groupes?.[m.groupe]
            if (!g) continue
            const ext = m.nom.split('.').pop()?.toLowerCase() ?? ''
            const fichier = await contexte.services.fichiers!.enregistrer(new Blob([m.octets as BlobPart], { type: MIME_IMAGE[ext] ?? 'application/octet-stream' }))
            arbre = { ...arbre, groupes: { ...arbre.groupes, [m.groupe]: { ...g, marqueurs: g.marqueurs.map((x) => (x.id === m.marqueur ? { ...x, fichier } : x)) } } }
          }
          ops.push({ type: 'creer', element: { id: nouvelId(), x, y: Math.round(ou.y), largeur: LARGEUR_ARBRE, contenu: arbre } })
          x += LARGEUR_ARBRE + 4
        }
      }
      return ops
    })()
  },
})

/** « Exporter en .xmind » : les cartes choisies, une feuille chacune, avec leurs images. */
registre.entreeMenu({
  get libelle() {
    return t('arbre.exporterXmind')
  },
  visible: (els) => els.length > 0 && els.every((e) => e.contenu.type === 'arbre'),
  faire: (els, contexte) => void exporterCartes(els, contexte),
})


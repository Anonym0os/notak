import { couleurDuContenu } from '../couleur'
import { registre } from '../registre'
import { RenduTaches, OutilsTaches, afficherTitre } from './Taches'
import { HAUTEUR_TACHES_MIN, ajouterALaFin, docTaches, nouvelleListeTaches } from './liste'
import { htmlEnTaches } from './html'
import { type Operation, type Taches, texteBrut } from '../../coeur/tableau'
import { t } from '../../langue'
import './taches.css'
import { ico } from '../../icones'

registre.type<Taches>({
  type: 'taches',
  get nom() {
    return t('type.taches')
  },
  resume: (c) => c.titre || texteBrut(c.texte),
  Rendu: RenduTaches,
  Outils: OutilsTaches,
  couleur: couleurDuContenu<Taches>(),
  editable: true,
  // En édition, les outils de la liste prennent la barre de gauche (Couleur, Titre, Échéance, Assigner, Retrait…).
  outilsEdition: true,
  hauteurParDefaut: HAUTEUR_TACHES_MIN,
  // La liste suivante garde la largeur ; avec la mise en forme, elle garde aussi la couleur.
  suivant: (e, places, format) => {
    const neuve = nouvelleListeTaches(places.dessous.x, places.dessous.y)
    const couleur = format && e.contenu.couleur ? { couleur: e.contenu.couleur } : {}
    return { ...neuve, largeur: e.largeur, contenu: { ...neuve.contenu, ...couleur } }
  },
  outils: [
    {
      get libelle() {
        return t('outil.taches')
      },
      icone: ico('tache'),
      rang: 30,
      vignette: 'taches',
      fantome: () => nouvelleListeTaches(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouvelleListeTaches(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})

// Des tâches copiées, collées sur une liste choisie, s'y ajoutent (à la fin, sans le titre de la liste copiée).
registre.collage((paquet, selection) => {
  const cible = selection.length === 1 ? selection[0]! : null
  if (cible?.contenu.type !== 'taches') return null
  const listes = paquet.elements.filter((e) => !e.parent).flatMap((e) => (e.contenu.type === 'taches' ? [e.contenu] : []))
  if (listes.length === 0 || paquet.elements.some((e) => !e.parent && e.contenu.type !== 'taches')) return null
  const avant = cible.contenu
  const apres = listes.reduce((texte, source) => ajouterALaFin(texte, docTaches(source.texte)), docTaches(avant.texte))
  const operations: Operation[] = [{ type: 'contenu', id: cible.id, avant, apres: { ...avant, texte: apres } }]
  return operations
})

// Le HTML d'une liste de tâches (copiée dans Notak ou ailleurs) devient une liste, puces comprises.
registre.recepteur({
  priorite: 20,
  recevoir(donnees, ou) {
    const html = donnees.getData('text/html')
    if (!html.includes('data-type="taskList"')) return null
    const taches = htmlEnTaches(html)
    if (!taches) return null
    const liste = nouvelleListeTaches(Math.round(ou.x), Math.round(ou.y))
    return [{ type: 'creer', element: { ...liste, contenu: { type: 'taches', texte: { type: 'doc', content: [{ type: 'taskList', content: taches }] } } } }]
  },
})

// Alt+Retour sur une liste choisie : son titre, curseur dedans (comme l'outil Titre).
registre.raccourci((e, contexte) => {
  if (e.key !== 'Enter' || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || contexte.services.lectureSeule) return false
  const choisis = contexte.magasin.lire().elements.filter((x) => contexte.selection.has(x.id))
  const liste = choisis.length === 1 ? choisis[0]! : null
  if (liste?.contenu.type !== 'taches' || liste.verrou) return false
  afficherTitre(liste as never, contexte)
  return true
})

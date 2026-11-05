import '@fontsource-variable/inter'
import '@fontsource-variable/source-serif-4'
import '@notak/tableau/toile.css'
import '../app.css'
import '../styles/ios.css'
import { type BoitePlan, BoutonIlot, type Element as ElementToile, type Espace, HoteNotak, creerDans, creerEspace, definirLangue, quandPretes, renommerChose } from '@notak/tableau'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { EntreeBibliotheque } from '../api'
import { PageBibliotheque } from '../Bibliotheque'
import { simulerCoqueSiDemandee } from '../ios/coqueSimulee'
import { BibliothequeLocale, noterVu } from '../local/BibliothequeLocale'
import { BibliothequeApp } from '../local/BibliothequeApp'
import { Rangement } from '../local/Rangement'
import { type EspaceLocal, espaceLocal } from '../local/espace'

/**
 * Le banc de la bibliothèque, pour le développement seulement : la page d'un serveur sans serveur
 * (`/banc-bibliotheque.html`), celle de l'app au téléphone avec des toiles d'essai (`?edition=locale`), ou celle de
 * l'app sur un iPad ou un ordinateur (`?edition=calque`). Il sert à voir chaque
 * largeur d'écran (un iPad en portrait, une fenêtre partagée) et à en faire des captures. `?langue=en` passe à
 * l'anglais, `?coque=ios` fait croire à l'app d'un iPhone ou d'un iPad.
 */

const parametres = new URLSearchParams(location.search)
if (parametres.get('coque')) simulerCoqueSiDemandee()
definirLangue(parametres.get('langue') === 'en' ? 'en' : 'fr')

const MAINTENANT = Date.now()
const HEURE = 3_600_000
const JOUR = 24 * HEURE

const TOILES = ['Voyage au Japon', 'Atelier céramique', 'Budget 2027', 'Lectures', 'Recettes de saison', 'Projet maison', 'Idées cadeaux', 'Jardin', 'Clients', 'Réunions hebdo']
const CARTES = ['Plan du lancement', 'Objectifs du trimestre', 'Livre à écrire', 'Organisation de l’équipe']
const DOCUMENTS = ['Compte rendu du 3 novembre', 'Charte graphique', 'Notes de lecture', 'Cahier des charges du site']

const renvoi = (id: string, cible: string, x: number): ElementToile => ({ id, x, y: 0, largeur: 10, contenu: { type: 'tableau', cible } })

/** Le monde du serveur : l'accueil porte les toiles, « Voyage au Japon » porte une carte et un document. */
function monde(): Espace {
  const tableaux: Espace['tableaux'] = { racine: { titre: 'Silak', elements: TOILES.map((_, i) => renvoi(`c${i}`, `t${i}`, i * 12)) } }
  TOILES.forEach((titre, i) => (tableaux[`t${i}`] = { titre, elements: [] }))
  return { racine: 'racine', tableaux }
}

function entreesServeur(): EntreeBibliotheque[] {
  const commun = { favori: false, partage: false, ou: 'Silak', dans: 'racine' }
  const boites = (n: number): BoitePlan[] =>
    Array.from({ length: 3 + (n % 5) }, (_, i): BoitePlan => [i * 24, (i % 2) * 12, 20, 8 + (i % 3) * 4, ['jaune', 'bleu', 'vert', 'rose'][i % 4]!, i % 4 === 3 ? 'colonne' : 'note', 2])
  return [
    ...TOILES.map((titre, i) => ({
      ...commun,
      // « Projet maison » et « Clients » se montrent en dossiers ; « Jardin » est rangé dans « Projet maison ».
      ...(i === 7 ? { ou: 'Projet maison', dans: 't5' } : {}),
      tableau: `t${i}`,
      element: null,
      genre: 'toile' as const,
      titre,
      resume: { genre: 'toile' as const, element: '' as const, titre, boites: boites(i), ...(i === 5 || i === 8 ? { dossier: true as const } : {}) },
      vu: i < 6 ? MAINTENANT - i * 5 * HEURE : null,
      favori: i % 4 === 0,
      partage: i === 8,
    })),
    ...CARTES.map((titre, i) => ({
      ...commun,
      tableau: 't0',
      element: `a${i}`,
      genre: 'arbre' as const,
      titre,
      ou: 'Voyage au Japon',
      dans: 't0',
      resume: { genre: 'arbre' as const, element: `a${i}`, titre, branches: ['Pourquoi', 'Comment', 'Quand', 'Avec qui'] },
      vu: MAINTENANT - (i + 1) * JOUR,
    })),
    ...DOCUMENTS.map((titre, i) => ({
      ...commun,
      tableau: 't1',
      element: `d${i}`,
      genre: 'document' as const,
      titre,
      ou: 'Atelier céramique',
      dans: 't1',
      resume: { genre: 'document' as const, element: `d${i}`, titre, lignes: ['Une première ligne assez longue', 'Puis une autre', 'Et la suite du texte'] },
      vu: i < 2 ? MAINTENANT - (i + 2) * HEURE : null,
    })),
    ...PHOTOS.map(([titre], i) => ({
      ...commun,
      tableau: 't0',
      element: `p${i}`,
      genre: 'image' as const,
      titre,
      ou: 'Voyage au Japon',
      dans: 't0',
      resume: { genre: 'image' as const, element: `p${i}`, titre, fichier: `photo-${i}`, largeur: 4, hauteur: 3 },
      vu: i === 0 ? MAINTENANT - HEURE / 2 : null,
    })),
    ...LIENS.map(([titre, url, site], i) => ({
      ...commun,
      tableau: 't3',
      element: `l${i}`,
      genre: 'lien' as const,
      titre,
      ou: 'Lectures',
      dans: 't3',
      resume: { genre: 'lien' as const, element: `l${i}`, titre, url, site },
      vu: null,
    })),
    ...FICHIERS.map(([nom, typeMime], i) => ({
      ...commun,
      tableau: 't2',
      element: `f${i}`,
      genre: 'fichier' as const,
      titre: nom,
      ou: 'Budget 2027',
      dans: 't2',
      resume: { genre: 'fichier' as const, element: `f${i}`, titre: nom, fichier: `fichier-${i}`, nom, typeMime, taille: 1000 },
      vu: null,
    })),
  ]
}

/** Des photos sans réseau : des dégradés, à la place d'images. */
const PHOTOS: [string, string, string][] = [
  ['Le temple de Kyoto', '#e9a46b', '#8c3b2f'],
  ['', '#7fb3d5', '#1b4f72'],
  ['Marché de Nishiki', '#a9cf8f', '#3b6e2c'],
  ['Le mont Fuji au matin', '#f5d0e0', '#6c3483'],
]
const LIENS: [string, string, string][] = [
  ['Guide des ryokans', 'https://www.japan-guide.com/e/e2029.html', 'japan-guide.com'],
  ['', 'https://fr.wikipedia.org/wiki/C%C3%A9ramique', ''],
  ['Recette du dashi', 'https://www.justonecookbook.com/dashi/', 'Just One Cookbook'],
]
const FICHIERS: [string, string][] = [
  ['Billets d’avion.pdf', 'application/pdf'],
  ['Budget prévisionnel.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['Plan de la maison.dwg', 'application/octet-stream'],
]
const VIGNETTES_BANC = {
  async adresse(fichier: string) {
    const [, a, b] = PHOTOS[Number(fichier.replace('photo-', ''))] ?? []
    if (!a) return null
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><circle cx="300" cy="80" r="38" fill="#fff" opacity=".55"/></svg>`
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
  },
  distant: () => false,
}

/** Le bouton de signalement, la cloche, le compte et la roue : la même largeur que les vrais. */
const Compte = () => (
  <>
    <BoutonIlot icone="bug" libelle="Signaler" onClick={() => {}} />
    <BoutonIlot icone="cloche" libelle="Notifications" onClick={() => {}} />
    <BoutonIlot icone="compte" libelle="Compte" onClick={() => {}} />
  </>
)

function BancServeur() {
  const [espace] = useState(() => creerEspace(monde()))
  return (
    <HoteNotak className="biblio-hote">
      {(fenetres) => <PageBibliotheque charger={async () => entreesServeur()} vignettes={VIGNETTES_BANC} espace={espace} fenetres={fenetres} compte={<Compte />} avatar={<BoutonIlot icone="compte" libelle="Compte" onClick={() => {}} />} />}
    </HoteNotak>
  )
}

/** L'app : de vraies toiles dans ce navigateur (IndexedDB), créées une fois, dont certaines déjà ouvertes. */
let prepare: Promise<EspaceLocal> | null = null
const preparerLocal = () => (prepare ??= remplirLocal())
async function remplirLocal(): Promise<EspaceLocal> {
  const el = await espaceLocal()
  if (el.index.lister().length > 1) return el
  const { espace } = el
  await quandPretes(espace, [espace.racine])
  TOILES.forEach((titre, i) => {
    const { tableau } = creerDans(espace, espace.racine, 'toile', titre)
    if (i < 6) noterVu(tableau, MAINTENANT - i * 5 * HEURE)
  })
  for (const titre of CARTES) {
    const c = creerDans(espace, espace.racine, 'arbre')
    renommerChose(espace, { toile: c.tableau, element: c.element }, titre)
  }
  for (const titre of DOCUMENTS) {
    const d = creerDans(espace, espace.racine, 'document')
    renommerChose(espace, { toile: d.tableau, element: d.element }, titre)
  }
  return el
}

function BancLocal({ calque }: { calque: boolean }) {
  const [el, setEl] = useState<EspaceLocal | null>(null)
  useEffect(() => void preparerLocal().then(setEl), [])
  if (!el) return null
  // L'app sur un iPad ou un ordinateur : la bibliothèque qui range, sur les toiles de l'appareil.
  if (calque)
    return <BibliothequeApp el={el} importer={async () => ({ elements: [], toiles: [], refuses: [] })} rangement={<Rangement el={el} enregistrer={() => {}} rouvrir={() => {}} message={null} />} />
  return <BibliothequeLocale el={el} ouvrir={() => {}} reglages={() => {}} />
}

const edition = parametres.get('edition')
createRoot(document.getElementById('racine')!).render(<StrictMode>{edition === 'locale' || edition === 'calque' ? <BancLocal calque={edition === 'calque'} /> : <BancServeur />}</StrictMode>)

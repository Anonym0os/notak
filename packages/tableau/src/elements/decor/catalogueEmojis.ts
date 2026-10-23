import { EMOJIS as FREQUENTS } from './annotations'

/** Un émoji et les mots avec lesquels on le cherche (en français, sans accents ni casse). */
export interface Emoji {
  e: string
  mots: string
}

export interface CategorieEmojis {
  cle: string
  /** L'émoji qui sert d'onglet. */
  icone: string
  emojis: Emoji[]
}

/** « 😀 sourire content » → un émoji et ses mots. */
const lire = (lignes: string): Emoji[] =>
  lignes
    .trim()
    .split('\n')
    .map((l) => {
      const [e, ...mots] = l.trim().split(' ')
      return { e: e!, mots: mots.join(' ') }
    })

export const CATEGORIES_EMOJIS: CategorieEmojis[] = [
  {
    cle: 'visages',
    icone: '😀',
    emojis: lire(`
😀 sourire content joie
😃 sourire heureux
😄 rire sourire
😁 grand sourire
😆 rire
😅 soulagement rire gene
😂 rire larmes mort de rire
🤣 rire par terre
🙂 sourire
😉 clin oeil
😊 sourire joue timide
😇 ange sage
🥰 amour adorable
😍 yeux coeurs amour
😘 bisou
😋 delicieux miam
😛 langue
😜 clin oeil langue
🤪 fou
🤗 calin
🤔 reflechir doute question
🤨 sceptique
😐 neutre
😶 muet
🙄 yeux au ciel
😏 narquois
😌 soulage calme
😴 dormir sommeil
😎 lunettes cool
🤓 intello
😕 perplexe
😟 inquiet
😮 surpris bouche ouverte
😲 choc
😳 gene rouge
🥺 supplier
😢 pleurer triste
😭 sanglots pleurer
😱 peur cri
😖 contrarie
😞 decu
😤 agace
😡 colere
🤯 explose tete
🥳 fete anniversaire
🤩 etoiles yeux
🥵 chaud
🥶 froid
🤒 malade
🤕 blesse
🤮 degout
🙃 envers ironie
`),
  },
  {
    cle: 'gestes',
    icone: '👍',
    emojis: lire(`
👍 pouce oui bien approuver
👎 pouce non mal
👏 applaudir bravo
🙌 bravo mains levees
🙏 merci priere svp
🤝 accord poignee de main
💪 muscle force
👀 yeux regarder
👋 salut main
✋ stop main
🤚 main
👌 ok parfait
✌️ victoire paix
🤞 doigts croises chance
🤟 rock
👉 droite pointer
👈 gauche pointer
👆 haut pointer
👇 bas pointer
☝️ doigt haut
✍️ ecrire
🤷 haussement epaules
🤦 facepalm
🙋 lever la main
🙇 salut reverence
🫡 salut militaire
🫶 coeur mains
🧠 cerveau idee
`),
  },
  {
    cle: 'symboles',
    icone: '❤️',
    emojis: lire(`
❤️ coeur amour
🧡 coeur orange
💛 coeur jaune
💚 coeur vert
💙 coeur bleu
💜 coeur violet
🖤 coeur noir
💔 coeur brise
💯 cent parfait
✅ valide fait coche
❌ non croix erreur
⚠️ attention
❓ question
❗ important exclamation
⭐ etoile favori
✨ etincelles nouveau
🔥 feu top
💥 explosion
💡 idee ampoule
💬 message bulle
💭 pensee
🔔 cloche notification
🔒 verrou cadenas
🔓 deverrouille
🔗 lien
📌 epingle
📎 trombone
🚩 drapeau
🏁 arrivee
➕ plus ajouter
➖ moins
➡️ fleche droite
⬆️ fleche haut
🔄 actualiser
⏳ sablier attente
`),
  },
  {
    cle: 'nature',
    icone: '🌿',
    emojis: lire(`
🐶 chien
🐱 chat
🐭 souris
🐰 lapin
🦊 renard
🐻 ours
🐼 panda
🦁 lion
🐸 grenouille
🐵 singe
🐔 poule
🐧 pingouin
🦉 hibou
🦋 papillon
🐝 abeille
🐢 tortue
🐙 pieuvre
🐬 dauphin
🐳 baleine
🌳 arbre
🌲 sapin
🌴 palmier
🌱 pousse
🌿 plante feuille
🍀 trefle chance
🌸 fleur cerisier
🌹 rose
🌻 tournesol
🌞 soleil
🌙 lune
⭐ etoile
🌈 arc en ciel
☁️ nuage
🌧️ pluie
⛄ neige bonhomme
🌊 vague mer
`),
  },
  {
    cle: 'nourriture',
    icone: '🍎',
    emojis: lire(`
🍎 pomme
🍐 poire
🍊 orange
🍋 citron
🍌 banane
🍉 pasteque
🍇 raisin
🍓 fraise
🍒 cerise
🍑 peche
🥑 avocat
🍅 tomate
🥕 carotte
🌽 mais
🍞 pain
🥐 croissant
🧀 fromage
🍳 oeuf poele
🥓 bacon
🍔 burger
🍟 frites
🍕 pizza
🌮 taco
🍝 pates
🍣 sushi
🍰 gateau
🍫 chocolat
🍪 biscuit
🍩 donut
🍦 glace
☕ cafe
🍵 the
🍺 biere
🍷 vin
🥂 champagne trinquer
🥤 boisson
`),
  },
  {
    cle: 'activites',
    icone: '⚽',
    emojis: lire(`
⚽ football
🏀 basket
🎾 tennis
🏈 rugby
🎱 billard
🏆 trophee victoire
🥇 medaille or
🎯 cible objectif
🎮 jeu video
🎲 de jeu
🎨 peinture art
🎬 cinema film
🎤 micro chanter
🎧 casque musique
🎸 guitare
🎹 piano
🎉 fete celebration
🎊 confettis
🎂 anniversaire gateau
🎁 cadeau
🚀 fusee lancement
✈️ avion voyage
🚗 voiture
🚲 velo
🚆 train
⛵ voilier
🏠 maison
🏢 immeuble bureau
🏖️ plage vacances
⛰️ montagne
🗺️ carte
🧭 boussole
`),
  },
  {
    cle: 'objets',
    icone: '💡',
    emojis: lire(`
💻 ordinateur
🖥️ ecran
📱 telephone
⌨️ clavier
🖱️ souris
📷 photo appareil
📹 camera video
📞 telephone appel
📧 courriel email
📨 envoye
📅 calendrier date
🗓️ agenda
📆 calendrier
⏰ reveil heure
⌛ sablier
📝 note memo
📄 document page
📚 livres
📖 livre ouvert
🔍 loupe recherche
🔧 cle outil
🔨 marteau
⚙️ reglages engrenage
🔑 cle
💰 argent
💳 carte bancaire
📈 hausse graphique
📉 baisse graphique
📊 statistiques
📦 colis
🗑️ corbeille
🧪 test experience
`),
  },
]

/** Les mots d'une recherche, sans accents ni casse. */
export const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Tous les émojis dont un mot commence comme la recherche, sans doublon. */
export function chercherEmojis(requete: string): Emoji[] {
  const q = normaliser(requete)
  if (!q) return []
  const vus = new Set<string>()
  return CATEGORIES_EMOJIS.flatMap((c) => c.emojis).filter((m) => {
    if (vus.has(m.e) || !normaliser(m.mots).split(' ').some((mot) => mot.startsWith(q))) return false
    vus.add(m.e)
    return true
  })
}

export { FREQUENTS }

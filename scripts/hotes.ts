/**
 * Les hôtes que nomme l'application construite, comparés à ceux qu'on connaît :
 *
 *   node scripts/hotes.ts apps/web/dist [autres dossiers…]
 *
 * La CSP (`packages/tableau/src/securite.ts`) empêche déjà le navigateur de joindre un autre hôte ; ceci prévient plus
 * tôt, à la construction : une dépendance mise à jour qui se mettrait à appeler un service (une mesure d'audience, un
 * rapport d'erreur, une police chargée ailleurs) fait échouer la CI, et quelqu'un regarde avant que ça parte.
 * Un hôte nouveau et légitime s'ajoute ci-dessous, avec la raison de sa présence.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ORIGINES_LECTEURS, ORIGINES_REQUETES } from '../packages/tableau/src/securite.ts'

/** Ceux qu'on ne joint jamais de soi-même : des liens qu'on clique, des noms d'espaces XML, des adresses d'aide. */
export const HOTES_NOMMES: Record<string, string> = {
  'github.com': 'le lien vers le code, et la page des versions',
  'notak.app': 'le lien « À propos » de l’app de bureau',
  'soundcloud.com': 'l’adresse du morceau, passée au lecteur w.soundcloud.com',
  'www.pexels.com': 'le lien vers la banque d’images (édition serveur)',
  'www.w3.org': 'les espaces de noms XML (SVG, XHTML, MathML)',
  'schemas.openxmlformats.org': 'les espaces de noms de l’export Word',
  'react.dev': 'les messages d’erreur de React',
  'tiptap.dev': 'les messages d’erreur de l’éditeur',
  'prosemirror.net': 'les messages d’erreur de l’éditeur',
  'www.apache.org': 'la licence du lecteur PDF (pdf.js)',
  'www.xfa.org': 'les espaces de noms des formulaires PDF',
  'ns.adobe.com': 'les espaces de noms des métadonnées PDF',
  'notak.exemple.fr': 'l’adresse d’exemple de l’écran « Se connecter à un serveur Notak »',
  'notak.example.com': 'la même, en anglais',
  'example.com': 'un exemple dans une bibliothèque',
  'foo.bar': 'un exemple dans une bibliothèque',
}

/** Tous les hôtes connus : ceux que la CSP laisse joindre, et ceux qui ne sont que nommés. */
export const HOTES_CONNUS: ReadonlySet<string> = new Set([...[...ORIGINES_LECTEURS, ...ORIGINES_REQUETES].map((o) => new URL(o).hostname), ...Object.keys(HOTES_NOMMES)])

/** Les hôtes d'un texte (`https://hote/…`), sans doublon. */
export function hotesDe(texte: string): Set<string> {
  return new Set([...texte.matchAll(/https?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})/gi)].map((m) => m[1]!.toLowerCase()))
}

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom)
    if (statSync(chemin).isDirectory()) return fichiers(chemin)
    return /\.(m?js|html|css|webmanifest|json)$/.test(nom) ? [chemin] : []
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dossiers = process.argv.slice(2)
  if (!dossiers.length) {
    console.error('node scripts/hotes.ts <dossier construit>…')
    process.exit(1)
  }
  const inconnus = new Map<string, Set<string>>()
  for (const d of dossiers) {
    for (const f of fichiers(d)) {
      for (const h of hotesDe(readFileSync(f, 'utf8'))) if (!HOTES_CONNUS.has(h)) inconnus.set(h, (inconnus.get(h) ?? new Set()).add(f))
    }
  }
  if (inconnus.size) {
    console.error("Des hôtes que l'application ne nommait pas :")
    for (const [h, ou] of inconnus) console.error(`  ${h}  (${[...ou].join(', ')})`)
    console.error("Si l'un d'eux est joint de lui-même, il n'a rien à faire là. Sinon, ajoutez-le à scripts/hotes.ts avec sa raison.")
    process.exit(1)
  }
  console.log(`Aucun hôte inconnu dans ${dossiers.join(', ')}.`)
}

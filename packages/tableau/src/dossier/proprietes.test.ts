import { describe, expect, it } from 'vitest'
import { TABLEAUX, scenario } from './essais/scenario'
import { AppareilSimule } from './essais/simulation'

/**
 * Les propriétés du dossier Notak, éprouvées sur des scénarios tirés au hasard (graine fixée, donc rejouables) :
 * plusieurs appareils et personnes modifient des tableaux, écrivent, relisent, compactent, plantent, se clonent,
 * pendant que le faux nuage retarde, réordonne, tronque, crée des fantômes et des copies de conflit, et fait
 * réapparaître des fichiers effacés. À la fin, une fois tout livré :
 *
 * - E1 : aucune modification faite sur un appareil qui peut écrire n'est perdue, nulle part ;
 * - E2 : tous les appareils ont le même contenu ;
 * - E3 : aucun fichier de données n'a été écrit par deux appareils ;
 * - E6 : après compactage, le dossier de chaque appareil ne garde qu'une poignée de fichiers.
 *
 * Un scénario qui échoue se rejoue seul : NOTAK_GRAINE=<graine> bun run test proprietes
 */

const JOUR = 24 * 3600 * 1000
// Le paquet ne connaît pas Node : l'environnement se lit sans ses types.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
const GRAINES = env.NOTAK_GRAINE ? [Number(env.NOTAK_GRAINE)] : Array.from({ length: Number(env.NOTAK_SCENARIOS ?? 120) }, (_, i) => i + 1)

describe('propriétés du dossier Notak', () => {
  it.each(GRAINES)('scénario %i', async (graine) => {
    const { nuage, temps, appareils, lecteur, journal } = await scenario(graine)
    const contexte = `graine ${graine} : ${journal.slice(-12).join(', ')}`

    // E2 : tout le monde a la même chose (le lecteur aussi, hors de ce qu'il a fait sans pouvoir l'écrire).
    for (const t of TABLEAUX) {
      const ref = appareils[0]!.contenu(t)
      for (const a of appareils) expect(a.contenu(t), contexte).toEqual(ref)
    }
    // E1 : chaque modification faite sur un appareil qui écrit est partout, lecteur compris.
    for (const auteur of appareils)
      for (const [client, horloge] of auteur.faits)
        for (const a of lecteur ? [...appareils, lecteur] : appareils)
          expect(Math.max(...TABLEAUX.map((t) => a.horloge(t, client))), `${contexte} ; ${auteur.nom} → ${a.nom}`).toBeGreaterThanOrEqual(horloge)
    // Pas de fausse alerte : des copies qui ont convergé ne divergent pas.
    for (const a of appareils) await a.coffre.versionner()
    nuage.toutLivrer()
    for (const a of appareils) expect(await a.coffre.divergences(), `${contexte} ; ${a.nom}`).toEqual([])
    // E3 : écrivain unique.
    for (const [chemin, auteurs] of nuage.auteurs) expect(auteurs.size, `${contexte} ; ${chemin}`).toBe(1)

    // E6 : après compactage et un long délai, chaque appareil vivant ne garde que peu de fichiers.
    for (let i = 0; i < 5; i++) {
      temps.maintenant += 31 * JOUR
      for (const a of appareils) await a.coffre.compacter()
      nuage.toutLivrer()
      for (const a of appareils) await a.coffre.relire()
      nuage.toutLivrer()
    }
    for (const a of appareils) {
      const miens = [...nuage.verite.keys()].filter((c) => c.startsWith(`appareils/${a.coffre.id()}/`) && /\.nm[jb]/.test(c) && !c.endsWith('.tmp'))
      expect(miens.length, `${contexte} ; ${a.nom}`).toBeLessThanOrEqual(TABLEAUX.length + 1)
    }
    // Et rien n'a été perdu par le ménage : un appareil neuf retrouve tout.
    const neuf = await new AppareilSimule('neuf', nuage.vue('neuf'), temps).demarrer()
    for (let i = 0; i < 5; i++) {
      await neuf.coffre.relire()
      nuage.toutLivrer()
    }
    for (const t of TABLEAUX) expect(neuf.contenu(t), `${contexte} ; appareil neuf`).toEqual(appareils[0]!.contenu(t))
  })
})

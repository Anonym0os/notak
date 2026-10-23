import { FAUTES_ORDINAIRES, FauxNuage, generateur } from './fauxNuage'
import { AppareilSimule } from './simulation'

export const TABLEAUX = ['t1', 't2', 't3']

/** Un scénario tiré au hasard de la graine : appareils, gestes, fautes, puis le calme. */
export async function scenario(graine: number, noter: (ligne: string) => void = () => {}) {
  const h = generateur(graine * 7919)
  const nuage = new FauxNuage(graine, FAUTES_ORDINAIRES)
  const temps = { maintenant: 1_000_000 }
  const appareils: AppareilSimule[] = []
  const nb = 2 + h.entier(3)
  for (let i = 0; i < nb; i++) appareils.push(await new AppareilSimule(`app${i}`, nuage.vue(`app${i}`), temps).demarrer())
  // Parfois, une personne n'a que la lecture du dossier partagé.
  const lecteur = h.vrai(0.25) ? await new AppareilSimule('lecteur', nuage.vue('lecteur', { lectureSeule: true }), temps).demarrer() : null
  const tous = () => (lecteur ? [...appareils, lecteur] : appareils)
  const journal: string[] = []

  const pas = 60 + h.entier(80)
  for (let p = 0; p < pas; p++) {
    temps.maintenant += h.entier(6 * 3600 * 1000)
    const a = h.choisir(tous())
    const action = h.entier(100)
    try {
      if (action < 40) {
        const t = h.choisir(TABLEAUX)
        a.modifier(t, h)
        journal.push(`${a.nom} modifie ${t} (client ${a.doc(t).clientID})`)
      } else if (action < 55) {
        await a.coffre.enregistrer()
        journal.push(`${a.nom} enregistre`)
      } else if (action < 72) {
        await a.coffre.relire()
        journal.push(`${a.nom} relit`)
      } else if (action < 77) {
        await a.coffre.compacter()
        journal.push(`${a.nom} compacte`)
      } else if (action < 80) {
        await a.coffre.versionner()
        journal.push(`${a.nom} versionne`)
      } else if (action < 84) {
        if (h.vrai(0.5)) {
          a.vue.planterAuProchainEcrit = true
          journal.push(`${a.nom} plantera`)
        } else {
          await a.planter()
          journal.push(`${a.nom} plante`)
        }
      } else if (action < 86 && appareils.length < 6 && a !== lecteur) {
        const c = await a.cloner(`${a.nom}-clone${p}`, nuage).demarrer()
        appareils.push(c)
        journal.push(`${a.nom} cloné`)
      } else if (action < 90) {
        a.vue.connectee = !a.vue.connectee
        journal.push(`${a.nom} ${a.vue.connectee ? 'connecté' : 'déconnecté'}`)
      } else {
        nuage.pas()
        journal.push('le nuage avance')
      }
    } catch (e) {
      journal.push(`${a.nom} : ${(e as Error).message}`)
      // Un plantage provoqué, un dossier en lecture seule : l'appareil continue.
    }
    noter(`${p} ${journal.at(-1) ?? ''}`)
    nuage.pas()
  }

  // Tout le monde se reconnecte, et l'on laisse le monde se calmer.
  for (const a of tous()) {
    a.vue.connectee = true
    a.vue.planterAuProchainEcrit = false
  }
  for (let tour = 0; tour < 60; tour++) {
    for (const a of tous()) await a.coffre.enregistrer().catch(() => {})
    nuage.toutLivrer()
    let attente = false
    for (const a of tous()) attente = (await a.coffre.relire()).enAttente || attente
    nuage.toutLivrer()
    if (!attente && nuage.enRoute() === 0 && tour > 2) break
  }
  return { nuage, temps, appareils, lecteur, journal }
}


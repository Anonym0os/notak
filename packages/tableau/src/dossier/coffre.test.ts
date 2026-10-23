import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { FauxNuage, generateur } from './essais/fauxNuage'
import { AppareilSimule } from './essais/simulation'

const SANS_FAUTES = { tronque: 0, fantome: 0, resurrection: 0 }
const JOUR = 24 * 3600 * 1000

async function monde(noms: string[], fautes = SANS_FAUTES, graine = 1) {
  const nuage = new FauxNuage(graine, fautes)
  const temps = { maintenant: 1_000_000 }
  const appareils = []
  for (const n of noms) appareils.push(await new AppareilSimule(n, nuage.vue(n), temps).demarrer())
  return { nuage, temps, appareils }
}

/** Jusqu'à ce que plus rien ne bouge : tout est livré, chacun a écrit et relu. */
async function stabiliser(nuage: FauxNuage, appareils: AppareilSimule[]) {
  for (let tour = 0; tour < 40; tour++) {
    for (const a of appareils) await a.coffre.enregistrer().catch(() => {})
    nuage.toutLivrer()
    let attente = false
    for (const a of appareils) attente = (await a.coffre.relire()).enAttente || attente
    nuage.toutLivrer()
    if (!attente && nuage.enRoute() === 0 && tour > 1) return
  }
}

describe('le coffre', () => {
  it('deux appareils retrouvent les mêmes tableaux', async () => {
    const { nuage, appareils } = await monde(['mac', 'iphone'])
    const [mac, iphone] = appareils as [AppareilSimule, AppareilSimule]
    mac.doc('t1').getMap('elements').set('a', 'du mac')
    iphone.doc('t1').getMap('elements').set('b', 'de l’iphone')
    iphone.doc('t2').getText('texte').insert(0, 'bonjour')
    await stabiliser(nuage, appareils)
    for (const t of ['t1', 't2']) expect(mac.contenu(t)).toEqual(iphone.contenu(t))
    expect(mac.contenu('t1').elements).toEqual({ a: 'du mac', b: 'de l’iphone' })
  })

  it('chaque appareil n’écrit que chez lui, et se présente', async () => {
    const { nuage, appareils } = await monde(['mac', 'pc'])
    appareils[0]!.doc('t').getMap('elements').set('a', 1)
    await stabiliser(nuage, appareils)
    for (const [chemin, auteurs] of nuage.auteurs) {
      expect(auteurs.size).toBe(1)
      const appareil = chemin.split('/')[1]
      const auteur = appareils.find((a) => a.nom === [...auteurs][0])!
      expect(appareil).toBe(auteur.coffre.id())
    }
    const vus = await appareils[1]!.coffre.appareils()
    expect(vus.map((v) => v.nom).sort()).toEqual(['mac', 'pc'])
    expect(vus.find((v) => v.moi)!.nom).toBe('pc')
  })

  it('une suppression passe aussi (elle ne change pas le vecteur d’état)', async () => {
    const { nuage, appareils } = await monde(['a', 'b'])
    const [a, b] = appareils as [AppareilSimule, AppareilSimule]
    a.doc('t').getMap('elements').set('x', 1)
    await stabiliser(nuage, appareils)
    a.doc('t').getMap('elements').delete('x')
    await stabiliser(nuage, appareils)
    expect(b.contenu('t').elements).toEqual({})
  })

  it('un fichier lu avant celui dont il dépend n’est pas perdu au redémarrage (C6)', async () => {
    const { nuage, appareils } = await monde(['a', 'b'])
    const [a, b] = appareils as [AppareilSimule, AppareilSimule]
    const texte = a.doc('t').getText('texte')
    texte.insert(0, 'un')
    await a.coffre.enregistrer()
    texte.insert(2, ' deux')
    await a.coffre.enregistrer()
    nuage.toutLivrer()
    // B ne voit d'abord que le second fichier : Yjs le garde en attente, en mémoire seulement.
    const [premier] = [...b.vue.local.keys()].filter((c) => c.endsWith('.nmj')).sort()
    const gardePremier = b.vue.local.get(premier!)!
    b.vue.local.delete(premier!)
    await b.coffre.relire()
    expect(b.contenu('t').texte).toBe('')
    // B redémarre : ce que Yjs tenait en attente est perdu, mais le fichier n'a pas été marqué comme lu.
    await b.planter()
    b.vue.local.set(premier!, gardePremier)
    await b.coffre.relire()
    expect(b.contenu('t').texte).toBe('un deux')
  })

  it('un appareil n’efface son journal qu’une fois sa base vue ailleurs (C5)', async () => {
    const { nuage, temps, appareils } = await monde(['a', 'b'])
    const [a, b] = appareils as [AppareilSimule, AppareilSimule]
    for (let i = 0; i < 5; i++) {
      a.doc('t').getMap('elements').set(`k${i}`, i)
      await a.coffre.enregistrer()
    }
    nuage.toutLivrer()
    await a.coffre.compacter()
    const journal = () => [...a.vue.local.keys()].filter((c) => c.includes(`/${a.coffre.id()}/maj-`))
    // La base n'est pas encore descendue chez B : rien n'est effacé.
    expect(journal().length).toBe(5)
    temps.maintenant += JOUR
    await a.coffre.compacter()
    expect(journal().length).toBe(5)
    // B lit la base et le dit ; A peut alors effacer.
    nuage.toutLivrer()
    await b.coffre.relire()
    nuage.toutLivrer()
    await a.coffre.compacter()
    expect(journal().length).toBe(0)
    // Et si A disparaît maintenant, rien n'est perdu : un appareil neuf retrouve tout.
    nuage.toutLivrer()
    const neuf = await new AppareilSimule('neuf', nuage.vue('neuf'), temps).demarrer()
    await neuf.coffre.relire()
    expect(Object.keys(neuf.contenu('t').elements).length).toBe(5)
  })

  it('seul dans le dossier, un appareil efface son journal après un délai', async () => {
    const { temps, appareils } = await monde(['seul'])
    const [a] = appareils as [AppareilSimule]
    for (let i = 0; i < 3; i++) {
      a.doc('t').getMap('elements').set(`k${i}`, i)
      await a.coffre.enregistrer()
    }
    await a.coffre.compacter()
    const fichiers = () => [...a.vue.local.keys()].filter((c) => /\.nm[jb]$/.test(c))
    expect(fichiers().length).toBe(4)
    temps.maintenant += 8 * JOUR
    await a.coffre.compacter()
    expect(fichiers().length).toBe(1)
  })

  it('un appareil cloné le découvre et prend un nouvel id, sans rien perdre (C4)', async () => {
    const { nuage, temps, appareils } = await monde(['mac'])
    const [mac] = appareils as [AppareilSimule]
    mac.doc('t').getMap('elements').set('avant', 1)
    await mac.coffre.enregistrer()
    nuage.toutLivrer()
    const clone = await mac.cloner('mac-restaure', nuage).demarrer()
    mac.doc('t').getMap('elements').set('original', 1)
    clone.doc('t').getMap('elements').set('clone', 1)
    await mac.coffre.enregistrer()
    await clone.coffre.enregistrer()
    await stabiliser(nuage, [mac, clone])
    expect(mac.coffre.id()).not.toBe(clone.coffre.id())
    expect(mac.contenu('t')).toEqual(clone.contenu('t'))
    expect(Object.keys(mac.contenu('t').elements).sort()).toEqual(['avant', 'clone', 'original'])
    for (const auteurs of nuage.auteurs.values()) expect(auteurs.size).toBe(1)
    const neuf = await new AppareilSimule('neuf', nuage.vue('neuf'), temps).demarrer()
    await neuf.coffre.relire()
    expect(neuf.contenu('t')).toEqual(mac.contenu('t'))
  })

  it('un appareil oublié qui revient prend un nouvel id, et le dossier de l’oublié part quand tout est lu', async () => {
    const { nuage, temps, appareils } = await monde(['a', 'perdu'])
    const [a, perdu] = appareils as [AppareilSimule, AppareilSimule]
    perdu.doc('t').getMap('elements').set('p', 1)
    await stabiliser(nuage, appareils)
    const ancien = perdu.coffre.id()
    await a.coffre.oublier(ancien)
    expect((await a.coffre.appareils()).find((v) => v.id === ancien)?.oublie).toBe(true)
    nuage.toutLivrer()
    // Il revient : il se sait oublié, repart sous un autre nom, et réécrit tout.
    const r = await perdu.coffre.relire()
    expect(r.nouvelId).toBeDefined()
    await stabiliser(nuage, appareils)
    expect(a.contenu('t')).toEqual(perdu.contenu('t'))
    // Longtemps après, A met d'abord ce qu'il a lu de l'oublié dans ses propres bases, puis, une fois ces bases
    // lues ailleurs, efface le dossier de l'oublié.
    temps.maintenant += 31 * JOUR
    await a.coffre.compacter()
    nuage.toutLivrer()
    expect([...a.vue.local.keys()].some((c) => c.startsWith(`appareils/${ancien}/`))).toBe(true)
    await perdu.coffre.relire()
    nuage.toutLivrer()
    await a.coffre.compacter()
    nuage.toutLivrer()
    expect([...a.vue.local.keys()].some((c) => c.startsWith(`appareils/${ancien}/`))).toBe(false)
  })

  it('un dossier partagé en lecture seule : on lit tout, on n’écrit rien, et on le sait', async () => {
    const nuage = new FauxNuage(3, SANS_FAUTES)
    const temps = { maintenant: 1 }
    const auteur = await new AppareilSimule('auteur', nuage.vue('auteur'), temps).demarrer()
    const lecteur = await new AppareilSimule('lecteur', nuage.vue('lecteur', { lectureSeule: true }), temps).demarrer()
    auteur.doc('t').getMap('elements').set('a', 1)
    await stabiliser(nuage, [auteur, lecteur])
    expect(lecteur.contenu('t').elements).toEqual({ a: 1 })
    lecteur.doc('t').getMap('elements').set('b', 2)
    await expect(lecteur.coffre.enregistrer()).rejects.toThrow()
    expect(lecteur.coffre.lectureSeule()).toBe(true)
  })

  it('une mise à jour illisible dans un fichier valable ne bloque pas les autres', async () => {
    const { nuage, appareils } = await monde(['a', 'b'])
    const [a, b] = appareils as [AppareilSimule, AppareilSimule]
    a.doc('t').getMap('elements').set('bon', 1)
    await a.coffre.enregistrer()
    const { encoderFichier } = await import('./fichierNotak')
    const mauvais = await encoderFichier({ genre: 'maj', enregistrements: [{ tableau: 't', maj: new Uint8Array([255, 255, 255, 1, 2]) }] })
    await a.vue.ecrireAtomique(`appareils/${a.coffre.id()}/maj-zzz-000001.nmj`, mauvais)
    nuage.toutLivrer()
    await b.coffre.relire()
    expect(b.contenu('t').elements).toEqual({ bon: 1 })
  })

  it('un plantage pendant l’écriture laisse un fichier temporaire ignoré, et rien n’est perdu', async () => {
    const { nuage, appareils } = await monde(['a', 'b'])
    const [a, b] = appareils as [AppareilSimule, AppareilSimule]
    a.doc('t').getMap('elements').set('x', 1)
    a.vue.planterAuProchainEcrit = true
    await expect(a.coffre.enregistrer()).rejects.toThrow()
    await a.planter()
    await stabiliser(nuage, appareils)
    expect(b.contenu('t').elements).toEqual({ x: 1 })
  })

  it('le hasard du faux nuage est rejouable', () => {
    const [x, y] = [generateur(42), generateur(42)]
    expect(Array.from({ length: 5 }, () => x.suivant())).toEqual(Array.from({ length: 5 }, () => y.suivant()))
    expect(Y).toBeDefined()
  })
})

describe('le coffre : historique', () => {
  it('garde une version par jour de changement, et revient à l’état d’un jour passé même après un effacement', async () => {
    const { nuage, temps, appareils } = await monde(['mac', 'pc'])
    const [mac, pc] = appareils as [AppareilSimule, AppareilSimule]
    const elements = () => mac.doc('t').getMap('elements')
    temps.maintenant = Date.parse('2026-10-01T10:00:00Z')
    elements().set('lundi', 1)
    await mac.coffre.versionner()
    temps.maintenant += JOUR
    elements().set('mardi', 2)
    await mac.coffre.versionner()
    temps.maintenant += JOUR
    // Mercredi, rien ne change : pas de version.
    await mac.coffre.versionner()
    // Jeudi, quelqu'un efface tout, et l'effacement se propage.
    temps.maintenant += JOUR
    await stabiliser(nuage, appareils)
    pc.doc('t').getMap('elements').clear()
    await stabiliser(nuage, appareils)
    expect(mac.contenu('t').elements).toEqual({})
    await mac.coffre.versionner()

    expect(await mac.coffre.jours('t')).toEqual(['2026-10-01', '2026-10-02', '2026-10-04'])
    const mardi = await mac.coffre.version('t', '2026-10-02')
    const doc = new Y.Doc()
    Y.applyUpdate(doc, mardi!)
    expect(doc.getMap('elements').toJSON()).toEqual({ lundi: 1, mardi: 2 })
    // Un jour sans version rend la précédente.
    const mercredi = new Y.Doc()
    Y.applyUpdate(mercredi, (await mac.coffre.version('t', '2026-10-03'))!)
    expect(mercredi.getMap('elements').toJSON()).toEqual({ lundi: 1, mardi: 2 })
    expect(await mac.coffre.version('t', '2026-09-30')).toBeNull()
  })

  it('élague : chaque jour pendant 30 jours, puis une version par semaine', async () => {
    const { temps, appareils } = await monde(['seul'])
    const [a] = appareils as [AppareilSimule]
    temps.maintenant = Date.parse('2026-01-01T10:00:00Z')
    for (let j = 0; j < 60; j++) {
      a.doc('t').getMap('elements').set('jour', j)
      await a.coffre.versionner()
      temps.maintenant += JOUR
    }
    const jours = await a.coffre.jours('t')
    // Les 30 derniers jours un par un, et avant, une version par semaine.
    expect(jours.length).toBeGreaterThanOrEqual(30)
    expect(jours.length).toBeLessThan(40)
    const doc = new Y.Doc()
    Y.applyUpdate(doc, (await a.coffre.version('t', jours.at(-1)!))!)
    expect(doc.getMap('elements').get('jour')).toBe(59)
  })
})

describe('le coffre : divergence', () => {
  it('quelqu’un qui écrit sous l’identité d’un autre fait diverger les copies : on le voit', async () => {
    const { nuage, appareils } = await monde(['honnete', 'temoin', 'tricheur'])
    const [honnete, temoin, tricheur] = appareils as [AppareilSimule, AppareilSimule, AppareilSimule]
    // Le tricheur reprend l'identifiant Yjs de l'honnête, et écrit autre chose à la même horloge.
    const vrai = honnete.doc('t')
    const faux = tricheur.doc('t')
    faux.clientID = vrai.clientID
    vrai.getMap('elements').set('x', 'vrai')
    faux.getMap('elements').set('x', 'faux')
    // Le témoin reçoit le faux d'abord : il le garde, le vrai arrivé ensuite a la même identité.
    await tricheur.coffre.enregistrer()
    nuage.toutLivrer()
    await temoin.coffre.relire()
    await honnete.coffre.enregistrer()
    nuage.toutLivrer()
    await temoin.coffre.relire()
    expect(temoin.contenu('t').elements).toEqual({ x: 'faux' })
    expect(honnete.contenu('t').elements).toEqual({ x: 'vrai' })
    expect(Y.encodeStateVector(temoin.doc('t'))).toEqual(Y.encodeStateVector(honnete.doc('t')))
    // Chacun publie son empreinte ; l'honnête voit que le témoin a divergé.
    await temoin.coffre.versionner()
    await honnete.coffre.versionner()
    nuage.toutLivrer()
    const d = await honnete.coffre.divergences()
    expect(d).toContainEqual({ tableau: 't', appareil: temoin.coffre.id() })
  })

  it('des copies qui ont convergé n’ont pas de divergence, même découpées différemment', async () => {
    const { nuage, appareils } = await monde(['a', 'b'])
    const [a, b] = appareils as [AppareilSimule, AppareilSimule]
    const ta = a.doc('t').getText('texte')
    ta.insert(0, 'bonjour')
    ta.insert(3, '---')
    b.doc('t').getText('texte').insert(0, 'salut ')
    await stabiliser(nuage, appareils)
    await a.coffre.versionner()
    await b.coffre.versionner()
    nuage.toutLivrer()
    expect(await a.coffre.divergences()).toEqual([])
    expect(await b.coffre.divergences()).toEqual([])
  })
})

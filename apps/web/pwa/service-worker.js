/*
 * Le service worker de Notak : l'application s'ouvre sans réseau, et reçoit ce qu'on lui partage.
 * Les deux marques des lignes qui suivent sont remplacées à la construction (voir `pwa/plugin.ts`) par les
 * fichiers du build et une empreinte de leur contenu.
 */
const VERSION = '__VERSION__'
const PRECACHE = /* __PRECACHE__ */ []
const CACHE = `notak-${VERSION}`
/** Ce qu'un partage a apporté, gardé là jusqu'à ce que la page l'ait posé dans les non triés. */
const PARTAGE = 'notak-partage'

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((noms) => Promise.all(noms.filter((n) => n.startsWith('notak-') && n !== CACHE && n !== PARTAGE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const requete = e.request
  const url = new URL(requete.url)
  if (url.origin !== self.location.origin) return
  if (requete.method === 'POST' && url.pathname === '/partage') return e.respondWith(recevoirPartage(requete))
  if (requete.method !== 'GET') return
  // Les données (fichiers, aperçus, synchro) se lisent toujours au réseau : jamais de copie périmée ni d'un autre compte.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/sync')) return
  if (requete.mode === 'navigate') return e.respondWith(ouvrirPage(requete))
  e.respondWith(caches.match(requete).then((copie) => copie ?? fetch(requete)))
})

/** Une page : le serveur d'abord, la page d'accueil de l'application gardée quand il manque. */
async function ouvrirPage(requete) {
  try {
    return await fetch(requete)
  } catch {
    return (await caches.match('/')) ?? Response.error()
  }
}

const texte = (form, cle) => {
  const v = form.get(cle)
  return typeof v === 'string' ? v : ''
}

/**
 * Le partage (`POST /partage`, multipart) : on garde le texte et les images dans le cache, puis on renvoie la page
 * de l'application, qui les prendra par leur numéro.
 */
async function recevoirPartage(requete) {
  const accueil = Response.redirect(new URL('/', self.location.origin).href, 303)
  let form
  try {
    form = await requete.formData()
  } catch {
    return accueil
  }
  const id = crypto.randomUUID()
  const cache = await caches.open(PARTAGE)
  const fichiers = []
  for (const f of form.getAll('images')) {
    if (typeof f === 'string') continue
    const cle = `/partage-recu/${id}/${fichiers.length}`
    await cache.put(cle, new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-nom': encodeURIComponent(f.name ?? '') } }))
    fichiers.push(cle)
  }
  const recu = { titre: texte(form, 'titre'), texte: texte(form, 'texte'), adresse: texte(form, 'adresse'), fichiers }
  await cache.put(`/partage-recu/${id}`, new Response(JSON.stringify(recu), { headers: { 'content-type': 'application/json' } }))
  return Response.redirect(new URL(`/partage?recu=${id}`, self.location.origin).href, 303)
}

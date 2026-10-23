/** Un `CacheStorage` en mémoire, pour les essais du service worker et de la lecture d'un partage. */
export function fauxCaches() {
  const caches = new Map<string, Map<string, Response>>()
  const cle = (r: string | Request | URL) => new URL(typeof r === 'string' ? r : r instanceof Request ? r.url : r.href, 'https://notak.test').href
  const ouvrir = (nom: string) => {
    if (!caches.has(nom)) caches.set(nom, new Map())
    const m = caches.get(nom)!
    return {
      async put(r: string | Request, reponse: Response) {
        m.set(cle(r), reponse)
      },
      async match(r: string | Request) {
        return m.get(cle(r))?.clone()
      },
      async addAll(adresses: string[]) {
        for (const a of adresses) m.set(cle(a), new Response('copie de ' + a))
      },
      async keys() {
        return [...m.keys()].map((u) => new Request(u))
      },
      async delete(r: string | Request) {
        return m.delete(cle(r))
      },
    }
  }
  return {
    noms: () => [...caches.keys()],
    open: async (nom: string) => ouvrir(nom),
    keys: async () => [...caches.keys()],
    delete: async (nom: string) => caches.delete(nom),
    async match(r: string | Request) {
      for (const nom of caches.keys()) {
        const trouve = await ouvrir(nom).match(r)
        if (trouve) return trouve
      }
      return undefined
    },
  }
}

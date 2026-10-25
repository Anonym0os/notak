import { execFileSync } from 'node:child_process'
import type { TestProject } from 'vitest/node'

// Les droits du serveur sont évalués par OpenFGA : les essais en lancent un, en mémoire, le temps de la suite. Chaque
// monde d'essai y ouvre son propre magasin, donc rien ne fuit d'un essai à l'autre. `NOTAK_OPENFGA_ESSAI` désigne un
// serveur déjà lancé (en CI, un conteneur de service) ; sinon Docker en démarre un.

export const IMAGE_OPENFGA = 'openfga/openfga:v1.22.0'

declare module 'vitest' {
  export interface ProvidedContext {
    openfga: string
  }
}

async function attendre(url: string) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${url}/healthz`)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`OpenFGA ne répond pas sur ${url}`)
}

export default async function preparer(projet: TestProject) {
  const deja = process.env.NOTAK_OPENFGA_ESSAI
  if (deja) {
    await attendre(deja)
    projet.provide('openfga', deja)
    return
  }
  let conteneur: string
  try {
    conteneur = execFileSync('docker', ['run', '-d', '--rm', '-p', '127.0.0.1::8080', IMAGE_OPENFGA, 'run', '--datastore-engine', 'memory', '--playground-enabled=false'], {
      encoding: 'utf8',
    }).trim()
  } catch (e) {
    throw new Error(`Les essais du serveur ont besoin d'OpenFGA : lancez Docker, ou donnez NOTAK_OPENFGA_ESSAI. (${(e as Error).message})`)
  }
  const port = execFileSync('docker', ['port', conteneur, '8080/tcp'], { encoding: 'utf8' }).trim().split('\n')[0]!.split(':').at(-1)
  const url = `http://127.0.0.1:${port}`
  await attendre(url)
  projet.provide('openfga', url)
  return () => {
    execFileSync('docker', ['stop', '-t', '0', conteneur], { stdio: 'ignore' })
  }
}

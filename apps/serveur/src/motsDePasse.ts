import { hash, verify } from '@node-rs/argon2'

// Argon2id est l'algorithme par défaut de la bibliothèque.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 }

export function hacher(motDePasse: string): Promise<string> {
  return hash(motDePasse, OPTIONS)
}

export async function verifier(empreinte: string, motDePasse: string): Promise<boolean> {
  try {
    return await verify(empreinte, motDePasse)
  } catch {
    return false
  }
}

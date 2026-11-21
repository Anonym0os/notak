// Écrit `docs/agents.schemas.json`, le contrat de la porte des agents, tiré de `apps/serveur/src/agentsContrat.ts`.
// Un essai vérifie que le fichier suit le code : après un changement du contrat, relancer `bun scripts/schemas-agents.ts`.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contrat } from '../apps/serveur/src/agentsContrat.ts'

export const CHEMIN_SCHEMAS = join(import.meta.dirname, '..', 'docs', 'agents.schemas.json')
export const texteDesSchemas = () => `${JSON.stringify(contrat(), null, 2)}\n`

if (import.meta.main) {
  writeFileSync(CHEMIN_SCHEMAS, texteDesSchemas())
  console.log(`Écrit : ${CHEMIN_SCHEMAS}`)
}

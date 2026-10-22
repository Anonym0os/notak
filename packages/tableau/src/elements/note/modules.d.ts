// Les feuilles de style s'importent comme des modules (Vite) .
declare module '*.css'
// Seul `readFileSync` sert, dans un test : on ne tire pas tous les types de Node pour ça.
declare module 'node:fs' {
  export function readFileSync(chemin: URL, encodage: 'utf8'): string
}

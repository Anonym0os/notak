// Le test d'aller-retour .xmind parcourt une copie locale de Xmind : ces quelques fonctions de Node suffisent.
declare module 'node:fs' {
  export function readFileSync(chemin: string): Uint8Array
  export function existsSync(chemin: string): boolean
  export function readdirSync(chemin: string): string[]
  export function statSync(chemin: string): { isDirectory(): boolean }
}
declare module 'node:path' {
  export function join(...morceaux: string[]): string
}
declare const process: { env: Record<string, string | undefined> }

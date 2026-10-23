/**
 * Recompte l'avancement de `docs/FONCTIONNALITES.md` et réécrit son tableau de tête.
 * ✅ compte 1, 🟡 compte ½, ⬜ compte 0 ; les lignes ➖ (écartées) ne comptent pas.
 */
const chemin = new URL('../docs/FONCTIONNALITES.md', import.meta.url)
const texte = await Bun.file(chemin).text()

const parties = [...texte.matchAll(/\n## (\d+)\. ([^\n]+)\n([\s\S]*?)(?=\n## |$)/g)]
const total = [0, 0, 0]
const lignes = parties.map(([, num, titre, corps]) => {
  const c = [0, 0, 0]
  for (const [, etat] of corps!.matchAll(/^\|[^|\n]+\| (✅|🟡|⬜) \|/gm)) c[['✅', '🟡', '⬜'].indexOf(etat!)]! += 1
  c.forEach((n, i) => (total[i]! += n))
  return `| ${num}. ${titre} | ${c[0]} | ${c[1]} | ${c[2]} | ${pourcent(c)} % |`
})
lignes.push(`| **Total** | **${total[0]}** | **${total[1]}** | **${total[2]}** | **${pourcent(total)} %** |`)

function pourcent([fait, partiel, absent]: number[]) {
  const n = fait! + partiel! + absent!
  return n === 0 ? 0 : Math.round((100 * (fait! + partiel! / 2)) / n)
}

const tableau = `| Partie | Fait | En partie | Absent | Avancement |\n|---|---|---|---|---|\n${lignes.join('\n')}`
await Bun.write(chemin, texte.replace(/\| Partie \| Fait[\s\S]*?\| \*\*Total\*\*[^\n]*/, tableau))
console.log(tableau)

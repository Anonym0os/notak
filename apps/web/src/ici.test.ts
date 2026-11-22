import { describe, expect, it } from 'vitest'
import { iciDe } from './ici'

describe('d’où l’on écrit à l’agent', () => {
  it('la toile, sa page ou sa carte ouverte en grand', () => {
    expect(iciDe('/t/voyage', '', 'r')).toEqual({ tableau: 'voyage', element: null, vue: 'toile' })
    expect(iciDe('/t/voyage/', '', 'r')).toEqual({ tableau: 'voyage', element: null, vue: 'toile' })
    expect(iciDe('/t/voyage/e/page', '', 'r')).toEqual({ tableau: 'voyage', element: 'page', vue: 'element' })
    expect(iciDe(`/t/${encodeURIComponent('é t é')}`, '', 'r')?.tableau).toBe('é t é')
  })

  it('le dossier qu’on parcourt, sinon la bibliothèque, rattachée à l’accueil du compte', () => {
    expect(iciDe('/', '?dossier=clients&type=arbre', 'r')).toEqual({ tableau: 'clients', element: null, vue: 'dossier' })
    expect(iciDe('/', '?vue=favoris', 'r')).toEqual({ tableau: 'r', element: null, vue: 'bibliotheque' })
    expect(iciDe('/bibliotheque', '', 'r')).toEqual({ tableau: 'r', element: null, vue: 'bibliotheque' })
  })

  it('pas d’ici sur les autres pages : la bulle n’y paraît pas', () => {
    for (const chemin of ['/rapide', '/partage', '/envoyer', '/espace', '/relier', '/p/jeton', '/t/a/b/c', '/t/%E0%A4%A']) expect(iciDe(chemin, '', 'r'), chemin).toBeNull()
  })
})

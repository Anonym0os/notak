import '@fontsource-variable/inter'
import '@notak/tableau/toile.css'
import './app.css'
import { Toile, creerMagasin } from '@notak/tableau'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { fichiers } from './fichiers'
import { ecrire, lire } from './stockage'

const magasin = creerMagasin(lire())
let attente: ReturnType<typeof setTimeout> | undefined
magasin.ecouter(() => {
  clearTimeout(attente)
  attente = setTimeout(() => ecrire(magasin.lire()), 300)
})

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <Toile
      magasin={magasin}
      services={{
        fichiers,
        apercu: (url) => fetch('/api/apercu?url=' + encodeURIComponent(url)).then((r) => (r.ok ? r.json() : Promise.reject())),
      }}
    />
  </StrictMode>,
)

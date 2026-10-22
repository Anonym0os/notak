import '@fontsource-variable/inter'
import '@notak/tableau/toile.css'
import './app.css'
import { EspaceNotak, creerEspace } from '@notak/tableau'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { fichiers } from './fichiers'
import { ecrire, lire } from './stockage'

const espace = creerEspace(lire())
let attente: ReturnType<typeof setTimeout> | undefined
espace.ecouter(() => {
  clearTimeout(attente)
  attente = setTimeout(() => ecrire(espace.lire()), 300)
})

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <EspaceNotak
      espace={espace}
      services={{
        fichiers,
        apercu: (url) => fetch('/api/apercu?url=' + encodeURIComponent(url)).then((r) => (r.ok ? r.json() : Promise.reject())),
      }}
    />
  </StrictMode>,
)

import { FauxNuage } from './essais/fauxNuage'
import { verifierContrat } from './essais/contrat'

// La vue locale du faux nuage tient le contrat, sans quoi les essais du coffre ne prouveraient rien.
verifierContrat('vue locale du faux nuage', async () => new FauxNuage(1).vue('essai'))

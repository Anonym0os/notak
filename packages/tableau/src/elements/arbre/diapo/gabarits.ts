import type { ReactNode } from 'react'
import type { Gabarit } from '../modele/gabarits'
import { GabaritArete, GabaritChronologie, GabaritTeteArete, GabaritTeteChronologie } from './aretes'
import type { PropsGabarit } from './commun'
import { GabaritEnfantUniqueIllustre, GabaritEnfantUniqueParentIllustre, GabaritEnfantsIllustres, GabaritListeIllustree, GabaritParentIllustre } from './illustres'
import { GabaritAccolade, GabaritArbre, GabaritEnfantUnique, GabaritParoles, GabaritPuces } from './listes'
import { GabaritResume, GabaritResumeDefilant } from './resume'
import { GabaritFin, GabaritSujet, GabaritSujetImage } from './sujet'

/**
 * Le dessin de chaque gabarit (relevé 11) ; « Merci » à part. Chacun est une fonction du contexte et de la diapositive,
 * sans état : on l'appelle avant de dessiner le décor, qui suit la place qu'il a donnée au titre et aux sous-sujets.
 */
// biome-ignore lint/suspicious/noExplicitAny: chaque gabarit reçoit la diapositive de son type.
type Dessin = (p: PropsGabarit<any>) => ReactNode

export const GABARITS: Record<Gabarit | 'fin', Dessin> = {
  sujet: GabaritSujet,
  'sujet-image': GabaritSujetImage,
  accolade: GabaritAccolade,
  puces: GabaritPuces,
  paroles: GabaritParoles,
  arbre: GabaritArbre,
  'enfant-unique': GabaritEnfantUnique,
  resume: GabaritResume,
  'resume-defilant': GabaritResumeDefilant,
  arete: GabaritArete,
  'tete-arete': GabaritTeteArete,
  chronologie: GabaritChronologie,
  'tete-chronologie': GabaritTeteChronologie,
  'parent-illustre': GabaritParentIllustre,
  'enfant-unique-parent-illustre': GabaritEnfantUniqueParentIllustre,
  'enfants-illustres': GabaritEnfantsIllustres,
  'liste-illustree': GabaritListeIllustree,
  'enfant-unique-illustre': GabaritEnfantUniqueIllustre,
  fin: GabaritFin,
}

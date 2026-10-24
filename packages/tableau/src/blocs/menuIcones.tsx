import {
  IconBulb,
  IconCaretRightFilled,
  IconClearFormatting,
  IconCode,
  IconCopy,
  IconDots,
  IconH1,
  IconH2,
  IconH3,
  IconLayoutColumns,
  IconLink,
  IconList,
  IconListNumbers,
  IconMessage,
  IconPaint,
  IconPhoto,
  IconQuote,
  IconRepeat,
  IconSeparator,
  IconSquareCheck,
  IconTable,
  IconTrash,
  IconTypography,
  IconWorld,
} from '@tabler/icons-react'
import type { ComponentType } from 'react'
import type { NomIconeMenu } from './catalogue'

/**
 * Les icônes des menus : un jeu cohérent (Tabler, comme `icones.tsx`), dessiné à 20 px sans tuile, dans la couleur
 * d'icône du menu (docs/NOTION.md § 1.2).
 */

type Dessin = ComponentType<{ size?: number; stroke?: number; color?: string; className?: string; 'aria-hidden'?: boolean | 'true' }>

const DESSINS: Record<NomIconeMenu, Dessin> = {
  texte: IconTypography,
  titre1: IconH1,
  titre2: IconH2,
  titre3: IconH3,
  puce: IconList,
  numero: IconListNumbers,
  tache: IconSquareCheck,
  deroulant: IconCaretRightFilled,
  citation: IconQuote,
  encadre: IconBulb,
  code: IconCode,
  tableau: IconTable,
  separateur: IconSeparator,
  image: IconPhoto,
  colonnes: IconLayoutColumns,
  transformer: IconRepeat,
  couleur: IconPaint,
  lien: IconLink,
  dupliquer: IconCopy,
  supprimer: IconTrash,
  commenter: IconMessage,
}

export function IconeMenu({ nom, taille = 20 }: { nom: NomIconeMenu; taille?: number }) {
  const Dessin = DESSINS[nom]
  return <Dessin size={taille} stroke={1.6} color="currentColor" className="notak-menu-icone" aria-hidden="true" />
}

/** Les icônes propres à la bulle et au lien, qui ne sont pas des entrées de menu. */
export const IconeEffacerFormat = ({ taille = 20 }: { taille?: number }) => <IconClearFormatting size={taille} stroke={1.6} color="currentColor" className="notak-menu-icone" aria-hidden="true" />
export const IconeAdresse = ({ taille = 20 }: { taille?: number }) => <IconWorld size={taille} stroke={1.6} color="currentColor" className="notak-menu-icone" aria-hidden="true" />
export const IconePlus = ({ taille = 20 }: { taille?: number }) => <IconDots size={taille} stroke={1.6} color="currentColor" className="notak-menu-icone" aria-hidden="true" />

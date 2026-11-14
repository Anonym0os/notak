import sharp from 'sharp'
import type { BoitePlan, PhotoMontree } from './contenu.ts'
import { type Corps, couper, dessinable, equilibrer, manquants, mesurer, police, tracer } from './police.ts'

// La carte d'aperçu d'un lien Notak (1200 × 630) : l'image qu'iMessage, WhatsApp, Slack ou un courriel montrent sous
// un lien partagé. Elle reprend la page d'accueil du site (apps/site/public/a-propos) : le fond pointillé de la toile,
// l'encre presque noire, l'éclat, et de petites cartes de tableau qui flottent. Tout se dessine en SVG, le texte en
// tracés (police.ts), puis `sharp` le rend en PNG ou en JPEG : rien ne dépend des polices de la machine.

export const LARGEUR = 1200
export const HAUTEUR = 630

/** Les couleurs du site et de l'app. */
const FOND = '#f4f5f7'
const POINT = '#cdd1d7'
const ENCRE = '#16181b'
const DOUX = '#5d6670'
const PALE = '#8a929b'
const TRAIT = '#e1e4e8'
const ACCENT = '#2f6feb'
const VERT = '#3c9d5b'
/** La carte d'une toile sans couleur, dans la bibliothèque (apps/web/src/bibliotheque/Vignettes.tsx). */
const CARTE_TOILE = '#5b6cf0'

/**
 * Les fonds de note, ceux de la toile (`FOND_NOTE`, packages/tableau/src/elements/note/couleurs.ts) : ce module-là
 * charge la toile, que le serveur ne lit pas. Un essai vérifie qu'ils restent ceux de `note.css`, que la toile vérifie.
 */
export const FONDS_NOTE: Record<string, string> = {
  gris: '#bbbec3',
  cyan: '#62dbc8',
  vert: '#7cd651',
  brun: '#d58558',
  jaune: '#ffd14d',
  orange: '#ff8d48',
  rouge: '#ff5757',
  rose: '#ff6ed4',
  violet: '#ad6fff',
  bleu: '#4ebafd',
  bleu_nuit: '#5882f8',
}

/**
 * L'éclat, la marque de Notak : le tracé de apps/web/public/icones/eclat/marque.svg, dans sa boîte (`MARQUE_BOITE`).
 * Un essai vérifie qu'il reste celui du fichier.
 */
export const MARQUE_BOITE = [61.01639232150973, 61.01639232150973, 901.9672153569805] as const
export const MARQUE =
  'M500.2 70.9C497.6 71.4 495.4 72 493 72.9C490.6 73.8 487.9 75 485.7 76.2C483.5 77.3 482 78.3 479.9 79.8C477.8 81.4 475.3 83.5 473.4 85.5C471.4 87.5 469.8 89.5 468.3 91.6C466.7 93.8 465.3 96.2 464.1 98.6C462.9 101 462 103.4 461.2 105.9C460.4 108.3 459.9 109.5 459.4 113.1C459 116.8 458.5 122.8 458.6 127.7C458.7 132.5 459.3 137.4 460.1 142.2C460.9 147 460.8 147.3 463.6 156.7C466.3 166.2 474.1 189.4 476.7 198.9C479.4 208.3 478.7 208.6 479.4 213.4C480 218.3 480.4 221.9 480.5 228C480.5 234 480.4 241.3 479.5 249.8C478.6 258.3 476.7 271.8 475.2 278.9C473.8 285.9 472.2 288.8 470.9 291.9C469.6 295.1 468.8 296 467.6 297.8C466.5 299.5 465.7 300.7 463.9 302.4C462.1 304 459.1 306.5 456.6 307.7C454.2 308.9 451.8 309.4 449.4 309.6C446.9 309.8 444.5 309.5 442.1 308.8C439.7 308 437 306.6 434.8 305.2C432.7 303.8 430.9 302.2 429 300.2C427.1 298.3 427.3 299.4 423.4 293.4C419.5 287.4 410 271.3 405.4 264.3C400.7 257.3 397.9 254.4 395.2 251.2C392.6 248.1 391.3 247.1 389.4 245.4C387.4 243.7 385.6 242.4 383.5 241.1C381.4 239.7 379 238.4 376.7 237.4C374.3 236.3 372.1 235.5 369.4 234.8C366.7 234.1 363.6 233.5 360.7 233.2C357.8 233 354.9 232.9 352 233.2C349.1 233.4 346.2 233.8 343.2 234.6C340.3 235.4 337.2 236.5 334.5 237.8C331.9 239 329.4 240.6 327.3 242.1C325.1 243.7 323.3 245.2 321.4 247.2C319.5 249.2 317.4 251.8 315.8 254.1C314.3 256.5 313.1 258.7 312 261.4C310.9 264.1 309.8 267 309.2 270.1C308.6 273.3 308.3 277.2 308.3 280.3C308.3 283.5 308.6 286.1 309.3 289C309.9 291.9 310.7 294.6 312 297.8C313.3 300.9 315.2 304.5 317.2 307.9C319.2 311.3 318.9 311.8 324 318.1C329 324.4 342.4 339.4 347.6 345.7C352.7 352 352.8 352.3 355 355.9C357.3 359.5 359.5 363.4 361.1 367.5C362.8 371.6 364.2 377.2 364.9 380.6C365.7 384 365.6 385.2 365.7 387.9C365.8 390.5 366.1 392.2 365.5 396.6C364.8 401 363.5 408.2 361.6 414C359.7 419.9 356 427.3 353.9 431.5C351.8 435.7 350.8 436.6 349.1 439C347.3 441.4 346.2 443.2 343.3 446C340.4 448.9 335.9 453.2 331.6 456.2C327.2 459.2 323.1 461.5 317.1 463.8C311 466.1 300.6 468.7 295.3 470C289.9 471.3 288.5 471.3 285.1 471.6C281.7 472 279.3 472.4 274.9 472.2C270.6 472.1 264.5 471.8 258.9 471C253.4 470.1 246.8 468.7 241.5 467.3C236.2 465.9 234.2 465.2 226.9 462.5C219.7 459.8 205.4 453.8 197.9 451.2C190.4 448.6 187.2 447.7 181.9 446.7C176.6 445.6 171 444.8 165.9 444.7C160.8 444.6 155.2 445.2 151.4 445.9C147.5 446.5 145.3 447.6 142.6 448.7C140 449.8 137.7 451 135.4 452.5C133 454 130.7 455.8 128.7 457.7C126.7 459.5 125 461.3 123.3 463.5C121.6 465.7 119.9 468.3 118.6 470.7C117.3 473.2 116.3 475.3 115.4 478C114.5 480.7 113.7 483.8 113.3 486.7C112.9 489.6 112.7 492.5 112.8 495.5C112.9 498.4 113.3 501.5 113.8 504.2C114.4 506.8 115.1 509 116 511.4C116.9 513.9 118.1 516.4 119.4 518.6C120.6 520.8 121.8 522.6 123.4 524.5C125 526.5 127 528.7 128.8 530.3C130.6 532 132.3 533.3 134.3 534.7C136.4 536.1 138.8 537.5 141.2 538.6C143.5 539.7 144.8 540.5 148.4 541.3C152.1 542.2 158.1 543.3 163 543.8C167.8 544.2 172.7 544.1 177.5 543.8C182.4 543.5 183.6 543.4 192.1 541.9C200.5 540.5 218.7 536.3 228.4 534.9C238.1 533.5 244.6 533.6 250.2 533.6C255.8 533.6 258.2 534.1 261.8 534.8C265.4 535.5 268.8 536.4 271.7 537.6C274.7 538.8 277.4 540.3 279.8 542C282.1 543.7 284.3 545.9 285.8 547.8C287.3 549.7 288.3 551.7 289 553.6C289.7 555.5 290 557.5 290 559.4C290 561.4 289.6 563.4 289 565.2C288.5 567.1 288.1 568.2 286.6 570.4C285 572.6 284.4 574.1 279.5 578.3C274.7 582.5 263 590.9 257.5 595.5C251.9 600.1 249.5 602.3 246.3 605.9C243.2 609.6 240.6 613.5 238.6 617.4C236.6 621.3 235.2 626 234.2 629.4C233.3 632.8 233.1 635.3 232.9 637.9C232.7 640.5 232.8 642.8 232.9 645.2C233.1 647.6 233.4 650 234 652.5C234.5 654.9 235.2 657.3 236.1 659.7C237.1 662.2 238.4 664.8 239.6 667C240.9 669.2 242.1 671 243.7 672.8C245.2 674.7 246.8 676.5 248.8 678.2C250.7 679.8 252.8 681.5 255.3 683C257.7 684.4 260.5 685.9 263.3 686.9C266.1 687.9 269.1 688.7 272 689.2C274.9 689.6 277.8 689.8 280.7 689.7C283.6 689.7 286.6 689.3 289.5 688.8C292.4 688.2 295 687.4 298.2 686.3C301.3 685.2 301.8 685.5 308.4 682.3C314.9 679 330.9 670.2 337.4 666.9C344 663.6 344 663.7 347.6 662.3C351.2 661 355.6 659.7 359.2 659C362.9 658.2 365.5 657.9 369.4 658C373.3 658.1 378.3 658.6 382.5 659.6C386.7 660.6 390.1 661.8 394.4 664.1C398.8 666.3 404.3 669.8 408.7 673.2C413 676.6 417.3 680.6 420.7 684.4C424 688.3 426.7 692.2 428.9 696.1C431.2 699.9 432.9 703.6 434.3 707.7C435.7 711.8 436.7 716.2 437.2 720.8C437.8 725.4 437.7 731.2 437.5 735.3C437.3 739.4 436.8 741.9 436 745.5C435.2 749.1 435.7 749.6 432.7 757.1C429.7 764.6 421.3 782.8 418.1 790.6C414.9 798.3 414.7 799 413.4 803.6C412.1 808.2 410.9 813.6 410.3 818.2C409.7 822.8 409.5 827.4 409.7 831.3C410 835.1 410.6 838.1 411.7 841.4C412.7 844.8 414.2 848.4 416.1 851.6C418 854.8 420.6 858.1 423.2 860.8C425.8 863.5 429 865.9 431.9 867.8C434.8 869.7 437.7 870.9 440.6 872C443.6 873.1 446.5 873.8 449.4 874.3C452.3 874.8 455.2 874.9 458.1 874.9C461 874.8 463.9 874.4 466.8 873.8C469.7 873.2 472.6 872.3 475.5 871C478.4 869.7 481.6 867.9 484.1 866.2C486.7 864.4 488.8 862.5 490.9 860.3C492.9 858.2 494.8 856 496.6 853.1C498.4 850.2 500.1 847.3 501.5 842.9C502.9 838.5 504.4 832.2 505.1 826.9C505.9 821.6 506.2 818.9 506 810.9C505.9 802.9 504.5 786.4 504.3 778.9C504 771.4 504.1 770.5 504.5 765.8C505 761.2 505.7 755.9 507 751.3C508.2 746.8 509.9 742.5 511.9 738.6C513.9 734.7 516.2 731.3 518.8 728.1C521.5 724.8 524.2 722.1 527.9 719C531.6 715.9 536.6 712.1 541 709.4C545.3 706.7 549.7 704.6 554 702.7C558.4 700.9 562.8 699.5 567.1 698.4C571.5 697.3 575.8 696.6 580.2 696.3C584.6 696 588.9 696 593.3 696.5C597.6 697 601.5 697.6 606.4 699.2C611.2 700.9 617 703.4 622.4 706.2C627.7 709 632.8 712.1 638.4 716.1C643.9 720 650.5 725.3 655.8 730C661.1 734.6 666.1 739.8 670.1 744C674 748.3 676.6 751.6 679.5 755.7C682.5 759.7 683.3 760 687.8 768.5C692.3 777 702 798 706.4 806.6C710.7 815.1 711 815.4 713.9 819.8C716.9 824.1 720.5 828.9 724.1 832.8C727.8 836.7 732.4 840.5 735.8 842.9C739.1 845.4 741.6 846.3 744.5 847.5C747.4 848.8 750.3 849.6 753.2 850.2C756.1 850.8 758.8 851.2 761.9 851.3C765.1 851.3 768.9 851.1 772.1 850.6C775.2 850.1 777.9 849.3 780.8 848.3C783.7 847.2 786.8 845.7 789.5 844.1C792.3 842.5 794.7 840.7 797.1 838.5C799.5 836.3 802.2 833.3 804.1 830.9C806 828.5 807.2 826.4 808.4 824C809.6 821.6 810.6 819.2 811.4 816.7C812.3 814.3 812.8 811.9 813.3 809.5C813.7 807 813.9 804.6 814 802.2C814 799.8 813.9 797.3 813.7 794.9C813.4 792.5 812.9 790.1 812.2 787.7C811.6 785.2 810.8 782.8 809.7 780.4C808.6 778 807.8 776.2 805.7 773.1C803.5 770.1 800.2 765.7 796.8 762.2C793.4 758.7 789.1 754.9 785.2 751.9C781.3 748.8 781.3 748.8 773.5 744C765.8 739.1 746.4 728 738.7 723C730.9 718.1 730.6 717.2 727 714.1C723.4 711.1 720.4 708.3 717.1 704.8C713.7 701.3 710.1 697.3 707.1 693.2C704.1 689 701 684.2 698.9 680.1C696.8 676 695.3 672.1 694.4 668.5C693.4 664.8 693.2 661.2 693.2 658.3C693.3 655.4 693.9 653.1 694.7 651C695.5 648.9 696.7 647.1 698 645.6C699.2 644.1 700.4 643 702.3 641.9C704.3 640.8 707.2 639.7 709.6 639.1C712 638.5 714.4 638.4 716.9 638.3C719.3 638.2 717.8 637.7 724.1 638.6C730.4 639.6 746.9 643.1 754.6 644.2C762.4 645.4 765.8 645.5 770.6 645.4C775.5 645.2 779.4 644.8 783.7 643.5C788.1 642.3 793.4 639.8 796.8 637.9C800.2 636.1 801.9 634.5 804.1 632.7C806.3 630.8 808.2 628.8 809.9 626.8C811.6 624.7 813 622.7 814.4 620.5C815.7 618.2 817 615.6 818 613.2C819 610.8 819.7 608.6 820.2 605.9C820.8 603.3 821.3 600.1 821.3 597.2C821.4 594.3 821.2 591.2 820.7 588.5C820.3 585.8 819.9 583.9 818.9 581.2C817.9 578.6 816.4 575.1 814.9 572.5C813.4 569.9 811.9 567.9 809.9 565.7C807.9 563.6 805.5 561.3 803 559.4C800.6 557.6 798.3 556.2 795.4 554.7C792.4 553.2 788.6 551.6 785.2 550.4C781.8 549.2 782.3 548.9 775 547.4C767.7 545.8 749.1 542.6 741.6 541.1C734.1 539.5 733.8 539.3 729.9 538C726.1 536.6 721.9 535 718.3 533C714.7 530.9 711.5 528.8 708.4 526C705.2 523.1 702 519.9 699.3 515.8C696.5 511.7 693.9 506.6 691.8 501.3C689.8 495.9 687.9 489.4 686.9 483.8C685.9 478.3 685.6 472.7 685.7 467.8C685.7 463 686.2 459.1 687.2 454.8C688.1 450.4 689.3 446.4 691.3 441.7C693.4 437 696.6 430.9 699.4 426.6C702.2 422.2 704.8 418.9 707.9 415.5C711.1 412.1 714.6 408.9 718.3 406.1C722 403.3 725.8 400.9 729.9 398.5C734.1 396.2 735 395.7 743 392.2C751 388.7 770.2 381.2 777.9 377.7C785.7 374.2 786.1 373.4 789.5 371.2C793 369 795.6 367.2 798.6 364.6C801.6 362.1 805 359 807.5 355.9C810.1 352.8 812.3 349.1 814 345.7C815.6 342.3 816.7 339.2 817.4 335.5C818.2 331.9 818.6 327.6 818.5 323.9C818.5 320.3 817.9 316.9 817.2 313.7C816.4 310.6 815.5 307.9 814.1 305C812.7 302.1 810.9 299 808.9 296.3C806.9 293.6 804.6 291.2 802.1 289C799.6 286.8 796.7 284.8 793.9 283.2C791.1 281.6 788.3 280.4 785.2 279.4C782 278.4 778.4 277.6 775 277.3C771.6 276.9 767.7 277.1 764.8 277.4C761.9 277.6 760.1 278 757.6 278.8C755 279.5 752.2 280.5 749.6 281.8C747 283 744.6 284.4 742 286.1C739.5 287.8 737.8 288.7 734.3 291.9C730.8 295 727.1 297.8 721.1 305C715 312.2 703.4 328.3 698 335C692.5 341.8 692 342.2 688.2 345.7C684.5 349.2 680 353 675.6 355.9C671.2 358.8 665.6 361.3 661.6 363C657.6 364.7 655.1 365.2 651.4 365.9C647.8 366.7 643.7 367.3 639.8 367.6C635.9 368 632.1 368.1 628.2 368C624.3 367.9 620.4 367.6 616.5 367C612.7 366.4 608.6 365.5 604.9 364.5C601.3 363.5 598.1 362.4 594.7 361C591.3 359.6 587.7 357.8 584.6 356C581.4 354.1 578.6 352.2 575.8 350C573.1 347.8 570.5 345.5 568 342.8C565.6 340.2 563.2 337.2 561.1 334.1C559.1 330.9 557.2 327.6 555.6 323.9C553.9 320.3 552.6 316.4 551.2 312.3C549.9 308.2 548.7 303.5 547.7 299.2C546.7 294.9 546.5 296 545.3 286.6C544.2 277.1 541.5 253.2 540.7 242.5C539.9 231.8 540.2 228.7 540.7 222.2C541.1 215.6 542.1 209.1 543.2 203.3C544.3 197.4 544.9 195.3 547.3 187.3C549.7 179.3 555.4 163.3 557.7 155.3C560 147.3 560.5 144.6 561.2 139.3C562 134 562.4 128.4 562.3 123.3C562.2 118.2 561.3 112.6 560.5 108.8C559.7 104.9 558.8 103 557.4 100C556.1 97.1 554.3 94 552.4 91.3C550.5 88.7 548.4 86.3 546 84.1C543.6 81.8 540.8 79.6 538 77.9C535.3 76.1 532.5 74.6 529.3 73.4C526.2 72.2 522.5 71.2 519.1 70.6C515.8 70 512.1 69.8 509 69.9C505.8 69.9 502.9 70.4 500.2 70.9Z'

/**
 * Les polices : Inter, celle de l'app, en tracés. Le titre et le nom en Inter Display, son dessin pour les grandes
 * tailles, serré comme la marque du site ; le reste en Inter.
 */
const titre = (taille: number): Corps => ({ police: police('Inter-Display-Bold.ttf'), taille, interlettrage: -0.032 })
const marque = (taille: number): Corps => ({ police: police('Inter-Display-Bold.ttf'), taille, interlettrage: -0.04 })
const gras = (taille: number): Corps => ({ police: police('Inter-SemiBold.ttf'), taille, interlettrage: -0.011 })
const courant = (taille: number): Corps => ({ police: police('Inter-Regular.ttf'), taille, interlettrage: -0.008 })

const arrondi = (n: number) => Math.round(n * 100) / 100

/** Une ligne de texte, en tracé. */
const ligneDeTexte = (corps: Corps, texte: string, x: number, y: number, couleur: string, extra = '') => {
  const d = tracer(corps, texte, x, y)
  return d ? `<path d="${d}" fill="${couleur}"${extra}/>` : ''
}

/** Plusieurs lignes, l'une sous l'autre, la première ligne de base à `y`. */
const lignesDeTexte = (corps: Corps, lignes: readonly string[], x: number, y: number, interligne: number, couleur: string) =>
  lignes.map((l, i) => ligneDeTexte(corps, l, x, y + i * interligne, couleur)).join('')

/**
 * Ce qu'une carte dit. `genre` choisit le dessin de droite : la toile d'exemple du site (`marque`), la même sans un mot
 * quand rien ne peut s'en dire (`toile`, `invitation`), ou le plan d'une toile ouverte par son lien (`visiteur`).
 */
export interface Carte {
  genre: 'marque' | 'toile' | 'invitation' | 'visiteur'
  /** Le nom de l'instance (`NOTAK_NOM`), à côté de l'éclat. */
  nom: string
  /** L'hôte, en pied de carte : `notak.exemple.fr`. */
  hote: string
  titre: string
  description: string
  /** La pastille du pied : ce qu'est le lien (« Accès réservé », « Lecture seule · 12 éléments »). */
  pastille: string
  /** Pour `visiteur` : la couleur de la toile (une clé de `FONDS_NOTE`), son plan, et les photos qu'il montre. */
  couleur?: string
  boites?: readonly BoitePlan[]
  /** Les photos du plan, en `data:` (petites copies JPEG), par fichier. */
  photos?: ReadonlyMap<string, string>
}

/** Le SVG de la carte. */
export function svgDeLaCarte(carte: Carte): string {
  const gauche = 88
  const largeurTexte = 548
  // Le titre : trois lignes au plus, plus petit s'il est long. Ce que la police ne dessine pas (un émoji) n'y est pas ;
  // un titre qui n'y serait presque plus (une écriture qu'Inter n'a pas) laisse la place au nom de l'instance.
  let titreTexte = dessinable(titre(64), carte.titre)
  if (!titreTexte || manquants(titre(64), carte.titre) > [...carte.titre.trim()].length / 3) titreTexte = carte.nom
  let corpsTitre = titre(64)
  let lignesTitre = equilibrer(corpsTitre, titreTexte, largeurTexte, 3)
  if (lignesTitre.length === 3 || lignesTitre.some((l) => l.endsWith('…'))) {
    corpsTitre = titre(54)
    lignesTitre = equilibrer(corpsTitre, titreTexte, largeurTexte, 3)
  }
  const interligneTitre = Math.round(corpsTitre.taille * 1.1)
  const corpsDescription = courant(26)
  const description = dessinable(corpsDescription, carte.description)
  const lignesDescription = description ? equilibrer(corpsDescription, description, largeurTexte - 20, lignesTitre.length >= 3 ? 2 : 3) : []
  const interligneDescription = 37

  // Le bloc du titre et de la description, centré entre l'en-tête et le pied.
  const capitales = (corpsTitre.police.capitales * corpsTitre.taille) / corpsTitre.police.unites
  const hauteurTitre = capitales + (lignesTitre.length - 1) * interligneTitre
  const ecart = lignesDescription.length ? 34 : 0
  const hauteurDescription = lignesDescription.length ? 19 + (lignesDescription.length - 1) * interligneDescription : 0
  const hauteurBloc = hauteurTitre + ecart + hauteurDescription
  const [haut, bas] = [150, 510]
  const debut = Math.round(haut + (bas - haut - hauteurBloc) / 2)
  const baseTitre = debut + capitales
  const baseDescription = baseTitre + (lignesTitre.length - 1) * interligneTitre + ecart + 19 + 6

  const enTete = lockup(carte.nom, gauche, 92)
  const pied = piedDeCarte(carte, gauche, 552)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGEUR}" height="${HAUTEUR}" viewBox="0 0 ${LARGEUR} ${HAUTEUR}">
<defs>
  <pattern id="points" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="13" cy="13" r="1.5" fill="${POINT}"/></pattern>
  <linearGradient id="voile" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${FOND}" stop-opacity="1"/>
    <stop offset="0.42" stop-color="${FOND}" stop-opacity="0.94"/>
    <stop offset="0.62" stop-color="${FOND}" stop-opacity="0"/>
  </linearGradient>
  <filter id="ombre" x="-30%" y="-30%" width="160%" height="170%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="11"/>
    <feOffset dy="10" result="loin"/>
    <feFlood flood-color="#101828" flood-opacity="0.13"/>
    <feComposite in2="loin" operator="in" result="ombreLoin"/>
    <feGaussianBlur in="SourceAlpha" stdDeviation="1.2"/>
    <feOffset dy="1.5" result="pres"/>
    <feFlood flood-color="#101828" flood-opacity="0.08"/>
    <feComposite in2="pres" operator="in" result="ombrePres"/>
    <feMerge><feMergeNode in="ombreLoin"/><feMergeNode in="ombrePres"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <linearGradient id="moodboard" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f6d8a8"/><stop offset="0.55" stop-color="#e8729f"/><stop offset="1" stop-color="#8a5fd1"/>
  </linearGradient>
</defs>
<rect width="${LARGEUR}" height="${HAUTEUR}" fill="${FOND}"/>
<rect width="${LARGEUR}" height="${HAUTEUR}" fill="url(#points)"/>
${carte.genre === 'visiteur' ? planDeLaToile(carte) : scene(carte.genre)}
<rect width="${LARGEUR}" height="${HAUTEUR}" fill="url(#voile)"/>
${enTete}
${lignesDeTexte(corpsTitre, lignesTitre, gauche - 2, baseTitre, interligneTitre, ENCRE)}
${lignesDeTexte(corpsDescription, lignesDescription, gauche, baseDescription, interligneDescription, DOUX)}
${pied}
</svg>`
}

/** L'éclat et le nom, en haut à gauche, comme l'en-tête du site. */
function lockup(nom: string, x: number, y: number): string {
  const taille = 40
  const [bx, by, cote] = MARQUE_BOITE
  const echelle = taille / cote
  const corps = marque(34)
  const capitales = (corps.police.capitales * corps.taille) / corps.police.unites
  return `<path d="${MARQUE}" fill="${ENCRE}" transform="translate(${x} ${y}) scale(${arrondi(echelle * 1e4) / 1e4}) translate(${-bx} ${-by})"/>
${ligneDeTexte(corps, nom, x + taille + 13, y + taille / 2 + capitales / 2, ENCRE)}`
}

/** Le pied : la pastille, qui dit ce qu'est le lien, puis l'hôte. */
function piedDeCarte(carte: Carte, x: number, y: number): string {
  const corps = gras(19)
  const hauteur = 44
  const capitales = (corps.police.capitales * corps.taille) / corps.police.unites
  const base = y + hauteur / 2 + capitales / 2
  const icone = iconeDePastille(carte, x + 16, y + hauteur / 2)
  const texteX = x + 16 + 22 + 10
  const largeur = Math.round(texteX - x + mesurer(corps, carte.pastille) + 18)
  const hote = courant(19)
  return `<rect x="${x}" y="${y}" width="${largeur}" height="${hauteur}" rx="12" fill="#fff" stroke="${TRAIT}" stroke-width="1.5"/>
${icone}
${ligneDeTexte(corps, carte.pastille, texteX, base, ENCRE)}
${ligneDeTexte(hote, carte.hote, x + largeur + 18, base, PALE)}`
}

/** L'icône de la pastille, centrée verticalement sur `cy`, à partir de `x` (22 px de large). */
function iconeDePastille(carte: Carte, x: number, cy: number): string {
  const trait = `fill="none" stroke="${ENCRE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`
  switch (carte.genre) {
    case 'toile':
      // Un cadenas.
      return `<rect x="${x + 3}" y="${cy - 2}" width="16" height="12" rx="3" fill="${ENCRE}"/><path d="M${x + 6.5} ${cy - 2}v-3.5a4.5 4.5 0 0 1 9 0V${cy - 2}" ${trait}/>`
    case 'invitation':
      // Une enveloppe.
      return `<rect x="${x + 1}" y="${cy - 7.5}" width="20" height="15" rx="3" ${trait}/><path d="M${x + 2.5} ${cy - 5}l8.5 6 8.5-6" ${trait}/>`
    case 'visiteur': {
      // La carte d'une toile, à sa couleur, comme dans la bibliothèque.
      const couleur = carte.couleur && FONDS_NOTE[carte.couleur] ? FONDS_NOTE[carte.couleur] : CARTE_TOILE
      return `<rect x="${x}" y="${cy - 11}" width="22" height="22" rx="5.5" fill="${couleur}"/><rect x="${x + 4.5}" y="${cy - 6}" width="13" height="4" rx="1.2" fill="#fff" opacity="0.88"/><rect x="${x + 4.5}" y="${cy}" width="5.5" height="5.5" rx="1.2" fill="#fff" opacity="0.88"/><rect x="${x + 12}" y="${cy}" width="5.5" height="5.5" rx="1.2" fill="#fff" opacity="0.88"/>`
    }
    default:
      // Le code ouvert : deux chevrons.
      return `<path d="M${x + 6} ${cy - 6}l-5 6 5 6M${x + 16} ${cy - 6}l5 6-5 6" ${trait}/>`
  }
}

/** Une carte de la scène : un rectangle blanc ombré, tourné autour de son centre. */
const carteFlottante = (x: number, y: number, l: number, h: number, angle: number, interieur: string, fond = '#fff') =>
  `<g transform="rotate(${angle} ${x + l / 2} ${y + h / 2})"><rect x="${x}" y="${y}" width="${l}" height="${h}" rx="14" fill="${fond}" filter="url(#ombre)"/>${interieur}</g>`

/** Des barres à la place du texte, comme les vignettes de la bibliothèque. */
const barres = (x: number, y: number, l: number, n: number, pas: number, couleur = 'rgb(50 59 74 / 0.18)', epaisseur = 9) =>
  Array.from({ length: n }, (_, i) => {
    const part = [0.94, 0.78, 0.86, 0.6, 0.84, 0.7][i % 6]!
    return `<rect x="${x}" y="${y + i * pas}" width="${arrondi(l * (i === n - 1 && n > 1 ? 0.52 : part))}" height="${epaisseur}" rx="${epaisseur / 2}" fill="${couleur}"/>`
  }).join('')

/** Une case cochée (ou non) de la liste, comme celle du site. */
const caseDeListe = (x: number, cy: number, cochee: boolean) =>
  cochee
    ? `<rect x="${x}" y="${cy - 9}" width="18" height="18" rx="5" fill="${VERT}"/><path d="M${x + 4.5} ${cy + 0.5}l3.2 3 6-6.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<rect x="${x + 1}" y="${cy - 8}" width="16" height="16" rx="4.5" fill="none" stroke="#b8bec5" stroke-width="2"/>`

/**
 * La toile d'exemple, à droite : les cartes de la page d'accueil du site (une idée, un moodboard, une liste, une
 * toile). `marque` les écrit ; ailleurs, elles n'ont que des barres : on ne fait pas croire à un contenu qu'on ne montre pas.
 */
function scene(genre: Carte['genre']): string {
  const mots = genre === 'marque'
  const morceaux: string[] = []

  // Une idée, sur un papier jaune.
  {
    const [x, y, l, h] = [668, 96, 258, 162]
    const interieur = mots
      ? ligneDeTexte(gras(21), 'Idée', x + 22, y + 42, ENCRE) + lignesDeTexte(courant(19), couper(courant(19), 'Une toile pour chaque projet, et des toiles dans les toiles.', l - 44, 3), x + 22, y + 74, 27, ENCRE)
      : `<rect x="${x + 22}" y="${y + 26}" width="64" height="12" rx="6" fill="rgb(22 24 27 / 0.5)"/>` + barres(x + 22, y + 58, l - 44, 3, 24, 'rgb(22 24 27 / 0.16)')
    morceaux.push(carteFlottante(x, y, l, h, -4, interieur, '#fdf6df'))
  }
  // Un moodboard.
  {
    const [x, y, l, h] = [954, 58, 226, 212]
    const interieur =
      `<rect x="${x + 12}" y="${y + 12}" width="${l - 24}" height="116" rx="9" fill="url(#moodboard)"/>` +
      (mots
        ? ligneDeTexte(gras(21), 'Moodboard', x + 20, y + 162, ENCRE) + ligneDeTexte(courant(17), '12 images', x + 20, y + 190, PALE)
        : `<rect x="${x + 20}" y="${y + 148}" width="118" height="12" rx="6" fill="rgb(22 24 27 / 0.5)"/>` + barres(x + 20, y + 174, 74, 1, 0, 'rgb(22 24 27 / 0.16)'))
    morceaux.push(carteFlottante(x, y, l, h, 3, interieur))
  }
  // Une liste, avant la sortie.
  {
    const [x, y, l, h] = [702, 304, 262, 226]
    const bande = `<rect x="${x}" y="${y + 16}" width="4" height="${h - 32}" rx="2" fill="${VERT}"/>`
    const taches: [string, boolean][] = [
      ['La toile', true],
      ['Les notes riches', true],
      ['Le travail à plusieurs', false],
      ["L'app de bureau", false],
    ]
    const lignes = taches
      .map(([t, faite], i) => {
        const cy = y + 92 + i * 34
        const texte = mots
          ? ligneDeTexte(courant(18), t, x + 54, cy + 6.5, faite ? '#9aa1a9' : ENCRE) + (faite ? `<rect x="${x + 54}" y="${cy - 1}" width="${arrondi(mesurer(courant(18), t))}" height="1.6" fill="#9aa1a9"/>` : '')
          : barres(x + 54, cy - 4.5, [96, 132, 156, 118][i]!, 1, 0, faite ? 'rgb(22 24 27 / 0.1)' : 'rgb(22 24 27 / 0.18)')
        return caseDeListe(x + 24, cy, faite) + texte
      })
      .join('')
    const titreListe = mots ? ligneDeTexte(gras(21), 'Avant la sortie', x + 24, y + 52, ENCRE) : `<rect x="${x + 24}" y="${y + 36}" width="140" height="12" rx="6" fill="rgb(22 24 27 / 0.5)"/>`
    morceaux.push(carteFlottante(x, y, l, h, 2, bande + titreListe + lignes))
  }
  // Une toile dans la toile.
  {
    const corps = gras(18)
    const [x, y, h] = [982, 312, 60]
    const l = Math.round(12 + 34 + 12 + mesurer(corps, 'Voyage au Japon') + 18)
    const icone = `<rect x="${x + 12}" y="${y + 13}" width="34" height="34" rx="8.5" fill="#3a76df"/>`
    const nom = mots ? ligneDeTexte(corps, 'Voyage au Japon', x + 58, y + 36.5, ENCRE) : `<rect x="${x + 58}" y="${y + 25}" width="112" height="11" rx="5.5" fill="rgb(22 24 27 / 0.5)"/>`
    morceaux.push(carteFlottante(x, y, l, h, -3, icone + nom))
  }
  // Une note rose, en bas.
  {
    const [x, y, l, h] = [996, 414, 186, 100]
    const interieur = mots
      ? lignesDeTexte(courant(18), couper(courant(18), 'Glisser, déposer, relier.', l - 40, 3), x + 20, y + 44, 26, ENCRE)
      : barres(x + 20, y + 30, l - 40, 3, 20, 'rgb(22 24 27 / 0.16)')
    morceaux.push(carteFlottante(x, y, l, h, 4, interieur, '#fce8ef'))
  }
  // Ce qui distingue l'image : le cadenas d'une toile privée, la flèche de qui arrive par l'invitation.
  if (genre === 'toile') {
    const [cx, cy] = [946, 290]
    morceaux.push(
      `<g filter="url(#ombre)"><circle cx="${cx}" cy="${cy}" r="50" fill="#fff"/></g>` +
        `<rect x="${cx - 17}" y="${cy - 4}" width="34" height="26" rx="6" fill="${ENCRE}"/>` +
        `<path d="M${cx - 10} ${cy - 4}v-8a10 10 0 0 1 20 0v8" fill="none" stroke="${ENCRE}" stroke-width="4.2" stroke-linecap="round"/>` +
        `<circle cx="${cx}" cy="${cy + 7}" r="3.6" fill="#fff"/><rect x="${cx - 1.6}" y="${cy + 8}" width="3.2" height="7" rx="1.6" fill="#fff"/>`,
    )
  }
  if (genre === 'invitation') morceaux.push(curseur(918, 254, 'Vous', ACCENT))
  return morceaux.join('\n')
}

/** Le curseur d'une personne sur la toile, et son nom, comme sur le site. */
function curseur(x: number, y: number, nom: string, couleur: string): string {
  const corps = gras(19)
  const largeur = Math.round(mesurer(corps, nom) + 26)
  const capitales = (corps.police.capitales * corps.taille) / corps.police.unites
  return `<g filter="url(#ombre)"><path d="M${x} ${y}l0 38 10.8-10.2 7 15.9 6.4-2.8-6.9-15.6 15-.8z" fill="${couleur}" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/></g>
<rect x="${x + 26}" y="${y + 38}" width="${largeur}" height="34" rx="10" fill="${couleur}"/>
${ligneDeTexte(corps, nom, x + 39, y + 55 + capitales / 2, '#fff')}`
}

// ---- Le plan d'une toile (lien visiteur) ----

/** Les largeurs des barres d'une note, d'une ligne à l'autre (celles des vignettes). */
const PARTS = [0.92, 0.78, 0.86, 0.6, 0.84, 0.7]
const fondNote = (couleur: string) => FONDS_NOTE[couleur] ?? '#fff'
const ENTIERE = { x: 0, y: 0, largeur: 1, hauteur: 1 }
const couchee = (p: PhotoMontree) => p.rotation === 90 || p.rotation === 270
const proportions = (p: PhotoMontree) => {
  const r = p.recadrage ?? ENTIERE
  const q = (p.largeur * r.largeur) / (p.hauteur * r.hauteur)
  return couchee(p) ? 1 / q : q
}

/** Où poser une photo dans sa boîte, comme `placerDansLaBoite` (apps/web/src/bibliotheque/Vignettes.tsx). */
function placerPhoto(p: PhotoMontree, [x, y, l, h]: BoitePlan) {
  const r = p.recadrage ?? ENTIERE
  const q = proportions(p)
  const [lm, hm] = l / h > q ? [l, l / q] : [h * q, h]
  const [lp, hp] = couchee(p) ? [hm, lm] : [lm, hm]
  const [li, hi] = [lp / r.largeur, hp / r.hauteur]
  const miroir = p.miroirH || p.miroirV ? ` scale(${p.miroirH ? -1 : 1} ${p.miroirV ? -1 : 1})` : ''
  const tour = p.rotation ? ` rotate(${p.rotation})` : ''
  return `x="${arrondi(-lp / 2 - r.x * li)}" y="${arrondi(-hp / 2 - r.y * hi)}" width="${arrondi(li)}" height="${arrondi(hi)}" transform="translate(${arrondi(x + l / 2)} ${arrondi(y + h / 2)})${miroir}${tour}"`
}

const barresPlan = (x: number, y: number, l: number, n: number, couleur = 'rgb(50 59 74 / 0.26)', pas = 2.6) =>
  Array.from({ length: n }, (_, i) => `<rect x="${arrondi(x)}" y="${arrondi(y + i * pas)}" width="${arrondi(Math.max(2, l * PARTS[i % PARTS.length]!))}" height="1.1" rx="0.55" fill="${couleur}"/>`).join('')

/** Une boîte du plan, dessinée selon ce qu'elle est : le dessin de `Boite` dans les vignettes de la bibliothèque. */
function boiteDuPlan(b: BoitePlan, photos: ReadonlyMap<string, string> | undefined, n: number): string {
  const [x, y, l, h, couleur, type = 'note', lignes = 1, fichier, photo] = b
  const trait = 'stroke="rgb(27 37 54 / 0.12)" stroke-width="0.35"'
  const photoVue = type === 'image' && fichier ? photos?.get(fichier) : undefined
  if (photoVue) {
    const montree: PhotoMontree = photo ?? { largeur: l, hauteur: h }
    return `<clipPath id="photo-${n}"><rect x="${x}" y="${y}" width="${l}" height="${h}" rx="0.8"/></clipPath><g clip-path="url(#photo-${n})"><rect x="${x}" y="${y}" width="${l}" height="${h}" fill="#cfd4da"/><image href="${photoVue}" ${placerPhoto(montree, b)} preserveAspectRatio="xMidYMid slice"/></g>`
  }
  switch (type) {
    case 'colonne': {
      const cartes = Math.max(0, Math.min(lignes, Math.floor((h - 5) / 9)))
      return (
        `<rect x="${x}" y="${y}" width="${l}" height="${h}" rx="1.2" fill="${couleur ? fondNote(couleur) : 'rgb(50 59 74 / 0.12)'}"/>` +
        `<rect x="${x + 1.6}" y="${y + 1.6}" width="${Math.min(l * 0.45, 12)}" height="1.4" rx="0.7" fill="rgb(50 59 74 / 0.55)"/>` +
        Array.from({ length: cartes }, (_, i) => `<rect x="${x + 1.5}" y="${y + 5 + i * 9}" width="${l - 3}" height="7.6" rx="0.7" fill="#fff" ${trait}/>${barresPlan(x + 3, y + 7.4 + i * 9, l - 7, 2)}`).join('')
      )
    }
    case 'image':
      return (
        `<rect x="${x}" y="${y}" width="${l}" height="${h}" rx="0.8" fill="#cfd4da"/>` +
        `<path d="M${x} ${arrondi(y + h * 0.82)}L${arrondi(x + l * 0.32)} ${arrondi(y + h * 0.5)}L${arrondi(x + l * 0.52)} ${arrondi(y + h * 0.7)}L${arrondi(x + l * 0.7)} ${arrondi(y + h * 0.56)}L${x + l} ${arrondi(y + h * 0.84)}V${y + h}H${x}Z" fill="#b3bac3"/>` +
        `<circle cx="${arrondi(x + l * 0.72)}" cy="${arrondi(y + h * 0.28)}" r="${arrondi(Math.min(l, h) * 0.08)}" fill="#e6e9ec"/>`
      )
    case 'dessin':
      return `<path d="M${arrondi(x + l * 0.1)} ${arrondi(y + h * 0.62)}C${arrondi(x + l * 0.28)} ${arrondi(y + h * 0.08)} ${arrondi(x + l * 0.42)} ${arrondi(y + h * 0.95)} ${arrondi(x + l * 0.6)} ${arrondi(y + h * 0.45)}S${arrondi(x + l * 0.84)} ${arrondi(y + h * 0.22)} ${arrondi(x + l * 0.9)} ${arrondi(y + h * 0.55)}" fill="none" stroke="rgb(50 59 74 / 0.5)" stroke-width="${arrondi(Math.max(0.5, Math.min(l, h) * 0.07))}" stroke-linecap="round"/>`
    case 'tableau': {
      const c = Math.max(1, Math.min(l, h - 3.5))
      const [cx, fond] = [x + (l - c) / 2, couleur && FONDS_NOTE[couleur] ? FONDS_NOTE[couleur] : CARTE_TOILE]
      return (
        `<rect x="${arrondi(cx)}" y="${y}" width="${arrondi(c)}" height="${arrondi(c)}" rx="${arrondi(c * 0.2)}" fill="${fond}"/>` +
        `<rect x="${arrondi(cx + c * 0.2)}" y="${arrondi(y + c * 0.24)}" width="${arrondi(c * 0.6)}" height="${arrondi(c * 0.18)}" rx="0.5" fill="#fff" opacity="0.85"/>` +
        `<rect x="${arrondi(cx + c * 0.2)}" y="${arrondi(y + c * 0.5)}" width="${arrondi(c * 0.27)}" height="${arrondi(c * 0.27)}" rx="0.5" fill="#fff" opacity="0.85"/>` +
        `<rect x="${arrondi(cx + c * 0.53)}" y="${arrondi(y + c * 0.5)}" width="${arrondi(c * 0.27)}" height="${arrondi(c * 0.27)}" rx="0.5" fill="#fff" opacity="0.85"/>` +
        `<rect x="${arrondi(x + l * 0.2)}" y="${arrondi(y + c + 1.6)}" width="${arrondi(l * 0.6)}" height="1.2" rx="0.6" fill="rgb(50 59 74 / 0.4)"/>`
      )
    }
    case 'arbre': {
      const branches = ['#e5534b', '#ef8a2b', '#d6b11d']
      return (
        `<rect x="${x}" y="${y}" width="${l}" height="${h}" rx="1" fill="#fff" ${trait}/>` +
        [-0.28, 0, 0.28]
          .map(
            (d, i) =>
              `<path d="M${arrondi(x + l * 0.5)} ${arrondi(y + h / 2)}C${arrondi(x + l * 0.65)} ${arrondi(y + h / 2)} ${arrondi(x + l * 0.65)} ${arrondi(y + h * (0.5 + d))} ${arrondi(x + l * 0.78)} ${arrondi(y + h * (0.5 + d))}h${arrondi(l * 0.12)}" fill="none" stroke="${branches[i]}" stroke-width="0.5"/>`,
          )
          .join('') +
        `<rect x="${arrondi(x + l * 0.3)}" y="${arrondi(y + h / 2 - 1.8)}" width="${arrondi(l * 0.26)}" height="3.6" rx="1" fill="#323b4a"/>`
      )
    }
    case 'document':
      return (
        `<rect x="${x}" y="${y}" width="${l}" height="${h}" rx="0.8" fill="#fff" ${trait}/>` +
        `<rect x="${x + 2}" y="${y + 2.2}" width="${arrondi(l * 0.5)}" height="1.6" rx="0.8" fill="rgb(50 59 74 / 0.7)"/>` +
        barresPlan(x + 2, y + 5.6, l - 4, Math.max(1, Math.floor((h - 7) / 2.4)), undefined, 2.4)
      )
    case 'table':
      return (
        `<rect x="${x}" y="${y}" width="${l}" height="${h}" rx="0.6" fill="#fff" ${trait}/>` +
        `<rect x="${x}" y="${y}" width="${l}" height="${arrondi(Math.min(4, h / 4))}" fill="rgb(50 59 74 / 0.08)"/>` +
        [1, 2, 3].map((k) => `<path d="M${arrondi(x + (l * k) / 4)} ${y}V${y + h}M${x} ${arrondi(y + (h * k) / 4)}H${x + l}" ${trait}/>`).join('')
      )
    default: {
      const n = Math.max(1, Math.min(lignes, Math.floor((h - 2.4) / 2.6)))
      return (
        `<rect x="${x}" y="${y}" width="${l}" height="${h}" rx="0.8" fill="${fondNote(couleur)}" ${trait}/>` +
        barresPlan(x + 2, y + (h - (n - 1) * 2.6 - 1.1) / 2, l - 4, n, couleur in FONDS_NOTE ? 'rgb(27 37 54 / 0.3)' : 'rgb(50 59 74 / 0.26)')
      )
    }
  }
}

/** Au plus tant d'UG de large dans le plan : au-delà, on montre le coin où la toile commence. */
const PLAN_LARGEUR_MAX = 150

/**
 * La partie de la toile que le plan montre, en UG : toute la toile si elle est petite, sinon son coin de départ, à une
 * échelle où l'on reconnaît ses cartes. Le même calcul que `PlanToile`, aux proportions `rapport` du cadre (0 : celles
 * de la toile).
 */
export function vueDuPlan(boites: readonly BoitePlan[], rapport: number): { gauche: number; haut: number; l: number; h: number } {
  if (boites.length === 0) return { gauche: 0, haut: 0, l: 100, h: 100 / (rapport || 1) }
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y, l, h] of boites) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x + l), Math.max(y1, y + h)]
  const marge = 8
  let [l, h] = [Math.max(x1 - x0, 60) + 2 * marge, Math.max(y1 - y0, 50) + 2 * marge]
  if (!rapport) return { gauche: x0 - marge, haut: y0 - marge, l, h }
  if (l / h > rapport) h = l / rapport
  else l = h * rapport
  const rogne = l > PLAN_LARGEUR_MAX
  if (rogne) [l, h] = [PLAN_LARGEUR_MAX, PLAN_LARGEUR_MAX / rapport]
  const [gauche, haut] = rogne ? [x0 - marge, y0 - marge] : [(x0 + x1) / 2 - l / 2, (y0 + y1) / 2 - h / 2]
  return { gauche, haut, l, h }
}

/** L'épaisseur du cadre blanc autour du plan. */
const BORD = 14
/** Au plus tant de photos dans le plan : les autres gardent le dessin d'une photo. */
export const PHOTOS_MAX = 12

/**
 * Le cadre du plan, à droite de la carte : la vignette de la toile dans la bibliothèque, en grand. Sa largeur est
 * fixe, sa hauteur suit les proportions de la toile (une frise reste une frise) ; `vue` est la partie de la toile qu'il
 * montre, `echelle` des UG aux pixels, et `visibles` les boîtes qui y paraissent.
 */
export function cadreDuPlan(boites: readonly BoitePlan[]) {
  const [l, cx, cy, hMin, hMax] = [500, 916, 306, 300, 476]
  const il = l - 2 * BORD
  // Une toile vide : un cadre en largeur, qui ne promet pas de place à remplir.
  let rapport = il / (hMin - 2 * BORD)
  if (boites.length) {
    const naturel = vueDuPlan(boites, 0)
    rapport = Math.min(rapport, Math.max(il / (hMax - 2 * BORD), naturel.l / naturel.h))
  }
  const ih = Math.round(il / rapport)
  const h = ih + 2 * BORD
  const [x, y] = [cx - l / 2, Math.round(cy - h / 2)]
  const vue = vueDuPlan(boites, il / ih)
  const visibles = boites.filter((b) => b[0] < vue.gauche + vue.l && b[0] + b[2] > vue.gauche && b[1] < vue.haut + vue.h && b[1] + b[3] > vue.haut)
  return { x, y, l, h, ix: x + BORD, iy: y + BORD, il, ih, vue, echelle: il / vue.l, visibles }
}

/** Les photos que montre le plan, et la taille à laquelle il les montre (en pixels de la carte). */
export function photosDuPlan(boites: readonly BoitePlan[]): { fichier: string; largeur: number; hauteur: number }[] {
  const { visibles, echelle } = cadreDuPlan(boites)
  const vues = new Map<string, { fichier: string; largeur: number; hauteur: number }>()
  for (const [, , l, h, , type, , fichier, photo] of visibles) {
    if (type !== 'image' || !fichier || vues.size >= PHOTOS_MAX) continue
    // Recadrée ou tournée, la photo entière est plus grande que sa boîte : on la garde assez grande pour la partie montrée.
    const r = photo?.recadrage
    const agrandie = r ? 1 / Math.min(r.largeur, r.hauteur) : 1
    const [largeur, hauteur] = [Math.ceil(l * echelle * agrandie), Math.ceil(h * echelle * agrandie)]
    const deja = vues.get(fichier)
    if (!deja || deja.largeur < largeur) vues.set(fichier, { fichier, largeur, hauteur })
  }
  return [...vues.values()]
}

function planDeLaToile(carte: Carte): string {
  const boites = carte.boites ?? []
  const { x, y, l, h, ix, iy, il, ih, vue, echelle, visibles } = cadreDuPlan(boites)
  let plan = ''
  if (visibles.length) {
    plan = `<g transform="translate(${ix} ${iy}) scale(${arrondi(echelle * 1e4) / 1e4}) translate(${arrondi(-vue.gauche)} ${arrondi(-vue.haut)})">${visibles.map((b, n) => boiteDuPlan(b, carte.photos, n)).join('')}</g>`
  } else {
    const corps = courant(22)
    const vide = 'Une toile encore vide'
    plan = ligneDeTexte(corps, vide, arrondi(ix + il / 2 - mesurer(corps, vide) / 2), iy + ih / 2 + 8, PALE)
  }
  return `<g transform="rotate(-2 ${x + l / 2} ${y + h / 2})">
<rect x="${x}" y="${y}" width="${l}" height="${h}" rx="20" fill="#fff" filter="url(#ombre)"/>
<clipPath id="interieur"><rect x="${ix}" y="${iy}" width="${il}" height="${ih}" rx="11"/></clipPath>
<g clip-path="url(#interieur)">
<rect x="${ix}" y="${iy}" width="${il}" height="${ih}" fill="#ebedee"/>
<pattern id="points-plan" x="${ix}" y="${iy}" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="9" cy="9" r="1.2" fill="#c4c8ce"/></pattern>
<rect x="${ix}" y="${iy}" width="${il}" height="${ih}" fill="url(#points-plan)"/>
${plan}
</g>
</g>`
}

/** La carte, rendue : un PNG, ou un JPEG quand le plan porte des photos (un PNG de photos passerait les 300 Ko de WhatsApp). */
export async function rendreLaCarte(carte: Carte): Promise<{ octets: Buffer; type: 'image/png' | 'image/jpeg' }> {
  const image = sharp(Buffer.from(svgDeLaCarte(carte)), { density: 72 }).resize(LARGEUR, HAUTEUR)
  if (carte.photos?.size) return { octets: await image.flatten({ background: FOND }).jpeg({ quality: 86, optimiseCoding: true, chromaSubsampling: '4:4:4' }).toBuffer(), type: 'image/jpeg' }
  // En couleurs pleines : une palette de 256 couleurs fait des anneaux dans les dégradés, et n'y gagne presque rien.
  // (`effort` ou `quality` y mèneraient : `sharp` passe alors en palette.)
  return { octets: await image.flatten({ background: FOND }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer(), type: 'image/png' }
}

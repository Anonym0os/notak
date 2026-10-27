/**
 * L'écran se touche-t-il du doigt (un téléphone, une tablette) plutôt qu'à la souris ? Ce que la page dit alors de
 * ses gestes change : on touche deux fois au lieu de double-cliquer, et ni ⌘S ni « / » ne veulent rien dire sans
 * clavier. Une tablette avec clavier et pavé reste au doigt : c'est son pointeur premier.
 */
export const auDoigt = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches


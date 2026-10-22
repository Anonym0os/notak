//! Le cœur de Notak : un tableau, ses éléments, la caméra qui le regarde,
//! la sélection et l'historique. Rien ici ne dépend de l'interface.

pub mod camera;
pub mod geometrie;
pub mod historique;
pub mod selection;
pub mod tableau;

/// Points d'écran par unité de grille, à 100 %.
pub const PX_PAR_UG: f32 = 10.0;

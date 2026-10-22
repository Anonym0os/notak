use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::geometrie::Point;

pub type Id = Ulid;

/// Largeur par défaut d'une note, en unités de grille.
pub const LARGEUR_NOTE: i32 = 34;
/// Hauteur d'une note vide, en unités de grille.
pub const HAUTEUR_NOTE_MIN: i32 = 8;
/// Une position ne s'éloigne jamais plus de ça de l'origine.
pub const POSITION_MAX: i32 = 15_000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Contenu {
    Note { texte: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Element {
    pub id: Id,
    /// Coin haut-gauche, en unités de grille entières.
    pub x: i32,
    pub y: i32,
    pub largeur: i32,
    pub contenu: Contenu,
}

impl Element {
    pub fn note(x: i32, y: i32, texte: impl Into<String>) -> Self {
        Self {
            id: Ulid::generate(),
            x: borner(x),
            y: borner(y),
            largeur: LARGEUR_NOTE,
            contenu: Contenu::Note { texte: texte.into() },
        }
    }

    pub fn position(&self) -> Point {
        Point::new(self.x as f32, self.y as f32)
    }
}

pub fn borner(v: i32) -> i32 {
    v.clamp(-POSITION_MAX, POSITION_MAX)
}

/// Arrondit une position libre à l'unité de grille.
pub fn aimanter(p: Point) -> (i32, i32) {
    (borner(p.x.round() as i32), borner(p.y.round() as i32))
}

/// Un geste élémentaire. Chacun a son inverse, ce qui fait l'historique.
#[derive(Debug, Clone, PartialEq)]
pub enum Operation {
    Creer(Element),
    Supprimer(Element),
    Deplacer { id: Id, de: (i32, i32), vers: (i32, i32) },
    Texte { id: Id, avant: String, apres: String },
}

impl Operation {
    pub fn inverse(&self) -> Operation {
        match self {
            Operation::Creer(e) => Operation::Supprimer(e.clone()),
            Operation::Supprimer(e) => Operation::Creer(e.clone()),
            Operation::Deplacer { id, de, vers } => Operation::Deplacer { id: *id, de: *vers, vers: *de },
            Operation::Texte { id, avant, apres } => {
                Operation::Texte { id: *id, avant: apres.clone(), apres: avant.clone() }
            }
        }
    }
}

/// Un tableau : ses éléments, du plus bas au plus haut dans l'empilement.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Tableau {
    pub titre: String,
    pub elements: Vec<Element>,
}

impl Tableau {
    pub fn element(&self, id: Id) -> Option<&Element> {
        self.elements.iter().find(|e| e.id == id)
    }

    fn element_mut(&mut self, id: Id) -> Option<&mut Element> {
        self.elements.iter_mut().find(|e| e.id == id)
    }

    pub fn appliquer(&mut self, op: &Operation) {
        match op {
            Operation::Creer(e) => {
                if self.element(e.id).is_none() {
                    self.elements.push(e.clone());
                }
            }
            Operation::Supprimer(e) => self.elements.retain(|x| x.id != e.id),
            Operation::Deplacer { id, vers, .. } => {
                if let Some(e) = self.element_mut(*id) {
                    e.x = borner(vers.0);
                    e.y = borner(vers.1);
                }
            }
            Operation::Texte { id, apres, .. } => {
                if let Some(Element { contenu: Contenu::Note { texte }, .. }) = self.element_mut(*id) {
                    texte.clone_from(apres);
                }
            }
        }
    }

    /// Passe ces éléments au-dessus des autres, en gardant leur ordre entre eux.
    pub fn au_premier_plan(&mut self, ids: &[Id]) {
        let (dessus, mut reste): (Vec<_>, Vec<_>) =
            self.elements.drain(..).partition(|e| ids.contains(&e.id));
        reste.extend(dessus);
        self.elements = reste;
    }

    pub fn vers_json(&self) -> String {
        serde_json::to_string_pretty(self).expect("un tableau se sérialise toujours")
    }

    pub fn depuis_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chaque_operation_suivie_de_son_inverse_rend_le_tableau_d_origine() {
        let mut t = Tableau::default();
        let note = Element::note(0, 0, "a");
        t.appliquer(&Operation::Creer(note.clone()));
        let origine = t.clone();
        let ops = [
            Operation::Deplacer { id: note.id, de: (0, 0), vers: (12, -4) },
            Operation::Texte { id: note.id, avant: "a".into(), apres: "b".into() },
            Operation::Supprimer(note.clone()),
        ];
        for op in ops {
            t.appliquer(&op);
            assert_ne!(t, origine);
            t.appliquer(&op.inverse());
            assert_eq!(t, origine, "{op:?}");
        }
    }

    #[test]
    fn une_position_est_arrondie_a_la_grille_et_bornee() {
        assert_eq!(aimanter(Point::new(3.4, -2.6)), (3, -3));
        assert_eq!(aimanter(Point::new(99_999.0, 0.0)), (POSITION_MAX, 0));
    }

    #[test]
    fn le_premier_plan_garde_l_ordre_des_elements_remontes() {
        let mut t = Tableau::default();
        let [a, b, c] = ["a", "b", "c"].map(|s| Element::note(0, 0, s));
        for e in [&a, &b, &c] {
            t.appliquer(&Operation::Creer(e.clone()));
        }
        t.au_premier_plan(&[a.id, b.id]);
        let ordre: Vec<_> = t.elements.iter().map(|e| e.id).collect();
        assert_eq!(ordre, vec![c.id, a.id, b.id]);
    }

    #[test]
    fn un_tableau_relu_depuis_son_json_est_identique() {
        let mut t = Tableau { titre: "Essai".into(), ..Default::default() };
        t.appliquer(&Operation::Creer(Element::note(4, 8, "Bonjour é")));
        assert_eq!(Tableau::depuis_json(&t.vers_json()).unwrap(), t);
    }
}

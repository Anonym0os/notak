use std::collections::BTreeSet;

use crate::geometrie::Rect;
use crate::tableau::Id;

pub type Selection = BTreeSet<Id>;

/// Ce que prend un lasso : tout élément qui touche le rectangle.
/// Avec `inverser` (Maj ou Cmd), le lasso bascule l'état de ce qu'il touche
/// par rapport à la sélection d'avant le geste.
pub fn lasso<'a>(
    zone: &Rect,
    elements: impl IntoIterator<Item = (Id, &'a Rect)>,
    avant: &Selection,
    inverser: bool,
) -> Selection {
    let touches: Selection =
        elements.into_iter().filter(|(_, r)| zone.chevauche(r)).map(|(id, _)| id).collect();
    if inverser { avant.symmetric_difference(&touches).copied().collect() } else { touches }
}

/// Un clic sur un élément. Cmd bascule l'élément ; sinon il devient la seule
/// sélection, sauf s'il en fait déjà partie (pour pouvoir glisser le groupe).
pub fn cliquer(selection: &Selection, id: Id, basculer: bool) -> Selection {
    let mut s = selection.clone();
    if basculer {
        if !s.remove(&id) {
            s.insert(id);
        }
    } else if !s.contains(&id) {
        s = Selection::from([id]);
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometrie::Point;
    use ulid::Ulid;

    fn carre(x: f32) -> Rect {
        Rect::depuis_taille(Point::new(x, 0.0), 10.0, 10.0)
    }

    #[test]
    fn le_lasso_prend_ce_qu_il_touche_et_inverse_avec_maj() {
        let (a, b, c) = (Ulid::generate(), Ulid::generate(), Ulid::generate());
        let rects = [(a, carre(0.0)), (b, carre(20.0)), (c, carre(40.0))];
        let zone = Rect::depuis_coins(Point::new(5.0, 5.0), Point::new(25.0, 6.0));
        let iter = || rects.iter().map(|(id, r)| (*id, r));

        assert_eq!(lasso(&zone, iter(), &Selection::new(), false), Selection::from([a, b]));
        let avant = Selection::from([b, c]);
        assert_eq!(lasso(&zone, iter(), &avant, true), Selection::from([a, c]));
    }

    #[test]
    fn cliquer_un_element_deja_choisi_garde_le_groupe() {
        let (a, b) = (Ulid::generate(), Ulid::generate());
        let groupe = Selection::from([a, b]);
        assert_eq!(cliquer(&groupe, a, false), groupe);
        assert_eq!(cliquer(&groupe, a, true), Selection::from([b]));
        assert_eq!(cliquer(&Selection::from([b]), a, false), Selection::from([a]));
    }
}

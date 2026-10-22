use crate::tableau::{Operation, Tableau};

/// Au-delà, on oublie les plus anciens pas, jusqu'à en garder `PAS_GARDES`.
const PAS_MAX: usize = 500;
const PAS_GARDES: usize = 400;

/// Annuler et rétablir. Un pas regroupe toutes les opérations d'un même geste :
/// un déplacement de groupe s'annule d'un coup.
#[derive(Debug, Default)]
pub struct Historique {
    annuler: Vec<Vec<Operation>>,
    retablir: Vec<Vec<Operation>>,
}

impl Historique {
    /// Applique un geste au tableau et l'inscrit dans l'historique.
    pub fn faire(&mut self, tableau: &mut Tableau, pas: Vec<Operation>) {
        if pas.is_empty() {
            return;
        }
        for op in &pas {
            tableau.appliquer(op);
        }
        self.inscrire(pas);
    }

    /// Inscrit un geste déjà appliqué (un glisser, appliqué au fil du mouvement).
    pub fn inscrire(&mut self, pas: Vec<Operation>) {
        if pas.is_empty() {
            return;
        }
        self.annuler.push(pas);
        self.retablir.clear();
        if self.annuler.len() > PAS_MAX {
            self.annuler.drain(..self.annuler.len() - PAS_GARDES);
        }
    }

    pub fn annuler(&mut self, tableau: &mut Tableau) -> bool {
        let Some(pas) = self.annuler.pop() else { return false };
        for op in pas.iter().rev() {
            tableau.appliquer(&op.inverse());
        }
        self.retablir.push(pas);
        true
    }

    pub fn retablir(&mut self, tableau: &mut Tableau) -> bool {
        let Some(pas) = self.retablir.pop() else { return false };
        for op in &pas {
            tableau.appliquer(op);
        }
        self.annuler.push(pas);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tableau::Element;

    fn deplacer(e: &Element, vers: (i32, i32)) -> Operation {
        Operation::Deplacer { id: e.id, de: (e.x, e.y), vers }
    }

    #[test]
    fn un_geste_de_groupe_s_annule_et_se_retablit_d_un_coup() {
        let mut t = Tableau::default();
        let mut h = Historique::default();
        let (a, b) = (Element::note(0, 0, "a"), Element::note(40, 0, "b"));
        h.faire(&mut t, vec![Operation::Creer(a.clone()), Operation::Creer(b.clone())]);
        let avant = t.clone();
        h.faire(&mut t, vec![deplacer(&a, (5, 5)), deplacer(&b, (45, 5))]);
        let apres = t.clone();

        assert!(h.annuler(&mut t));
        assert_eq!(t, avant);
        assert!(h.retablir(&mut t));
        assert_eq!(t, apres);
    }

    #[test]
    fn un_nouveau_geste_efface_ce_qu_on_pouvait_retablir() {
        let mut t = Tableau::default();
        let mut h = Historique::default();
        let a = Element::note(0, 0, "a");
        h.faire(&mut t, vec![Operation::Creer(a.clone())]);
        h.annuler(&mut t);
        h.faire(&mut t, vec![Operation::Creer(Element::note(1, 1, "b"))]);
        assert!(!h.retablir(&mut t));
    }

    #[test]
    fn l_historique_oublie_les_plus_vieux_pas() {
        let mut t = Tableau::default();
        let mut h = Historique::default();
        for i in 0..=PAS_MAX {
            h.faire(&mut t, vec![Operation::Creer(Element::note(i as i32, 0, ""))]);
        }
        let mut n = 0;
        while h.annuler(&mut t) {
            n += 1;
        }
        assert_eq!(n, PAS_GARDES);
    }
}

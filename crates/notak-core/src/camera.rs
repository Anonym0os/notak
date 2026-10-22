//! Ce que la fenêtre montre du tableau : où l'on regarde et à quelle échelle.
//!
//! Le tableau se compte en unités de grille (UG), l'écran en points.
//! À l'échelle 1, une UG fait `PX_PAR_UG` points.

use crate::PX_PAR_UG;
use crate::geometrie::{Point, Rect};

pub const ECHELLE_MAX: f32 = 3.0;
/// Le zoom arrière s'arrête au plus tard ici, plus bas si le contenu l'exige.
pub const ECHELLE_MIN_PLAFOND: f32 = 0.4;
/// Marge autour du contenu pour calculer le zoom arrière minimal, en part de la vue.
const MARGE_ECHELLE_MIN: f32 = 0.2;
/// Crans du clavier au-dessus de 100 %.
const CRANS_DESSUS: [f32; 4] = [1.2, 1.5, 2.0, 3.0];
/// Un geste de zoom s'arrête quand plus rien n'arrive pendant ce temps, en secondes.
const FIN_DE_GESTE: f64 = 0.25;
/// Ajuster : plafonds selon que le contenu tient ou non à 100 %.
const AJUSTER_PETIT_MAX: f32 = 1.3;
const AJUSTER_GRAND_MAX: f32 = 0.8;
/// Marge autour du contenu ajusté, en points d'écran.
const MARGE_AJUSTER: f32 = 80.0;
pub const DUREE_AJUSTER: f64 = 0.6;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Camera {
    /// Le point du tableau au coin haut-gauche de la vue.
    pub origine: Point,
    pub echelle: f32,
}

impl Default for Camera {
    fn default() -> Self {
        Self { origine: Point::new(0.0, 0.0), echelle: 1.0 }
    }
}

/// La taille de la vue, en points.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vue {
    pub largeur: f32,
    pub hauteur: f32,
}

impl Vue {
    pub fn centre(&self) -> Point {
        Point::new(self.largeur / 2.0, self.hauteur / 2.0)
    }
}

impl Camera {
    fn points_par_ug(&self) -> f32 {
        PX_PAR_UG * self.echelle
    }

    pub fn vers_ecran(&self, p: Point) -> Point {
        let k = self.points_par_ug();
        Point::new((p.x - self.origine.x) * k, (p.y - self.origine.y) * k)
    }

    pub fn vers_tableau(&self, p: Point) -> Point {
        let k = self.points_par_ug();
        Point::new(p.x / k + self.origine.x, p.y / k + self.origine.y)
    }

    /// Une longueur d'écran, en UG.
    pub fn en_ug(&self, points: f32) -> f32 {
        points / self.points_par_ug()
    }

    /// Déplace la vue d'un décalage d'écran (la molette, un glisser de la toile).
    pub fn defiler(&mut self, dx: f32, dy: f32) {
        let k = self.points_par_ug();
        self.origine = Point::new(self.origine.x - dx / k, self.origine.y - dy / k);
    }

    /// Change d'échelle en gardant immobile le point d'écran `fixe`.
    pub fn echelle_autour(&mut self, echelle: f32, fixe: Point) {
        let sous = self.vers_tableau(fixe);
        self.echelle = echelle;
        let k = self.points_par_ug();
        self.origine = Point::new(sous.x - fixe.x / k, sous.y - fixe.y / k);
    }

    /// Le centre de la vue, sur le tableau.
    pub fn centre(&self, vue: Vue) -> Point {
        self.vers_tableau(vue.centre())
    }

    /// Une caméra centrée sur `centre` à cette échelle.
    pub fn centree(centre: Point, echelle: f32, vue: Vue) -> Self {
        let k = PX_PAR_UG * echelle;
        Self {
            origine: Point::new(centre.x - vue.largeur / 2.0 / k, centre.y - vue.hauteur / 2.0 / k),
            echelle,
        }
    }
}

/// L'échelle la plus basse permise : celle où tout le contenu tient, marge comprise,
/// sans dépasser `ECHELLE_MIN_PLAFOND`.
pub fn echelle_min(contenu: Option<Rect>, vue: Vue) -> f32 {
    let Some(c) = contenu else { return ECHELLE_MIN_PLAFOND };
    let utile = 1.0 - 2.0 * MARGE_ECHELLE_MIN;
    let tient = (vue.largeur * utile / (c.largeur() * PX_PAR_UG))
        .min(vue.hauteur * utile / (c.hauteur() * PX_PAR_UG));
    tient.min(ECHELLE_MIN_PLAFOND)
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Cote {
    Dessous,
    Dessus,
}

/// Un geste de zoom ne franchit pas 100 % : il faut s'arrêter puis recommencer.
/// L'inertie d'un trackpad ne traverse donc pas 100 % par accident.
#[derive(Debug, Default)]
pub struct GesteZoom {
    cote: Option<Cote>,
    dernier: f64,
}

impl GesteZoom {
    /// La nouvelle échelle après un pas de zoom de `facteur`, reçu à l'instant `maintenant`.
    pub fn appliquer(&mut self, echelle: f32, facteur: f32, min: f32, maintenant: f64) -> f32 {
        if maintenant - self.dernier > FIN_DE_GESTE {
            self.cote = None;
        }
        self.dernier = maintenant;
        let cote = *self.cote.get_or_insert(if echelle < 1.0 - f32::EPSILON {
            Cote::Dessous
        } else if echelle > 1.0 + f32::EPSILON || facteur > 1.0 {
            Cote::Dessus
        } else {
            Cote::Dessous
        });
        let voulue = echelle * facteur;
        match cote {
            Cote::Dessous => voulue.clamp(min.min(1.0), 1.0),
            Cote::Dessus => voulue.clamp(1.0, ECHELLE_MAX),
        }
    }
}

/// Le point d'écran qui reste immobile pendant un zoom : le curseur au-dessus de 100 %,
/// le centre de la vue en dessous.
pub fn point_fixe(nouvelle: f32, curseur: Point, vue: Vue) -> Point {
    if nouvelle > 1.0 { curseur } else { vue.centre() }
}

fn crans(min: f32) -> Vec<f32> {
    let mut c: Vec<f32> = (1..4).rev().map(|k| min.powf(k as f32 / 4.0)).collect();
    c.insert(0, min);
    c.push(1.0);
    c.extend(CRANS_DESSUS);
    c
}

/// Le cran du clavier juste au-dessus de l'échelle actuelle.
pub fn cran_dessus(echelle: f32, min: f32) -> f32 {
    crans(min).into_iter().find(|c| *c > echelle + 1e-3).unwrap_or(ECHELLE_MAX)
}

/// Le cran du clavier juste au-dessous de l'échelle actuelle.
pub fn cran_dessous(echelle: f32, min: f32) -> f32 {
    crans(min).into_iter().rev().find(|c| *c < echelle - 1e-3).unwrap_or(min)
}

/// La caméra qui cadre tout le contenu. `None` sur un tableau vide.
pub fn ajuster(contenu: Option<Rect>, vue: Vue) -> Option<Camera> {
    let c = contenu?;
    let tient = ((vue.largeur - 2.0 * MARGE_AJUSTER) / (c.largeur() * PX_PAR_UG))
        .min((vue.hauteur - 2.0 * MARGE_AJUSTER) / (c.hauteur() * PX_PAR_UG))
        .max(0.01);
    let echelle = if tient >= 1.0 { tient.min(AJUSTER_PETIT_MAX) } else { tient.min(AJUSTER_GRAND_MAX) };
    Some(Camera::centree(c.centre(), echelle, vue))
}

/// Ajuster une seconde fois ramène à 100 % : vrai si l'on est déjà à l'échelle ajustée.
pub fn deja_ajuste(camera: &Camera, cible: &Camera) -> bool {
    (camera.echelle / cible.echelle - 1.0).abs() < 0.01
}

/// Courbe d'accélération de Bézier (0,645 ; 0,045 ; 0,355 ; 1), pour `t` entre 0 et 1.
pub fn adoucir(t: f64) -> f64 {
    let (x1, y1, x2, y2) = (0.645, 0.045, 0.355, 1.0);
    let bezier = |a: f64, b: f64, s: f64| 3.0 * a * s * (1.0 - s).powi(2) + 3.0 * b * s * s * (1.0 - s) + s.powi(3);
    let t = t.clamp(0.0, 1.0);
    let (mut bas, mut haut) = (0.0, 1.0);
    for _ in 0..40 {
        let milieu = (bas + haut) / 2.0;
        if bezier(x1, x2, milieu) < t { bas = milieu } else { haut = milieu }
    }
    bezier(y1, y2, (bas + haut) / 2.0)
}

/// Un passage animé d'une caméra à une autre.
#[derive(Debug, Clone, Copy)]
pub struct Animation {
    depart: Camera,
    cible: Camera,
    debut: f64,
}

impl Animation {
    pub fn new(depart: Camera, cible: Camera, debut: f64) -> Self {
        Self { depart, cible, debut }
    }

    /// La caméra à l'instant `maintenant`, et vrai quand l'animation est finie.
    pub fn a(&self, maintenant: f64, vue: Vue) -> (Camera, bool) {
        let t = (maintenant - self.debut) / DUREE_AJUSTER;
        if t >= 1.0 {
            return (self.cible, true);
        }
        let k = adoucir(t) as f32;
        let (c0, c1) = (self.depart.centre(vue), self.cible.centre(vue));
        let centre = Point::new(c0.x + (c1.x - c0.x) * k, c0.y + (c1.y - c0.y) * k);
        let echelle = self.depart.echelle * (self.cible.echelle / self.depart.echelle).powf(k);
        (Camera::centree(centre, echelle, vue), false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const VUE: Vue = Vue { largeur: 1000.0, hauteur: 800.0 };

    fn proche(a: f32, b: f32) -> bool {
        (a - b).abs() < 1e-3
    }

    #[test]
    fn un_point_va_a_l_ecran_et_en_revient() {
        let c = Camera { origine: Point::new(-12.0, 7.5), echelle: 1.7 };
        let p = Point::new(33.0, -4.0);
        let r = c.vers_tableau(c.vers_ecran(p));
        assert!(proche(r.x, p.x) && proche(r.y, p.y));
    }

    #[test]
    fn le_zoom_garde_immobile_le_point_fixe() {
        let mut c = Camera { origine: Point::new(3.0, 3.0), echelle: 1.0 };
        let fixe = Point::new(420.0, 130.0);
        let avant = c.vers_tableau(fixe);
        c.echelle_autour(2.0, fixe);
        let apres = c.vers_tableau(fixe);
        assert!(proche(avant.x, apres.x) && proche(avant.y, apres.y));
    }

    #[test]
    fn un_geste_de_zoom_s_arrete_a_100_pour_cent() {
        let mut g = GesteZoom::default();
        let mut e = 0.8;
        for i in 0..20 {
            e = g.appliquer(e, 1.1, 0.4, i as f64 * 0.016);
        }
        assert_eq!(e, 1.0, "le premier geste bute sur 100 %");
        let e = g.appliquer(e, 1.1, 0.4, 2.0);
        assert!(e > 1.0, "un nouveau geste repart au-dessus");
    }

    #[test]
    fn un_geste_de_dezoom_parti_de_100_reste_dessous() {
        let mut g = GesteZoom::default();
        let e = g.appliquer(1.0, 0.9, 0.4, 0.0);
        assert!(e < 1.0);
        assert_eq!(g.appliquer(e, 10.0, 0.4, 0.01), 1.0);
    }

    #[test]
    fn le_zoom_arriere_minimal_fait_tenir_le_contenu_et_plafonne() {
        let petit = Rect::depuis_taille(Point::new(0.0, 0.0), 10.0, 10.0);
        assert_eq!(echelle_min(Some(petit), VUE), ECHELLE_MIN_PLAFOND);
        let immense = Rect::depuis_taille(Point::new(0.0, 0.0), 2000.0, 100.0);
        let m = echelle_min(Some(immense), VUE);
        assert!(proche(m, 1000.0 * 0.6 / 20_000.0));
    }

    #[test]
    fn les_crans_du_clavier_montent_et_descendent_dans_l_ordre() {
        assert!(proche(cran_dessus(1.0, 0.4), 1.2));
        assert!(proche(cran_dessus(1.3, 0.4), 1.5));
        assert!(proche(cran_dessus(3.0, 0.4), 3.0));
        assert!(proche(cran_dessous(1.2, 0.4), 1.0));
        let sous = cran_dessous(1.0, 0.4);
        assert!(sous < 1.0 && sous > 0.4);
        assert!(proche(cran_dessous(0.41, 0.4), 0.4));
    }

    #[test]
    fn ajuster_plafonne_selon_la_taille_du_contenu() {
        let petit = Rect::depuis_taille(Point::new(0.0, 0.0), 10.0, 10.0);
        assert!(proche(ajuster(Some(petit), VUE).unwrap().echelle, 1.3));
        let moyen = Rect::depuis_taille(Point::new(0.0, 0.0), 90.0, 10.0);
        assert!(proche(ajuster(Some(moyen), VUE).unwrap().echelle, 0.8));
        assert!(ajuster(None, VUE).is_none());
    }

    #[test]
    fn la_camera_ajustee_centre_le_contenu() {
        let c = Rect::depuis_taille(Point::new(100.0, -50.0), 40.0, 20.0);
        let cam = ajuster(Some(c), VUE).unwrap();
        let centre = cam.centre(VUE);
        assert!(proche(centre.x, 120.0) && proche(centre.y, -40.0));
    }

    #[test]
    fn la_courbe_part_de_zero_et_finit_a_un() {
        assert!(adoucir(0.0).abs() < 1e-6);
        assert!((adoucir(1.0) - 1.0).abs() < 1e-6);
        assert!(adoucir(0.25) < 0.25 && adoucir(0.75) > 0.75);
    }

    #[test]
    fn l_animation_finit_sur_sa_cible() {
        let depart = Camera::default();
        let cible = Camera::centree(Point::new(50.0, 50.0), 2.0, VUE);
        let anim = Animation::new(depart, cible, 10.0);
        let (milieu, fini) = anim.a(10.3, VUE);
        assert!(!fini && milieu.echelle > 1.0 && milieu.echelle < 2.0);
        assert_eq!(anim.a(11.0, VUE), (cible, true));
    }
}

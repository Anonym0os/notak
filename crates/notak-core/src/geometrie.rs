use serde::{Deserialize, Serialize};

/// Un point du tableau, en unités de grille.
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

impl Point {
    pub const fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }
}

impl std::ops::Add for Point {
    type Output = Point;
    fn add(self, o: Point) -> Point {
        Point::new(self.x + o.x, self.y + o.y)
    }
}

impl std::ops::Sub for Point {
    type Output = Point;
    fn sub(self, o: Point) -> Point {
        Point::new(self.x - o.x, self.y - o.y)
    }
}

/// Un rectangle aligné sur les axes, coin haut-gauche et coin bas-droit.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub min: Point,
    pub max: Point,
}

impl Rect {
    pub fn depuis_coins(a: Point, b: Point) -> Self {
        Self {
            min: Point::new(a.x.min(b.x), a.y.min(b.y)),
            max: Point::new(a.x.max(b.x), a.y.max(b.y)),
        }
    }

    pub fn depuis_taille(min: Point, largeur: f32, hauteur: f32) -> Self {
        Self { min, max: Point::new(min.x + largeur, min.y + hauteur) }
    }

    pub fn largeur(&self) -> f32 {
        self.max.x - self.min.x
    }

    pub fn hauteur(&self) -> f32 {
        self.max.y - self.min.y
    }

    pub fn centre(&self) -> Point {
        Point::new((self.min.x + self.max.x) / 2.0, (self.min.y + self.max.y) / 2.0)
    }

    pub fn contient(&self, p: Point) -> bool {
        p.x >= self.min.x && p.x <= self.max.x && p.y >= self.min.y && p.y <= self.max.y
    }

    /// Vrai si les deux rectangles se touchent, même d'un bord.
    pub fn chevauche(&self, o: &Rect) -> bool {
        self.min.x <= o.max.x && o.min.x <= self.max.x && self.min.y <= o.max.y && o.min.y <= self.max.y
    }

    pub fn union(&self, o: &Rect) -> Rect {
        Rect {
            min: Point::new(self.min.x.min(o.min.x), self.min.y.min(o.min.y)),
            max: Point::new(self.max.x.max(o.max.x), self.max.y.max(o.max.y)),
        }
    }

    pub fn englobant<'a>(rects: impl IntoIterator<Item = &'a Rect>) -> Option<Rect> {
        rects.into_iter().copied().reduce(|a, b| a.union(&b))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deux_rectangles_qui_se_touchent_d_un_bord_se_chevauchent() {
        let a = Rect::depuis_taille(Point::new(0.0, 0.0), 10.0, 10.0);
        let bord = Rect::depuis_taille(Point::new(10.0, 0.0), 5.0, 5.0);
        let loin = Rect::depuis_taille(Point::new(10.5, 0.0), 5.0, 5.0);
        assert!(a.chevauche(&bord));
        assert!(!a.chevauche(&loin));
    }

    #[test]
    fn les_coins_dans_n_importe_quel_ordre_donnent_le_meme_rectangle() {
        let a = Rect::depuis_coins(Point::new(5.0, 1.0), Point::new(1.0, 5.0));
        assert_eq!(a.min, Point::new(1.0, 1.0));
        assert_eq!(a.max, Point::new(5.0, 5.0));
    }
}

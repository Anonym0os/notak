//! La toile : afficher le tableau, zoomer, défiler, sélectionner, déplacer.

use std::collections::HashMap;

use eframe::egui::{
    self, Align2, Color32, CornerRadius, CursorIcon, FontId, Key, Modifiers, PointerButton, Pos2, Stroke,
    StrokeKind, Vec2,
};
use eframe::epaint::Shadow;
use notak_core::PX_PAR_UG;
use notak_core::camera::{self, Animation, Camera, GesteZoom, Vue};
use notak_core::geometrie::{Point, Rect};
use notak_core::historique::Historique;
use notak_core::selection::{self, Selection};
use notak_core::tableau::{Contenu, Element, HAUTEUR_NOTE_MIN, Id, Operation, Tableau, aimanter};

use crate::stockage;

const FOND: Color32 = Color32::from_rgb(0xEE, 0xEF, 0xF1);
const POINT_GRILLE: Color32 = Color32::from_rgb(0xC9, 0xCC, 0xD1);
const CARTE: Color32 = Color32::WHITE;
const TEXTE: Color32 = Color32::from_rgb(0x1F, 0x23, 0x28);
const ACCENT: Color32 = Color32::from_rgb(0x2F, 0x6F, 0xEB);
const LASSO_FOND: Color32 = Color32::from_rgba_premultiplied(0x2F, 0x6F, 0xEB, 0x14);
/// Marge intérieure d'une note, en UG.
const MARGE_NOTE: f32 = 2.0;
const TAILLE_TEXTE: f32 = 14.0;
/// Le tableau s'écrit au plus souvent une fois par seconde.
const DELAI_ECRITURE: f64 = 1.0;

enum Geste {
    Rien,
    /// Glisser la toile : espace maintenue, ou bouton du milieu.
    Attraper { dernier: Pos2 },
    Lasso { depart: Point, avant: Selection, inverser: bool },
    Glisser { depart: Point, initiales: Vec<(Id, (i32, i32))>, axe: Option<Axe> },
}

#[derive(Clone, Copy, PartialEq)]
enum Axe {
    Horizontal,
    Vertical,
}

struct Edition {
    id: Id,
    avant: String,
    texte: String,
}

pub struct Toile {
    tableau: Tableau,
    historique: Historique,
    camera: Camera,
    animation: Option<Animation>,
    geste_zoom: GesteZoom,
    selection: Selection,
    geste: Geste,
    lasso_courant: Option<Point>,
    edition: Option<Edition>,
    /// Hauteur mesurée de chaque note, en UG : elle dépend de son texte.
    hauteurs: HashMap<Id, f32>,
    modifie_depuis: Option<f64>,
}

impl Toile {
    pub fn new(_cc: &eframe::CreationContext<'_>) -> Self {
        Self {
            tableau: stockage::lire(),
            historique: Historique::default(),
            camera: Camera::default(),
            animation: None,
            geste_zoom: GesteZoom::default(),
            selection: Selection::new(),
            geste: Geste::Rien,
            lasso_courant: None,
            edition: None,
            hauteurs: HashMap::new(),
            modifie_depuis: None,
        }
    }

    fn rect(&self, e: &Element) -> Rect {
        let h = self.hauteurs.get(&e.id).copied().unwrap_or(HAUTEUR_NOTE_MIN as f32);
        Rect::depuis_taille(e.position(), e.largeur as f32, h)
    }

    fn contenu(&self) -> Option<Rect> {
        let rects: Vec<Rect> = self.tableau.elements.iter().map(|e| self.rect(e)).collect();
        Rect::englobant(&rects)
    }

    /// L'élément le plus haut sous ce point du tableau.
    fn sous(&self, p: Point) -> Option<Id> {
        self.tableau.elements.iter().rev().find(|e| self.rect(e).contient(p)).map(|e| e.id)
    }

    fn faire(&mut self, pas: Vec<Operation>, maintenant: f64) {
        self.historique.faire(&mut self.tableau, pas);
        self.modifie(maintenant);
    }

    fn modifie(&mut self, maintenant: f64) {
        self.modifie_depuis.get_or_insert(maintenant);
        self.selection.retain(|id| self.tableau.element(*id).is_some());
    }

    fn ecrire_si_besoin(&mut self, maintenant: f64, forcer: bool) {
        if let Some(depuis) = self.modifie_depuis
            && (forcer || maintenant - depuis > DELAI_ECRITURE)
        {
            if let Err(e) = stockage::ecrire(&self.tableau) {
                eprintln!("notak : le tableau n'a pas pu être écrit : {e}");
            }
            self.modifie_depuis = None;
        }
    }

    fn commencer_edition(&mut self, id: Id) {
        if let Some(Element { contenu: Contenu::Note { texte }, .. }) = self.tableau.element(id) {
            self.edition = Some(Edition { id, avant: texte.clone(), texte: texte.clone() });
            self.selection = Selection::from([id]);
        }
    }

    fn finir_edition(&mut self, maintenant: f64) {
        if let Some(Edition { id, avant, texte }) = self.edition.take()
            && avant != texte
        {
            self.faire(vec![Operation::Texte { id, avant, apres: texte }], maintenant);
        }
    }

    fn zoomer_vers(&mut self, echelle: f32, fixe: Point) {
        self.animation = None;
        self.camera.echelle_autour(echelle, fixe);
    }

    fn ajuster(&mut self, vue: Vue, maintenant: f64) {
        let Some(cible) = camera::ajuster(self.contenu(), vue) else { return };
        let cible = if camera::deja_ajuste(&self.camera, &cible) {
            Camera::centree(self.camera.centre(vue), 1.0, vue)
        } else {
            cible
        };
        self.animation = Some(Animation::new(self.camera, cible, maintenant));
    }

    fn deplacer_selection(&mut self, dx: i32, dy: i32, maintenant: f64) {
        let pas = self
            .tableau
            .elements
            .iter()
            .filter(|e| self.selection.contains(&e.id))
            .map(|e| Operation::Deplacer { id: e.id, de: (e.x, e.y), vers: (e.x + dx, e.y + dy) })
            .collect();
        self.faire(pas, maintenant);
    }

    fn clavier(&mut self, ctx: &egui::Context, vue: Vue, maintenant: f64) {
        let cmd = |k| ctx.input_mut(|i| i.consume_key(Modifiers::COMMAND, k));
        // Cmd+Maj+Z d'abord : Cmd+Z le prendrait aussi.
        let retablir = ctx.input_mut(|i| i.consume_key(Modifiers::COMMAND | Modifiers::SHIFT, Key::Z)) || cmd(Key::Y);
        if retablir && self.historique.retablir(&mut self.tableau) {
            self.modifie(maintenant);
        }
        if cmd(Key::Z) {
            self.finir_edition(maintenant);
            if self.historique.annuler(&mut self.tableau) {
                self.modifie(maintenant);
            }
        }
        let min = camera::echelle_min(self.contenu(), vue);
        if cmd(Key::Equals) || cmd(Key::Plus) {
            self.zoomer_vers(camera::cran_dessus(self.camera.echelle, min), vue.centre());
        }
        if cmd(Key::Minus) {
            self.zoomer_vers(camera::cran_dessous(self.camera.echelle, min), vue.centre());
        }
        if cmd(Key::Num0) {
            self.zoomer_vers(1.0, vue.centre());
        }

        if self.edition.is_some() {
            if ctx.input(|i| i.key_pressed(Key::Escape)) {
                self.finir_edition(maintenant);
            }
            return;
        }

        if cmd(Key::A) {
            self.selection = self.tableau.elements.iter().map(|e| e.id).collect();
        }
        let maj = ctx.input(|i| i.modifiers.shift);
        let touche = |k| ctx.input(|i| i.key_pressed(k) && !i.modifiers.command);
        if touche(Key::Escape) {
            self.selection.clear();
        }
        if touche(Key::Z) {
            self.ajuster(vue, maintenant);
        }
        if touche(Key::Enter) && self.selection.len() == 1 {
            let id = *self.selection.first().expect("une sélection d'un élément");
            self.commencer_edition(id);
        }
        if (touche(Key::Delete) || touche(Key::Backspace)) && !self.selection.is_empty() {
            let pas = self
                .tableau
                .elements
                .iter()
                .filter(|e| self.selection.contains(&e.id))
                .map(|e| Operation::Supprimer(e.clone()))
                .collect();
            self.faire(pas, maintenant);
        }
        let pas = if maj { 5 } else { 1 };
        for (k, dx, dy) in [(Key::ArrowLeft, -pas, 0), (Key::ArrowRight, pas, 0), (Key::ArrowUp, 0, -pas), (Key::ArrowDown, 0, pas)]
        {
            if touche(k) && !self.selection.is_empty() {
                self.deplacer_selection(dx, dy, maintenant);
            }
        }
    }

    fn souris(&mut self, ui: &egui::Ui, origine: Pos2, vue: Vue, maintenant: f64, survol_edition: bool) {
        let ctx = ui.ctx();
        let local = |p: Pos2| Point::new(p.x - origine.x, p.y - origine.y);
        let (pointeur, mods, espace) =
            ctx.input(|i| (i.pointer.hover_pos(), i.modifiers, i.key_down(Key::Space) && self.edition.is_none()));

        // Molette et pincement.
        let (zoom, defil) = ctx.input(|i| (i.zoom_delta(), i.smooth_scroll_delta));
        if let Some(p) = pointeur {
            if zoom != 1.0 {
                let min = camera::echelle_min(self.contenu(), vue);
                let e = self.geste_zoom.appliquer(self.camera.echelle, zoom, min, maintenant);
                self.zoomer_vers(e, camera::point_fixe(e, local(p), vue));
            } else if defil != Vec2::ZERO {
                self.animation = None;
                self.camera.defiler(defil.x, defil.y);
            }
        }

        let (presse, double, droit, milieu, relache) = ctx.input(|i| {
            (
                i.pointer.primary_pressed(),
                i.pointer.button_double_clicked(PointerButton::Primary),
                i.pointer.secondary_pressed(),
                i.pointer.button_pressed(PointerButton::Middle),
                i.pointer.any_released(),
            )
        });

        // Un appui et son relâchement peuvent arriver dans la même image : le geste part
        // du point d'appui, pas de là où se trouve le pointeur maintenant.
        let appui = ctx.input(|i| i.pointer.press_origin()).or(pointeur);
        if let Some(p) = appui.filter(|_| !survol_edition) {
            let ici = self.camera.vers_tableau(local(p));
            if double {
                self.finir_edition(maintenant);
                match self.sous(ici) {
                    Some(id) => self.commencer_edition(id),
                    None => {
                        let (x, y) = aimanter(ici);
                        let note = Element::note(x, y, "");
                        let id = note.id;
                        self.faire(vec![Operation::Creer(note)], maintenant);
                        self.commencer_edition(id);
                    }
                }
                self.geste = Geste::Rien;
            } else if milieu || (presse && espace) {
                self.geste = Geste::Attraper { dernier: p };
            } else if presse {
                self.finir_edition(maintenant);
                match self.sous(ici) {
                    Some(id) => {
                        self.selection = selection::cliquer(&self.selection, id, mods.command);
                        if self.selection.contains(&id) {
                            let initiales = self
                                .tableau
                                .elements
                                .iter()
                                .filter(|e| self.selection.contains(&e.id))
                                .map(|e| (e.id, (e.x, e.y)))
                                .collect();
                            self.geste = Geste::Glisser { depart: ici, initiales, axe: None };
                        }
                    }
                    None => {
                        let inverser = mods.shift || mods.command;
                        let avant = if inverser { self.selection.clone() } else { Selection::new() };
                        self.selection = avant.clone();
                        self.geste = Geste::Lasso { depart: ici, avant, inverser };
                    }
                }
            } else if droit && self.sous(ici).is_none() {
                self.selection.clear();
            }
        }

        let rects: Vec<(Id, Rect)> = if matches!(self.geste, Geste::Lasso { .. }) {
            self.tableau.elements.iter().map(|e| (e.id, self.rect(e))).collect()
        } else {
            Vec::new()
        };
        match &mut self.geste {
            Geste::Rien => {}
            Geste::Attraper { dernier } => {
                if let Some(p) = pointeur {
                    let d = p - *dernier;
                    self.camera.defiler(d.x, d.y);
                    *dernier = p;
                }
            }
            Geste::Lasso { depart, avant, inverser } => {
                if let Some(p) = pointeur {
                    let ici = self.camera.vers_tableau(local(p));
                    let zone = Rect::depuis_coins(*depart, ici);
                    self.selection = selection::lasso(&zone, rects.iter().map(|(id, r)| (*id, r)), avant, *inverser);
                    self.lasso_courant = Some(ici);
                }
            }
            Geste::Glisser { depart, initiales, axe } => {
                if let Some(p) = pointeur {
                    let ici = self.camera.vers_tableau(local(p));
                    let mut d = ici - *depart;
                    if mods.shift {
                        *axe = Some(choisir_axe(*axe, d));
                        match axe {
                            Some(Axe::Horizontal) => d.y = 0.0,
                            Some(Axe::Vertical) => d.x = 0.0,
                            None => {}
                        }
                    } else {
                        *axe = None;
                    }
                    for (id, (x, y)) in initiales.iter() {
                        let vers = aimanter(Point::new(*x as f32, *y as f32) + d);
                        self.tableau.appliquer(&Operation::Deplacer { id: *id, de: (*x, *y), vers });
                    }
                }
            }
        }

        if relache {
            if let Geste::Glisser { initiales, .. } = std::mem::replace(&mut self.geste, Geste::Rien) {
                let pas: Vec<Operation> = initiales
                    .iter()
                    .filter_map(|(id, de)| {
                        let e = self.tableau.element(*id)?;
                        (*de != (e.x, e.y)).then_some(Operation::Deplacer { id: *id, de: *de, vers: (e.x, e.y) })
                    })
                    .collect();
                if !pas.is_empty() {
                    let ids: Vec<Id> = initiales.iter().map(|(id, _)| *id).collect();
                    self.tableau.au_premier_plan(&ids);
                    self.historique.inscrire(pas);
                    self.modifie(maintenant);
                }
            }
            self.geste = Geste::Rien;
            self.lasso_courant = None;
        }

        let icone = match self.geste {
            Geste::Attraper { .. } => CursorIcon::Grabbing,
            Geste::Glisser { .. } => CursorIcon::Grabbing,
            _ if espace => CursorIcon::Grab,
            _ => CursorIcon::Default,
        };
        if icone != CursorIcon::Default {
            ctx.set_cursor_icon(icone);
        }
    }

    fn dessiner(&mut self, ui: &mut egui::Ui, origine: Pos2, vue: Vue) {
        let painter = ui.painter().clone();
        let ecran = |p: Point| {
            let s = self.camera.vers_ecran(p);
            Pos2::new(origine.x + s.x, origine.y + s.y)
        };
        let echelle = self.camera.echelle;
        let k = PX_PAR_UG * echelle;

        // La grille ne se montre qu'à 100 %.
        if (echelle - 1.0).abs() < 1e-3 && self.animation.is_none() {
            let haut_gauche = self.camera.vers_tableau(Point::new(0.0, 0.0));
            let (x0, y0) = (haut_gauche.x.floor() as i32, haut_gauche.y.floor() as i32);
            let (nx, ny) = ((vue.largeur / k) as i32 + 2, (vue.hauteur / k) as i32 + 2);
            for gy in y0..y0 + ny {
                for gx in x0..x0 + nx {
                    let p = ecran(Point::new(gx as f32, gy as f32));
                    painter.rect_filled(egui::Rect::from_center_size(p, Vec2::splat(1.5)), 0.0, POINT_GRILLE);
                }
            }
        }

        let police = FontId::proportional(TAILLE_TEXTE * echelle);
        let marge = MARGE_NOTE * k;
        let ids: Vec<Id> = self.tableau.elements.iter().map(|e| e.id).collect();
        for id in ids {
            let Some(e) = self.tableau.element(id).cloned() else { continue };
            let Contenu::Note { texte } = &e.contenu;
            let largeur = e.largeur as f32 * k;
            let en_edition = self.edition.as_ref().is_some_and(|ed| ed.id == id);
            let affiche = if en_edition { self.edition.as_ref().map(|ed| ed.texte.clone()).unwrap_or_default() } else { texte.clone() };
            let galee = painter.layout(affiche, police.clone(), TEXTE, (largeur - 2.0 * marge).max(1.0));
            let hauteur_ug = ((galee.size().y + 2.0 * marge) / k).max(HAUTEUR_NOTE_MIN as f32);
            self.hauteurs.insert(id, hauteur_ug);

            let min = ecran(e.position());
            let r = egui::Rect::from_min_size(min, Vec2::new(largeur, hauteur_ug * k));
            if !ui.clip_rect().intersects(r) {
                continue;
            }
            let ombre = Shadow { offset: [0, 1], blur: 6, spread: 0, color: Color32::from_black_alpha(28) };
            painter.add(ombre.as_shape(r, CornerRadius::same(2)));
            painter.rect_filled(r, CornerRadius::same(2), CARTE);
            if self.selection.contains(&id) {
                painter.rect_stroke(r, CornerRadius::same(2), Stroke::new(2.0, ACCENT), StrokeKind::Outside);
            }
            if !en_edition {
                painter.galley(r.min + Vec2::splat(marge), galee, TEXTE);
            }
        }

        // Le texte en cours d'édition, posé sur sa note.
        if let Some(ed) = &mut self.edition
            && let Some(e) = self.tableau.element(ed.id)
        {
            let h = self.hauteurs.get(&ed.id).copied().unwrap_or(HAUTEUR_NOTE_MIN as f32);
            let min = ecran(e.position());
            let r = egui::Rect::from_min_size(min, Vec2::new(e.largeur as f32 * k, h * k)).shrink(marge);
            let id_champ = ui.scope_id().with(("edition", ed.id));
            let champ = egui::TextEdit::multiline(&mut ed.texte)
                .id(id_champ)
                .font(police.clone())
                .text_color(TEXTE)
                .frame(egui::Frame::NONE)
                .margin(egui::Margin::ZERO)
                .desired_width(r.width());
            let rep = ui.put(r, champ);
            if !rep.has_focus() && !rep.lost_focus() {
                rep.request_focus();
            }
        }

        if let (Geste::Lasso { depart, .. }, Some(ici)) = (&self.geste, self.lasso_courant) {
            let r = egui::Rect::from_two_pos(ecran(*depart), ecran(ici));
            painter.rect_filled(r, 0.0, LASSO_FOND);
            painter.rect_stroke(r, 0.0, Stroke::new(1.0, ACCENT), StrokeKind::Inside);
        }

        painter.text(
            origine + Vec2::new(vue.largeur - 16.0, vue.hauteur - 12.0),
            Align2::RIGHT_BOTTOM,
            format!("{:.0} %", echelle * 100.0),
            FontId::proportional(12.0),
            Color32::from_gray(120),
        );
    }
}

/// Le verrou d'axe de Maj : choisi d'après le plus grand déplacement, il ne bascule
/// que si l'autre axe le dépasse franchement.
fn choisir_axe(actuel: Option<Axe>, d: Point) -> Axe {
    let (ax, ay) = (d.x.abs(), d.y.abs());
    match actuel {
        Some(Axe::Horizontal) if ay < ax * 2.0 => Axe::Horizontal,
        Some(Axe::Vertical) if ax < ay * 2.0 => Axe::Vertical,
        _ if ax >= ay => Axe::Horizontal,
        _ => Axe::Vertical,
    }
}

impl eframe::App for Toile {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        ctx.options_mut(|o| o.zoom_with_keyboard = false);
        let maintenant = ctx.input(|i| i.time);
        let zone = ui.max_rect();
        let origine = zone.min;
        let vue = Vue { largeur: zone.width(), hauteur: zone.height() };

        ui.painter().rect_filled(zone, 0.0, FOND);

        if let Some(anim) = self.animation {
            let (c, fini) = anim.a(maintenant, vue);
            self.camera = c;
            if fini {
                self.animation = None;
            }
            ctx.request_repaint();
        }

        let survol_edition = self.edition.is_some()
            && ctx.input(|i| i.pointer.hover_pos()).is_some_and(|p| {
                self.edition.as_ref().and_then(|ed| self.tableau.element(ed.id)).is_some_and(|e| {
                    let r = self.rect(e);
                    let s = self.camera.vers_tableau(Point::new(p.x - origine.x, p.y - origine.y));
                    r.contient(s)
                })
            });

        self.clavier(&ctx, vue, maintenant);
        self.souris(ui, origine, vue, maintenant, survol_edition);
        self.dessiner(ui, origine, vue);
        self.ecrire_si_besoin(maintenant, false);
        if self.modifie_depuis.is_some() {
            ctx.request_repaint_after(std::time::Duration::from_secs_f64(DELAI_ECRITURE));
        }
    }

    fn on_exit(&mut self) {
        self.finir_edition(0.0);
        self.ecrire_si_besoin(0.0, true);
    }
}

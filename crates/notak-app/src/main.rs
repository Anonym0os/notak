//! L'application de bureau Notak : une toile infinie où l'on pose des notes.

mod stockage;
mod toile;

fn main() -> eframe::Result {
    let options = eframe::NativeOptions {
        viewport: eframe::egui::ViewportBuilder::default()
            .with_title("Notak")
            .with_inner_size([1280.0, 800.0])
            .with_min_inner_size([480.0, 320.0]),
        ..Default::default()
    };
    eframe::run_native("Notak", options, Box::new(|cc| Ok(Box::new(toile::Toile::new(cc)))))
}

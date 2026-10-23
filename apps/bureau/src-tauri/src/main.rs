// En production sous Windows, pas de fenêtre de console derrière l'application.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    notak_bureau_lib::run()
}

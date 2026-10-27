// swift-tools-version:5.9
// Le paquet Swift du plugin « appareil » : Tauri le compile dans l'app (`tauri ios build`) et lui fournit son API
// (`Tauri`, copiée dans `.tauri/tauri-api` au moment de la construction). Le produit porte le nom du crate
// (`notak-appareil`) : c'est celui que Tauri lie.
import PackageDescription

let package = Package(
  name: "notak-appareil",
  platforms: [.iOS(.v15)],
  products: [
    .library(name: "notak-appareil", type: .static, targets: ["notak-appareil"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(name: "notak-appareil", dependencies: [.byName(name: "Tauri")], path: "Sources")
  ]
)

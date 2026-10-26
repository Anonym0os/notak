// swift-tools-version:5.9
// Le paquet Swift du plugin « appareil » : Tauri le compile dans l'app (`tauri ios build`) et lui fournit son API
// (`Tauri`, copiée dans `.tauri/tauri-api` au moment de la construction).
import PackageDescription

let package = Package(
  name: "tauri-plugin-appareil",
  platforms: [.iOS(.v15)],
  products: [
    .library(name: "tauri-plugin-appareil", type: .static, targets: ["tauri-plugin-appareil"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(name: "tauri-plugin-appareil", dependencies: [.byName(name: "Tauri")], path: "Sources")
  ]
)

// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "OverlayApp",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "OverlayApp",
            path: "Sources/OverlayApp"
        ),
    ]
)

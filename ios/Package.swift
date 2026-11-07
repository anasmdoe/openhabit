// swift-tools-version:5.9
// The platform-neutral core (models, rules, API client), built and tested with `swift test`.
// The apps, widgets and watch targets live in project.yml (XcodeGen) and compile these same files.
import PackageDescription

let package = Package(
    name: "OpenHabitCore",
    platforms: [.macOS(.v13), .iOS(.v17), .watchOS(.v10)],
    products: [.library(name: "OpenHabitCore", targets: ["OpenHabitCore"])],
    targets: [
        .target(name: "OpenHabitCore", path: "Shared"),
        .testTarget(name: "OpenHabitCoreTests", dependencies: ["OpenHabitCore"], path: "Tests/OpenHabitCoreTests"),
    ]
)

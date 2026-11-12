import SwiftUI

@main
struct OpenHabitWatchApp: App {
    init() { WatchSync.shared.activate() }

    var body: some Scene {
        WindowGroup { WatchContentView() }
    }
}

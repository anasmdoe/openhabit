import SwiftUI
import WidgetKit

@main
struct OpenHabitApp: App {
    init() { PhoneWatchSync.shared.activate() }

    var body: some Scene {
        WindowGroup { ContentView() }
    }
}

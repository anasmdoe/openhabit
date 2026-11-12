import SwiftUI
import WidgetKit

/// Views and loading shared by the iPhone widgets and the watch complications.

struct TodayEntry: TimelineEntry {
    let date: Date
    let today: Today?
    let configured: Bool

    static let placeholder = TodayEntry(date: Date(), today: .sample, configured: true)
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        if context.isPreview { completion(.placeholder); return }
        Task { completion(await Self.load()) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        Task {
            let entry = await Self.load()
            // refresh every 30 minutes, and right after midnight for the new day
            let midnight = Calendar.current.startOfDay(for: Date().addingTimeInterval(86_400))
            let next = min(Date().addingTimeInterval(30 * 60), midnight.addingTimeInterval(60))
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }

    static func load() async -> TodayEntry {
        let settings = SettingsStore.load()
        guard settings.isConfigured else { return TodayEntry(date: Date(), today: nil, configured: false) }
        let today = try? await OpenHabitAPI(settings: settings).today()
        return TodayEntry(date: Date(), today: today, configured: true)
    }
}

/// Lock-screen and watch-face shapes: a progress ring, a two-line summary, a single line.
struct ProgressAccessoryView: View {
    @Environment(\.widgetFamily) var family
    let entry: TodayEntry

    var body: some View {
        let done = entry.today?.done ?? 0
        let total = entry.today?.total ?? 0
        switch family {
        case .accessoryCircular:
            Gauge(value: Double(done), in: 0...Double(max(total, 1))) {
                Image(systemName: "checkmark")
            } currentValueLabel: {
                Text(entry.configured ? "\(done)/\(total)" : "—")
            }
            .gaugeStyle(.accessoryCircularCapacity)
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text(entry.configured ? "\(done) of \(total) habits" : "OpenHabit").font(.headline)
                Text(entry.configured ? (entry.today?.next.map { "Next: \($0.name)" } ?? (total > 0 ? "All done" : "Nothing due")) : "Set up in the app")
                    .font(.caption).lineLimit(2)
            }
        #if os(watchOS)
        case .accessoryCorner:
            Text("\(done)/\(total)")
                .widgetLabel { Gauge(value: Double(done), in: 0...Double(max(total, 1))) { Text("Habits") } }
        #endif
        default: // .accessoryInline
            Text(entry.configured ? "\(done)/\(total) habits" + (entry.today?.next.map { " · \($0.name)" } ?? "") : "OpenHabit")
        }
    }
}

import SwiftUI
import WidgetKit

/// Today's habits on the wrist: tap to check one off, tap again to undo.
struct WatchContentView: View {
    @State private var today: Today?
    @State private var message = ""

    var body: some View {
        List {
            if !SettingsStore.load().isConfigured {
                Text("Open OpenHabit on your iPhone and tap Save to connect the watch.").font(.footnote)
            } else if let today {
                Section("\(today.done)/\(today.total) done") {
                    ForEach(today.habits) { h in
                        Button { Task { await toggle(h) } } label: {
                            HStack {
                                Image(systemName: h.completed ? "checkmark.circle.fill" : h.skipped ? "minus.circle" : "circle")
                                    .foregroundStyle(Color(hex: h.color))
                                Text(h.name).lineLimit(2).foregroundStyle(h.completed ? .secondary : .primary)
                            }
                        }
                        .disabled(h.skipped)
                    }
                    if today.habits.isEmpty { Text("Nothing due today.") }
                }
            } else {
                Text(message.isEmpty ? "Loading…" : message).font(.footnote)
            }
        }
        .navigationTitle("Habits")
        .task { await load() }
        .onAppear { WatchSync.shared.onChange = { Task { await load() } } }
    }

    private func load() async {
        guard SettingsStore.load().isConfigured else { return }
        do { today = try await OpenHabitAPI().today() } catch { message = error.localizedDescription }
    }

    private func toggle(_ h: TodayHabit) async {
        if let t = today { today = TodayLogic.toggled(t, habitId: h.id) }
        try? await OpenHabitAPI().toggle(h)
        await load()
        WidgetCenter.shared.reloadAllTimelines()
    }
}

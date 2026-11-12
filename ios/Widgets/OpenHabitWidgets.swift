import SwiftUI
import WidgetKit
import AppIntents

@main
struct OpenHabitWidgets: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        ProgressWidget()
    }
}

/// Home screen: today's habits with a tap-to-complete button each (iOS 17 interactive widgets).
struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "app.openhabit.today", provider: TodayProvider()) { entry in
            TodayWidgetView(entry: entry)
                .containerBackground(Color(red: 0.06, green: 0.10, blue: 0.08), for: .widget)
        }
        .configurationDisplayName("Today")
        .description("Today's habits. Tap one to check it off.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

/// Lock screen (and StandBy): progress ring, a summary with the next habit, or one line above the clock.
struct ProgressWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "app.openhabit.progress", provider: TodayProvider()) { entry in
            ProgressAccessoryView(entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Habit progress")
        .description("How many of today's habits are done, and what's next.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct TodayWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: TodayEntry

    var body: some View {
        if !entry.configured {
            Text("Open OpenHabit to connect your server.").font(.caption).foregroundStyle(.secondary)
        } else if let today = entry.today {
            let rows = family == .systemSmall ? 3 : family == .systemMedium ? 4 : 9
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Today").font(.headline).foregroundStyle(.white)
                    Spacer()
                    Text("\(today.done)/\(today.total)").font(.headline).foregroundStyle(Color(hex: "#6EE7B7"))
                }
                if today.habits.isEmpty {
                    Text("Nothing due today.").font(.caption).foregroundStyle(.secondary)
                }
                ForEach(today.habits.prefix(rows)) { h in
                    Button(intent: ToggleHabitIntent(habit: h)) {
                        HStack(spacing: 8) {
                            Image(systemName: h.completed ? "checkmark.circle.fill" : h.skipped ? "minus.circle" : "circle")
                                .foregroundStyle(Color(hex: h.color))
                            Text((h.afterHabitId != nil ? "↳ " : "") + h.name)
                                .font(.caption).lineLimit(1)
                                .foregroundStyle(h.completed || h.skipped ? .secondary : .primary)
                            Spacer(minLength: 0)
                            if h.streak >= 2 && family != .systemSmall { Text("🔥\(h.streak)").font(.caption2) }
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(h.skipped)
                }
                Spacer(minLength: 0)
            }
            .environment(\.colorScheme, .dark)
        } else {
            Text("Offline").font(.caption).foregroundStyle(.secondary)
        }
    }
}

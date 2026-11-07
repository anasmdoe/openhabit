import SwiftUI
import WidgetKit

/// Watch-face complications: today's progress as a ring, corner gauge, summary or one line.
@main
struct OpenHabitWatchWidgets: WidgetBundle {
    var body: some Widget { WatchProgressWidget() }
}

struct WatchProgressWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "app.openhabit.watch.progress", provider: TodayProvider()) { entry in
            ProgressAccessoryView(entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Habit progress")
        .description("How many of today's habits are done.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryRectangular, .accessoryInline])
    }
}

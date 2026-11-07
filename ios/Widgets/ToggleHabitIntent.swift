import AppIntents
import WidgetKit

/// A tap on a habit in the widget: checks it off (or undoes it) without opening the app.
struct ToggleHabitIntent: AppIntent {
    static var title: LocalizedStringResource = "Check off a habit"
    static var description = IntentDescription("Marks a habit done for today, or undoes it.")

    @Parameter(title: "Habit ID") var habitId: String
    @Parameter(title: "Habit name") var name: String
    @Parameter(title: "Already done") var completed: Bool
    @Parameter(title: "Measurable") var numeric: Bool
    @Parameter(title: "Target") var target: Double

    init() {}

    init(habit: TodayHabit) {
        habitId = habit.id
        name = habit.name
        completed = habit.completed
        numeric = habit.isNumeric
        target = habit.target
    }

    func perform() async throws -> some IntentResult {
        let habit = TodayHabit(id: habitId, name: name, type: numeric ? "numeric" : "boolean", target: target, completed: completed)
        try await OpenHabitAPI().toggle(habit)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

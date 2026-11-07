import Foundation

/// One habit due today, as returned by GET /api/v1/analytics/today.
public struct TodayHabit: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let color: String
    public let type: String
    public let unit: String
    public let target: Double
    public var value: Double?
    public var completed: Bool
    public let skipped: Bool
    public let streak: Int
    public let afterHabitId: String?

    public var isNumeric: Bool { type == "numeric" }

    public init(id: String, name: String, color: String = "#6EE7B7", type: String = "boolean", unit: String = "", target: Double = 1,
                value: Double? = nil, completed: Bool = false, skipped: Bool = false, streak: Int = 0, afterHabitId: String? = nil) {
        self.id = id; self.name = name; self.color = color; self.type = type; self.unit = unit; self.target = target
        self.value = value; self.completed = completed; self.skipped = skipped; self.streak = streak; self.afterHabitId = afterHabitId
    }
}

public struct Today: Codable, Sendable, Equatable {
    public let date: String
    public let total: Int
    public var done: Int
    public var habits: [TodayHabit]

    public init(date: String, total: Int, done: Int, habits: [TodayHabit]) {
        self.date = date; self.total = total; self.done = done; self.habits = habits
    }

    /// The first habit still open, in stacking order.
    public var next: TodayHabit? { habits.first { !$0.completed && !$0.skipped } }

    public static let sample = Today(date: "2026-11-07", total: 5, done: 2, habits: [
        TodayHabit(id: "1", name: "Wake up at 05:00", completed: true, streak: 6),
        TodayHabit(id: "2", name: "Meditation", color: "#8FB4E3", type: "numeric", unit: "min", target: 10, afterHabitId: "1"),
        TodayHabit(id: "3", name: "Reading", color: "#C792EA", type: "numeric", unit: "pages", target: 10, value: 4),
        TodayHabit(id: "4", name: "Gym", color: "#5BB5E0", completed: true, streak: 3),
        TodayHabit(id: "5", name: "No sugar", color: "#63C7B2"),
    ])
}

/// Pure rules shared by the app, the widgets and the watch (mirrors android/core TodayModel.kt).
public enum TodayLogic {
    /// A habit stacked "after" another sits directly behind it; everything else keeps the server's order.
    public static func stackOrder(_ list: [TodayHabit]) -> [TodayHabit] {
        let ids = Set(list.map(\.id))
        var followers: [String: [TodayHabit]] = [:]
        var roots: [TodayHabit] = []
        for h in list {
            if let a = h.afterHabitId, a != h.id, ids.contains(a) { followers[a, default: []].append(h) } else { roots.append(h) }
        }
        var out: [TodayHabit] = []
        var seen = Set<String>()
        func visit(_ h: TodayHabit) {
            guard seen.insert(h.id).inserted else { return }
            out.append(h)
            followers[h.id]?.forEach(visit)
        }
        roots.forEach(visit)
        list.forEach(visit) // never drop a habit, even if the data holds a loop
        return out
    }

    /// What a tap writes: nil means "undo" (the habit is already done); a measurable habit goes to its target.
    public static func valueToWrite(_ h: TodayHabit) -> Double? {
        if h.completed { return nil }
        return h.isNumeric ? h.target : 1
    }

    /// The device's calendar day as YYYY-MM-DD.
    public static func localDate(_ date: Date = Date(), calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    public static func parse(_ data: Data) throws -> Today {
        var t = try JSONDecoder().decode(Today.self, from: data)
        t.habits = stackOrder(t.habits)
        return t
    }

    /// Marks a habit done or undone locally, so a widget can redraw before the server answers.
    public static func toggled(_ t: Today, habitId: String) -> Today {
        var copy = t
        copy.habits = t.habits.map { h in
            guard h.id == habitId else { return h }
            var m = h
            m.completed.toggle()
            return m
        }
        copy.done = copy.habits.filter(\.completed).count
        return copy
    }
}

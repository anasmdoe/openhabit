import Foundation

public struct APIError: LocalizedError, Sendable {
    public let status: Int
    public let message: String
    public var errorDescription: String? { status == 0 ? message : "\(message) (HTTP \(status))" }
}

/// The calls the app, widgets and watch need, against /api/v1 with a personal API token.
public struct OpenHabitAPI: Sendable {
    public let settings: ServerSettings
    public init(settings: ServerSettings = SettingsStore.load()) { self.settings = settings }

    public func today(date: String = TodayLogic.localDate()) async throws -> Today {
        try TodayLogic.parse(try await request("GET", "/api/v1/analytics/today?today=\(date)"))
    }

    public func setValue(habitId: String, date: String, value: Double) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["habitId": habitId, "date": date, "value": value])
        _ = try await request("PUT", "/api/v1/entries", body: body)
    }

    public func clear(habitId: String, date: String) async throws {
        _ = try await request("DELETE", "/api/v1/entries/\(habitId)/\(date)")
    }

    /// Checks a habit off, or undoes it when it is already done.
    public func toggle(_ habit: TodayHabit, date: String = TodayLogic.localDate()) async throws {
        if let v = TodayLogic.valueToWrite(habit) { try await setValue(habitId: habit.id, date: date, value: v) }
        else { try await clear(habitId: habit.id, date: date) }
    }

    func request(_ method: String, _ path: String, body: Data? = nil) async throws -> Data {
        guard settings.isConfigured, let url = URL(string: settings.baseURL + path) else {
            throw APIError(status: 0, message: "Set your server and API token in the OpenHabit app")
        }
        var req = URLRequest(url: url, timeoutInterval: 10)
        req.httpMethod = method
        req.setValue("Bearer \(settings.token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body { req.httpBody = body; req.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIError(status: status, message: msg ?? "Request failed")
        }
        return data
    }
}

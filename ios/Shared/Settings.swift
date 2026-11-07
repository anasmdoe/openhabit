import Foundation

/// Where the user's OpenHabit server is, and their personal API token.
public struct ServerSettings: Codable, Equatable, Sendable {
    public var baseURL: String
    public var token: String

    public init(baseURL: String, token: String) {
        self.baseURL = ServerSettings.normalize(baseURL)
        self.token = token.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public var isConfigured: Bool { !baseURL.isEmpty && !token.isEmpty }

    /// "habits.example.com/" and "https://habits.example.com" both become "https://habits.example.com".
    public static func normalize(_ raw: String) -> String {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while s.hasSuffix("/") { s.removeLast() }
        if s.isEmpty { return "" }
        if !s.hasPrefix("http://") && !s.hasPrefix("https://") { s = "https://" + s }
        return s
    }
}

/// Settings live in the shared App Group so the widgets (and, on the watch, its complications) can read them.
public enum SettingsStore {
    public static let appGroup = "group.app.openhabit"
    private static var defaults: UserDefaults { UserDefaults(suiteName: appGroup) ?? .standard }

    public static func load() -> ServerSettings {
        ServerSettings(baseURL: defaults.string(forKey: "baseURL") ?? "", token: defaults.string(forKey: "token") ?? "")
    }

    public static func save(_ s: ServerSettings) {
        defaults.set(s.baseURL, forKey: "baseURL")
        defaults.set(s.token, forKey: "token")
    }
}

import SwiftUI
import WidgetKit

/// Settings (server and API token) plus today's habits with tap-to-complete.
struct ContentView: View {
    @State private var server = SettingsStore.load().baseURL
    @State private var token = SettingsStore.load().token
    @State private var today: Today?
    @State private var status = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://habits.example.com", text: $server)
                        .textContentType(.URL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField("Personal API token", text: $token)
                    Button(busy ? "Checking…" : "Save and test") { Task { await save() } }.disabled(busy)
                    if !status.isEmpty { Text(status).font(.footnote).foregroundStyle(.secondary) }
                } header: { Text("Your OpenHabit server") } footer: {
                    Text("Create a token in the web app under Account → API tokens. It is stored on this iPhone and your Apple Watch only.")
                }

                if let today {
                    Section("Today · \(today.done) of \(today.total) done") {
                        ForEach(today.habits) { h in
                            Button { Task { await toggle(h) } } label: {
                                HStack {
                                    Image(systemName: h.completed ? "checkmark.circle.fill" : h.skipped ? "minus.circle" : "circle")
                                        .foregroundStyle(Color(hex: h.color))
                                    Text((h.afterHabitId != nil ? "↳ " : "") + h.name).foregroundStyle(h.completed ? .secondary : .primary)
                                    Spacer()
                                    if h.streak >= 2 { Text("🔥 \(h.streak)").font(.footnote) }
                                }
                            }
                            .disabled(h.skipped)
                        }
                    }
                }

                Section {
                    Text("Add the OpenHabit widgets: long-press the Home Screen or Lock Screen → Edit → Add Widget → OpenHabit.")
                    Text("Apple Health: a Shortcuts automation can send steps, exercise and sleep every evening so habits complete themselves. See docs/iphone-shortcuts.md in the OpenHabit repository.")
                } header: { Text("More") }
                .font(.footnote)
            }
            .navigationTitle("OpenHabit")
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func save() async {
        let s = ServerSettings(baseURL: server, token: token)
        SettingsStore.save(s)
        server = s.baseURL
        PhoneWatchSync.shared.send(s)
        busy = true
        defer { busy = false }
        do {
            let t = try await OpenHabitAPI(settings: s).today()
            today = t
            status = "Connected: \(t.done) of \(t.total) habits done today."
        } catch {
            status = "Could not connect: \(error.localizedDescription)"
        }
        WidgetCenter.shared.reloadAllTimelines()
    }

    private func load() async {
        guard SettingsStore.load().isConfigured else { return }
        today = try? await OpenHabitAPI().today()
    }

    private func toggle(_ h: TodayHabit) async {
        if let t = today { today = TodayLogic.toggled(t, habitId: h.id) }
        do { try await OpenHabitAPI().toggle(h) } catch { status = error.localizedDescription }
        await load()
        WidgetCenter.shared.reloadAllTimelines()
    }
}

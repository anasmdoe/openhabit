import Foundation
import WatchConnectivity
import WidgetKit

/// Receives the server address and token from the iPhone app.
final class WatchSync: NSObject, WCSessionDelegate {
    static let shared = WatchSync()
    var onChange: (() -> Void)?

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        apply(session.receivedApplicationContext)
    }

    func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        apply(context)
    }

    private func apply(_ context: [String: Any]) {
        guard let url = context["baseURL"] as? String, let token = context["token"] as? String else { return }
        SettingsStore.save(ServerSettings(baseURL: url, token: token))
        WidgetCenter.shared.reloadAllTimelines()
        DispatchQueue.main.async { self.onChange?() }
    }
}

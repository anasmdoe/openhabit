import Foundation
import WatchConnectivity

/// Sends the server address and token to the Apple Watch app, so it never has to be typed on the watch.
final class PhoneWatchSync: NSObject, WCSessionDelegate {
    static let shared = PhoneWatchSync()

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func send(_ s: ServerSettings) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated, WCSession.default.isPaired else { return }
        try? WCSession.default.updateApplicationContext(["baseURL": s.baseURL, "token": s.token])
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        if state == .activated { send(SettingsStore.load()) }
    }
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }
}

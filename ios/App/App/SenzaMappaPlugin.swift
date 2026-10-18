// Plugin locale: Live Activity della camminata e scorciatoie Siri (vedi src/lib/platform.ts).
import Foundation
import Capacitor
import ActivityKit

/// Azione chiesta da Siri / Comandi / tasto Azione, in attesa che la pagina la prenda.
enum ShortcutInbox {
    static let didArrive = Notification.Name("SenzaMappaShortcut")
    private static var pending: (action: String, at: Date)?

    static func post(_ action: String) {
        pending = (action, Date())
        NotificationCenter.default.post(name: didArrive, object: nil)
    }

    static func take() -> (action: String, at: Date)? {
        defer { pending = nil }
        return pending
    }
}

@objc(SenzaMappaPlugin)
public class SenzaMappaPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SenzaMappaPlugin"
    public let jsName = "SenzaMappa"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "liveUpdate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "liveEnd", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeShortcut", returnType: CAPPluginReturnPromise),
    ]

    private var observer: NSObjectProtocol?

    override public func load() {
        observer = NotificationCenter.default.addObserver(forName: ShortcutInbox.didArrive, object: nil, queue: .main) { [weak self] _ in
            self?.notifyListeners("shortcut", data: [:])
        }
    }

    deinit {
        if let observer { NotificationCenter.default.removeObserver(observer) }
    }

    // --- scorciatoie ---

    @objc func takeShortcut(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let p = ShortcutInbox.take() {
                call.resolve(["action": p.action, "at": p.at.timeIntervalSince1970 * 1000])
            } else {
                call.resolve([:])
            }
        }
    }

    // --- Live Activity ---

    /// Avvia la Live Activity della camminata o, se c'è già, aggiorna i contatori.
    @objc func liveUpdate(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["active": false])
            return
        }
        guard let walkId = call.getString("walkId"), let startedAt = call.getDouble("startedAt") else {
            call.reject("walkId e startedAt servono")
            return
        }
        let attributes = WalkActivityAttributes(
            walkId: walkId,
            name: call.getString("name") ?? "",
            startedAt: Date(timeIntervalSince1970: startedAt / 1000)
        )
        let state = WalkActivityAttributes.ContentState(
            bangla: call.getInt("bangla") ?? 0,
            checkpoint: call.getInt("checkpoint") ?? 0,
            lastPointAt: Date(timeIntervalSince1970: (call.getDouble("lastPointAt") ?? startedAt) / 1000)
        )
        Task {
            var current: Activity<WalkActivityAttributes>?
            for activity in Activity<WalkActivityAttributes>.activities {
                let alive = activity.activityState == .active || activity.activityState == .stale
                if current == nil, alive, activity.attributes.walkId == walkId {
                    current = activity
                } else {
                    // giri vecchi rimasti appesi
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
            }
            let content = ActivityContent(state: state, staleDate: nil)
            if let current {
                await current.update(content)
                call.resolve(["active": true])
                return
            }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                call.resolve(["active": false])
                return
            }
            do {
                _ = try Activity.request(attributes: attributes, content: content, pushType: nil)
                call.resolve(["active": true])
            } catch {
                call.reject("Live Activity non partita: \(error.localizedDescription)")
            }
        }
    }

    @objc func liveEnd(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        Task {
            for activity in Activity<WalkActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }
}

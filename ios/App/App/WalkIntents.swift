// Siri, Comandi e tasto Azione: aprono l'app sulla camminata e premono il pulsante giusto.
// La pagina riceve l'azione da SenzaMappaPlugin (evento "shortcut") in src/screens/Camminata.tsx.
import AppIntents

@available(iOS 16.0, *)
struct CheckpointIntent: AppIntent {
    static var title: LocalizedStringResource = "Checkpoint"
    static var description = IntentDescription("Apre la camminata e segna un checkpoint dove siete.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        ShortcutInbox.post("checkpoint")
        return .result()
    }
}

@available(iOS 16.0, *)
struct BanglaIntent: AppIntent {
    static var title: LocalizedStringResource = "Bangla"
    static var description = IntentDescription("Apre la camminata e segna una sosta al bangla.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        ShortcutInbox.post("bangla")
        return .result()
    }
}

@available(iOS 17.0, *)
struct SenzaMappaShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CheckpointIntent(),
            phrases: [
                "Checkpoint su \(.applicationName)",
                "Segna un checkpoint su \(.applicationName)",
                "\(.applicationName) checkpoint",
            ],
            shortTitle: "Checkpoint",
            systemImageName: "flag.fill"
        )
        AppShortcut(
            intent: BanglaIntent(),
            phrases: [
                "Bangla su \(.applicationName)",
                "Segna un bangla su \(.applicationName)",
                "\(.applicationName) bangla",
            ],
            shortTitle: "Bangla",
            systemImageName: "mug.fill"
        )
    }
}

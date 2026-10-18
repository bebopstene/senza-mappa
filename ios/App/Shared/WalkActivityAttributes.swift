// Dati della Live Activity, condivisi tra l'app e l'estensione widget.
// Alla cieca (R4): solo tempo e contatori, mai posizione né direzioni.
import Foundation
import ActivityKit

@available(iOS 16.2, *)
struct WalkActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var bangla: Int
        var checkpoint: Int
        var lastPointAt: Date
    }

    var walkId: String
    var name: String
    var startedAt: Date
}

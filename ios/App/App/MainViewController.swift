import UIKit
import Capacitor

/// Il bridge di Capacitor con in più il plugin locale dell'app.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SenzaMappaPlugin())
    }
}

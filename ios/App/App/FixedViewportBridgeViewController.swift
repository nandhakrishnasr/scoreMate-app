import Capacitor
import UIKit

final class FixedViewportBridgeViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()

        let scrollView = webView?.scrollView
        scrollView?.minimumZoomScale = 1.0
        scrollView?.maximumZoomScale = 1.0
        scrollView?.zoomScale = 1.0
        scrollView?.bouncesZoom = false
        scrollView?.showsVerticalScrollIndicator = false
        scrollView?.showsHorizontalScrollIndicator = false
        scrollView?.isDirectionalLockEnabled = true
    }
}

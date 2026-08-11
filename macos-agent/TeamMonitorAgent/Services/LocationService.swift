import CoreLocation

// Fetches device location once on first request, caches result, discards manager.
// Subsequent calls return the cached value immediately — zero ongoing CPU/memory.
final class LocationService: NSObject, CLLocationManagerDelegate {
    static let shared = LocationService()

    private var manager: CLLocationManager?
    private var continuation: CheckedContinuation<CLLocationCoordinate2D?, Never>?

    // Cached result — persisted across calls
    private(set) var cachedCoordinate: CLLocationCoordinate2D?

    private override init() { super.init() }

    // Returns cached coordinate immediately if available; otherwise fetches once.
    func fetchIfNeeded() async -> CLLocationCoordinate2D? {
        if let cached = cachedCoordinate { return cached }
        return await fetch()
    }

    private func fetch() async -> CLLocationCoordinate2D? {
        await withCheckedContinuation { cont in
            self.continuation = cont
            let mgr = CLLocationManager()
            mgr.delegate = self
            mgr.desiredAccuracy = kCLLocationAccuracyThreeKilometers
            self.manager = mgr

            switch mgr.authorizationStatus {
            case .notDetermined:
                mgr.requestWhenInUseAuthorization()
            case .authorized, .authorizedAlways:
                mgr.requestLocation()
            default:
                // Denied or restricted — resolve with nil
                cont.resume(returning: nil)
                self.continuation = nil
                self.manager = nil
            }
        }
    }

    // MARK: — CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorized, .authorizedAlways:
            manager.requestLocation()
        case .denied, .restricted:
            finish(nil)
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        finish(locations.first?.coordinate)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        TMLog("[Location] fetch failed: \(error.localizedDescription)")
        finish(nil)
    }

    private func finish(_ coord: CLLocationCoordinate2D?) {
        cachedCoordinate = coord
        continuation?.resume(returning: coord)
        continuation = nil
        manager?.stopUpdatingLocation()
        manager = nil  // deallocate immediately — no ongoing tracking
    }
}

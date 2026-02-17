import AppKit
import CoreGraphics

struct SimulatorWindowInfo {
    let frame: CGRect       // macOS screen coordinates (top-left origin)
    let windowId: CGWindowID
}

class SimulatorTracker {
    private var timer: Timer?
    var onUpdate: ((SimulatorWindowInfo) -> Void)?
    var onLost: (() -> Void)?

    private(set) var currentInfo: SimulatorWindowInfo?
    private var wasFound = false

    func start() {
        updateSimulatorWindow()
        timer = Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { [weak self] _ in
            self?.updateSimulatorWindow()
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func updateSimulatorWindow() {
        guard let info = findSimulatorWindow() else {
            if wasFound {
                wasFound = false
                currentInfo = nil
                onLost?()
            }
            return
        }

        wasFound = true
        let changed = currentInfo.map { $0.frame != info.frame } ?? true
        currentInfo = info

        if changed {
            onUpdate?(info)
        }
    }

    private func findSimulatorWindow() -> SimulatorWindowInfo? {
        let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        guard let windowList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
            return nil
        }

        // Find the main Simulator window (largest one)
        var best: SimulatorWindowInfo?
        var bestArea: CGFloat = 0

        for window in windowList {
            guard let ownerName = window[kCGWindowOwnerName as String] as? String,
                  ownerName == "Simulator",
                  let boundsDict = window[kCGWindowBounds as String] as? [String: CGFloat],
                  let windowId = window[kCGWindowNumber as String] as? CGWindowID else {
                continue
            }

            let x = boundsDict["X"] ?? 0
            let y = boundsDict["Y"] ?? 0
            let width = boundsDict["Width"] ?? 0
            let height = boundsDict["Height"] ?? 0

            // Skip tiny windows (menu bar items, popups)
            guard width > 200 && height > 200 else { continue }

            let area = width * height
            if area > bestArea {
                bestArea = area
                best = SimulatorWindowInfo(
                    frame: CGRect(x: x, y: y, width: width, height: height),
                    windowId: windowId
                )
            }
        }

        return best
    }
}

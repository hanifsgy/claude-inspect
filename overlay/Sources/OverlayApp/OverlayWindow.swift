import AppKit

// MARK: - Drawing Overlay Window (transparent, ignoresMouseEvents)

class OverlayWindow: NSWindow {
    let overlayView: OverlayView
    let tooltipView: TooltipView

    private var globalMouseMonitor: Any?
    private var globalClickMonitor: Any?

    var isSelectMode: Bool = false {
        didSet {
            overlayView.isSelectMode = isSelectMode
            if isSelectMode {
                startGlobalClickMonitor()
            } else {
                stopGlobalClickMonitor()
            }
        }
    }

    init() {
        overlayView = OverlayView()
        tooltipView = TooltipView()

        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 400, height: 800),
            styleMask: .borderless,
            backing: .buffered,
            defer: false
        )

        backgroundColor = .clear
        isOpaque = false
        hasShadow = false
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        isReleasedWhenClosed = false

        // Always pass through — never block the simulator
        ignoresMouseEvents = true

        let container = NSView()
        container.wantsLayer = true
        contentView = container

        overlayView.wantsLayer = true
        tooltipView.wantsLayer = true

        container.addSubview(overlayView)
        container.addSubview(tooltipView)

        tooltipView.isHidden = true

        // Global mouse monitor for hover (works with ignoresMouseEvents=true)
        startGlobalMouseMonitor()
    }

    // MARK: - Global Mouse Monitor

    private func startGlobalMouseMonitor() {
        globalMouseMonitor = NSEvent.addGlobalMonitorForEvents(matching: .mouseMoved) { [weak self] event in
            self?.handleGlobalMouseMove()
        }
    }

    // MARK: - Global Click Monitor (select mode only)

    private func startGlobalClickMonitor() {
        globalClickMonitor = NSEvent.addGlobalMonitorForEvents(matching: .leftMouseDown) { [weak self] _ in
            self?.handleGlobalClick()
        }
    }

    private func stopGlobalClickMonitor() {
        if let monitor = globalClickMonitor {
            NSEvent.removeMonitor(monitor)
            globalClickMonitor = nil
        }
    }

    private func handleGlobalClick() {
        guard isVisible else { return }
        let mouseLocation = NSEvent.mouseLocation
        guard frame.contains(mouseLocation) else { return }

        let windowPoint = convertPoint(fromScreen: mouseLocation)
        let localPoint = overlayView.convert(windowPoint, from: nil)
        if let comp = overlayView.componentHitTest(overlayPoint: localPoint) {
            overlayView.onClick?(comp)
        }
    }

    private func handleGlobalMouseMove() {
        guard isVisible else { return }

        let mouseLocation = NSEvent.mouseLocation

        // Check if mouse is within our window
        guard frame.contains(mouseLocation) else {
            clearHover()
            return
        }

        let windowPoint = convertPoint(fromScreen: mouseLocation)
        overlayView.updateHover(windowPoint: windowPoint)

        if let comp = overlayView.hoveredComponent {
            tooltipView.show(component: comp)
            positionTooltip(near: windowPoint)
        } else {
            tooltipView.isHidden = true
        }
    }

    func clearHover() {
        if overlayView.hoveredComponent != nil {
            overlayView.hoveredComponent = nil
            tooltipView.isHidden = true
        }
    }

    private func positionTooltip(near point: NSPoint) {
        let edgePadding: CGFloat = 8
        let pointerGap: CGFloat = 12
        let tooltipWidth = min(overlayView.bounds.width - edgePadding * 2, 320)

        var tf = tooltipView.frame
        tf.size.width = tooltipWidth

        let preferredX = point.x + 12
        let maxX = overlayView.bounds.width - tooltipWidth - edgePadding
        tf.origin.x = max(edgePadding, min(preferredX, maxX))

        let preferredY = point.y - tf.size.height - pointerGap
        if preferredY >= edgePadding {
            tf.origin.y = preferredY
        } else {
            tf.origin.y = min(point.y + pointerGap, overlayView.bounds.height - tf.size.height - edgePadding)
        }

        tooltipView.frame = tf
    }

    // MARK: - Layout

    func reposition(to cgFrame: CGRect) {
        guard let screen = NSScreen.main else { return }
        let screenHeight = screen.frame.height
        let nsY = screenHeight - cgFrame.origin.y - cgFrame.height

        let windowFrame = NSRect(
            x: cgFrame.origin.x,
            y: nsY,
            width: cgFrame.width,
            height: cgFrame.height
        )

        setFrame(windowFrame, display: true)

        // Overlay view covers full window
        overlayView.frame = NSRect(x: 0, y: 0, width: cgFrame.width, height: cgFrame.height)
        overlayView.needsDisplay = true
    }

    // MARK: - Save Selection

    func saveSelection(_ component: ComponentData) {
        guard let data = try? JSONEncoder().encode(component),
              let json = String(data: data, encoding: .utf8) else { return }

        let bundlePath = Bundle.main.executablePath ?? ""
        let rootDir = (bundlePath as NSString)
            .deletingLastPathComponent
            .appending("/../../../state")
        let statePath = (rootDir as NSString).standardizingPath

        try? FileManager.default.createDirectory(atPath: statePath, withIntermediateDirectories: true)
        let filePath = (statePath as NSString).appendingPathComponent("selected_component.json")
        try? json.write(toFile: filePath, atomically: true, encoding: .utf8)
    }

    deinit {
        if let monitor = globalMouseMonitor { NSEvent.removeMonitor(monitor) }
        if let monitor = globalClickMonitor { NSEvent.removeMonitor(monitor) }
    }
}

// MARK: - Status Bar Window (always interactive, separate from overlay)

class StatusBarWindow: NSWindow {
    let statusBar: StatusBarView

    init() {
        statusBar = StatusBarView()

        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 400, height: 32),
            styleMask: .borderless,
            backing: .buffered,
            defer: false
        )

        backgroundColor = .clear
        isOpaque = false
        hasShadow = false
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        isReleasedWhenClosed = false

        // Always interactive — buttons must work
        ignoresMouseEvents = false

        statusBar.wantsLayer = true
        contentView = statusBar
    }

    /// Position below the simulator window
    func reposition(simulatorFrame cgFrame: CGRect) {
        guard let screen = NSScreen.main else { return }
        let screenHeight = screen.frame.height
        let statusHeight: CGFloat = 32

        // Place at the bottom of the simulator window
        let nsY = screenHeight - cgFrame.origin.y - cgFrame.height

        let windowFrame = NSRect(
            x: cgFrame.origin.x,
            y: nsY,
            width: cgFrame.width,
            height: statusHeight
        )

        setFrame(windowFrame, display: true)
    }
}

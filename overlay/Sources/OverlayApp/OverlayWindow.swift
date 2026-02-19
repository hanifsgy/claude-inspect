import AppKit

class OverlayWindow: NSWindow {
    let overlayView: OverlayView
    let tooltipView: TooltipView

    private var globalMouseMonitor: Any?

    var isSelectMode: Bool = false {
        didSet {
            overlayView.isSelectMode = isSelectMode
            ignoresMouseEvents = !isSelectMode
        }
    }
    
    private var lastHoverTime: CFTimeInterval = 0
    private let hoverThrottleInterval: CFTimeInterval = 1.0 / 30.0

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

        ignoresMouseEvents = true

        let container = NSView()
        container.wantsLayer = true
        contentView = container

        overlayView.wantsLayer = true
        tooltipView.wantsLayer = true

        container.addSubview(overlayView)
        container.addSubview(tooltipView)

        tooltipView.isHidden = true

        startGlobalMouseMonitor()
    }

    private func startGlobalMouseMonitor() {
        globalMouseMonitor = NSEvent.addGlobalMonitorForEvents(matching: .mouseMoved) { [weak self] event in
            self?.handleGlobalMouseMove()
        }
    }

    private func handleGlobalMouseMove() {
        guard isVisible else { return }
        
        let now = CACurrentMediaTime()
        guard now - lastHoverTime >= hoverThrottleInterval else { return }
        lastHoverTime = now

        let mouseLocation = NSEvent.mouseLocation

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

        overlayView.frame = NSRect(x: 0, y: 0, width: cgFrame.width, height: cgFrame.height)
    }

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
    }
}

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
        level = NSWindow.Level.floating + 1
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        isReleasedWhenClosed = false

        ignoresMouseEvents = false

        statusBar.wantsLayer = true
        contentView = statusBar
    }

    func reposition(simulatorFrame cgFrame: CGRect) {
        guard let screen = NSScreen.main else { return }
        let screenHeight = screen.frame.height
        let statusHeight: CGFloat = 32

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

import AppKit

class OverlayView: NSView {
    var components: [ComponentData] = [] {
        didSet { needsDisplay = true }
    }

    /// iOS screen size in points (from AXe root element)
    var iosScreen: ScreenSize = ScreenSize(w: 402, h: 874) {
        didSet { needsDisplay = true }
    }

    var hoveredComponent: ComponentData? {
        didSet { needsDisplay = true }
    }

    var onHover: ((ComponentData?, NSPoint) -> Void)?
    var onClick: ((ComponentData) -> Void)?

    override var isFlipped: Bool { true }

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        wantsLayer = true
    }

    // MARK: - Dynamic Coordinate Mapping

    /// macOS simulator title bar height
    private let macTitleBar: CGFloat = 28

    /// Convert iOS point coordinates to overlay view coordinates.
    /// Computed dynamically from overlay bounds and iOS screen size.
    func iosToOverlay(_ iosRect: FrameData) -> NSRect {
        let contentHeight = bounds.height - macTitleBar
        let contentWidth = bounds.width

        guard iosScreen.w > 0, iosScreen.h > 0, contentWidth > 0, contentHeight > 0 else {
            return .zero
        }

        // Uniform scale to fit iOS screen into available area
        let scaleX = contentWidth / CGFloat(iosScreen.w)
        let scaleY = contentHeight / CGFloat(iosScreen.h)
        let scale = min(scaleX, scaleY)

        // Center within content area
        let renderedW = CGFloat(iosScreen.w) * scale
        let renderedH = CGFloat(iosScreen.h) * scale
        let offsetX = (contentWidth - renderedW) / 2
        let offsetY = macTitleBar + (contentHeight - renderedH) / 2

        return NSRect(
            x: CGFloat(iosRect.x) * scale + offsetX,
            y: CGFloat(iosRect.y) * scale + offsetY,
            width: CGFloat(iosRect.w) * scale,
            height: CGFloat(iosRect.h) * scale
        )
    }

    // MARK: - Drawing

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)

        let normalColor = NSColor(red: 0.29, green: 0.56, blue: 0.85, alpha: 0.5)
        let hoverColor = NSColor(red: 0.40, green: 0.70, blue: 1.0, alpha: 1.0)
        let hoverFill = NSColor(red: 0.40, green: 0.70, blue: 1.0, alpha: 0.08)

        for component in components {
            let rect = iosToOverlay(component.frame)
            guard rect.width > 0, rect.height > 0 else { continue }

            let isHovered = hoveredComponent?.id == component.id

            if isHovered {
                hoverFill.setFill()
                NSBezierPath(rect: rect).fill()

                hoverColor.setStroke()
                let path = NSBezierPath(rect: rect)
                path.lineWidth = 2.0
                path.stroke()
            } else {
                normalColor.setStroke()
                let path = NSBezierPath(rect: rect)
                path.lineWidth = 1.0
                path.stroke()
            }
        }
    }

    // MARK: - Hit Testing

    /// Find the smallest component under a given point (in overlay view coordinates)
    func componentHitTest(overlayPoint: NSPoint) -> ComponentData? {
        var best: ComponentData?
        var bestArea = Double.infinity

        for component in components {
            let rect = iosToOverlay(component.frame)
            if rect.contains(overlayPoint) {
                let area = Double(rect.width * rect.height)
                if area < bestArea {
                    bestArea = area
                    best = component
                }
            }
        }
        return best
    }

    /// Update hover state from a window point (called by global mouse monitor)
    func updateHover(windowPoint: NSPoint) {
        let localPoint = convert(windowPoint, from: nil)
        let component = componentHitTest(overlayPoint: localPoint)
        hoveredComponent = component
        onHover?(component, localPoint)
    }

    // MARK: - Mouse (selection mode only, triggered by parent window)

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        if let comp = componentHitTest(overlayPoint: point) {
            onClick?(comp)
        }
    }
}

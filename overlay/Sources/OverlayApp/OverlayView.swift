import AppKit

class OverlayView: NSView {
    var components: [ComponentData] = [] {
        didSet { needsDisplay = true }
    }

    /// iOS screen size in points (from AXe root element)
    var iosScreen: ScreenSize = ScreenSize(w: 402, h: 874) {
        didSet { needsDisplay = true }
    }

    /// Detected content rect: exact iOS content area within the macOS simulator window.
    /// If provided by geometry detection, used for precise coordinate mapping.
    var contentRect: ContentRect? {
        didSet { needsDisplay = true }
    }

    /// Render scale from geometry detection (iOS pts → macOS pts)
    var renderScale: Double? {
        didSet { needsDisplay = true }
    }

    var hoveredComponent: ComponentData? {
        didSet { needsDisplay = true }
    }

    var isSelectMode: Bool = false {
        didSet { needsDisplay = true }
    }

    /// Set after a click — freezes the overlay on this component until cleared.
    var lockedComponent: ComponentData? {
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

    /// Convert iOS point coordinates to overlay view coordinates.
    /// Uses detected contentRect from geometry.js when available,
    /// otherwise falls back to heuristic calculation.
    func iosToOverlay(_ iosRect: FrameData) -> NSRect {
        guard iosScreen.w > 0, iosScreen.h > 0 else { return .zero }

        let offsetX: CGFloat
        let offsetY: CGFloat
        let scale: CGFloat

        if let cr = contentRect {
            // Precise mode: use detected content rect from geometry.js
            // contentRect tells us exactly where iOS content renders within the window
            scale = CGFloat(cr.w) / CGFloat(iosScreen.w)
            offsetX = CGFloat(cr.x)
            // contentRect.y is in macOS CG coordinates (top-down), which matches our flipped view
            offsetY = CGFloat(cr.y)
        } else {
            // Fallback: estimate from window bounds
            let macTitleBar: CGFloat = 28
            let contentHeight = bounds.height - macTitleBar
            let contentWidth = bounds.width

            guard contentWidth > 0, contentHeight > 0 else { return .zero }

            let scaleX = contentWidth / CGFloat(iosScreen.w)
            let scaleY = contentHeight / CGFloat(iosScreen.h)
            scale = min(scaleX, scaleY)

            let renderedW = CGFloat(iosScreen.w) * scale
            let renderedH = CGFloat(iosScreen.h) * scale
            offsetX = (contentWidth - renderedW) / 2
            offsetY = macTitleBar + (contentHeight - renderedH) / 2
        }

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

        let isLocked = lockedComponent != nil

        let normalColor: NSColor
        let hoverColor: NSColor
        let hoverFill: NSColor

        if isLocked {
            // Dim everything so the locked component stands out
            normalColor = NSColor(red: 0.29, green: 0.56, blue: 0.85, alpha: 0.18)
            hoverColor  = normalColor
            hoverFill   = .clear
        } else if isSelectMode {
            normalColor = NSColor(red: 0.95, green: 0.60, blue: 0.10, alpha: 0.6)
            hoverColor  = NSColor(red: 1.0,  green: 0.75, blue: 0.20, alpha: 1.0)
            hoverFill   = NSColor(red: 1.0,  green: 0.75, blue: 0.20, alpha: 0.10)
        } else {
            normalColor = NSColor(red: 0.29, green: 0.56, blue: 0.85, alpha: 0.5)
            hoverColor  = NSColor(red: 0.40, green: 0.70, blue: 1.0,  alpha: 1.0)
            hoverFill   = NSColor(red: 0.40, green: 0.70, blue: 1.0,  alpha: 0.08)
        }

        for component in components {
            guard component.id != lockedComponent?.id else { continue } // drawn last
            let rect = iosToOverlay(component.frame)
            guard rect.width > 0, rect.height > 0 else { continue }

            let isHovered = !isLocked && hoveredComponent?.id == component.id

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

        // Draw locked component on top — green glow
        if let locked = lockedComponent {
            let rect = iosToOverlay(locked.frame)
            if rect.width > 0, rect.height > 0 {
                NSColor(red: 0.20, green: 0.80, blue: 0.35, alpha: 0.12).setFill()
                NSBezierPath(rect: rect).fill()
                let path = NSBezierPath(rect: rect)
                path.lineWidth = 2.5
                NSColor(red: 0.20, green: 0.80, blue: 0.35, alpha: 1.0).setStroke()
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
        guard lockedComponent == nil else { return } // frozen while locked
        let localPoint = convert(windowPoint, from: nil)
        let component = componentHitTest(overlayPoint: localPoint)
        hoveredComponent = component
        onHover?(component, localPoint)
    }

    // MARK: - Mouse (selection mode only, triggered by parent window)

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { return true }

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        if let comp = componentHitTest(overlayPoint: point) {
            onClick?(comp)
        }
    }
}

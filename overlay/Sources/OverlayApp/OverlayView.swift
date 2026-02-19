import AppKit

class OverlayView: NSView {
    private var componentLayers: [String: ComponentShapeLayer] = [:]
    private var lockedLayer: ComponentShapeLayer?
    private var hoverFillLayer: CAShapeLayer?
    
    var components: [ComponentData] = [] {
        didSet { rebuildLayers() }
    }

    var iosScreen: ScreenSize = ScreenSize(w: 402, h: 874) {
        didSet { rebuildLayers() }
    }

    var contentRect: ContentRect? {
        didSet { rebuildLayers() }
    }

    var renderScale: Double? {
        didSet { rebuildLayers() }
    }

    var hoveredComponent: ComponentData? {
        didSet { updateHoverState() }
    }

    var isSelectMode: Bool = false {
        didSet { updateAllLayerColors() }
    }

    var lockedComponent: ComponentData? {
        didSet { updateLockedState() }
    }

    var onHover: ((ComponentData?, NSPoint) -> Void)?
    var onClick: ((ComponentData) -> Void)?

    override var isFlipped: Bool { true }
    
    private var cachedTransforms: [String: NSRect] = [:]
    private var lastGeometryKey: String = ""
    private var isBatchUpdating = false

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.drawsAsynchronously = true
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        wantsLayer = true
        layer?.drawsAsynchronously = true
    }
    
    func beginBatchUpdate() {
        isBatchUpdating = true
    }
    
    func endBatchUpdate() {
        isBatchUpdating = false
        rebuildLayers()
    }

    private func geometryKey() -> String {
        let cr = contentRect.map { "\($0.x),\($0.y),\($0.w),\($0.h)" } ?? "nil"
        return "\(iosScreen.w),\(iosScreen.h)|\(cr)|\(renderScale ?? 0)|\(bounds.width),\(bounds.height)"
    }

    func iosToOverlay(_ iosRect: FrameData) -> NSRect {
        guard iosScreen.w > 0, iosScreen.h > 0 else { return .zero }

        let offsetX: CGFloat
        let offsetY: CGFloat
        let scale: CGFloat

        if let cr = contentRect {
            scale = CGFloat(cr.w) / CGFloat(iosScreen.w)
            offsetX = CGFloat(cr.x)
            offsetY = CGFloat(cr.y)
        } else {
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

    private func computeAllTransforms() {
        let key = geometryKey()
        guard key != lastGeometryKey else { return }
        lastGeometryKey = key
        cachedTransforms.removeAll(keepingCapacity: true)
        for comp in components {
            cachedTransforms[comp.id] = iosToOverlay(comp.frame)
        }
    }

    private func getCachedRect(for id: String) -> NSRect? {
        return cachedTransforms[id]
    }

    private func rebuildLayers() {
        guard !isBatchUpdating else { return }
        guard self.layer != nil else { return }
        
        computeAllTransforms()
        
        let currentIds = Set(components.map { $0.id })
        for (id, layer) in componentLayers {
            if !currentIds.contains(id) {
                layer.removeFromSuperlayer()
            }
        }
        componentLayers = componentLayers.filter { currentIds.contains($0.key) }
        
        rebuildSpatialGrid()

        for component in components {
            guard let rect = getCachedRect(for: component.id),
                  rect.width > 0, rect.height > 0 else { continue }
            
            let isHovered = hoveredComponent?.id == component.id
            let isLocked = lockedComponent?.id == component.id
            
            if let existing = componentLayers[component.id] {
                existing.update(rect: rect, component: component, isHovered: isHovered, isLocked: isLocked, isSelectMode: isSelectMode)
            } else {
                let layer = ComponentShapeLayer(component: component, rect: rect, isHovered: isHovered, isLocked: isLocked, isSelectMode: isSelectMode)
                self.layer?.addSublayer(layer)
                componentLayers[component.id] = layer
            }
        }
        
        if let locked = lockedComponent, let layer = componentLayers[locked.id] {
            layer.zPosition = 1000
        }
    }

    private func updateHoverState() {
        guard lockedComponent == nil else { return }
        
        for (id, layer) in componentLayers {
            let isHovered = hoveredComponent?.id == id
            layer.updateHover(isHovered: isHovered, isSelectMode: isSelectMode)
        }
    }

    private func updateLockedState() {
        for (id, layer) in componentLayers {
            let isLocked = lockedComponent?.id == id
            layer.updateLocked(isLocked: isLocked)
            layer.zPosition = isLocked ? 1000 : 0
        }
    }

    private func updateAllLayerColors() {
        for layer in componentLayers.values {
            layer.updateColor(isSelectMode: isSelectMode)
        }
    }

    func colorForConfidence(_ confidence: Double?, isHovered: Bool) -> NSColor {
        guard let conf = confidence else {
            return isHovered
                ? NSColor(red: 0.40, green: 0.70, blue: 1.0, alpha: 1.0)
                : NSColor(red: 0.29, green: 0.56, blue: 0.85, alpha: 0.5)
        }

        if conf >= 0.7 {
            return isHovered
                ? NSColor(red: 0.20, green: 0.85, blue: 0.40, alpha: 1.0)
                : NSColor(red: 0.20, green: 0.75, blue: 0.35, alpha: 0.6)
        } else if conf >= 0.4 {
            return isHovered
                ? NSColor(red: 1.0, green: 0.80, blue: 0.20, alpha: 1.0)
                : NSColor(red: 0.95, green: 0.70, blue: 0.15, alpha: 0.5)
        } else {
            return isHovered
                ? NSColor(red: 1.0, green: 0.35, blue: 0.35, alpha: 1.0)
                : NSColor(red: 0.90, green: 0.30, blue: 0.30, alpha: 0.5)
        }
    }

    private var spatialGrid: [[ComponentData]] = []
    private var gridCols = 0
    private var gridRows = 0
    private let gridSize: CGFloat = 50

    private func rebuildSpatialGrid() {
        guard bounds.width > 0, bounds.height > 0 else { return }
        
        gridCols = max(1, Int(ceil(bounds.width / gridSize)))
        gridRows = max(1, Int(ceil(bounds.height / gridSize)))
        spatialGrid = Array(repeating: [], count: gridCols * gridRows)
        
        for component in components {
            guard let rect = getCachedRect(for: component.id) else { continue }
            
            let minCol = max(0, Int(rect.minX / gridSize))
            let maxCol = min(gridCols - 1, Int(rect.maxX / gridSize))
            let minRow = max(0, Int(rect.minY / gridSize))
            let maxRow = min(gridRows - 1, Int(rect.maxY / gridSize))
            
            for row in minRow...maxRow {
                for col in minCol...maxCol {
                    let idx = row * gridCols + col
                    spatialGrid[idx].append(component)
                }
            }
        }
    }

    func componentHitTest(overlayPoint: NSPoint) -> ComponentData? {
        guard gridCols > 0, gridRows > 0 else {
            return linearHitTest(overlayPoint: overlayPoint)
        }
        
        let col = min(gridCols - 1, max(0, Int(overlayPoint.x / gridSize)))
        let row = min(gridRows - 1, max(0, Int(overlayPoint.y / gridSize)))
        let idx = row * gridCols + col
        
        var best: ComponentData?
        var bestArea = Double.infinity

        for component in spatialGrid[idx] {
            guard let rect = getCachedRect(for: component.id) else { continue }
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
    
    private func linearHitTest(overlayPoint: NSPoint) -> ComponentData? {
        var best: ComponentData?
        var bestArea = Double.infinity

        for component in components {
            guard let rect = getCachedRect(for: component.id) else { continue }
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

    func updateHover(windowPoint: NSPoint) {
        guard lockedComponent == nil else { return }
        let localPoint = convert(windowPoint, from: nil)
        let component = componentHitTest(overlayPoint: localPoint)
        hoveredComponent = component
        onHover?(component, localPoint)
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { return true }

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        if let comp = componentHitTest(overlayPoint: point) {
            onClick?(comp)
        }
    }
}

private class ComponentShapeLayer: CAShapeLayer {
    var componentId: String = ""
    private var currentRect: NSRect = .zero
    private var isCurrentlyHovered: Bool = false
    private var isCurrentlyLocked: Bool = false
    private var isCurrentlySelectMode: Bool = false
    private var component: ComponentData?
    
    override init() {
        super.init()
        fillColor = nil
        lineWidth = 1.0
        strokeColor = NSColor(red: 0.29, green: 0.56, blue: 0.85, alpha: 0.5).cgColor
    }
    
    override init(layer: Any) {
        super.init(layer: layer)
        guard let other = layer as? ComponentShapeLayer else { return }
        self.componentId = other.componentId
        self.currentRect = other.currentRect
        self.isCurrentlyHovered = other.isCurrentlyHovered
        self.isCurrentlyLocked = other.isCurrentlyLocked
        self.isCurrentlySelectMode = other.isCurrentlySelectMode
        self.component = other.component
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    convenience init(component: ComponentData, rect: NSRect, isHovered: Bool, isLocked: Bool, isSelectMode: Bool) {
        self.init()
        self.component = component
        self.componentId = component.id
        self.currentRect = rect
        self.isCurrentlyHovered = isHovered
        self.isCurrentlyLocked = isLocked
        self.isCurrentlySelectMode = isSelectMode
        
        lineWidth = isHovered ? 2.0 : 1.0
        
        updatePath(rect: rect)
        updateColors(isHovered: isHovered, isLocked: isLocked, isSelectMode: isSelectMode, confidence: component.confidence)
    }
    
    func update(rect: NSRect, component: ComponentData, isHovered: Bool, isLocked: Bool, isSelectMode: Bool) {
        let rectChanged = rect != currentRect
        let stateChanged = isHovered != isCurrentlyHovered || isLocked != isCurrentlyLocked || isSelectMode != isCurrentlySelectMode
        
        if rectChanged {
            currentRect = rect
            updatePath(rect: rect)
        }
        
        if stateChanged || rectChanged {
            isCurrentlyHovered = isHovered
            isCurrentlyLocked = isLocked
            isCurrentlySelectMode = isSelectMode
            self.component = component
            updateColors(isHovered: isHovered, isLocked: isLocked, isSelectMode: isSelectMode, confidence: component.confidence)
            lineWidth = isHovered ? 2.0 : 1.0
        }
    }
    
    func updateHover(isHovered: Bool, isSelectMode: Bool) {
        guard isHovered != isCurrentlyHovered || isSelectMode != isCurrentlySelectMode else { return }
        isCurrentlyHovered = isHovered
        isCurrentlySelectMode = isSelectMode
        if let comp = component {
            updateColors(isHovered: isHovered, isLocked: isCurrentlyLocked, isSelectMode: isSelectMode, confidence: comp.confidence)
        }
        lineWidth = isHovered ? 2.0 : 1.0
    }
    
    func updateLocked(isLocked: Bool) {
        guard isLocked != isCurrentlyLocked else { return }
        isCurrentlyLocked = isLocked
        if let comp = component {
            updateColors(isHovered: isCurrentlyHovered, isLocked: isLocked, isSelectMode: isCurrentlySelectMode, confidence: comp.confidence)
        }
        lineWidth = isLocked ? 2.5 : (isCurrentlyHovered ? 2.0 : 1.0)
    }
    
    func updateColor(isSelectMode: Bool) {
        guard isCurrentlySelectMode != isSelectMode else { return }
        isCurrentlySelectMode = isSelectMode
        if let comp = component {
            updateColors(isHovered: isCurrentlyHovered, isLocked: isCurrentlyLocked, isSelectMode: isSelectMode, confidence: comp.confidence)
        }
    }
    
    private func updatePath(rect: NSRect) {
        let path = CGMutablePath()
        path.addRect(CGRect(x: rect.origin.x, y: rect.origin.y, width: rect.width, height: rect.height))
        self.path = path
    }
    
    private func updateColors(isHovered: Bool, isLocked: Bool, isSelectMode: Bool, confidence: Double?) {
        if isLocked {
            fillColor = NSColor(red: 0.20, green: 0.80, blue: 0.35, alpha: 0.12).cgColor
            strokeColor = NSColor(red: 0.20, green: 0.80, blue: 0.35, alpha: 1.0).cgColor
            lineWidth = 2.5
            return
        }
        
        fillColor = nil
        
        if isHovered {
            let hoverFill: NSColor
            if isSelectMode {
                hoverFill = NSColor(red: 1.0, green: 0.75, blue: 0.20, alpha: 0.10)
            } else {
                hoverFill = NSColor(red: 0.40, green: 0.70, blue: 1.0, alpha: 0.08)
            }
            fillColor = hoverFill.cgColor
        }
        
        strokeColor = colorForConfidence(confidence, isHovered: isHovered).cgColor
    }
    
    private func colorForConfidence(_ confidence: Double?, isHovered: Bool) -> NSColor {
        guard let conf = confidence else {
            return isHovered
                ? NSColor(red: 0.40, green: 0.70, blue: 1.0, alpha: 1.0)
                : NSColor(red: 0.29, green: 0.56, blue: 0.85, alpha: 0.5)
        }

        if conf >= 0.7 {
            return isHovered
                ? NSColor(red: 0.20, green: 0.85, blue: 0.40, alpha: 1.0)
                : NSColor(red: 0.20, green: 0.75, blue: 0.35, alpha: 0.6)
        } else if conf >= 0.4 {
            return isHovered
                ? NSColor(red: 1.0, green: 0.80, blue: 0.20, alpha: 1.0)
                : NSColor(red: 0.95, green: 0.70, blue: 0.15, alpha: 0.5)
        } else {
            return isHovered
                ? NSColor(red: 1.0, green: 0.35, blue: 0.35, alpha: 1.0)
                : NSColor(red: 0.90, green: 0.30, blue: 0.30, alpha: 0.5)
        }
    }
}

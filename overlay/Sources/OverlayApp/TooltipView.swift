import AppKit

/// Fixed info panel that appears above the status bar when hovering a component.
/// Shows: ClassName: "name", ID, Frame, File:Line
class TooltipView: NSView {
    private let classLabel = NSTextField(labelWithString: "")
    private let idLabel = NSTextField(labelWithString: "")
    private let frameLabel = NSTextField(labelWithString: "")
    private let fileLabel = NSTextField(labelWithString: "")

    override init(frame: NSRect) {
        super.init(frame: NSRect(x: 0, y: 0, width: 300, height: 72))
        setup()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setup()
    }

    private func setup() {
        wantsLayer = true
        layer?.backgroundColor = NSColor(white: 0.08, alpha: 0.92).cgColor
        layer?.cornerRadius = 4

        let labels = [classLabel, idLabel, frameLabel, fileLabel]
        for label in labels {
            label.font = NSFont.monospacedSystemFont(ofSize: 10, weight: .regular)
            label.textColor = NSColor(white: 0.95, alpha: 1.0)
            label.lineBreakMode = .byTruncatingTail
            label.maximumNumberOfLines = 1
            addSubview(label)
        }
    }

    func show(component: ComponentData) {
        classLabel.stringValue = "\(component.className): \"\(component.name)\""
        idLabel.stringValue = "ID: \(component.id)"
        frameLabel.stringValue = "Frame: (\(Int(component.frame.x)), \(Int(component.frame.y)), \(Int(component.frame.w)), \(Int(component.frame.h)))"

        if let file = component.file, let line = component.fileLine {
            fileLabel.stringValue = "\(file):\(line)"
            fileLabel.isHidden = false
        } else {
            fileLabel.isHidden = true
        }

        layoutLabels()
        isHidden = false
    }

    private func layoutLabels() {
        let padding: CGFloat = 8
        let lineHeight: CGFloat = 14
        let lineGap: CGFloat = 2
        let width = bounds.width

        let visibleLabels = [classLabel, idLabel, frameLabel, fileLabel].filter { !$0.isHidden }
        let totalHeight = CGFloat(visibleLabels.count) * lineHeight + CGFloat(visibleLabels.count - 1) * lineGap + padding * 2

        // Resize self
        var f = self.frame
        f.size.height = totalHeight
        self.frame = f

        // Layout labels top-to-bottom (view is NOT flipped)
        var y = totalHeight - padding - lineHeight
        for label in visibleLabels {
            label.frame = NSRect(x: padding, y: y, width: width - padding * 2, height: lineHeight)
            y -= (lineHeight + lineGap)
        }
    }
}

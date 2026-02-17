import AppKit

class StatusBarView: NSView {
    var onRefresh: (() -> Void)?
    var onSelect: (() -> Void)?
    var onClose: (() -> Void)?

    private let statusDot = NSView()
    private let statusLabel = NSTextField(labelWithString: "Claude Inspector Connected")
    private let selectButton = NSButton(title: "Select ↗", target: nil, action: nil)
    private let refreshButton = NSButton(title: "⟳", target: nil, action: nil)
    private let closeButton = NSButton(title: "✕", target: nil, action: nil)

    override init(frame: NSRect) {
        super.init(frame: frame)
        setup()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setup()
    }

    private func setup() {
        wantsLayer = true
        layer?.backgroundColor = NSColor(white: 0.1, alpha: 0.90).cgColor

        // Green status dot
        statusDot.wantsLayer = true
        statusDot.layer?.backgroundColor = NSColor(red: 0.2, green: 0.8, blue: 0.3, alpha: 1.0).cgColor
        statusDot.layer?.cornerRadius = 4
        addSubview(statusDot)

        // Status label
        statusLabel.font = NSFont.systemFont(ofSize: 11, weight: .medium)
        statusLabel.textColor = NSColor(white: 0.85, alpha: 1.0)
        addSubview(statusLabel)

        // Select button
        selectButton.bezelStyle = .rounded
        selectButton.font = NSFont.systemFont(ofSize: 11, weight: .medium)
        selectButton.target = self
        selectButton.action = #selector(selectTapped)
        addSubview(selectButton)

        // Refresh button
        refreshButton.bezelStyle = .rounded
        refreshButton.font = NSFont.systemFont(ofSize: 13, weight: .medium)
        refreshButton.target = self
        refreshButton.action = #selector(refreshTapped)
        addSubview(refreshButton)

        // Close button
        closeButton.bezelStyle = .rounded
        closeButton.font = NSFont.systemFont(ofSize: 11, weight: .medium)
        closeButton.target = self
        closeButton.action = #selector(closeTapped)
        addSubview(closeButton)
    }

    override func layout() {
        super.layout()
        let h = bounds.height
        let padding: CGFloat = 8

        statusDot.frame = NSRect(x: padding, y: (h - 8) / 2, width: 8, height: 8)
        statusLabel.frame = NSRect(x: padding + 14, y: (h - 16) / 2, width: 180, height: 16)

        let closeW: CGFloat = 26
        let refreshW: CGFloat = 30
        let buttonW: CGFloat = 70

        closeButton.frame = NSRect(x: bounds.width - padding - closeW, y: (h - 22) / 2, width: closeW, height: 22)
        refreshButton.frame = NSRect(x: bounds.width - padding - closeW - 4 - refreshW, y: (h - 22) / 2, width: refreshW, height: 22)
        selectButton.frame = NSRect(x: bounds.width - padding - closeW - 4 - refreshW - 4 - buttonW, y: (h - 22) / 2, width: buttonW, height: 22)
    }

    func updateSelectionState(_ selecting: Bool) {
        if selecting {
            selectButton.title = "Cancel"
            statusLabel.stringValue = "Click a component to select..."
            statusDot.layer?.backgroundColor = NSColor.systemOrange.cgColor
        } else {
            selectButton.title = "Select ↗"
            statusLabel.stringValue = "Claude Inspector Connected"
            statusDot.layer?.backgroundColor = NSColor(red: 0.2, green: 0.8, blue: 0.3, alpha: 1.0).cgColor
        }
    }

    func updateComponentCount(_ count: Int) {
        if count > 0 {
            statusLabel.stringValue = "Claude Inspector — \(count) components"
        }
    }

    @objc private func selectTapped() { onSelect?() }
    @objc private func refreshTapped() { onRefresh?() }
    @objc private func closeTapped() { onClose?() }
}

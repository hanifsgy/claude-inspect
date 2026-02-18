import AppKit

class StatusBarView: NSView {
    var onRefresh: (() -> Void)?
    var onClose: (() -> Void)?
    var onToggleMode: (() -> Void)?

    private let statusDot = NSView()
    private let statusLabel = NSTextField(labelWithString: "Claude Inspector Connected")
    private let modeButton = NSButton(title: "◉ Select", target: nil, action: nil)
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

        // Mode toggle button
        modeButton.bezelStyle = .rounded
        modeButton.font = NSFont.systemFont(ofSize: 11, weight: .medium)
        modeButton.target = self
        modeButton.action = #selector(modeToggleTapped)
        addSubview(modeButton)

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
        statusLabel.frame = NSRect(x: padding + 14, y: (h - 16) / 2, width: 150, height: 16)

        let closeW: CGFloat = 26
        let refreshW: CGFloat = 30
        let modeW: CGFloat = 76

        closeButton.frame = NSRect(x: bounds.width - padding - closeW, y: (h - 22) / 2, width: closeW, height: 22)
        refreshButton.frame = NSRect(x: bounds.width - padding - closeW - 4 - refreshW, y: (h - 22) / 2, width: refreshW, height: 22)
        modeButton.frame = NSRect(x: bounds.width - padding - closeW - 4 - refreshW - 4 - modeW, y: (h - 22) / 2, width: modeW, height: 22)
    }

    func updateComponentCount(_ count: Int) {
        if count > 0 {
            statusLabel.stringValue = "Inspector — \(count) components"
        }
    }

    func updateMode(_ isSelectMode: Bool) {
        if isSelectMode {
            modeButton.title = "⏹ Selecting"
            modeButton.contentTintColor = .orange
        } else {
            modeButton.title = "◉ Select"
            modeButton.contentTintColor = nil
        }
    }

    func updateLocked(_ component: ComponentData?) {
        if let comp = component {
            modeButton.title = "✕ Clear"
            modeButton.contentTintColor = NSColor(red: 0.20, green: 0.80, blue: 0.35, alpha: 1.0)
            let name = comp.name.isEmpty ? comp.className : comp.name
            statusLabel.stringValue = name.count > 22 ? String(name.prefix(22)) + "…" : name
        } else {
            updateMode(false)
        }
    }

    @objc private func modeToggleTapped() { onToggleMode?() }
    @objc private func refreshTapped() { onRefresh?() }
    @objc private func closeTapped() { onClose?() }
}

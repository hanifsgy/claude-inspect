import AppKit

class AppDelegate: NSObject, NSApplicationDelegate {
    var overlayWindow: OverlayWindow!
    var statusBarWindow: StatusBarWindow!
    var tracker: SimulatorTracker!
    var framesPath: String?

    func applicationDidFinishLaunching(_ notification: Notification) {
        overlayWindow = OverlayWindow()
        statusBarWindow = StatusBarWindow()
        tracker = SimulatorTracker()

        // Get frames file path from command-line argument
        let args = CommandLine.arguments
        if args.count > 1 {
            framesPath = args[1]
        }

        // Track simulator window — both windows follow it
        tracker.onUpdate = { [weak self] (info: SimulatorWindowInfo) in
            guard let self = self else { return }
            self.overlayWindow.reposition(to: info.frame)
            self.overlayWindow.orderFront(nil)
            self.statusBarWindow.reposition(simulatorFrame: info.frame)
            self.statusBarWindow.orderFront(nil)
        }

        tracker.onLost = { [weak self] in
            self?.overlayWindow.orderOut(nil)
            self?.statusBarWindow.orderOut(nil)
        }

        // Wire overlay click → emit + save
        overlayWindow.overlayView.onClick = { [weak self] (component: ComponentData) in
            guard let self = self else { return }
            emitEvent(OutgoingEvent(event: "click", component: component))
            self.overlayWindow.saveSelection(component)
        }

        // Wire status bar buttons
        statusBarWindow.statusBar.onRefresh = { [weak self] in
            self?.requestRescan()
            self?.reloadFrames()
        }

        statusBarWindow.statusBar.onClose = {
            NSApp.terminate(nil)
        }

        // Start tracking simulator
        tracker.start()

        // Load initial data from file
        if let path = framesPath {
            loadAndApply(from: path)

            // Watch for file changes (re-scan updates overlay live)
            watchFile(path) { [weak self] (data: OverlayData) in
                self?.applyData(data)
            }
        }

        emitEvent(OutgoingEvent(event: "started", component: nil))
    }

    // MARK: - Data Loading

    func loadAndApply(from path: String) {
        guard let data = loadOverlayData(from: path) else { return }
        applyData(data)
    }

    func applyData(_ data: OverlayData) {
        overlayWindow.overlayView.iosScreen = data.screen
        overlayWindow.overlayView.contentRect = data.contentRect
        overlayWindow.overlayView.renderScale = data.scale
        overlayWindow.overlayView.components = data.components
        statusBarWindow.statusBar.updateComponentCount(data.components.count)
    }

    func reloadFrames() {
        guard let path = framesPath else { return }
        loadAndApply(from: path)
    }

    func requestRescan() {
        guard let path = framesPath else { return }
        let stateDir = (path as NSString).deletingLastPathComponent
        let triggerPath = (stateDir as NSString).appendingPathComponent("scan.trigger")
        FileManager.default.createFile(atPath: triggerPath, contents: Data())
    }

    func applicationWillTerminate(_ notification: Notification) {
        tracker.stop()
    }
}

// --- Entry Point ---
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()

import AppKit

class AppDelegate: NSObject, NSApplicationDelegate {
    var overlayWindow: OverlayWindow!
    var statusBarWindow: StatusBarWindow!
    var tracker: SimulatorTracker!
    var framesPath: String?
    var fileWatcher: FileWatcher?

    func applicationDidFinishLaunching(_ notification: Notification) {
        overlayWindow = OverlayWindow()
        statusBarWindow = StatusBarWindow()
        tracker = SimulatorTracker()

        let args = CommandLine.arguments
        if args.count > 1 {
            framesPath = args[1]
        }

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

        overlayWindow.overlayView.onClick = { [weak self] (component: ComponentData) in
            guard let self = self else { return }
            emitEvent(OutgoingEvent(event: "click", component: component))
            self.overlayWindow.saveSelection(component)
            self.overlayWindow.isSelectMode = false
            self.overlayWindow.overlayView.lockedComponent = component
            self.overlayWindow.overlayView.hoveredComponent = nil
            self.statusBarWindow.statusBar.updateLocked(component)
        }

        statusBarWindow.statusBar.onToggleMode = { [weak self] in
            guard let self = self else { return }
            if self.overlayWindow.overlayView.lockedComponent != nil {
                self.overlayWindow.overlayView.lockedComponent = nil
                self.overlayWindow.overlayView.hoveredComponent = nil
                self.statusBarWindow.statusBar.updateLocked(nil)
                self.overlayWindow.isSelectMode = false
                self.statusBarWindow.statusBar.updateMode(false)
            } else {
                self.overlayWindow.isSelectMode.toggle()
                self.statusBarWindow.statusBar.updateMode(self.overlayWindow.isSelectMode)
            }
        }

        statusBarWindow.statusBar.onRefresh = { [weak self] in
            self?.requestRescan()
            self?.reloadFrames()
        }

        statusBarWindow.statusBar.onClose = {
            NSApp.terminate(nil)
        }

        tracker.start()

        if let path = framesPath {
            loadAndApply(from: path)

            fileWatcher = watchFile(path) { [weak self] (data: OverlayData) in
                self?.applyData(data)
            }

            let stateDir = (path as NSString).deletingLastPathComponent
            let unlockPath = (stateDir as NSString).appendingPathComponent("unlock.trigger")
            setupUnlockWatcher(unlockPath: unlockPath)
        }

        emitEvent(OutgoingEvent(event: "started", component: nil))
    }
    
    private func setupUnlockWatcher(unlockPath: String) {
        Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] timer in
            guard let self = self else {
                timer.invalidate()
                return
            }
            guard FileManager.default.fileExists(atPath: unlockPath) else { return }
            try? FileManager.default.removeItem(atPath: unlockPath)
            self.overlayWindow.overlayView.lockedComponent = nil
            self.overlayWindow.overlayView.hoveredComponent = nil
            self.statusBarWindow.statusBar.updateLocked(nil)
        }
    }

    func loadAndApply(from path: String) {
        guard let data = loadOverlayData(from: path) else { return }
        applyData(data)
    }

    func applyData(_ data: OverlayData) {
        overlayWindow.overlayView.beginBatchUpdate()
        overlayWindow.overlayView.iosScreen = data.screen
        overlayWindow.overlayView.contentRect = data.contentRect
        overlayWindow.overlayView.renderScale = data.scale
        overlayWindow.overlayView.components = data.components
        overlayWindow.overlayView.endBatchUpdate()
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
        fileWatcher?.stop()
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()

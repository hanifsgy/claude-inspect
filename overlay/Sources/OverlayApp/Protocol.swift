import AppKit

struct OverlayData: Codable {
    let screen: ScreenSize
    let contentRect: ContentRect?
    let scale: Double?
    let components: [ComponentData]
}

struct ScreenSize: Codable {
    let w: Double
    let h: Double
}

struct ContentRect: Codable {
    let x: Double
    let y: Double
    let w: Double
    let h: Double
}

struct ComponentData: Codable {
    let id: String
    let className: String
    let name: String
    let frame: FrameData
    let file: String?
    let fileLine: Int?
    let ownerType: String?
    let confidence: Double?
}

struct FrameData: Codable {
    let x: Double
    let y: Double
    let w: Double
    let h: Double
}

struct OutgoingEvent: Encodable {
    let event: String
    let component: ComponentData?
}

func emitEvent(_ event: OutgoingEvent) {
    guard let data = try? JSONEncoder().encode(event),
          let json = String(data: data, encoding: .utf8) else { return }
    FileHandle.standardOutput.write((json + "\n").data(using: .utf8)!)
}

func loadOverlayData(from path: String) -> OverlayData? {
    guard let data = FileManager.default.contents(atPath: path) else {
        NSLog("OverlayApp: Cannot read file at \(path)")
        return nil
    }
    do {
        return try JSONDecoder().decode(OverlayData.self, from: data)
    } catch {
        NSLog("OverlayApp: Failed to decode: \(error)")
        return nil
    }
}

class FileWatcher {
    private var source: DispatchSourceFileSystemObject?
    private let queue = DispatchQueue(label: "com.overlay.filewatcher", qos: .userInteractive)
    private let path: String
    private let onChange: (OverlayData) -> Void
    private var isWatching = false
    
    init(path: String, onChange: @escaping (OverlayData) -> Void) {
        self.path = path
        self.onChange = onChange
    }
    
    func start() {
        guard !isWatching else { return }
        
        let descriptor = open(path, O_EVTONLY)
        guard descriptor >= 0 else {
            NSLog("OverlayApp: Failed to open file for watching: \(path)")
            startPollingFallback()
            return
        }
        
        source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: descriptor,
            eventMask: [.write, .extend, .attrib],
            queue: queue
        )
        
        source?.setEventHandler { [weak self] in
            guard let self = self else { return }
            self.handleFileChange()
        }
        
        source?.setCancelHandler {
            close(descriptor)
        }
        
        source?.resume()
        isWatching = true
        NSLog("OverlayApp: Started file system event watcher for \(path)")
    }
    
    private func handleFileChange() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if let data = loadOverlayData(from: self.path) {
                self.onChange(data)
            }
        }
    }
    
    private func startPollingFallback() {
        var lastMod: Date?
        Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] timer in
            guard let self = self else {
                timer.invalidate()
                return
            }
            guard let attrs = try? FileManager.default.attributesOfItem(atPath: self.path),
                  let mod = attrs[.modificationDate] as? Date else { return }
            if lastMod != mod {
                lastMod = mod
                if let data = loadOverlayData(from: self.path) {
                    DispatchQueue.main.async {
                        self.onChange(data)
                    }
                }
            }
        }
        isWatching = true
    }
    
    func stop() {
        source?.cancel()
        source = nil
        isWatching = false
    }
    
    deinit {
        stop()
    }
}

func watchFile(_ path: String, onChange: @escaping (OverlayData) -> Void) -> FileWatcher {
    let watcher = FileWatcher(path: path, onChange: onChange)
    watcher.start()
    return watcher
}

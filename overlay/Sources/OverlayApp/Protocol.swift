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
        return nil
    }
    do {
        return try JSONDecoder().decode(OverlayData.self, from: data)
    } catch {
        return nil
    }
}

class FileWatcher {
    private var source: DispatchSourceFileSystemObject?
    private var pollTimer: Timer?
    private let queue = DispatchQueue(label: "com.overlay.filewatcher", qos: .userInteractive)
    private let path: String
    private let onChange: (OverlayData) -> Void
    
    private var lastFileSize: UInt64 = 0
    private var lastModTime: Date?
    private var lastContentHash: Int = 0
    private var isProcessing = false
    
    init(path: String, onChange: @escaping (OverlayData) -> Void) {
        self.path = path
        self.onChange = onChange
    }
    
    func start() {
        let descriptor = open(path, O_EVTONLY)
        if descriptor >= 0 {
            source = DispatchSource.makeFileSystemObjectSource(
                fileDescriptor: descriptor,
                eventMask: [.write, .extend, .delete, .rename],
                queue: queue
            )
            
            source?.setEventHandler { [weak self] in
                self?.checkAndReload()
            }
            
            source?.setCancelHandler {
                close(descriptor)
            }
            
            source?.resume()
        }
        
        startFastPolling()
        
        checkAndReload()
    }
    
    private func startFastPolling() {
        pollTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            self?.checkAndReload()
        }
    }
    
    private func checkAndReload() {
        guard !isProcessing else { return }
        
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: path),
              let fileSize = attrs[.size] as? UInt64,
              let modTime = attrs[.modificationDate] as? Date else {
            return
        }
        
        if fileSize != lastFileSize || lastModTime == nil || modTime != lastModTime {
            lastFileSize = fileSize
            lastModTime = modTime
            
            isProcessing = true
            queue.async { [weak self] in
                guard let self = self else { return }
                
                if let data = FileManager.default.contents(atPath: self.path) {
                    let hash = data.hashValue
                    if hash != self.lastContentHash {
                        self.lastContentHash = hash
                        
                        if let overlayData = try? JSONDecoder().decode(OverlayData.self, from: data) {
                            DispatchQueue.main.async {
                                self.onChange(overlayData)
                            }
                        }
                    }
                }
                
                DispatchQueue.main.async {
                    self.isProcessing = false
                }
            }
        }
    }
    
    func stop() {
        source?.cancel()
        source = nil
        pollTimer?.invalidate()
        pollTimer = nil
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

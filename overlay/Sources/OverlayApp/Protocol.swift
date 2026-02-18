import AppKit

// MARK: - Data Models

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

/// The exact iOS content area within the macOS simulator window, in macOS points.
/// Detected by geometry.js from window size, screenshot, and display scale.
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

// MARK: - Outgoing Events (stdout)

struct OutgoingEvent: Encodable {
    let event: String
    let component: ComponentData?
}

func emitEvent(_ event: OutgoingEvent) {
    guard let data = try? JSONEncoder().encode(event),
          let json = String(data: data, encoding: .utf8) else { return }
    FileHandle.standardOutput.write((json + "\n").data(using: .utf8)!)
}

// MARK: - Load overlay data from JSON file

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

// MARK: - Watch file for changes

func watchFile(_ path: String, onChange: @escaping (OverlayData) -> Void) {
    var lastMod: Date?
    Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { _ in
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: path),
              let mod = attrs[.modificationDate] as? Date else { return }
        if lastMod != mod {
            lastMod = mod
            if let data = loadOverlayData(from: path) {
                onChange(data)
            }
        }
    }
}

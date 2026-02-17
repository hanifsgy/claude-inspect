#!/usr/bin/env swift
/// Detects the exact iOS content area within the Simulator macOS window.
/// Outputs JSON: { "x", "y", "w", "h", "windowW", "windowH", "scale" }
/// All values in macOS points.
import CoreGraphics
import Foundation

// Find the Simulator window
let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let windowList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
    fputs("Error: Cannot list windows\n", stderr)
    exit(1)
}

var simWindowId: CGWindowID = 0
var simBounds: CGRect = .zero
for window in windowList {
    guard let owner = window[kCGWindowOwnerName as String] as? String,
          owner == "Simulator",
          let bounds = window[kCGWindowBounds as String] as? [String: CGFloat],
          let winId = window[kCGWindowNumber as String] as? CGWindowID else { continue }
    let w = bounds["Width"] ?? 0
    let h = bounds["Height"] ?? 0
    guard w > 200, h > 200 else { continue }
    if w * h > simBounds.width * simBounds.height {
        simWindowId = winId
        simBounds = CGRect(x: bounds["X"] ?? 0, y: bounds["Y"] ?? 0, width: w, height: h)
    }
}

guard simWindowId != 0 else {
    fputs("Error: No Simulator window found\n", stderr)
    exit(1)
}

fputs("Window: \(simBounds.width) x \(simBounds.height) (id: \(simWindowId))\n", stderr)

// Capture the simulator window image
guard let image = CGWindowListCreateImage(
    .null,
    .optionIncludingWindow,
    simWindowId,
    [.boundsIgnoreFraming]
) else {
    fputs("Error: Cannot capture window image\n", stderr)
    exit(1)
}

let imgW = image.width
let imgH = image.height
fputs("Image pixels: \(imgW) x \(imgH)\n", stderr)

// Get pixel data
guard let dataProvider = image.dataProvider,
      let data = dataProvider.data,
      let ptr = CFDataGetBytePtr(data) else {
    fputs("Error: Cannot read pixel data\n", stderr)
    exit(1)
}

let bytesPerRow = image.bytesPerRow
let bpp = image.bitsPerPixel / 8  // bytes per pixel (typically 4 for BGRA)

// Helper to check if a pixel is "bezel" (very dark / black)
func isBezel(_ x: Int, _ y: Int) -> Bool {
    let offset = y * bytesPerRow + x * bpp
    let b = Int(ptr[offset])
    let g = Int(ptr[offset + 1])
    let r = Int(ptr[offset + 2])
    // Bezel is typically black or very dark gray
    return r < 30 && g < 30 && b < 30
}

// Scan from top to find first non-bezel row
var topEdge = 0
for y in 0..<imgH {
    let midX = imgW / 2
    if !isBezel(midX, y) {
        topEdge = y
        break
    }
}

// Scan from bottom
var bottomEdge = imgH - 1
for y in stride(from: imgH - 1, through: 0, by: -1) {
    let midX = imgW / 2
    if !isBezel(midX, y) {
        bottomEdge = y
        break
    }
}

// Scan from left
var leftEdge = 0
for x in 0..<imgW {
    let midY = (topEdge + bottomEdge) / 2
    if !isBezel(x, midY) {
        leftEdge = x
        break
    }
}

// Scan from right
var rightEdge = imgW - 1
for x in stride(from: imgW - 1, through: 0, by: -1) {
    let midY = (topEdge + bottomEdge) / 2
    if !isBezel(x, midY) {
        rightEdge = x
        break
    }
}

fputs("Content pixels: (\(leftEdge), \(topEdge)) to (\(rightEdge), \(bottomEdge))\n", stderr)

// Convert to macOS points (image is at macOS backingScaleFactor)
let macScale = CGFloat(imgW) / simBounds.width

let contentX = CGFloat(leftEdge) / macScale
let contentY = CGFloat(topEdge) / macScale
let contentW = CGFloat(rightEdge - leftEdge + 1) / macScale
let contentH = CGFloat(bottomEdge - topEdge + 1) / macScale

fputs("Mac scale: \(macScale), Content rect: (\(contentX), \(contentY), \(contentW), \(contentH))\n", stderr)

// Output as JSON
let result: [String: Double] = [
    "x": Double(contentX),
    "y": Double(contentY),
    "w": Double(contentW),
    "h": Double(contentH),
    "windowW": Double(simBounds.width),
    "windowH": Double(simBounds.height),
    "macScale": Double(macScale),
]

let jsonData = try! JSONSerialization.data(withJSONObject: result, options: .sortedKeys)
print(String(data: jsonData, encoding: .utf8)!)

import { execSync } from "child_process";

/**
 * Detect the simulator content geometry:
 * - Where the iOS screen renders within the macOS simulator window
 * - The scale from iOS points to macOS points
 *
 * Returns: { contentRect: {x,y,w,h}, scale, windowSize: {w,h} }
 */
export function detectGeometry(iosScreenW, iosScreenH) {
  // 1. Get macOS simulator window size
  const windowSize = getSimulatorWindowSize();
  if (!windowSize) {
    console.error("[geometry] Could not find simulator window");
    return fallbackGeometry(iosScreenW, iosScreenH);
  }

  // 2. Get iOS screenshot pixel dimensions
  const screenshotPixels = getScreenshotPixels();

  // 3. Get macOS display scale
  const macScale = getMacDisplayScale();

  console.error(`[geometry] Window: ${windowSize.w} x ${windowSize.h} macOS pts`);
  console.error(`[geometry] iOS screen: ${iosScreenW} x ${iosScreenH} AXe pts`);
  console.error(`[geometry] Screenshot: ${screenshotPixels.w} x ${screenshotPixels.h} px`);
  console.error(`[geometry] macOS display scale: ${macScale}x`);

  // 4. Calculate device scale (iOS pixels per iOS point)
  const deviceScale = screenshotPixels.w / iosScreenW;
  console.error(`[geometry] Device scale: ${deviceScale}x`);

  // 5. Determine rendering mode by checking if it's point-accurate
  //    Point accurate: 1 iOS pt = 1 macOS pt (scale = 1.0)
  //    We check if window_w - ios_w gives a reasonable bezel (20-60 pts)
  const bezelX = windowSize.w - iosScreenW;
  const titleBar = 28;
  const bezelY = windowSize.h - titleBar - iosScreenH;

  const isPointAccurate = bezelX > 10 && bezelX < 80 && bezelY > 10 && bezelY < 120;

  let contentRect;
  let renderScale;

  if (isPointAccurate) {
    // Point Accurate mode: 1 iOS pt = 1 macOS pt
    renderScale = 1.0;
    const offsetX = bezelX / 2;
    const offsetY = titleBar + bezelY / 2;

    contentRect = {
      x: offsetX,
      y: offsetY,
      w: iosScreenW,
      h: iosScreenH,
    };
    console.error(`[geometry] Mode: Point Accurate (scale=1.0)`);
    console.error(`[geometry] Bezel: x=${bezelX.toFixed(1)}, y=${bezelY.toFixed(1)}`);
  } else {
    // Scaled mode: iOS screen is scaled to fit the window content area
    const contentW = windowSize.w;
    const contentH = windowSize.h - titleBar;

    // Scale iOS pixels to macOS pixels, then to macOS points
    const macPixelsW = windowSize.w * macScale;
    const macPixelsH = contentH * macScale;
    const pixelScale = Math.min(macPixelsW / screenshotPixels.w, macPixelsH / screenshotPixels.h);

    const renderedW = (screenshotPixels.w * pixelScale) / macScale;
    const renderedH = (screenshotPixels.h * pixelScale) / macScale;

    renderScale = renderedW / iosScreenW;

    const offsetX = (windowSize.w - renderedW) / 2;
    const offsetY = titleBar + (contentH - renderedH) / 2;

    contentRect = {
      x: offsetX,
      y: offsetY,
      w: renderedW,
      h: renderedH,
    };
    console.error(`[geometry] Mode: Scaled (scale=${renderScale.toFixed(4)})`);
  }

  console.error(
    `[geometry] Content rect: (${contentRect.x.toFixed(1)}, ${contentRect.y.toFixed(1)}, ${contentRect.w.toFixed(1)}, ${contentRect.h.toFixed(1)})`
  );

  return { contentRect, scale: renderScale, windowSize };
}

function getSimulatorWindowSize() {
  try {
    const output = execSync(
      `swift -target arm64-apple-macosx14.0 -e '
import CoreGraphics
let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
if let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] {
  var bestW: CGFloat = 0; var bestH: CGFloat = 0; var bestArea: CGFloat = 0
  for w in list {
    if let owner = w[kCGWindowOwnerName as String] as? String, owner == "Simulator",
       let b = w[kCGWindowBounds as String] as? [String: CGFloat] {
      let width = b["Width"] ?? 0; let height = b["Height"] ?? 0
      if width > 200 && width * height > bestArea {
        bestW = width; bestH = height; bestArea = width * height
      }
    }
  }
  if bestArea > 0 { print("\\(bestW)|\\(bestH)") }
}'`,
      { encoding: "utf-8", timeout: 10000 }
    ).trim();

    if (!output) return null;
    const [w, h] = output.split("|").map(Number);
    return { w, h };
  } catch {
    return null;
  }
}

function getScreenshotPixels() {
  try {
    execSync("xcrun simctl io booted screenshot /tmp/_inspector_screen.png", {
      timeout: 10000,
    });
    const sipsOutput = execSync("sips -g pixelWidth -g pixelHeight /tmp/_inspector_screen.png", {
      encoding: "utf-8",
      timeout: 5000,
    });
    const wMatch = sipsOutput.match(/pixelWidth:\s*(\d+)/);
    const hMatch = sipsOutput.match(/pixelHeight:\s*(\d+)/);
    return {
      w: wMatch ? parseInt(wMatch[1]) : 1206,
      h: hMatch ? parseInt(hMatch[1]) : 2622,
    };
  } catch {
    return { w: 1206, h: 2622 };
  }
}

function getMacDisplayScale() {
  try {
    const output = execSync(
      `swift -target arm64-apple-macosx14.0 -e 'import AppKit; print(NSScreen.main?.backingScaleFactor ?? 2.0)'`,
      { encoding: "utf-8", timeout: 5000 }
    ).trim();
    return parseFloat(output) || 2.0;
  } catch {
    return 2.0;
  }
}

function fallbackGeometry(iosScreenW, iosScreenH) {
  return {
    contentRect: { x: 24, y: 58, w: iosScreenW, h: iosScreenH },
    scale: 1.0,
    windowSize: { w: iosScreenW + 48, h: iosScreenH + 116 },
  };
}

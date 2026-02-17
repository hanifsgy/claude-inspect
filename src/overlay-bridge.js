import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, readFileSync } from "fs";
import { createInterface } from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OVERLAY_BIN = resolve(ROOT, "overlay", ".build", "release", "OverlayApp");
const FRAMES_PATH = resolve(ROOT, "state", "overlay_frames.json");
const SELECTION_PATH = resolve(ROOT, "state", "selected_component.json");

export class OverlayBridge {
  constructor() {
    this.process = null;
    this._clickResolve = null;
    this._pollTimer = null;
  }

  /**
   * Write frames to file and spawn overlay with the file path.
   */
  start(components) {
    if (this.process) {
      throw new Error("Overlay already running");
    }

    // Write frames to file
    writeFileSync(FRAMES_PATH, JSON.stringify(components, null, 2));

    // Launch overlay with frames file path
    this.process = spawn(OVERLAY_BIN, [FRAMES_PATH], {
      stdio: ["ignore", "pipe", "ignore"],
      detached: true,
    });

    this.process.on("exit", () => {
      this.process = null;
      this._stopPolling();
    });

    // Listen for stdout events (click, etc.)
    if (this.process.stdout) {
      const rl = createInterface({ input: this.process.stdout });
      rl.on("line", (line) => {
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          return;
        }
        if (msg.event === "click" && this._clickResolve) {
          const resolve = this._clickResolve;
          this._clickResolve = null;
          resolve(msg.component);
        }
      });
    }
  }

  /**
   * Update the frames file (overlay watches for changes).
   */
  highlight(components) {
    writeFileSync(FRAMES_PATH, JSON.stringify(components, null, 2));
  }

  /**
   * Wait for user to click a component.
   * Polls state/selected_component.json as a fallback.
   */
  waitForClick(timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        return reject(new Error("Overlay not running"));
      }

      // Primary: resolve from stdout click event
      this._clickResolve = resolve;

      // Fallback: poll the selection file
      const startTime = Date.now();
      let lastMod = 0;
      try {
        const stat = require("fs").statSync(SELECTION_PATH);
        lastMod = stat.mtimeMs;
      } catch {}

      this._pollTimer = setInterval(() => {
        try {
          const stat = require("fs").statSync(SELECTION_PATH);
          if (stat.mtimeMs > lastMod) {
            const data = JSON.parse(readFileSync(SELECTION_PATH, "utf-8"));
            clearInterval(this._pollTimer);
            this._clickResolve = null;
            resolve(data);
          }
        } catch {}
      }, 500);

      // Timeout
      setTimeout(() => {
        this._stopPolling();
        this._clickResolve = null;
        reject(new Error("Selection timed out"));
      }, timeoutMs);
    });
  }

  stop() {
    this._stopPolling();
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }
}

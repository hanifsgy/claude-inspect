import { spawn, execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, readFileSync, statSync } from "fs";
import { createInterface } from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OVERLAY_BIN = resolve(ROOT, "overlay", ".build", "release", "OverlayApp");
const FRAMES_PATH = resolve(ROOT, "state", "overlay_frames.json");
const SELECTION_PATH = resolve(ROOT, "state", "selected_component.json");
const UNLOCK_PATH = resolve(ROOT, "state", "unlock.trigger");

export class OverlayBridge {
  constructor() {
    this.process = null;
    this._queue = [];    // selections buffered before waitForClick is called
    this._waiters = []; // pending waitForClick Promises
    this._bgTimer = null;
    this._bgLastMod = 0;
    this._ownsStdoutEvents = false;
    this._lastDeliveredId = null;
    this._lastDeliveredAt = 0;
  }

  /**
   * Ensure the overlay is running. If already started (e.g. by the shell
   * script), skips spawning. Starts background file watching only when
   * clicks are not already delivered over stdout.
   */
  start(udid = "booted") {
    if (this.process) {
      this._startBackground();
      return;
    }

    // Skip spawn if OverlayApp is already running (started by shell script)
    try {
      execSync("pgrep -x OverlayApp", { stdio: "ignore" });
      this._startBackground();
      return;
    } catch {
      // not running, fall through to spawn
    }

    this.process = spawn(OVERLAY_BIN, [FRAMES_PATH], {
      stdio: ["ignore", "pipe", "ignore"],
      detached: true,
    });
    this._ownsStdoutEvents = true;

    this.process.on("exit", () => {
      this.process = null;
      this._ownsStdoutEvents = false;
      this._stopBackground();
    });

    // stdout path (bridge-owned overlay) — delivers to queue immediately
    if (this.process.stdout) {
      const rl = createInterface({ input: this.process.stdout });
      rl.on("line", (line) => {
        let msg;
        try { msg = JSON.parse(line); } catch { return; }
        if (msg.event === "click") this._deliver(msg.component);
      });
    }

    this._startBackground();
  }

  /**
   * Always-on file watcher. Runs continuously so clicks are buffered
   * even when no waitForClick is active.
   */
  _startBackground() {
    if (this._ownsStdoutEvents) return;
    if (this._bgTimer) return;
    try { this._bgLastMod = statSync(SELECTION_PATH).mtimeMs; } catch {}

    this._bgTimer = setInterval(() => {
      try {
        const { mtimeMs } = statSync(SELECTION_PATH);
        if (mtimeMs > this._bgLastMod) {
          this._bgLastMod = mtimeMs;
          const data = JSON.parse(readFileSync(SELECTION_PATH, "utf-8"));
          this._deliver(data);
        }
      } catch {}
    }, 300);
  }

  _stopBackground() {
    if (this._bgTimer) {
      clearInterval(this._bgTimer);
      this._bgTimer = null;
    }
  }

  /**
   * Route a selection to the next waiter, or buffer it if no one is waiting.
   */
  _deliver(data) {
    if (!data || !data.id) return;
    const now = Date.now();
    if (data.id === this._lastDeliveredId && (now - this._lastDeliveredAt) < 500) {
      return;
    }
    this._lastDeliveredId = data.id;
    this._lastDeliveredAt = now;

    if (this._waiters.length > 0) {
      const waiter = this._waiters.shift();
      waiter.cleanup();
      waiter.resolve(data);
    } else {
      this._queue.push(data);
    }
  }

  /**
   * Update the frames file (overlay watches for changes).
   */
  highlight(components) {
    writeFileSync(FRAMES_PATH, JSON.stringify(components, null, 2));
  }

  /**
   * Wait for the next component selection.
   * Returns immediately if a selection was buffered since the last call.
   */
  waitForClick(timeoutMs = 120000) {
    // Return buffered selection immediately
    if (this._queue.length > 0) {
      const data = this._queue.shift();
      try { writeFileSync(UNLOCK_PATH, ""); } catch {}
      return Promise.resolve(data);
    }

    return new Promise((resolve, reject) => {
      let timer;
      const waiter = {
        resolve: (data) => {
          try { writeFileSync(UNLOCK_PATH, ""); } catch {}
          resolve(data);
        },
        reject,
        cleanup: () => clearTimeout(timer),
      };
      this._waiters.push(waiter);

      timer = setTimeout(() => {
        const idx = this._waiters.indexOf(waiter);
        if (idx !== -1) this._waiters.splice(idx, 1);
        reject(new Error("Selection timed out"));
      }, timeoutMs);
    });
  }

  stop() {
    this._stopBackground();
    this._waiters.forEach((w) => { w.cleanup(); w.reject(new Error("Inspector stopped")); });
    this._waiters = [];
    this._queue = [];
    this._ownsStdoutEvents = false;
    this._lastDeliveredId = null;
    this._lastDeliveredAt = 0;
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

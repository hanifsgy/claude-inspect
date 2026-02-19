import { spawn, execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, readFileSync, statSync, watch } from "fs";
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
    this._queue = [];
    this._waiters = [];
    this._fsWatcher = null;
    this._ownsStdoutEvents = false;
    this._lastDeliveredId = null;
    this._lastDeliveredAt = 0;
  }

  start(udid = "booted") {
    if (this.process) {
      this._startFileWatcher();
      return;
    }

    try {
      execSync("pgrep -x OverlayApp", { stdio: "ignore" });
      this._startFileWatcher();
      return;
    } catch {
    }

    this.process = spawn(OVERLAY_BIN, [FRAMES_PATH], {
      stdio: ["ignore", "pipe", "ignore"],
      detached: true,
    });
    this._ownsStdoutEvents = true;

    this.process.on("exit", () => {
      this.process = null;
      this._ownsStdoutEvents = false;
      this._stopFileWatcher();
    });

    if (this.process.stdout) {
      const rl = createInterface({ input: this.process.stdout });
      rl.on("line", (line) => {
        let msg;
        try { msg = JSON.parse(line); } catch { return; }
        if (msg.event === "click") this._deliver(msg.component);
      });
    }

    this._startFileWatcher();
  }

  _startFileWatcher() {
    if (this._fsWatcher) return;

    try {
      this._fsWatcher = watch(SELECTION_PATH, (eventType) => {
        if (eventType === "change") {
          this._handleFileChange();
        }
      });
      this._fsWatcher.on("error", () => {
        this._startPollingFallback();
      });
    } catch {
      this._startPollingFallback();
    }
  }

  _handleFileChange() {
    try {
      const data = JSON.parse(readFileSync(SELECTION_PATH, "utf-8"));
      this._deliver(data);
    } catch {}
  }

  _pollTimer = null;
  _startPollingFallback() {
    if (this._pollTimer) return;
    let lastMod = 0;
    try { lastMod = statSync(SELECTION_PATH).mtimeMs; } catch {}

    this._pollTimer = setInterval(() => {
      try {
        const { mtimeMs } = statSync(SELECTION_PATH);
        if (mtimeMs > lastMod) {
          lastMod = mtimeMs;
          const data = JSON.parse(readFileSync(SELECTION_PATH, "utf-8"));
          this._deliver(data);
        }
      } catch {}
    }, 100);
  }

  _stopFileWatcher() {
    if (this._fsWatcher) {
      this._fsWatcher.close();
      this._fsWatcher = null;
    }
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

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

  highlight(overlayData) {
    const fullData = {
      screen: overlayData.screen || { w: 402, h: 874 },
      contentRect: overlayData.contentRect || null,
      scale: overlayData.scale || null,
      components: overlayData.components || overlayData,
    };
    writeFileSync(FRAMES_PATH, JSON.stringify(fullData));
  }

  waitForClick(timeoutMs = 120000) {
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
    this._stopFileWatcher();
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

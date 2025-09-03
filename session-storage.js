import { uuidBase62 } from '@dreamworld/uuid-base62';

export default class SessionStorage {
  constructor(prefix = "session_storage") {
    this.prefix = prefix;
    this.heartbeatKey = `${prefix}_heartbeats`;
    this.heartbeatInterval = 4000; // 4s
    this.timeout = 8000; // tab considered dead if >8s no heartbeat
    this.tabId = `${Date.now()}_${uuidBase62()}`;
    this.cache = {}; // in-memory session store

    // Load cache from localStorage initially
    this._loadCache();

    // Start heartbeat
    this._sendHeartbeat();
    this.heartbeatTimer = setInterval(() => this._sendHeartbeat(), this.heartbeatInterval);

    // Sync across tabs
    addEventListener("storage", (event) => {
      if (event.key && event.key.startsWith(this.prefix) && event.key !== this.heartbeatKey) {
        this._loadCache(); // sync localStorage → memory
        this._notifyChange();
      }
    });

    // Cleanup on unload
    addEventListener("beforeunload", () => {
      this._removeHeartbeat();
    });
  }

  // --- Private methods ---
  _loadCache() {
    const result = {};
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith(this.prefix) && k !== this.heartbeatKey) {
        const shortKey = k.substring(this.prefix.length + 1);
        try {
          result[shortKey] = JSON.parse(localStorage.getItem(k));
        } catch {
          result[shortKey] = localStorage.getItem(k);
        }
      }
    });
    this.cache = result;
  }

  _sendHeartbeat() {
    let beats = this._getHeartbeats();
    beats[this.tabId] = Date.now();
    localStorage.setItem(this.heartbeatKey, JSON.stringify(beats));
    this._cleanupHeartbeats(beats);
  }

  _removeHeartbeat() {
    let beats = this._getHeartbeats();
    delete beats[this.tabId];
    if (Object.keys(beats).length === 0) {
      this._clearAll();
    } else {
      localStorage.setItem(this.heartbeatKey, JSON.stringify(beats));
    }
  }

  _cleanupHeartbeats(beats) {
    const now = Date.now();
    for (const [id, ts] of Object.entries(beats)) {
      if (now - ts > this.timeout) {
        delete beats[id];
      }
    }
    if (Object.keys(beats).length === 0) {
      this._clearAll();
    } else {
      localStorage.setItem(this.heartbeatKey, JSON.stringify(beats));
    }
  }

  _getHeartbeats() {
    return JSON.parse(localStorage.getItem(this.heartbeatKey) || "{}");
  }

  _clearAll() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(this.prefix))
      .forEach((k) => localStorage.removeItem(k));
    this.cache = {}; // also clear memory
  }

  _notifyChange() {
    if (typeof this.onChange === "function") {
      this.onChange(this.getAll());
    }
  }

  // --- Public API ---
  set(key, value) {
    this.cache[key] = value;
    localStorage.setItem(`${this.prefix}_${key}`, JSON.stringify(value));
    this._notifyChange();
  }

  get(key) {
    return this.cache[key] ?? null;
  }

  remove(key) {
    delete this.cache[key];
    localStorage.removeItem(`${this.prefix}_${key}`);
    this._notifyChange();
  }

  clear() {
    this._clearAll();
    this._notifyChange();
  }

  getAll() {
    return { ...this.cache }; // return copy of memory cache
  }

  subscribe(callback) {
    this.onChange = callback;
  }
}
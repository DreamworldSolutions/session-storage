import { uuidBase62 } from '@dreamworld/uuid-base62';

/**
 * SessionStorage provides a session-scoped key-value store.
 * It uses localStorage for persistence and synchronization across tabs.
 * Each browser tab gets a unique session identified by a tabId.
 * Data is automatically cleaned up when all tabs are closed.
 * It also supports a heartbeat mechanism to detect and clean up stale sessions.
 * 
 * How it works:
 * - Each tab generates a unique tabId on load.
 * - A heartbeat entry is created/updated in localStorage every 10 seconds to indicate the tab is alive. key: `__dw_ss___$$_heartbeats`, value: `{ $tabId: { status: ACTIVE, liveSinceAt: Timestamp, closeAt: Timestamp } }`
 * - When a tab is closed,
 *  - If `timeoutOnCloseTab` is configured to a non-zero value, the heartBeat entry is updated with a `closeAt` timestamp and `status` with `CLOSED` for respective `tabId`. session data won't be cleared immediately. If a new tab is opened within this timeout period, the session data will be retained.
 *  - If `timeoutOnCloseTab` is zero, the heartbeat entry is removed immediately and if all tabs are closed, the session data is also cleared.
 * - If no heartbeats are detected for a tab within a timeout period (e.g., 30 seconds), it is considered dead and its data is cleaned up on initialization.
 * - Session data is stored in localStorage with a specific prefix to avoid collisions.
 * - The class listens for storage events to sync data across tabs in real-time.
 * 
 * Usage:
 * javascript```
 *  const ss = new SessionStorage({ timeoutOnCloseTab, timeoutOnHeartBeat, heartbeatInterval });
 *  ss.set('key', 'value');
 *  const value = ss.get('key');
 *  ss.remove('key');
 *  ss.clear();
 *  const allData = ss.getAll();
 *  ss.subscribe((data) => { console.log('Session data changed:', data); });
 * ```
 * 
 * Options:
 * - timeoutOnCloseTab: Duration to wait before clearing session data after the last tab is closed (default: 5000)
 * - timeoutOnHeartBeat: Duration in ms to consider a tab dead if no heartbeat is received (default: 30000)
 * - heartbeatInterval: Interval in ms to send heartbeat signals (default: 10000)
 * 
 * Note: This class does not handle complex data types or circular references.
 *       Values are stored as JSON strings in localStorage.
 */

export default class SessionStorage {
  static prefix = `__dw_ss_`;
  static internalPrefix = `${SessionStorage.prefix}___$$_`;
  /**
   * It represents the timeout after the last tab is closed.
   * It used to clear all session data if last tab is closed no new tab is opened within this time.
   */
  static timeoutOnCloseTab = 5000; // 5 seconds (Default)

  /**
   * It represents the timeout after which a tab is considered dead if no heartbeat is received.
   */
  static timeoutOnHeartBeat = 30000; // 30 seconds (Default)

  /**
   * It represents the interval to send heartbeat signals to indicate that the tab is alive.
   */
  static heartbeatInterval = 10000; // 10 seconds (Default)

  constructor({ timeoutOnCloseTab, timeoutOnHeartBeat, heartbeatInterval } = {}) {
    this._heartbeatKey = `${SessionStorage.internalPrefix}heartbeats`;
    this._heartbeatInterval = heartbeatInterval ?? SessionStorage.heartbeatInterval;
    this._timeoutOnHeartBeat = timeoutOnHeartBeat ?? SessionStorage.timeoutOnHeartBeat;
    this._timeoutOnCloseTab = timeoutOnCloseTab ?? SessionStorage.timeoutOnCloseTab;

    
    this._tabId = `${Date.now()}_${uuidBase62()}`;
    this._cache = {}; // in-memory session store
    this._subscribers = new Set(); // for change notifications
    
    // Initialize session storage
    this._init();

    // Start heartbeat
    this._heartbeatTimer = setInterval(() => this._sendHeartbeat(), this._heartbeatInterval);

    // Start sync session data across tabs
    this._startSyncSessionStorageFromOtherTabs();

    // Listen for tab close
    this._listenCloseTab();
  }

  /**
   * It initializes the session storage.
   * It checks from heartBeats data whether latest CLOSED tab's time is passed `timeoutOnCloseTab` or not. If passed, 
   * clears all session data. Otherwise loads the session data from localStorage into memory (_cache).
   * If there is no CLOSED tab is available, it checks for ACTIVE tabs. If any ACTIVE tab's `liveSinceAt` is within 
   * `timeoutOnHeartBeat`, it considers that tab is alive and does not clear session data. Otherwise, it clears all 
   * session data.
   * It removes all heartBeat entries for CLOSED tabs and stale ACTIVE tabs from localStorage.
   * It also registers the it's own tab's heartbeat entry in localStorage.
   */
  _init() {
    const now = Date.now();
    const heartbeatsData = this._getHeartbeats();
    let shouldClearData = true;
    let cleanedHeartbeats = {};

    // Check for CLOSED tabs first
    const closedTabs = Object.entries(heartbeatsData).filter(([, data]) => data.status === 'CLOSED');
    if (closedTabs.length > 0) {
      // Find the latest closed tab
      const latestClosedTab = closedTabs.reduce((latest, [tabId, data]) => {
        return !latest || data.closeAt > latest.closeAt ? data : latest;
      }, null);

      // If the latest closed tab is within timeout period, don't clear data
      if (latestClosedTab && (now - latestClosedTab.closeAt) < this._timeoutOnCloseTab) {
        shouldClearData = false;
      }
    } else {
      // Check for ACTIVE tabs
      const activeTabs = Object.entries(heartbeatsData).filter(([, data]) => data.status === 'ACTIVE');
      for (const [tabId, data] of activeTabs) {
        // If tab is still alive (within heartbeat timeout), don't clear data
        if ((now - data.liveSinceAt) < this._timeoutOnHeartBeat) {
          shouldClearData = false;
          cleanedHeartbeats[tabId] = data;
        }
      }
    }

    cleanedHeartbeats[this._tabId] = {
      status: 'ACTIVE',
      liveSinceAt: Date.now()
    };

    // Clean up stale heartbeat entries
    localStorage.setItem(this._heartbeatKey, JSON.stringify(cleanedHeartbeats));

    if (shouldClearData) {
      this._clearAllSessionData();
    } else {
      this._loadSessionDataFromStorage();
    }

    // Register this tab's heartbeat
    this._sendHeartbeat();
  }

  /**
   * It starts sync session data across tabs based on a storage event listener.
   * It listens for storage events and updates the in-memory `_cache` when relevant keys change.
   * This ensures that all tabs have the most up-to-date session data.
   * It also dispatch an change event to notify subscribers.
   */
  _startSyncSessionStorageFromOtherTabs() {
    this._storageListener = (event) => {
      if (!event.key || !event.key.startsWith(SessionStorage.prefix)) {
        return;
      }

      // Skip internal keys (heartbeats)
      if (event.key.startsWith(SessionStorage.internalPrefix)) {
        return;
      }

      const sessionKey = event.key.replace(SessionStorage.prefix, '');

      if (event.newValue === null) {
        // Key was removed
        delete this._cache[sessionKey];
      } else {
        // Key was added or updated
        try {
          this._cache[sessionKey] = JSON.parse(event.newValue);
        } catch (e) {
          console.warn('Failed to parse session storage value:', e);
        }
      }

      // Notify subscribers
      this._notifySubscribers(sessionKey);
    };

    window.addEventListener('storage', this._storageListener);
  }

  /**
   * It listens for tab close events and handles session data cleanup based on the `timeoutOnCloseTab` setting.
   * If `timeoutOnCloseTab` is set to a non-zero value, it updates the heartbeat entry with a `closeAt` timestamp and `status` with `CLOSED`.
   * If `timeoutOnCloseTab` is zero, it removes the heartbeat entry immediately and clears session data if all tabs are closed.
   */
  _listenCloseTab() {
    this._beforeUnloadListener = () => {
      console.log('Tab is closing, handling session cleanup if needed...');
      const heartbeatsData = this._getHeartbeats();

      if (this._timeoutOnCloseTab === 0) {
        // Remove this tab's heartbeat immediately
        delete heartbeatsData[this._tabId];
        localStorage.setItem(this._heartbeatKey, JSON.stringify(heartbeatsData));

        // If no other tabs, clear all session data
        if (Object.keys(heartbeatsData).length === 0) {
          this._clearAllSessionData();
        }
      } else {
        // Mark this tab as closed with timestamp
        heartbeatsData[this._tabId] = {
          ...heartbeatsData[this._tabId],
          status: 'CLOSED',
          closeAt: Date.now(),
          liveSinceAt: undefined
        };
        localStorage.setItem(this._heartbeatKey, JSON.stringify(heartbeatsData));
      }

      // Clear the heartbeat timer
      if (this._heartbeatTimer) {
        clearInterval(this._heartbeatTimer);
      }

      // Remove storage listener
      if (this._storageListener) {
        window.removeEventListener('storage', this._storageListener);
      }
    };

    window.addEventListener('beforeunload', this._beforeUnloadListener);
  }

  /**
   * It sends a heartbeat signal to indicate that the tab is alive.
   * It adds/updates an entry into heartBeats data in localStorage. `liveSinceAt: Current timestamp and status: ACTIVE`
   */
  _sendHeartbeat() {
    const heartbeatsData = this._getHeartbeats();
    heartbeatsData[this._tabId] = {
      status: 'ACTIVE',
      liveSinceAt: Date.now()
    };
    localStorage.setItem(this._heartbeatKey, JSON.stringify(heartbeatsData));
  }

  _getHeartbeats() {
    try {
      const data = localStorage.getItem(this._heartbeatKey);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.warn('Failed to parse heartbeats data:', e);
      return {};
    }
  }

  _loadSessionDataFromStorage() {
    this._cache = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(SessionStorage.prefix) && !key.startsWith(SessionStorage.internalPrefix)) {
        const sessionKey = key.replace(SessionStorage.prefix, '');
        try {
          this._cache[sessionKey] = JSON.parse(localStorage.getItem(key));
        } catch (e) {
          console.warn('Failed to parse session storage value:', e);
        }
      }
    }
  }

  _clearAllSessionData() {
    // Clear from memory
    this._cache = {};

    // Clear from localStorage
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(SessionStorage.prefix) && !key.startsWith(SessionStorage.internalPrefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  _notifySubscribers(key) {
    this._subscribers.forEach(callback => {
      try {
        callback({ [key]: this._cache[key] });
      } catch (e) {
        console.warn('Error in session storage subscriber:', e);
      }
    });
  }

  // --- Public API ---
  set(key, value) {
    this._cache[key] = value;
    const storageKey = `${SessionStorage.prefix}${key}`;
    localStorage.setItem(storageKey, JSON.stringify(value));
  }

  get(key) {
    return this._cache[key] ?? null;
  }

  remove(key) {
    delete this._cache[key];
    const storageKey = `${SessionStorage.prefix}${key}`;
    localStorage.removeItem(storageKey);
  }

  clear() {
    this._cache = {};
    // Remove only session data, not internal data like heartbeats
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(SessionStorage.prefix) && !key.startsWith(SessionStorage.internalPrefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  getAll() {
    return { ...this._cache };
  }

  subscribe(callback) {
    this._subscribers.add(callback);
    // Return unsubscribe function
    return () => {
      this._subscribers.delete(callback);
    };
  }
}
# SessionStorage

A lightweight **cross-tab session storage** for browsers that:

- Stores session keys in **localStorage** with a common prefix.  
- Keeps a **fast in-memory cache** for instant access.  
- Shares data across multiple tabs **in real-time**.  
- **Clears session automatically** when all tabs are closed or the browser is killed.  
- Provides event hooks to react to session updates.

---

## ✨ Features

- 🔑 **Per-key storage**: Each key is stored separately in `localStorage` with a prefix (`session_key`).
- ⚡ **In-memory cache**: Reads are served from memory for performance.  
- 🔄 **Cross-tab sync**: Updates propagate live across all open tabs.  
- 🧹 **Auto-cleanup**: Session is wiped when the last tab closes or the browser is killed.  
- 📡 **Heartbeat mechanism**: Ensures cleanup even if browser crashes.  
- 🛠 **Easy integration**: Works out of the box, no backend required.

---

## 🚀 Installation

```bash
npm install @dreamworld/session-storage
```
OR
```bash
yarn add @dreamworld/session-storage
```

## 📝 Usage
### Import and Initialize

```javascript
import SessionStorage from "@dreamworld/session-storage";

const session = new SessionStorage({ 
  timeoutOnCloseTab: 0, // Default: 5000
  timeoutOnHeartBeat: 5000, //Default: 30000
  heartbeatInterval: 15000 //Default: 10000
});
```

### Set a value
```javascript
session.set("user", { id: 1, name: "Alice" });
session.set("token", "abcdef");
```

### Get a value
```javascript
console.log(session.get("user")); 
// { id: 1, name: "Alice" }
```

### Get all values
```javascript
console.log(session.getAll()); 
// { user: { id: 1, name: "Alice" }, token: "abcdef" }
```

### Remove a key
```javascript
session.remove("token");
```

### Clear all session data
```javascript
session.clear(); //This removes all entries with the prefix `myapp_session_*` from localStorage.
```

### Subscribe to changes (cross-tab sync)
```javascript
const unsubscribe = session.subscribe((data) => {
  console.log("Session updated:", data); // Object with all session keys
});

//Unsubscribe
unsubscribe();
//This callback fires whenever session data changes — either in the same tab or in another tab.
```

---

## Demo

### Running the Demo

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Open your browser to the displayed URL (usually http://localhost:8000)

### Testing Cross-Tab Sync

1. Open the demo page in multiple browser tabs
2. Set values in one tab and watch them appear in others
3. Close tabs one by one - data persists until the last tab
4. Close all tabs and reopen - data should be cleared

---

## ⚙️ How it Works
- Each tab generates a unique `tabId`.
- Tabs send a heartbeat every 4 seconds(`${prefix}_heartbeats`)
- If no heartbeats are detected for >8 seconds, all session data is cleared.
- Updates are stored both in **memory cache** and **localStorage**.
- `storage` event ensures cross-tab synchronization.

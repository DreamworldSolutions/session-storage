# @dreamworld/session-storage

A browser-side utility for storing and syncing session data across multiple tabs/windows, distributed as a public ES Module package.

---

## 1. User Guide

### Installation & Setup

```bash
npm install @dreamworld/session-storage
```

```bash
yarn add @dreamworld/session-storage
```
---

### Basic Usage

The package exports a single default class, `SessionStorage`. The import pattern is derivable from the module type and entry point declared in `package.json`:

```javascript
import SessionStorage from "@dreamworld/session-storage";

const session = new SessionStorage();
```
---

### API Reference

#### Exports

| Export | Kind | Description |
|--------|------|-------------|
| `SessionStorage` | `export default class` | The sole exported member of the module. |

---

## 2. Developer Guide / Architecture

### Architecture Overview

| Observable Fact | Detail |
|-----------------|--------|
| Module format | ES Module (`"type": "module"` in `package.json`) |
| Exported surface | Single `export default class SessionStorage {}` |
| Implementation | Class body is empty — no constructor, fields, or methods present |
| Design patterns | Not determinable from provided source |
| Dependencies | None (no runtime dependencies declared in `package.json`) |

The file `session-storage.js` defines one class with no implementation. No design patterns, internal data flow, or module responsibilities can be identified from the current source.

---

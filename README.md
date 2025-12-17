# ioBroker Global Scripts

Reusable JavaScript helper libraries for the ioBroker JavaScript adapter.

This repository currently contains:

- **Global-Tools** – helper functions used across (almost) all of my ioBroker scripts
- **_libVoiceGpt** – global helper library for GPT / voice related scripts

---

## 🧰 Global-Tools

**Type:** global library script  
**Version:** 1.1

`Global-Tools` is loaded once as a global script in the JavaScript adapter and registers a set of helper functions in the global context.

> It does **not** start any schedules and does **not** register its own `on()` listeners.  
> It only provides functions that can be reused by other scripts.

### Provided helpers

**Logging**

- `gtLog(...)`
- `gtLogDebug(...)`
- `gtSetDebugEnabled(...)`
- `gtIsDebugEnabled(...)`

**State helpers**

- `ensureState(...)` – combines legacy + async/typed handling
- `ensureStateAsync(...)` – async/typed master implementation
- `ensureChannel(...)`
- `getSafeState(...)`
- `getNum(...)`, `getBool(...)`, `getStr(...)`
- `setStateIfChanged(...)`
- `setStateSafe(...)`

**Formatting**

- `fmtBytes(...)`
- `fmtWatt(...)`
- `fmtPercent(...)`
- `fmtDuration(...)`
- `fmtDateTime(...)`
- `fmtNum(...)`

**Date / time**

- `gtDate(...)`
- `gtTime(...)`
- `gtStartOfDay(...)`
- `gtIsSameDay(...)`
- `gtDaysBetween(...)`

**JSON**

- `gtJsonParse(...)`
- `gtJsonStringify(...)`

**Array**

- `deleteDuplicates(...)`

**HTML**

- `gtEscapeHtml(...)`

**Heartbeat helpers**

- `hbEnsure(...)`
- `heartbeat(...)`
- `hbOk(...)`
- `hbError(...)`

**SynoChat helpers**

- `notifySynoChat(...)`
- `notifySynoChatEx(...)`

### Usage (ioBroker)

1. Create a **global script** in the ioBroker JavaScript adapter.
2. Paste the `Global-Tools` source code into this global script and enable it.
3. All helpers above are then available directly in other scripts within the same adapter instance.

Example:

```js
// Example usage in another ioBroker script

ensureState('0_userdata.0.test.value', 0, { type: 'number' });
setStateIfChanged('0_userdata.0.test.value', 42, true);

gtLog('Updated test value to 42');
```

---

## 🗣️ _libVoiceGpt

**Type:** global library script

`_libVoiceGpt` is a small global helper library for the ioBroker JavaScript adapter.

- It is exposed as: `globalThis._libVoiceGpt`
- It is meant to be used by other scripts that implement voice control / GPT integration.

### Usage

1. Create a **global script** in the JavaScript adapter with the `_libVoiceGpt` code.
2. In other scripts (same adapter instance), you can access it via:

```js
const lib = globalThis._libVoiceGpt;
if (lib) {
    // use helpers provided by _libVoiceGpt
}
```

For details about the available functions, please refer to the `_libVoiceGpt` source file in this repository.

---

## Notes

- Both libraries are designed to be **side-effect free**:
  - no schedules,
  - no `on()` subscriptions,
  - no polling loops.
- They are intended to provide a consistent toolbox for all other ioBroker scripts in my repositories.

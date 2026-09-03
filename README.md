# WME Rapid House Numbers

A [Waze Map Editor (WME)](https://www.waze.com/editor) userscript that speeds up house number entry by automatically injecting sequential values into each new house number field. Controls are embedded directly into the WME house number mini-editor.

## Installation

1. Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/) or [Greasemonkey](https://www.greasespot.net/).
2. Install the script from [Greasy Fork](https://greasyfork.org/en/scripts/35931-wme-rapid-house-numbers).
3. Open WME — the script loads automatically.

## How It Works

When you open the house number editor for a segment, RHN injects a control panel below the standard "Add HN" button. As soon as you click "Add HN" (or press **H**), the script fills in the configured next value and automatically advances it by the configured increment for the next entry. This lets you add a whole street's worth of house numbers with minimal clicks.

### House Number Format

The increment is applied to the **rightmost token** of the house number:

| Next value | Increment | Produces sequence   |
| ---------- | --------- | ------------------- |
| `1`        | `2`       | 1, 3, 5, 7, …       |
| `2`        | `2`       | 2, 4, 6, 8, …       |
| `7A`       | `1`       | 7A, 7B, 7C, …       |
| `10-1`     | `1`       | 10-1, 10-2, 10-3, … |

Both numeric and alphabetic suffixes are supported.

## UI Overview

The control panel is visible whenever a segment's house number editor is open. Click **Show More** to expand the full panel.

### Compact View (always visible)

| Element                   | Description                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| **Next** input            | The value that will be injected into the next new house number.                            |
| **Inc** input             | The increment applied after each house number is added. Use negative values to count down. |
| **Show More / Hide More** | Toggles the extended settings panel.                                                       |
| **HN** button             | The standard WME "Add House Number" button (shortened label).                              |
| **Subnumber Mode** button | Activates/deactivates Subnumber Mode (see below).                                          |

### Extended View (Show More)

| Element                            | Description                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| **Sub** input                      | Suffix appended to the current value when Subnumber Mode is activated (e.g. `/1`, `A`). |
| **Inc** (sub)                      | Increment used while Subnumber Mode is active.                                          |
| **+2 / +1 / −1** buttons           | Advance or rewind the next value without adding a house number.                         |
| **Reset to 1 / Reset to 2** button | Resets the next value to 1. If the current value is already 1, it resets to 2 instead.  |
| Mode info / Keys link              | Tooltip describing Subnumber Mode; a link to the WME keyboard shortcuts dialog.         |

## Subnumber Mode

Subnumber Mode is useful for streets where one main number has several sub-addresses (e.g. `7/1`, `7/2`, `7/3` or `7A`, `7B`).

1. Enter the main number in **Next** as usual (e.g. `7`).
2. Set **Sub** to the desired suffix (e.g. `/1` or `A`) and **Sub Inc** to `1`.
3. Press the **Subnumber Mode** button (or the shortcut key). The current value and increment are saved; the next value becomes `7/1` with increment `1`.
4. Add house numbers normally — they will be `7/1`, `7/2`, `7/3`, …
5. Press **Normal Mode** (or the shortcut) to return to the saved main-number state.

Hint: To add a series like 1, 3, 5, 5a, 5b, 7, 9, ... add 5a and 5b first. E.g. add 1, add 3, **Special Mode**, add 5a, add 5b, **Normal Mode**, add 5, add 7, add 9.
This is due to the fact, that adding 5 first would jump to 7 afterwards.

## Keyboard Shortcuts

All shortcuts are registered in WME and can be customized in the WME keyboard shortcuts dialog (**Settings → Keyboard shortcuts → WME Rapid House Numbers**). Changes are saved automatically.

### In-map accelerators (active while the HN editor is open)

These shortcuts are handled directly by the script and are not configurable via the WME dialog.

| Key                          | Action                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------- |
| **H**                        | Add the next house number with the configured increment.                        |
| **1 – 9** / **Numpad 1 – 9** | Add the next house number with a one-time increment equal to the pressed digit. |

### WME-registered shortcuts (configurable)

| Default Key    | Action                                         | WME Shortcut Name                     |
| -------------- | ---------------------------------------------- | ------------------------------------- |
| **Numpad +**   | Increment the next value by +1                 | Increment HN                          |
| **Numpad −**   | Decrement the next value by −1                 | Decrement HN                          |
| **,** (comma)  | Increment the next value by +1 (fixed default) | Increment HN (default, do not change) |
| **.** (period) | Decrement the next value by −1 (fixed default) | Decrement HN (default, do not change) |
| _(none)_       | Advance the next value by +2                   | Double Increment HN (+2)              |
| **Numpad \***  | Flip the sign of the increment                 | Invert Increment                      |
| **M**          | Toggle Subnumber Mode on/off                   | Activate/Deactivate Special Suffix    |
| **V**          | Reset next value to 1 (or 2 if already at 1)   | Reset to 1 (twice reset to 2)         |

> The two "default" shortcuts (`,` and `.`) provide a stable fallback that cannot be overwritten via the WME dialog. The configurable Numpad +/− shortcuts can be freely rebound.

## Settings Persistence

All settings (next value, increment, subnumber suffix, shortcut assignments, panel visibility) are stored in the browser's `localStorage` under the key `rapidHN` and survive page reloads.

## License

MIT

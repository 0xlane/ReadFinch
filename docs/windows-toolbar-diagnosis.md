# Windows toolbar click diagnosis

Verified on 2026-11-10 against the installed ReadFinch 1.2.6 process, without restarting it during the live comparison.

## Finding

The toolbar strip and its separate menu were permanently configured with `focusable: false`. In the observed Windows/Electron focus state, the menu received a native `mouseUp` and trusted DOM `pointerup`/`mouseup`, but no `mouseDown`, `pointerdown`, `mousedown`, or `click`. No `selectionOpen` request reached the coordinator. The failure occurred before an AI request could begin.

The same running menu, with the same selected input, immediately delivered the full native and DOM event sequence and opened writing improvement after allowing activation. The strip's translation button also succeeded after the same adjustment. Fresh isolated windows sometimes worked with the old setting, so a passing fresh-launch smoke test alone did not reproduce this failure.

The strip and menu are reused across source applications. Changing applications therefore does not recreate a window whose input handling has entered this state.

## Fix

- Windows toolbar surfaces can activate when clicked, while `showInactive()` preserves the source application's keyboard focus when displaying them.
- Later selections do not reset the Windows strip to non-focusable.
- Toolbar activation continues to preserve its selected-text snapshot. Native reads are initiated by completed mouse-selection gestures or explicit shortcuts, rather than by continuous provider polling.
- Toolbar/menu hit regions are sent to the Windows helper in physical screen coordinates, including display scaling.
- Explicit menu focus retains `skipTaskbar`; Electron's `setFocusable(true)` can reset that flag on Windows.

The running installed instance received an in-memory focus adjustment during diagnosis. This is not a persistent installation update.

## Validation

- Live native click trace from the installed process: missing press/click before the adjustment; complete press/release/click and matching `selectionOpen` afterward.
- Native Windows regression: programmatic selection and Ctrl+A stay quiet; explicit reads still work; showing a toolbar preserves source focus; the first real click opens the correct result; moving to the menu preserves the original text snapshot; repeated selection/click/close cycles succeed.
- Helper recovery: an unresponsive editor times out safely, and a suspended test-owned helper is retired and replaced without restarting the application.
- Tray restart: schedules one relaunch followed by clean shutdown; duplicate requests do not schedule additional processes.
- Type checking and production build passed. The full test suite passed 203 tests with 3 platform-specific skips.

Diagnostic recordings remain local and contain event types, window state, and local selection ordinals. They omit selected text, clipboard contents, prompts, API credentials, and key values.

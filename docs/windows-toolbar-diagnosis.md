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

## Keyboard-selection follow-up

The original 1.2.7 regression checked Ctrl+A immediately after the shortcut, but did not move the pointer afterward. The extended regression now checks the complete sequence and counts native toolbar `show` events so a brief flash cannot pass as a hidden final window.

The source comparison covered:

- [Selection Hook's Windows mouse-event processing](https://github.com/0xfullex/selection-hook/blob/d8ac605db1b0a87f816f6fdfd880e054033737e5/src/windows/selection_hook.cc#L916): selection retrieval is gated by mouse-up gestures such as dragging, double-clicking, and Shift-clicking. Mouse movement emits a pointer event without initiating retrieval. Its queued input uses event-time snapshots rather than later system-state samples.
- [OpenAI Translator's mouse hook](https://github.com/yetone/openai-translator/blob/f4c3511bc52b96741985749730bd77f509cbd003/src-tauri/src/main.rs#L163): selection retrieval starts on qualifying left-button releases, using recorded press/release timing and double-click detection.
- [Pot's selection translation entry point](https://github.com/pot-app/pot-desktop/blob/594d32ede96acd106b0256deaa8bb440ffcdff40/src-tauri/src/window.rs#L226): it retrieves the selection on an explicit translation invocation, rather than supplying a comparable automatic mouse-gesture detector.

Two deterministic tests failed against the previous state machine: a keyboard event during an unfinished drag did not clear the pressed state, and a click after keyboard input could reuse pre-keyboard double-click history. Keyboard, outside scrolling, and cancelling input now discard the complete gesture and click history. A subsequent mouse movement or unmatched release cannot reuse it; a fresh mouse selection still works.

Each non-move input now also carries its monotonic hook version. An automatic provider read must still match the accepted mouse-up version before starting, as well as after completion. This closes the interval in which a keyboard cancellation has reached the hook but has not yet been drained by the provider worker. Explicit shortcut reads remain independent of automatic mouse triggering.

Validation after this follow-up:

- 67 deterministic Windows gesture and toolbar-lifetime assertions.
- 12 real Windows integration cases, including programmatic selection followed by pointer movement, Ctrl+A followed by movement, explicit shortcut snapshots, keyboard-interrupted drags, keyboard-separated clicks, dismissal of an existing toolbar, and subsequent normal selection/click/menu cycles.
- Full suite: 203 passed, 3 platform-specific skips. Type checking and production build passed.

The integration run uses an isolated development profile and a dedicated test text box. It does not close or restart the installed application.

If a separately installed ReadFinch instance covers the test toolbar, a failed native hit test is recorded and the development surface alone is raised without activation before retrying. Other hit-test failures remain fatal. This isolates native input delivery from two independently running toolbars without closing the installed instance.

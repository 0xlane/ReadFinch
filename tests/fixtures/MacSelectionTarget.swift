import AppKit
import ApplicationServices
import Foundation

func emit(_ value: [String: Any]) {
  if let data = try? JSONSerialization.data(withJSONObject: value),
     let text = String(data: data, encoding: .utf8) {
    print(text); fflush(stdout)
  }
}

let application = NSApplication.shared
application.setActivationPolicy(.regular)
let window = NSWindow(contentRect: NSRect(x: 100, y: 200, width: 620, height: 260),
  styleMask: [.titled, .closable], backing: .buffered, defer: false)
window.title = "ReadFinch macOS selection fixture"
let textView = NSTextView(frame: NSRect(x: 20, y: 95, width: 580, height: 140))
textView.font = NSFont.systemFont(ofSize: 22)
textView.string = "Small steps make a big difference."
window.contentView?.addSubview(textView)
let password = NSSecureTextField(frame: NSRect(x: 20, y: 35, width: 400, height: 30))
password.stringValue = "fixture-password"
window.contentView?.addSubview(password)

@MainActor func handle(_ op: String) {
  if op == "quit" { application.terminate(nil); return }
  if op != "status" {
    window.makeKeyAndOrderFront(nil)
    application.activate(ignoringOtherApps: true)
  }
  switch op {
    case "select", "changed":
      textView.string = op == "changed" ? "A fresh selection for the shortcut." : "Small steps make a big difference."
      window.makeFirstResponder(textView)
      textView.setSelectedRange(NSRange(location: 0, length: (textView.string as NSString).length))
    case "mouse-select":
      textView.string = "Small steps make a big difference."
      window.makeFirstResponder(textView)
      textView.setSelectedRange(NSRange(location: 0, length: 0))
      textView.layoutManager?.ensureLayout(for: textView.textContainer!)
      let start = textView.firstRect(forCharacterRange: NSRange(location: 0, length: 0), actualRange: nil)
      let end = textView.firstRect(forCharacterRange: NSRange(location: (textView.string as NSString).length, length: 0), actualRange: nil)
      let screenTop = NSScreen.screens.first?.frame.maxY ?? 0
      let first = CGPoint(x: start.minX + 0.5, y: screenTop - start.midY)
      let last = CGPoint(x: end.maxX + 2, y: screenTop - end.midY)
      CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: first, mouseButton: .left)?.post(tap: .cghidEventTap)
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
        CGEvent(mouseEventSource: nil, mouseType: .leftMouseDragged, mouseCursorPosition: last, mouseButton: .left)?.post(tap: .cghidEventTap)
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
        CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: last, mouseButton: .left)?.post(tap: .cghidEventTap)
      }
    case "clear": textView.setSelectedRange(NSRange(location: 0, length: 0))
    case "secure": window.makeFirstResponder(password); password.selectText(nil)
    case "shortcut":
      let down = CGEvent(keyboardEventSource: nil, virtualKey: 17, keyDown: true)
      let up = CGEvent(keyboardEventSource: nil, virtualKey: 17, keyDown: false)
      down?.flags = .maskAlternate; up?.flags = .maskAlternate
      down?.post(tap: .cghidEventTap); up?.post(tap: .cghidEventTap)
    default: break
  }
  emit(["id": op, "foreground": NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0,
    "pid": ProcessInfo.processInfo.processIdentifier, "selected": textView.selectedRange().length])
}

DispatchQueue.global().async {
  while let line = readLine() { DispatchQueue.main.async { handle(line) } }
  DispatchQueue.main.async { application.terminate(nil) }
}
window.makeKeyAndOrderFront(nil)
application.activate(ignoringOtherApps: true)
emit(["id": "ready"])
application.run()

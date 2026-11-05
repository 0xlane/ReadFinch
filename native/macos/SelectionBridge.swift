import Foundation
import AppKit
import ApplicationServices
let host = CommandLine.arguments.count > 1 ? Int32(CommandLine.arguments[1]) ?? 0 : 0
func emit(_ object: [String: Any]) { if let data = try? JSONSerialization.data(withJSONObject: object), let line = String(data:data,encoding:.utf8) { print(line); fflush(stdout) } }
@MainActor var lifetime = MacToolbarLifetime()
@MainActor var ignoreMouseGesture = false
@MainActor var selection: [String: Any]?
@MainActor var trusted: Bool?
@MainActor var preparedPID: pid_t?
@MainActor var preparedAt: CFAbsoluteTime = 0
@MainActor var pendingMouseSelectionUntil: TimeInterval?
@MainActor var mouseSelectionPoint: CGPoint?
@MainActor func invalidate(_ reason: String = "explicit") {
  if selection != nil {
    selectionDiagnostic(stage: "dismiss-" + reason)
    emit(["type":"invalid"])
  }
  selection = nil
  lifetime.clear()
}
@MainActor func checkPermission() {
  let allowed = AXIsProcessTrusted()
  guard allowed != trusted else { return }
  trusted = allowed
  preparedPID = nil
  pendingMouseSelectionUntil = nil
  if allowed {
    emit(["type":"ready", "message":"系统选区已连接"])
  } else {
    invalidate()
    emit(["type":"permission", "message":"请在系统设置 → 隐私与安全性 → 辅助功能中允许当前版本的 ReadFinch；授权后会自动连接"])
  }
}
@MainActor func poll(force: Bool = false) {
  guard trusted == true else { return }
  if let until = pendingMouseSelectionUntil, ProcessInfo.processInfo.systemUptime > until {
    pendingMouseSelectionUntil = nil
  }
  let mouseSelection = pendingMouseSelectionUntil != nil
  guard let front = NSWorkspace.shared.frontmostApplication else { return }
  // Transient AX failures and hover-dependent web nodes are not dismissal events.
  // Only an explicit shortcut or a completed mouse gesture reads selected text.
  if !force && !mouseSelection {
    if lifetime.dismissForApplication(front.processIdentifier, host: host) { invalidate("application") }
    return
  }
  guard front.processIdentifier != host else { if force { invalidate() }; return }
  if CGEventSource.buttonState(.combinedSessionState,button:.left) { if force { invalidate() }; return }
  let pid = front.processIdentifier
  let app = AXUIElementCreateApplication(pid)
  AXUIElementSetMessagingTimeout(app, 0.08)
  if preparedPID != pid || (selection == nil && CFAbsoluteTimeGetCurrent() - preparedAt > 2) {
    preparedPID = pid
    preparedAt = CFAbsoluteTimeGetCurrent()
    // Chromium/Electron may build their accessibility tree lazily.
    // Chromium shells may require either or both flags before their editable
    // descendants appear. The setters are idempotent; retry after a failed read.
    for name in ["AXManualAccessibility", "AXEnhancedUserInterface"] {
      if attribute(app, name) as? Bool != true {
        AXUIElementSetAttributeValue(app, name as CFString, kCFBooleanTrue)
      }
    }
  }
  let cursor = CGEvent(source: nil)?.location ?? .zero
  guard let resolved = foregroundSelection(application: app, cursor: cursor, diagnostics: true),
        NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else { invalidate(); return }
  let value = resolved.value
  pendingMouseSelectionUntil = nil
  let point = force ? value.anchor(near: cursor) : (mouseSelectionPoint ?? cursor)
  lifetime.begin(pid: pid, anchor: point)
  selection = ["token":UUID().uuidString,"text":value.text,"app":front.bundleIdentifier ?? front.localizedName ?? "unknown","x":point.x,"y":point.y,"canReplace":false]
  if !force {
    var event = selection!; event["type"] = "selection"; emit(event)
  }
}
final class CommandQueue: @unchecked Sendable {
  private let lock = NSLock()
  private var values: [[String: Any]] = []
  func push(_ value: [String: Any]) { lock.lock(); defer { lock.unlock() }; values.append(value) }
  func drain() -> [[String: Any]] { lock.lock(); defer { lock.unlock() }; let pending = values; values.removeAll(); return pending }
}
func readCommands(into commands: CommandQueue) {
  while let line = readLine() {
    guard let data = line.data(using:.utf8), let command = (try? JSONSerialization.jsonObject(with:data)) as? [String: Any] else { continue }
    commands.push(command)
  }
  commands.push(["op":"quit"])
}

final class MouseSelectionEvents: @unchecked Sendable {
  private let lock = NSLock()
  private var gesture = MacMouseSelectionGesture()
  private var lastMove: TimeInterval = 0
  let commands: CommandQueue
  init(commands: CommandQueue) { self.commands = commands }
  func receive(_ event: NSEvent) {
    lock.lock(); defer { lock.unlock() }
    let point = event.cgEvent?.location ?? event.locationInWindow
    switch event.type {
    case .leftMouseDown:
      gesture.down(at: point, clicks: event.clickCount)
      commands.push(["op": "mouseDown", "x": point.x, "y": point.y])
      selectionDiagnostic(stage: "mouseDown", clicks: event.clickCount)
    case .leftMouseDragged: gesture.drag(to: point)
    case .leftMouseUp:
      let accepted = gesture.up(at: point, clicks: event.clickCount, shift: event.modifierFlags.contains(.shift))
      selectionDiagnostic(stage: "mouse", length: Int(gesture.movement), clicks: event.clickCount, age: ProcessInfo.processInfo.systemUptime - event.timestamp, accepted: accepted)
      if accepted {
        commands.push(["op": "mouseSelection", "time": event.timestamp, "x": point.x, "y": point.y])
      }
    case .rightMouseDown, .otherMouseDown:
      commands.push(["op": "dismissPointer", "x": point.x, "y": point.y])
    case .mouseMoved:
      if event.timestamp - lastMove >= 0.05 {
        lastMove = event.timestamp
        commands.push(["op": "mouseMove", "x": point.x, "y": point.y])
      }
    case .scrollWheel:
      commands.push(["op": "scroll", "x": point.x, "y": point.y,
                     "dx": event.scrollingDeltaX, "dy": event.scrollingDeltaY])
    case .keyDown:
      // Keyboard events only dismiss; no key value/characters are read or stored.
      commands.push(["op": "dismissKeyboard"])
    default: break
    }
  }
}

@main struct SelectionBridge {
  @MainActor static func main() {
    let commands = CommandQueue()
    let application = NSApplication.shared
    application.setActivationPolicy(.prohibited)
    let mouseEvents = MouseSelectionEvents(commands: commands)
    guard let mouseMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .leftMouseDragged, .leftMouseUp, .rightMouseDown, .otherMouseDown, .mouseMoved, .scrollWheel, .keyDown], handler: { mouseEvents.receive($0) }) else {
      emit(["type": "error", "message": "无法监听鼠标选区，请重启伴读雀后重试。"])
      return
    }
    defer { NSEvent.removeMonitor(mouseMonitor) }
    DispatchQueue.global(qos: .userInitiated).async { readCommands(into: commands) }
    var ticks = 0
    let timer = Timer(timeInterval: 0.1, repeats: true) { _ in
      MainActor.assumeIsolated {
        if ticks % 10 == 0 { checkPermission() }
        for command in commands.drain() {
          let point: CGPoint? = (command["x"] as? CGFloat).flatMap { x in
            (command["y"] as? CGFloat).map { CGPoint(x: x, y: $0) }
          }
          switch command["op"] as? String {
          case "quit": application.terminate(nil)
          case "invalidate": pendingMouseSelectionUntil = nil; invalidate()
          case "toolbarBounds":
            if let point, let width = command["width"] as? CGFloat, let height = command["height"] as? CGFloat,
               point.x.isFinite, point.y.isFinite, width.isFinite, height.isFinite, width > 0, height > 0 {
              lifetime.toolbarBounds = CGRect(origin: point, size: CGSize(width: width, height: height))
            } else { lifetime.toolbarBounds = nil }
          case "mouseDown":
            ignoreMouseGesture = point.map { lifetime.containsToolbar($0) } ?? false
            if !ignoreMouseGesture { pendingMouseSelectionUntil = nil; invalidate("click") }
          case "dismissPointer":
            if let point, !lifetime.containsToolbar(point) { pendingMouseSelectionUntil = nil; invalidate("click") }
          case "dismissKeyboard":
            pendingMouseSelectionUntil = nil
            invalidate("keyboard")
          case "scroll":
            if let point, lifetime.dismissForScroll(at: point, dx: command["dx"] as? CGFloat ?? 0, dy: command["dy"] as? CGFloat ?? 0) {
              pendingMouseSelectionUntil = nil; invalidate("scroll")
            }
          case "mouseMove":
            if let point, lifetime.dismissForMove(to: point) { invalidate("distance") }
          case "mouseSelection":
            if !ignoreMouseGesture, let time = command["time"] as? TimeInterval {
              pendingMouseSelectionUntil = time + 0.8
              if let x = command["x"] as? CGFloat, let y = command["y"] as? CGFloat {
                mouseSelectionPoint = CGPoint(x: x, y: y)
              }
            }
          case "refresh":
            pendingMouseSelectionUntil = nil
            checkPermission()
            poll(force: true)
            emit(["type":"selectionSnapshot", "id":command["id"] as? String ?? "", "selection":selection as Any? ?? NSNull()])
          default: break
          }
        }
        poll()
        ticks += 1
        if ticks % 10 == 0 { emit(["type":"heartbeat"]) }
      }
    }
    RunLoop.main.add(timer, forMode: .common)
    // NSEvent's global monitor requires AppKit's event loop, not just an async
    // command polling task. The helper remains a background-only application.
    application.run()
    timer.invalidate()
  }
}

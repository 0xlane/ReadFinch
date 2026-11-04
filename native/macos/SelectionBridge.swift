import Foundation
import AppKit
import ApplicationServices
let host = CommandLine.arguments.count > 1 ? Int32(CommandLine.arguments[1]) ?? 0 : 0
func emit(_ object: [String: Any]) { if let data = try? JSONSerialization.data(withJSONObject: object), let line = String(data:data,encoding:.utf8) { print(line); fflush(stdout) } }
@MainActor var last: (pid: pid_t, element: AXUIElement, value: MacTextSelection)?
@MainActor var selection: [String: Any]?
@MainActor var trusted: Bool?
@MainActor var preparedPID: pid_t?
@MainActor func invalidate() {
  if selection != nil { emit(["type":"invalid"]) }
  selection = nil
  last = nil
}
@MainActor func checkPermission() {
  let allowed = AXIsProcessTrusted()
  guard allowed != trusted else { return }
  trusted = allowed
  preparedPID = nil
  if allowed {
    emit(["type":"ready", "message":"系统选区已连接"])
  } else {
    invalidate()
    emit(["type":"error", "message":"请在系统设置 → 隐私与安全性 → 辅助功能中允许伴读雀读取选区。"])
  }
}
@MainActor func poll(force: Bool = false) {
  guard trusted == true else { return }
  guard let front = NSWorkspace.shared.frontmostApplication, front.processIdentifier != host else { if force { invalidate() }; return }
  if CGEventSource.buttonState(.combinedSessionState,button:.left) { if force { invalidate() }; return }
  let pid = front.processIdentifier
  let app = AXUIElementCreateApplication(pid)
  if preparedPID != pid {
    preparedPID = pid
    // Chromium/Electron may build their accessibility tree lazily.
    let name = "AXManualAccessibility" as CFString
    var writable: DarwinBoolean = false
    if AXUIElementIsAttributeSettable(app, name, &writable) == .success, writable.boolValue,
       attribute(app, "AXManualAccessibility") as? Bool != true {
      AXUIElementSetAttributeValue(app, name, kCFBooleanTrue)
    }
  }
  guard let focused = attribute(app, kAXFocusedUIElementAttribute),
        CFGetTypeID(focused) == AXUIElementGetTypeID() else { invalidate(); return }
  let element = focused as! AXUIElement
  guard let value = MacTextReader(element: element).selection(),
        NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else { invalidate(); return }
  if let last, last.pid == pid, CFEqual(last.element, element), value.matches(last.value) { return }
  last = (pid, element, value)
  let point = value.anchor(near: CGEvent(source: nil)?.location ?? .zero)
  selection = ["token":UUID().uuidString,"text":value.text,"app":front.bundleIdentifier ?? front.localizedName ?? "unknown","x":point.x,"y":point.y,"canReplace":false]
  var event = selection!; event["type"] = "selection"; emit(event)
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
@main struct SelectionBridge {
  @MainActor static func main() async throws {
    let commands = CommandQueue()
    DispatchQueue.global(qos: .userInitiated).async { readCommands(into: commands) }
    var ticks = 0
    while true {
      if ticks % 5 == 0 { checkPermission() }
      for command in commands.drain() {
        switch command["op"] as? String {
        case "quit": return
        case "invalidate": invalidate()
        case "refresh":
          poll(force: true)
          emit(["type":"selectionSnapshot", "id":command["id"] as? String ?? "", "selection":selection as Any? ?? NSNull()])
        default: break
        }
      }
      poll()
      ticks += 1
      if ticks % 5 == 0 { emit(["type":"heartbeat"]) }
      try await Task.sleep(nanoseconds: 200_000_000)
    }
  }
}

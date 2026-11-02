import Foundation
import AppKit
import ApplicationServices
let host = CommandLine.arguments.count > 1 ? Int32(CommandLine.arguments[1]) ?? 0 : 0
func emit(_ object: [String: Any]) { if let data = try? JSONSerialization.data(withJSONObject: object), let line = String(data:data,encoding:.utf8) { print(line); fflush(stdout) } }
func attr(_ element: AXUIElement, _ name: CFString) -> CFTypeRef? { var value: CFTypeRef?; return AXUIElementCopyAttributeValue(element,name,&value) == .success ? value : nil }
guard AXIsProcessTrusted() else { emit(["type":"error","message":"请在系统设置 → 隐私与安全性 → 辅助功能中允许 TextHop，然后重启应用"]); exit(1) }
emit(["type":"ready","message":"macOS Accessibility 已连接；当前提供复制结果"])
var last = ""
var selection: [String: Any]? = nil
@MainActor func invalidate() { if selection != nil { emit(["type":"invalid"]) }; selection = nil; last = "" }
@MainActor func poll(force: Bool = false) {
  guard let front = NSWorkspace.shared.frontmostApplication, front.processIdentifier != host else { if force { invalidate() }; return }
  if CGEventSource.buttonState(.combinedSessionState,button:.left) { if force { invalidate() }; return }
  let app = AXUIElementCreateApplication(front.processIdentifier)
  guard let focused = attr(app,kAXFocusedUIElementAttribute as CFString) else { invalidate(); return }
  let element = focused as! AXUIElement
  let role = attr(element,kAXSubroleAttribute as CFString) as? String ?? ""
  let text = role.contains("Secure") ? "" : (attr(element,kAXSelectedTextAttribute as CFString) as? String ?? "")
  let key = "\(front.processIdentifier):\(text)"
  if NSWorkspace.shared.frontmostApplication?.processIdentifier != front.processIdentifier || text.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || text.count > 100000 { invalidate(); return }
  if key == last { return }
  last = key
  let point = CGEvent(source:nil)?.location ?? .zero
  selection = ["token":UUID().uuidString,"text":text,"app":front.bundleIdentifier ?? front.localizedName ?? "unknown","x":point.x,"y":point.y,"canReplace":false]
  var event = selection!; event["type"] = "selection"; emit(event)
}
final class CommandQueue: @unchecked Sendable {
  private let lock = NSLock()
  private var values: [[String: Any]] = []
  func push(_ value: [String: Any]) { lock.lock(); defer { lock.unlock() }; values.append(value) }
  func drain() -> [[String: Any]] { lock.lock(); defer { lock.unlock() }; let pending = values; values.removeAll(); return pending }
}
let commands = CommandQueue()
DispatchQueue.global(qos: .userInitiated).async {
  while let line = readLine() {
    guard let data = line.data(using:.utf8), let command = (try? JSONSerialization.jsonObject(with:data)) as? [String: Any] else { continue }
    commands.push(command)
  }
  commands.push(["op":"quit"])
}
var ticks = 0
while true {
  let pending = commands.drain()
  for command in pending {
    if command["op"] as? String == "quit" { exit(0) }
    if command["op"] as? String == "invalidate" { invalidate() }
    if command["op"] as? String == "refresh" {
      poll(force:true)
      emit(["type":"selectionSnapshot","id":command["id"] as? String ?? "","selection":selection as Any? ?? NSNull()])
    }
  }
  poll()
  ticks += 1
  if ticks % 5 == 0 { emit(["type":"heartbeat"]) }
  Thread.sleep(forTimeInterval:0.2)
}

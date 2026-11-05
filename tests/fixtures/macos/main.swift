import ApplicationServices
import Foundation

func span(_ start: Int, _ length: Int) -> AXValue {
  var range = CFRange(location: start, length: length)
  return AXValueCreate(.cfRange, &range)!
}
func box(_ x: CGFloat, _ y: CGFloat) -> AXValue {
  var rect = CGRect(x: x, y: y, width: 62, height: 18)
  return AXValueCreate(.cgRect, &rect)!
}
let word = "headers" as CFString
let bounds = box(-1180, -90)
func read(_ attrs: [String: CFTypeRef], _ parameters: [String: CFTypeRef] = [:]) -> MacTextSelection? {
  MacTextReader(read: { attrs[$0] }, readParameter: { name, _ in parameters[name] }).selection()
}
let firstRange = span(4, 7)
let fields = [kAXSelectedTextAttribute: word, kAXSelectedTextRangeAttribute: firstRange] as [String: CFTypeRef]
let rect = [kAXBoundsForRangeParameterizedAttribute: bounds] as [String: CFTypeRef]
let first = read(fields, rect)!
let nearby = CGPoint(x: -1160, y: -80), distant = CGPoint(x: 700, y: 600)
precondition(first.anchor(near: nearby) == nearby)
precondition(first.anchor(near: distant) == CGPoint(x: -1119, y: -73))
precondition(first.matches(read(fields, rect)!))
let second = read([kAXSelectedTextAttribute: word, kAXSelectedTextRangeAttribute: span(80, 7)], rect)!
precondition(!first.matches(second))
let ranged = read([kAXSelectedTextRangeAttribute: firstRange], [kAXStringForRangeParameterizedAttribute: word])!
precondition(ranged.text == "headers" && ranged.anchor(near: distant) == distant)

let marked = [kAXSelectedTextAttribute: "" as CFString, "AXSelectedTextMarkerRange": Data([1]) as CFData] as [String: CFTypeRef]
let markerText: [String: CFTypeRef] = ["AXStringForTextMarkerRange": word, "AXBoundsForTextMarkerRange": bounds]
let web = read(marked, markerText)!
precondition(web.text == "headers" && web.matches(read(marked, markerText)!))
precondition(!web.matches(read(marked, ["AXStringForTextMarkerRange": word, "AXBoundsForTextMarkerRange": box(200, 200)])!))
precondition(read(marked) == nil)
precondition(read([kAXSelectedTextRangeAttribute: span(0, 0), kAXSelectedTextAttribute: "" as CFString]) == nil)
precondition(read([kAXSelectedTextRangeAttribute: span(0, 100_001), kAXSelectedTextAttribute: word]) == nil)
let secure = MacTextReader(read: { name in
  precondition(name == kAXSubroleAttribute, "a password field must never be queried for text")
  return kAXSecureTextFieldSubrole as CFString
}, readParameter: { _, _ in fatalError("unexpected secure text request") })
precondition(secure.selection() == nil)

let fallbackValue = "A 😀 selected phrase" as CFString
let valueRange = span(2, 2)
let valueSelection = read([kAXSelectedTextRangeAttribute: valueRange, kAXValueAttribute: fallbackValue])!
precondition(valueSelection.text == "😀")
precondition(read([kAXSelectedTextRangeAttribute: span(99, 5), kAXValueAttribute: fallbackValue]) == nil)
precondition(read([kAXSelectedTextRangeAttribute: span(0, 1), kAXValueAttribute: String(repeating: "a", count: 1_000_001) as CFString]) == nil)

// Simulate a chat composer retaining focus while a sibling web message is selected.
let parents = [1: 0, 2: 3, 3: 0, 4: 0, 5: 4]
var selectedNodes: [Int] = []
let search = MacSelectionSearch<Int>(
  parent: { parents[$0] },
  selected: { node in selectedNodes.append(node); return node == 3 ? web : nil },
  secure: { $0 == 4 },
  equal: { $0 == $1 }
)
let chat = search.selection(focused: 1, hit: 2)!
precondition(chat.element == 3 && chat.value.text == "headers")
selectedNodes = []
precondition(search.selection(focused: 4, hit: 2) == nil)
precondition(selectedNodes.isEmpty)
precondition(search.selection(focused: 1, hit: 5) == nil)
precondition(selectedNodes.isEmpty)
precondition(search.selection(focused: 1, hit: nil) == nil)
var readCount = 0
let bounded = MacSelectionSearch<Int>(
  parent: { $0 + 1 }, selected: { _ in readCount += 1; return nil },
  secure: { _ in false }, equal: { $0 == $1 }
)
precondition(bounded.selection(focused: 0, hit: nil) == nil && readCount == 0)

var mouse = MacMouseSelectionGesture()
let origin = CGPoint(x: 100, y: 100)
precondition(!mouse.up(at: origin, clicks: 2, shift: false))
mouse.down(at: origin)
precondition(!mouse.up(at: origin, clicks: 1, shift: false))
mouse.down(at: origin)
precondition(mouse.up(at: origin, clicks: 2, shift: false))
mouse.down(at: origin)
mouse.drag(to: CGPoint(x: 120, y: 100))
precondition(mouse.up(at: CGPoint(x: 125, y: 100), clicks: 1, shift: false))
mouse.down(at: origin)
precondition(mouse.up(at: origin, clicks: 1, shift: true))
mouse.down(at: origin)
precondition(!mouse.up(at: CGPoint(x: 101, y: 101), clicks: 1, shift: false))
mouse.down(at: origin, clicks: 2)
precondition(mouse.up(at: origin, clicks: 1, shift: false))

// Embedded editors can expose selected text on a child of the focused wrapper.
var traversed: [Int] = []
let editorSearch = MacSelectionSearch<Int>(
  parent: { $0 == 1 ? 0 : nil },
  selected: { traversed.append($0); return $0 == 2 ? web : nil },
  secure: { $0 == 3 }, equal: { $0 == $1 },
  children: { $0 == 1 ? [3, 2] : [] }
)
precondition(editorSearch.selection(focused: 1, hit: nil)?.element == 2)
precondition(traversed == [1, 2])
precondition(read([kAXSelectedTextAttribute: NSNumber(value: 9999)])?.text == "9999")
precondition(read([kAXSelectedTextAttribute: kCFBooleanTrue!]) == nil)

// Hover-dependent AX providers may stop exposing a selected element while the
// pointer travels to a toolbar. Movement uses geometry, never a fresh AX read.
var lifetime = MacToolbarLifetime()
let releasePoint = CGPoint(x: -4, y: -60)
lifetime.begin(pid: 123, anchor: releasePoint)
lifetime.toolbarBounds = CGRect(x: -580, y: -34, width: 560, height: 48)
for target in [CGPoint(x: -575, y: -30), CGPoint(x: -25, y: 10)] {
  for step in 0...40 {
    let progress = CGFloat(step) / 40
    let point = CGPoint(x: releasePoint.x + (target.x - releasePoint.x) * progress,
                        y: releasePoint.y + (target.y - releasePoint.y) * progress)
    precondition(!lifetime.dismissForMove(to: point), "the entire path to a wide toolbar must remain usable")
  }
}
precondition(lifetime.containsToolbar(CGPoint(x: -200, y: 0)))
precondition(!lifetime.containsToolbar(CGPoint(x: 1, y: 200)))
precondition(lifetime.dismissForMove(to: CGPoint(x: 300, y: 400)))
precondition(!lifetime.dismissForScroll(at: CGPoint(x: -200, y: 0), dx: 0, dy: 1000))
precondition(!lifetime.dismissForScroll(at: releasePoint, dx: 0, dy: 40))
precondition(lifetime.dismissForScroll(at: releasePoint, dx: 0, dy: 41))
precondition(!lifetime.dismissForApplication(123, host: 456))
precondition(!lifetime.dismissForApplication(456, host: 456))
precondition(lifetime.dismissForApplication(789, host: 456))
lifetime.clear()
precondition(!lifetime.dismissForMove(to: releasePoint))
precondition(!lifetime.dismissForApplication(789, host: 456))

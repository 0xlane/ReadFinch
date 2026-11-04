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

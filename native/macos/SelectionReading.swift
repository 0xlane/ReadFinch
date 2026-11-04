import ApplicationServices
import Foundation

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
  var value: CFTypeRef?
  return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}

private func rangeValue(_ value: CFTypeRef?) -> CFRange? {
  guard let value, CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
  var range = CFRange(location: 0, length: 0)
  guard AXValueGetValue(value as! AXValue, .cfRange, &range),
        range.location >= 0, range.length > 0 else { return nil }
  return range
}

private func rectValue(_ value: CFTypeRef?) -> CGRect? {
  guard let value, CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
  var rect = CGRect.zero
  guard AXValueGetValue(value as! AXValue, .cgRect, &rect),
        !rect.isEmpty, !rect.isInfinite, rect.maxX.isFinite, rect.maxY.isFinite else { return nil }
  return rect
}

struct MacTextSelection {
  let text: String
  let range: CFRange?
  let bounds: CGRect?

  func matches(_ other: Self) -> Bool {
    guard text == other.text else { return false }
    if let range, let previous = other.range {
      return range.location == previous.location && range.length == previous.length
    }
    return range == nil && other.range == nil && bounds == other.bounds
  }

  func anchor(near cursor: CGPoint) -> CGPoint {
    // AX and CGEvent use global, top-left screen points on macOS, including Retina.
    guard let bounds, !bounds.insetBy(dx: -8, dy: -8).contains(cursor) else { return cursor }
    return CGPoint(x: bounds.maxX - min(1, bounds.width / 2),
                   y: bounds.maxY - min(1, bounds.height / 2))
  }
}

struct MacTextReader {
  let read: (String) -> CFTypeRef?
  let readParameter: (String, CFTypeRef) -> CFTypeRef?

  func selection() -> MacTextSelection? {
    if (read(kAXSubroleAttribute) as? String) == kAXSecureTextFieldSubrole { return nil }
    let rangeObject = read(kAXSelectedTextRangeAttribute)
    let range = rangeValue(rangeObject)
    if let range, range.length > 100_000 { return nil }
    var text = read(kAXSelectedTextAttribute) as? String ?? ""
    if text.isEmpty, range != nil, let rangeObject {
      text = readParameter(kAXStringForRangeParameterizedAttribute, rangeObject) as? String ?? ""
    }
    // A web view can return an empty AXSelectedText while exposing the actual
    // selection as a text marker. Only query the selected span.
    let marker = range == nil || text.isEmpty ? read("AXSelectedTextMarkerRange") : nil
    var usedMarker = false
    if text.isEmpty, let marker {
      text = readParameter("AXStringForTextMarkerRange", marker) as? String ?? ""
      usedMarker = !text.isEmpty
    }
    guard !text.isEmpty, text.utf16.count <= 100_000,
          !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    var bounds: CGRect?
    if !usedMarker, range != nil, let rangeObject {
      bounds = rectValue(readParameter(kAXBoundsForRangeParameterizedAttribute, rangeObject))
    }
    if bounds == nil, let marker {
      bounds = rectValue(readParameter("AXBoundsForTextMarkerRange", marker))
    }
    return MacTextSelection(text: text, range: usedMarker ? nil : range, bounds: bounds)
  }
}

extension MacTextReader {
  init(element: AXUIElement) {
    self.init(read: { attribute(element, $0) }, readParameter: { name, parameter in
      var value: CFTypeRef?
      return AXUIElementCopyParameterizedAttributeValue(element, name as CFString, parameter, &value) == .success ? value : nil
    })
  }
}

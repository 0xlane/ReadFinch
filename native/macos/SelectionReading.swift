import ApplicationServices
import Foundation

func selectionDiagnostic(stage: String, role: String? = nil, length: Int? = nil, clicks: Int? = nil, age: Double? = nil, accepted: Bool? = nil) {
  guard ProcessInfo.processInfo.environment["READFINCH_SELECTION_DIAGNOSTICS"] == "1" else { return }
  var value: [String: Any] = ["type": "diagnostic", "stage": stage]
  if let role { value["role"] = role }
  if let length { value["length"] = length }
  if let clicks { value["clicks"] = clicks }
  if let age { value["age"] = age }
  if let accepted { value["accepted"] = accepted }
  if let data = try? JSONSerialization.data(withJSONObject: value), let line = String(data: data, encoding: .utf8) {
    print(line); fflush(stdout)
  }
}

struct MacMouseSelectionGesture {
  private var origin: CGPoint?
  private var dragged = false
  private var downClicks = 1
  private(set) var movement: CGFloat = 0

  mutating func down(at point: CGPoint, clicks: Int = 1) { origin = point; dragged = false; downClicks = clicks; movement = 0 }
  mutating func drag(to point: CGPoint) {
    guard let origin else { return }
    movement = max(movement, hypot(point.x - origin.x, point.y - origin.y))
    if movement >= 3 { dragged = true }
  }
  mutating func up(at point: CGPoint, clicks: Int, shift: Bool) -> Bool {
    defer { origin = nil; dragged = false }
    guard origin != nil else { return false }
    drag(to: point)
    return dragged || max(clicks, downClicks) >= 2 || shift
  }
}

// The selected text is a snapshot. Its toolbar lifetime follows user events,
// not repeated AX reads of whichever element happens to be under the pointer.
// See Easydict's PopButtonVisibilityController / EventMonitor (GPL-3.0).
struct MacToolbarLifetime {
  private(set) var sourcePID: pid_t?
  private var anchor: CGPoint?
  var toolbarBounds: CGRect?
  private var scrolled: CGFloat = 0

  mutating func begin(pid: pid_t, anchor: CGPoint) {
    sourcePID = pid; self.anchor = anchor; scrolled = 0
  }
  mutating func clear() { sourcePID = nil; anchor = nil; toolbarBounds = nil; scrolled = 0 }
  func containsToolbar(_ point: CGPoint) -> Bool { toolbarBounds?.contains(point) ?? false }
  func dismissForMove(to point: CGPoint) -> Bool {
    guard let anchor, let toolbarBounds else { return false }
    // Easydict uses a 120-point neighborhood around its single icon. A toolbar
    // can be wider: include the whole bar, menus and the path from mouse release.
    let path = toolbarBounds.union(CGRect(origin: anchor, size: CGSize(width: 1, height: 1)))
    return !path.insetBy(dx: -120, dy: -120).contains(point)
  }
  mutating func dismissForScroll(at point: CGPoint, dx: CGFloat, dy: CGFloat) -> Bool {
    guard sourcePID != nil, !containsToolbar(point) else { return false }
    scrolled += abs(dx) + abs(dy)
    return scrolled > 80
  }
  func dismissForApplication(_ pid: pid_t, host: pid_t) -> Bool {
    sourcePID.map { pid != $0 && pid != host } ?? false
  }
}

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
    let selectedValue = read(kAXSelectedTextAttribute)
    var text = selectedValue as? String ?? ""
    if text.isEmpty, let selectedValue, CFGetTypeID(selectedValue) == CFNumberGetTypeID() {
      text = (selectedValue as! NSNumber).stringValue
    }
    if text.isEmpty, range != nil, let rangeObject {
      text = readParameter(kAXStringForRangeParameterizedAttribute, rangeObject) as? String ?? ""
    }
    if text.isEmpty, let range, let value = read(kAXValueAttribute) as? String {
      // Some embedded editors expose a range and a value but not AXStringForRange.
      let count = value.utf16.count
      if count <= 1_000_000, range.location <= count, range.length <= count - range.location,
         let selected = Range(NSRange(location: range.location, length: range.length), in: value) {
        text = String(value[selected])
      }
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
  init(element: AXUIElement, canRead: @escaping () -> Bool = { true }) {
    AXUIElementSetMessagingTimeout(element, 0.08)
    self.init(read: { canRead() ? attribute(element, $0) : nil }, readParameter: { name, parameter in
      guard canRead() else { return nil }
      var value: CFTypeRef?
      return AXUIElementCopyParameterizedAttributeValue(element, name as CFString, parameter, &value) == .success ? value : nil
    })
  }
}

// Chat clients can leave keyboard focus in the composer while the selected text
// belongs to a message's web area. Search only the foreground window's candidate
// ancestry, re-reading each selection rather than reusing cached text.
struct MacSelectionSearch<Element> {
  let parent: (Element) -> Element?
  let selected: (Element) -> MacTextSelection?
  let secure: (Element) -> Bool
  let equal: (Element, Element) -> Bool
  var canRead: () -> Bool = { true }
  var children: (Element) -> [Element] = { _ in [] }

  func selection(focused: Element?, hit: Element?) -> (element: Element, value: MacTextSelection)? {
    if let focused, secure(focused) { return nil }
    if let hit, secure(hit) { return nil }
    var seen: [Element] = []
    for root in [focused, hit].compactMap({ $0 }) {
      var next: Element? = root
      while let element = next {
        if seen.contains(where: { equal($0, element) }) { break }
        guard seen.count < 24, canRead() else { return nil }
        if secure(element) { return nil }
        seen.append(element)
        next = parent(element)
      }
    }
    // Inspired by selection-hook: focus, direct children, then ancestors.
    // Validate the entire candidate ancestry before asking for any text.
    var candidates: [Element] = []
    for root in [focused, hit].compactMap({ $0 }) {
      candidates.append(root)
      guard canRead() else { return nil }
      for child in children(root).prefix(32) {
        guard canRead() else { return nil }
        if !secure(child) { candidates.append(child) }
      }
    }
    candidates.append(contentsOf: seen)
    var readElements: [Element] = []
    for element in candidates {
      if readElements.contains(where: { equal($0, element) }) { continue }
      readElements.append(element)
      guard canRead() else { return nil }
      if let value = selected(element) { return (element, value) }
    }
    return nil
  }
}

private func axElement(_ value: CFTypeRef?) -> AXUIElement? {
  guard let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
  return (value as! AXUIElement)
}

private func axChildren(_ element: AXUIElement) -> [AXUIElement] {
  var values: CFArray?
  guard AXUIElementCopyAttributeValues(element, kAXChildrenAttribute as CFString, 0, 32, &values) == .success,
        let values else { return [] }
  return (values as [AnyObject]).compactMap { axElement($0) }
}

func foregroundSelection(application: AXUIElement, cursor: CGPoint, diagnostics: Bool = false) -> (element: AXUIElement, value: MacTextSelection)? {
  let deadline = CFAbsoluteTimeGetCurrent() + 0.25
  let canRead = { CFAbsoluteTimeGetCurrent() < deadline }
  AXUIElementSetMessagingTimeout(application, 0.08)
  let focused = axElement(attribute(application, kAXFocusedUIElementAttribute))
  if let focused, attribute(focused, kAXSubroleAttribute) as? String == kAXSecureTextFieldSubrole { return nil }
  // Read the focus chain before hit-testing. Rich-text composers often expose
  // a usable selection directly, while their native wrapper ancestry is costly.
  if let focused {
    let focusSearch = MacSelectionSearch<AXUIElement>(
      parent: { element in
        guard canRead() else { return nil }
        let role = attribute(element, kAXRoleAttribute) as? String
        if role == "AXWebArea" || role == kAXWindowRole || role == kAXApplicationRole { return nil }
        return axElement(attribute(element, kAXParentAttribute))
      },
      selected: { MacTextReader(element: $0, canRead: canRead).selection() },
      secure: { attribute($0, kAXSubroleAttribute) as? String == kAXSecureTextFieldSubrole },
      equal: { CFEqual($0, $1) }, canRead: canRead, children: axChildren
    )
    if let selected = focusSearch.selection(focused: focused, hit: nil) {
      if diagnostics { selectionDiagnostic(stage: "focus-selection", role: attribute(selected.element, kAXRoleAttribute) as? String, length: selected.value.text.utf16.count) }
      return selected
    }
  }
  let window = axElement(attribute(application, kAXFocusedWindowAttribute))
  var pointed: AXUIElement?
  if canRead(), window != nil {
    AXUIElementCopyElementAtPosition(application, Float(cursor.x), Float(cursor.y), &pointed)
  }
  // A background window of the same app must not supply a stale selection.
  if let pointedElement = pointed, let window {
    var belongs = CFEqual(pointedElement, window)
    if let owner = axElement(attribute(pointedElement, kAXWindowAttribute)) {
      belongs = belongs || CFEqual(owner, window)
    } else {
      var ancestor: AXUIElement? = pointedElement
      for _ in 0..<16 {
        guard canRead(), let current = ancestor else { break }
        if CFEqual(current, window) { belongs = true; break }
        ancestor = axElement(attribute(current, kAXParentAttribute))
      }
    }
    if !belongs { pointed = nil }
  }
  let search = MacSelectionSearch<AXUIElement>(
    parent: { element in
      guard canRead(), window.map({ !CFEqual(element, $0) }) ?? true,
            let parent = axElement(attribute(element, kAXParentAttribute)),
            attribute(parent, kAXRoleAttribute) as? String != kAXApplicationRole else { return nil }
      return parent
    },
    selected: { element in
      let value = MacTextReader(element: element, canRead: canRead).selection()
      if diagnostics && ProcessInfo.processInfo.environment["READFINCH_SELECTION_DIAGNOSTICS"] == "1" {
        selectionDiagnostic(stage: "candidate", role: attribute(element, kAXRoleAttribute) as? String, length: value?.text.utf16.count ?? 0)
      }
      return value
    },
    secure: { attribute($0, kAXSubroleAttribute) as? String == kAXSecureTextFieldSubrole },
    equal: { CFEqual($0, $1) }, canRead: canRead, children: axChildren
  )
  return search.selection(focused: focused, hit: pointed)
}

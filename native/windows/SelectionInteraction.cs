using System;
using System.Drawing;

// Selected text is a snapshot. Only a completed mouse selection or an explicit
// shortcut may read a provider; moving to the toolbar must not query it again.
internal sealed class SelectionInteraction {
  internal struct Input {
    public string Kind;
    public Point Point;
    public long Time;
    public IntPtr Window;
    public uint Pid;
    public bool Shift;
    public int Delta;
  }
  private readonly int doubleClickTime, doubleClickWidth, doubleClickHeight;
  private Point origin, lastDown, anchor;
  private long lastDownAt = -10000, pendingUntil;
  private IntPtr downWindow, lastDownWindow, pendingWindow;
  private bool down, dragged, ignored;
  private int clicks, scrolled;
  private uint sourcePid;
  private Rectangle? toolbar;

  internal SelectionInteraction(int doubleClickTime, int doubleClickWidth, int doubleClickHeight) {
    this.doubleClickTime = doubleClickTime;
    this.doubleClickWidth = doubleClickWidth;
    this.doubleClickHeight = doubleClickHeight;
  }
  internal void SetToolbar(Rectangle? bounds) { toolbar = bounds; }
  internal bool ContainsToolbar(Point point) { return toolbar.HasValue && toolbar.Value.Contains(point); }
  internal void Clear() { sourcePid = 0; toolbar = null; scrolled = 0; }
  internal void CancelPending() { pendingUntil = 0; }
  internal void Begin(uint pid, Point point) { sourcePid = pid; anchor = point; scrolled = 0; pendingUntil = 0; }
  internal bool DismissForApplication(uint pid, uint host) { return sourcePid != 0 && pid != sourcePid && pid != host; }
  internal bool Pending(long now, IntPtr foreground) {
    if (now > pendingUntil || foreground != pendingWindow) pendingUntil = 0;
    return pendingUntil != 0;
  }
  internal Point SelectionPoint { get { return anchor; } }
  // Return true to dismiss the current snapshot. No keyboard characters or
  // virtual-key values reach this state machine.
  internal bool Receive(Input input, uint host) {
    switch (input.Kind) {
      case "down":
        CancelPending();
        ignored = input.Pid == host;
        down = !ignored; dragged = false; origin = input.Point; downWindow = input.Window;
        if (!ignored && lastDownWindow == input.Window && input.Time - lastDownAt <= doubleClickTime &&
            Math.Abs(input.Point.X - lastDown.X) <= doubleClickWidth / 2 &&
            Math.Abs(input.Point.Y - lastDown.Y) <= doubleClickHeight / 2) clicks++;
        else clicks = 1;
        lastDownAt = input.Time; lastDown = input.Point; lastDownWindow = input.Window;
        return !ignored || !ContainsToolbar(input.Point);
      case "move":
        TrackDrag(input.Point);
        if (sourcePid == 0 || !toolbar.HasValue) return false;
        var path = Rectangle.Union(toolbar.Value, new Rectangle(anchor.X, anchor.Y, 1, 1));
        path.Inflate(120, 120);
        return !path.Contains(input.Point);
      case "up":
        if (!down || ignored) { down = false; return false; }
        TrackDrag(input.Point); down = false;
        if (dragged || clicks >= 2 || input.Shift) {
          pendingUntil = input.Time + 800; pendingWindow = downWindow; anchor = input.Point;
        }
        if (dragged) { lastDownAt = -10000; clicks = 0; }
        return false;
      case "keyboard":
        CancelPending(); return true;
      case "pointer":
      case "cancel":
        down = false; lastDownAt = -10000; CancelPending();
        return input.Kind == "cancel" || input.Pid != host || !ContainsToolbar(input.Point);
      case "scroll":
        if (ContainsToolbar(input.Point)) return false;
        CancelPending(); down = false;
        scrolled += Math.Abs(input.Delta);
        return sourcePid != 0 && scrolled > 80;
    }
    return false;
  }
  private void TrackDrag(Point point) {
    if (!down) return;
    long x = (long)point.X - origin.X, y = (long)point.Y - origin.Y;
    if (x * x + y * y >= 9) dragged = true;
  }
}

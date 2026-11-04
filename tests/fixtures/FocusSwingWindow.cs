using System;
using System.Runtime.InteropServices;
using System.Threading;

// Swing can report an active frame while Windows still routes global input
// to a different app. Address only the Java process created by the fixture.
class FocusSwingWindow {
  [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string kind, string title);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int w, int h, uint flags);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window, ref Point point);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  static int Main(string[] args) {
    SetThreadDpiAwarenessContext(new IntPtr(-4));
    var window = FindWindow(null, "ReadFinch Swing selection fixture " + args[0]);
    uint owner;
    if (GetWindowThreadProcessId(window, out owner) == 0 || owner != UInt32.Parse(args[0])) return 2;
    if (window == GetForegroundWindow()) return 0;
    SetWindowPos(window, new IntPtr(-1), 0, 0, 0, 0, 3);
    try {
      SetForegroundWindow(window);
      if (window == GetForegroundWindow()) return 0;
      var point = new Point { X = 25, Y = 25 };
      Point previous;
      if (!ClientToScreen(window, ref point) || GetAncestor(WindowFromPoint(point), 2) != window ||
          !GetCursorPos(out previous) || !SetCursorPos(point.X, point.Y)) return 3;
      try {
        if (GetAncestor(WindowFromPoint(point), 2) != window) return 3;
        mouse_event(2, 0, 0, 0, UIntPtr.Zero);
        mouse_event(4, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(80);
      } finally { SetCursorPos(previous.X, previous.Y); }
      return window == GetForegroundWindow() ? 0 : 4;
    } finally { SetWindowPos(window, new IntPtr(-2), 0, 0, 0, 0, 0x13); }
  }
}

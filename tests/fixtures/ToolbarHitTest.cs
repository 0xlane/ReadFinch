using System;
using System.Drawing;
using System.Globalization;
using System.Runtime.InteropServices;

// Check the composed desktop rather than a Chromium screenshot, which does
// not include the HWND's clipping region. Sample only the fixture's toolbar.
class ToolbarHitTest {
  [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window, out Rect bounds);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window, ref Point point);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);

  static int Offset(string fraction, int extent) {
    return (int)Math.Round(Double.Parse(fraction, CultureInfo.InvariantCulture) * extent);
  }
  static void Main(string[] args) {
    SetThreadDpiAwarenessContext(new IntPtr(-4));
    var window = new IntPtr(Int64.Parse(args[0]));
    Rect client;
    var origin = new Point();
    if (!GetClientRect(window, out client) || !ClientToScreen(window, ref origin))
      throw new Exception("Toolbar has no native client area");
    var bar = new Rectangle(origin.X + Offset(args[1], client.Right), origin.Y + Offset(args[2], client.Bottom),
      Offset(args[3], client.Right), Offset(args[4], client.Bottom));
    bar.Inflate(-3, -3);
    foreach (var x in new[] { 0.12, 0.5, 0.88 }) {
      foreach (var y in new[] { 0.15, 0.5, 0.85 }) {
        var point = new Point(bar.Left + (int)(bar.Width * x), bar.Top + (int)(bar.Height * y));
        if (GetAncestor(WindowFromPoint(point), 2) != window)
          throw new Exception("Part of the toolbar did not receive native hit tests");
      }
    }
    using (var image = new Bitmap(bar.Width, bar.Height)) {
      using (var graphics = Graphics.FromImage(image))
        graphics.CopyFromScreen(bar.Location, Point.Empty, image.Size);
      // At least a third of the rows must contain visible icon pixels. Skip
      // the More separator and outer borders, which can survive a bad repaint.
      int visibleRows = 0;
      for (int y = 0; y < image.Height; y++) {
        var background = image.GetPixel(1, y);
        for (int x = 4; x < image.Width / 2; x++) {
          var pixel = image.GetPixel(x, y);
          if (Math.Abs(background.R - pixel.R) + Math.Abs(background.G - pixel.G) +
              Math.Abs(background.B - pixel.B) > 100) { visibleRows++; break; }
        }
      }
      if (visibleRows < image.Height / 3) throw new Exception("The composed toolbar has no full-height icons");
    }
  }
}

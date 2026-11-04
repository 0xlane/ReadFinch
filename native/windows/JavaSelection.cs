using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

// Load the client packaged with the helper, never a DLL from the foreground app.
[assembly: DefaultDllImportSearchPaths(DllImportSearchPath.ApplicationDirectory | DllImportSearchPath.System32)]

internal static class JavaSelection {
  private const string Bridge = "WindowsAccessBridge-64.dll";
  private const CallingConvention ABI = CallingConvention.Cdecl;
  private const int SelectionCapacity = 1024;
  private static bool initialized, unavailable;
  private static readonly Stopwatch registration = new Stopwatch();
  private static IntPtr pointedWindow;
  private static int pointedX, pointedY;

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  private static extern int GetClassName(IntPtr window, StringBuilder name, int capacity);
  [DllImport(Bridge, CallingConvention = ABI)] private static extern void Windows_run();
  [DllImport(Bridge, CallingConvention = ABI)] private static extern bool isJavaWindow(IntPtr window);
  [DllImport(Bridge, CallingConvention = ABI)] private static extern bool getAccessibleContextWithFocus(IntPtr window, out int vm, out long context);
  [DllImport(Bridge, CallingConvention = ABI)] private static extern bool getAccessibleContextFromHWND(IntPtr window, out int vm, out long context);
  [DllImport(Bridge, CallingConvention = ABI)] private static extern bool getAccessibleContextAt(int vm, long parent, int x, int y, out long context);
  [DllImport(Bridge, CallingConvention = ABI)] private static extern bool getAccessibleContextInfo(int vm, long context, out ContextInfo info);
  [DllImport(Bridge, CallingConvention = ABI)] private static extern bool getAccessibleTextSelectionInfo(int vm, long context, out TextSelection selection);
  [DllImport(Bridge, CallingConvention = ABI, CharSet = CharSet.Unicode, ExactSpelling = true)]
  private static extern bool getAccessibleTextRange(int vm, long context, int start, int end, [Out] StringBuilder text, short capacity);
  [DllImport(Bridge, CallingConvention = ABI)] private static extern bool getAccessibleTextRect(int vm, long context, out TextRect rect, int index);
  [DllImport(Bridge, CallingConvention = ABI)] private static extern void releaseJavaObject(int vm, long context);

  // Field order and fixed UTF-16 buffers are the OpenJDK AccessBridgePackages.h ABI.
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private struct ContextInfo {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 1024)] public string Name, Description;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string Role, EnglishRole, States, EnglishStates;
    public int Index, Children, X, Y, Width, Height;
    public int Component, Action, Selection, Text, Interfaces;
  }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private struct TextSelection {
    public int Start, End;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = SelectionCapacity)] public string Text;
  }
  [StructLayout(LayoutKind.Sequential)]
  private struct TextRect { public int X, Y, Width, Height; }
  internal sealed class Result {
    public string Text, Key;
    public bool HasAnchor;
    public int X, Y;
  }
  internal static bool IsAwtWindow(IntPtr window) {
    var name = new StringBuilder(128);
    return GetClassName(window, name, name.Capacity) != 0 &&
      name.ToString().StartsWith("SunAwt", StringComparison.Ordinal);
  }
  internal static void PumpMessages() {
    // The bridge discovers running JVMs through a hidden window on this STA.
    if (initialized) System.Windows.Forms.Application.DoEvents();
  }
  internal static bool NeedsSetup(IntPtr window) {
    return IsAwtWindow(window) &&
      (unavailable || (registration.ElapsedMilliseconds >= 1500 && !isJavaWindow(window)));
  }
  internal static Result Read(IntPtr window, int x, int y, bool overSource, bool overToolbar) {
    if (unavailable) return null;
    if (!initialized) {
      try { Windows_run(); initialized = true; registration.Start(); }
      catch (DllNotFoundException) { unavailable = true; return null; }
      catch (BadImageFormatException) { unavailable = true; return null; }
    }
    int vm;
    long context;
    if (!getAccessibleContextWithFocus(window, out vm, out context) || context == 0) return null;
    try {
      ContextInfo info;
      if (!getAccessibleContextInfo(vm, context, out info)) return null;
      if (info.Text != 0 || IsPassword(info)) {
        pointedWindow = IntPtr.Zero;
        return ReadText(window, vm, context, info);
      }
    } finally {
      releaseJavaObject(vm, context);
    }
    // An IDE tool window can hold focus while the editor retains a selection.
    // Only hit-test the foreground JVM. Over our toolbar, re-read the last
    // editor point so deselection still takes effect without caching any text.
    if (!overSource) {
      if (!overToolbar || pointedWindow != window) { pointedWindow = IntPtr.Zero; return null; }
      x = pointedX; y = pointedY;
    }
    pointedWindow = IntPtr.Zero;
    long root;
    if (!getAccessibleContextFromHWND(window, out vm, out root) || root == 0) return null;
    try {
      if (!getAccessibleContextAt(vm, root, x, y, out context) || context == 0) return null;
      try {
        ContextInfo info;
        if (!getAccessibleContextInfo(vm, context, out info)) return null;
        var result = ReadText(window, vm, context, info);
        if (result.Text != null) { pointedWindow = window; pointedX = x; pointedY = y; }
        return result;
      } finally { releaseJavaObject(vm, context); }
    } finally { releaseJavaObject(vm, root); }
  }
  private static bool IsPassword(ContextInfo info) {
    return String.Equals(info.EnglishRole, "password text", StringComparison.OrdinalIgnoreCase);
  }
  private static Result ReadText(IntPtr window, int vm, long context, ContextInfo info) {
    var result = new Result();
    TextSelection range;
    if (IsPassword(info) || info.Text == 0 || !getAccessibleTextSelectionInfo(vm, context, out range) ||
        range.Start < 0 || range.End <= range.Start || range.End - range.Start > 100000)
      return result;
    var text = range.Text;
    if (String.IsNullOrEmpty(text)) return result;
    if (text.Length >= SelectionCapacity - 2 && range.End - range.Start >= SelectionCapacity) {
      // OpenJDK terminates a truncated selection two UTF-16 units before the
      // end of the buffer. Trust shorter strings even when a multi-caret
      // editor reports offsets for just its primary selection.
      var full = new StringBuilder(range.End - range.Start);
      for (int start = range.Start; start < range.End;) {
        int count = Math.Min(SelectionCapacity - 1, range.End - start);
        var chunk = new StringBuilder(count + 1);
        if (!getAccessibleTextRange(vm, context, start, start + count - 1, chunk, (short)(count + 1)) ||
            chunk.Length != count) return result;
        full.Append(chunk);
        start += count;
      }
      if (!full.ToString(0, text.Length).Equals(text, StringComparison.Ordinal)) return result;
      text = full.ToString();
    }
    if (String.IsNullOrWhiteSpace(text)) return result;
    result.Text = text;
    result.Key = window + ":java:" + info.X + "," + info.Y + ":" + info.Index + ":" + range.Start + ":" + range.End + ":" + text;
    TextRect rect;
    if (getAccessibleTextRect(vm, context, out rect, range.End - 1) && rect.Width > 0 && rect.Height > 0) {
      result.HasAnchor = true;
      result.X = rect.X + rect.Width - 1;
      result.Y = rect.Y + rect.Height - 1;
    }
    return result;
  }
}

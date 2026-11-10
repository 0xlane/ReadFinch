using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;

internal sealed class SelectionInput : IDisposable {
  private delegate IntPtr Hook(int code, IntPtr message, IntPtr data);
  [StructLayout(LayoutKind.Sequential)] private struct MouseData {
    public Point Point; public uint Data, Flags, Time; public UIntPtr Extra;
  }
  [StructLayout(LayoutKind.Sequential)] private struct Message {
    public IntPtr Window; public uint Id; public UIntPtr WParam; public IntPtr LParam;
    public uint Time; public Point Point; public uint Private;
  }
  [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetWindowsHookEx(int id, Hook callback, IntPtr module, uint thread);
  [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
  [DllImport("user32.dll")] private static extern int GetMessage(out Message message, IntPtr window, uint first, uint last);
  [DllImport("user32.dll")] private static extern bool PeekMessage(out Message message, IntPtr window, uint first, uint last, uint remove);
  [DllImport("user32.dll")] private static extern bool PostThreadMessage(uint thread, uint message, UIntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] private static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
  [DllImport("kernel32.dll")] private static extern IntPtr GetModuleHandle(string module);
  [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
  private readonly object gate = new object();
  private readonly Queue<SelectionInteraction.Input> queue = new Queue<SelectionInteraction.Input>();
  private readonly Stopwatch clock = Stopwatch.StartNew();
  private readonly ManualResetEvent ready = new ManualResetEvent(false);
  private readonly Hook mouse, keyboard;
  private readonly Thread thread;
  private uint threadId;
  private bool installed, overflow;
  private long lastMove, version;
  internal long Now { get { return clock.ElapsedMilliseconds; } }
  internal long Version { get { return Interlocked.Read(ref version); } }
  internal bool Installed { get { return installed; } }
  internal SelectionInput() {
    mouse = Mouse; keyboard = Keyboard;
    thread = new Thread(Run) { IsBackground = true, Name = "Selection input" };
    thread.Start(); ready.WaitOne(3000);
  }
  private void Run() {
    threadId = GetCurrentThreadId();
    Message message; PeekMessage(out message, IntPtr.Zero, 0, 0, 0);
    IntPtr mouseHook = IntPtr.Zero, keyboardHook = IntPtr.Zero;
    try {
      var module = GetModuleHandle(null);
      mouseHook = SetWindowsHookEx(14, mouse, module, 0);
      keyboardHook = SetWindowsHookEx(13, keyboard, module, 0);
      installed = mouseHook != IntPtr.Zero && keyboardHook != IntPtr.Zero;
      ready.Set();
      if (installed) while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0) {}
    } finally {
      if (mouseHook != IntPtr.Zero) UnhookWindowsHookEx(mouseHook);
      if (keyboardHook != IntPtr.Zero) UnhookWindowsHookEx(keyboardHook);
      ready.Set();
    }
  }
  private IntPtr Mouse(int code, IntPtr message, IntPtr data) {
    // Hooks run on a dedicated message-loop thread. Never call UIA, Java,
    // console I/O, or the host here: a slow provider must not remove the hook.
    if (code >= 0) {
      var value = (MouseData)Marshal.PtrToStructure(data, typeof(MouseData));
      int id = message.ToInt32(); string kind = null; int delta = 0;
      if (id == 0x201) kind = "down";
      else if (id == 0x202) kind = "up";
      else if (id == 0x200 && Now - lastMove >= 25) { kind = "move"; lastMove = Now; }
      else if (id == 0x204 || id == 0x207 || id == 0x20B) kind = "pointer";
      else if (id == 0x20A || id == 0x20E) { kind = "scroll"; delta = (short)(value.Data >> 16); }
      if (kind != null) {
        var input = new SelectionInteraction.Input { Kind = kind, Point = value.Point, Time = Now, Delta = delta };
        if (kind == "down" || kind == "pointer") {
          input.Window = GetAncestor(WindowFromPoint(value.Point), 2);
          GetWindowThreadProcessId(input.Window, out input.Pid);
        }
        if (kind == "up") input.Shift = (GetAsyncKeyState(16) & 0x8000) != 0;
        Enqueue(input);
      }
    }
    return CallNextHookEx(IntPtr.Zero, code, message, data);
  }
  private IntPtr Keyboard(int code, IntPtr message, IntPtr data) {
    // Read only the event type. Do not dereference key data or retain keys.
    if (code >= 0 && (message.ToInt32() == 0x100 || message.ToInt32() == 0x104))
      Enqueue(new SelectionInteraction.Input { Kind = "keyboard", Time = Now });
    return CallNextHookEx(IntPtr.Zero, code, message, data);
  }
  private void Enqueue(SelectionInteraction.Input input) {
    if (input.Kind != "move") Interlocked.Increment(ref version);
    lock (gate) {
      if (queue.Count >= 256) { overflow = true; return; }
      queue.Enqueue(input);
    }
  }
  internal SelectionInteraction.Input[] Drain() {
    lock (gate) {
      if (overflow) {
        queue.Clear(); overflow = false;
        return new[] { new SelectionInteraction.Input { Kind = "cancel", Time = Now } };
      }
      var values = queue.ToArray(); queue.Clear(); return values;
    }
  }
  public void Dispose() {
    if (threadId != 0) PostThreadMessage(threadId, 0x12, UIntPtr.Zero, IntPtr.Zero);
    thread.Join(1000);
    // The background thread owns its wait handle until it has stopped.
    if (!thread.IsAlive) ready.Dispose();
  }
}

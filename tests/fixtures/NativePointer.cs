using System;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;

// Real native input for an isolated integration fixture. Unlike Playwright/CDP
// or an accessibility Invoke, clicking does not activate the toolbar first.
class NativePointer {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  static Point PointAt(string[] args, int index) { return new Point(Int32.Parse(args[index]), Int32.Parse(args[index+1])); }
  static void Hit(IntPtr window, Point point) {
    var actual=GetAncestor(WindowFromPoint(point),2);
    if(actual!=window) {
      uint pid;GetWindowThreadProcessId(actual,out pid);
      throw new Exception("Fixture point belongs to another window: " + actual + ", process " + Process.GetProcessById((int)pid).ProcessName + ", expected " + window);
    }
  }
  static void Mouse(uint flags) { mouse_event(flags,0,0,0,UIntPtr.Zero); }
  static void SelectAll(IntPtr window, Process process) {
    if(process.ProcessName!="NativeTarget" || GetForegroundWindow()!=window) throw new Exception("Fixture is not foreground");
    keybd_event(0x11,0,0,UIntPtr.Zero);keybd_event(0x41,0,0,UIntPtr.Zero);keybd_event(0x41,0,2,UIntPtr.Zero);keybd_event(0x11,0,2,UIntPtr.Zero);
  }
  static void Main(string[] args) {
    try { Run(args); }
    catch(Exception error) { Console.Error.WriteLine(error.Message); Environment.Exit(1); }
  }
  static void Run(string[] args) {
    SetProcessDpiAwarenessContext(new IntPtr(-4));
    uint foregroundPid; GetWindowThreadProcessId(GetForegroundWindow(),out foregroundPid);
    if(foregroundPid==0 || Process.GetProcessById((int)foregroundPid).ProcessName=="LockApp")
      throw new Exception("Unlock the Windows desktop before running native input checks.");
    if(args[0]=="desktop")return;
    string operation=args[0]; var window=new IntPtr(Int64.Parse(args[1]));
    uint pid;GetWindowThreadProcessId(window,out pid);
    var process=Process.GetProcessById((int)pid);
    bool installed=Array.IndexOf(args,"--installed")>=0 && process.ProcessName=="ReadFinch" &&
      process.MainModule.FileName.EndsWith("\\Programs\\ReadFinch\\ReadFinch.exe",StringComparison.OrdinalIgnoreCase);
    if(process.ProcessName!="NativeTarget" && process.ProcessName!="electron" && !installed)
      throw new Exception("Native input is restricted to the test fixture and development Electron");
    if(operation=="select-all" || operation=="right") {
      if(process.ProcessName!="NativeTarget" || GetForegroundWindow()!=window) throw new Exception("Fixture is not foreground");
      if(operation=="right") { keybd_event(0x27,0,0,UIntPtr.Zero);keybd_event(0x27,0,2,UIntPtr.Zero); }
      else SelectAll(window,process);
      return;
    }
    var start=PointAt(args,2);Hit(window,start);SetCursorPos(start.X,start.Y);Thread.Sleep(80);
    if(operation=="move") return;
    Mouse(2);Thread.Sleep(80);
    if(operation=="key-interrupted-drag") { SelectAll(window,process);Thread.Sleep(80); }
    if(operation=="drag" || operation=="key-interrupted-drag") {
      var end=PointAt(args,4);
      for(int i=1;i<=15;i++){SetCursorPos(start.X+(end.X-start.X)*i/15,start.Y+(end.Y-start.Y)*i/15);Thread.Sleep(15);}
      Thread.Sleep(80);
    }
    Mouse(4);
    if(operation=="key-between-clicks") {
      Thread.Sleep(30);SelectAll(window,process);Thread.Sleep(30);
      Mouse(2);Thread.Sleep(40);Mouse(4);
    }
  }
}

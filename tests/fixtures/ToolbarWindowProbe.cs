using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

// Read-only observer for a running instance. It never activates a window,
// installs hooks, sends input, or reads document/accessibility/clipboard text.
class ToolbarWindowProbe {
  delegate bool EnumWindow(IntPtr window,IntPtr value);
  [StructLayout(LayoutKind.Sequential)] struct Rect {public int Left,Top,Right,Bottom;}
  [StructLayout(LayoutKind.Sequential)] struct GuiInfo {public int Size,Flags;public IntPtr Active,Focus,Capture,MenuOwner,MoveSize,Caret;public Rect CaretRect;}
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindow callback,IntPtr value);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window,out Rect rect);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] static extern bool IsWindowEnabled(IntPtr window);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr window,int index);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window,uint flags);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint thread,ref GuiInfo value);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  static uint Pid(IntPtr window){uint pid;GetWindowThreadProcessId(window,out pid);return pid;}
  static void Main(string[] args){
    SetThreadDpiAwarenessContext(new IntPtr(-4));
    uint own=UInt32.Parse(args[0]);int seconds=args.Length>1?Int32.Parse(args[1]):45;
    var clock=Stopwatch.StartNew();var json=new JavaScriptSerializer();string last="";
    while(clock.ElapsedMilliseconds<seconds*1000){
      Point cursor;GetCursorPos(out cursor);var hit=WindowFromPoint(cursor);var root=GetAncestor(hit,2);
      var foreground=GetForegroundWindow();uint pid;uint thread=GetWindowThreadProcessId(foreground,out pid);
      var gui=new GuiInfo{Size=Marshal.SizeOf(typeof(GuiInfo))};GetGUIThreadInfo(thread,ref gui);
      var windows=new List<object>();
      EnumWindows((window,value)=>{
        if(Pid(window)!=own)return true;Rect rect;GetWindowRect(window,out rect);
        windows.Add(new{handle=window.ToInt64(),visible=IsWindowVisible(window),enabled=IsWindowEnabled(window),minimized=IsIconic(window),
          noActivate=(GetWindowLong(window,-20)&0x8000000)!=0,transparent=(GetWindowLong(window,-20)&0x20)!=0,
          x=rect.Left,y=rect.Top,width=rect.Right-rect.Left,height=rect.Bottom-rect.Top,
          underPointer=root==window,hitEnabled=root==window?IsWindowEnabled(hit):(bool?)null});return true;
      },IntPtr.Zero);
      var state=json.Serialize(new{foregroundOwn=pid==own,captureOwn=Pid(gui.Capture)==own,capture=gui.Capture.ToInt64(),leftDown=(GetAsyncKeyState(1)&0x8000)!=0,windows=windows});
      if(state!=last){Console.WriteLine("{\"elapsedMs\":"+clock.ElapsedMilliseconds+",\"state\":"+state+"}");Console.Out.Flush();last=state;}
      Thread.Sleep(30);
    }
  }
}

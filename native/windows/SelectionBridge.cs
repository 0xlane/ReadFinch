using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;

class SelectionBridge {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hwnd,ref Point point);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder s,int n);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h,int msg,IntPtr w,StringBuilder s);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h,int msg,IntPtr w,string s);
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h,int msg,out int a,out int b);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h,int index);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint thread,ref GuiInfo info);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] struct Point {public int X,Y;}
  [StructLayout(LayoutKind.Sequential)] struct Rect {public int L,T,R,B;}
  [StructLayout(LayoutKind.Sequential)] struct GuiInfo {public int cbSize,flags;public IntPtr active,focus,capture,menuOwner,moveSize,caret;public Rect caretRect;}
  class Saved {public string Token,Text,Full,Key;public IntPtr Handle;public int Start,End;public uint Pid;public object Selection;}
  static JavaScriptSerializer json=new JavaScriptSerializer(){MaxJsonLength=2000000};
  static ConcurrentQueue<string> commands=new ConcurrentQueue<string>();
  static Saved saved;static uint host;static string lastKey="";static bool running=true;
  static void Emit(object value){Console.WriteLine(json.Serialize(value));Console.Out.Flush();}
  static void Invalidate(){if(saved!=null){saved=null;lastKey="";Emit(new{type="invalid"});}}
  static string WindowText(IntPtr h){var b=new StringBuilder(500001);SendMessage(h,13,(IntPtr)b.Capacity,b);return b.ToString();}
  static string ProcessName(uint pid){try{return Process.GetProcessById((int)pid).ProcessName;}catch{return "unknown";}}
  static bool Own(uint pid){return pid==host||pid==(uint)Process.GetCurrentProcess().Id;}
  static void Poll(bool force=false){
    IntPtr foreground=GetForegroundWindow();uint pid;uint thread=GetWindowThreadProcessId(foreground,out pid);
    if(Own(pid)){if(force)Invalidate();return;}
    if((GetAsyncKeyState(1)&0x8000)!=0){if(force)Invalidate();return;}
    if(!force&&(GetAsyncKeyState(16)&0x8000)!=0)return;
    var info=new GuiInfo();info.cbSize=Marshal.SizeOf(info);GetGUIThreadInfo(thread,ref info);
    IntPtr target=info.focus;var cls=new StringBuilder(300);GetClassName(target,cls,cls.Capacity);
    string text="",full=null,key="";int start=0,end=0;bool replace=false;Point anchor;GetCursorPos(out anchor);
    if(cls.ToString().Equals("Edit",StringComparison.OrdinalIgnoreCase)||cls.ToString().StartsWith("WindowsForms10.EDIT",StringComparison.OrdinalIgnoreCase)){
      int style=GetWindowLong(target,-16);if((style&0x20)!=0){Invalidate();return;}
      SendMessage(target,0xB0,out start,out end);if(end>start){full=WindowText(target);if(end<=full.Length){text=full.Substring(start,end-start);replace=(style&0x800)==0;key=target+":"+start+":"+end+":"+full;if(info.caret!=IntPtr.Zero){anchor.X=info.caretRect.R;anchor.Y=info.caretRect.B;ClientToScreen(info.caret,ref anchor);}}}
    }
    if(text.Length==0){
      var el=AutomationElement.FocusedElement;if(el==null||el.Current.ProcessId!=(int)pid||el.Current.IsPassword){Invalidate();return;}
      object pattern;if(el.TryGetCurrentPattern(TextPattern.Pattern,out pattern)){
        var ranges=((TextPattern)pattern).GetSelection();if(ranges.Length==1){text=ranges[0].GetText(100001);key=pid+":"+String.Join(",",el.GetRuntimeId())+":"+text;var rectangles=ranges[0].GetBoundingRectangles();if(rectangles.Length>0){var rect=rectangles[rectangles.Length-1];anchor.X=(int)rect.Right;anchor.Y=(int)rect.Bottom;}}
      }
    }
    if(GetForegroundWindow()!=foreground||String.IsNullOrWhiteSpace(text)||text.Length>100000){Invalidate();return;}
    if(key==lastKey)return;
    lastKey=key;
    saved=new Saved{Token=Guid.NewGuid().ToString("N"),Text=text,Full=full,Key=key,Handle=replace?target:IntPtr.Zero,Start=start,End=end,Pid=pid};
    saved.Selection=new{token=saved.Token,text=text,app=ProcessName(pid),x=anchor.X,y=anchor.Y,canReplace=replace};
    Emit(new{type="selection",token=saved.Token,text=text,app=ProcessName(pid),x=anchor.X,y=anchor.Y,canReplace=replace});
  }
  static void Command(string line){
    string id="";try{
      var c=json.Deserialize<Dictionary<string,object>>(line);id=c.ContainsKey("id")?(string)c["id"]:"";string op=(string)c["op"];
      if(op=="quit"){running=false;return;}if(op=="invalidate"){Invalidate();return;}
      if(op=="refresh"){
        try{Poll(true);}catch{Invalidate();}
        Emit(new{type="selectionSnapshot",id=id,selection=saved==null?null:saved.Selection});return;
      }
      if(op!="replace")return;
      if(saved==null||saved.Token!=(string)c["token"]||saved.Handle==IntPtr.Zero||!IsWindow(saved.Handle))throw new Exception("原选区已失效，请复制结果");
      uint pid;GetWindowThreadProcessId(saved.Handle,out pid);uint front;GetWindowThreadProcessId(GetForegroundWindow(),out front);
      int a,b;SendMessage(saved.Handle,0xB0,out a,out b);
      if(pid!=saved.Pid||(!Own(front)&&front!=pid)||a!=saved.Start||b!=saved.End||WindowText(saved.Handle)!=saved.Full||(GetWindowLong(saved.Handle,-16)&0x820)!=0)throw new Exception("目标或选区已改变，已阻止替换");
      string replacement=(string)c["text"];if(replacement.Length>100000)throw new Exception("结果太长，请复制");
      SendMessage(saved.Handle,0xC2,(IntPtr)1,replacement);
      Emit(new{type="response",id=id,ok=true});Invalidate();
    }catch(Exception e){Emit(new{type="response",id=id,ok=false,error=e.Message});}
  }
  [STAThread] static void Main(string[] args){
    Console.OutputEncoding=new UTF8Encoding(false);Console.InputEncoding=new UTF8Encoding(false);SetProcessDPIAware();if(args.Length>0)UInt32.TryParse(args[0],out host);
    var input=new Thread(()=>{string line;while((line=Console.ReadLine())!=null)commands.Enqueue(line);running=false;});input.IsBackground=true;input.Start();
    Emit(new{type="ready",message="Windows UI Automation 已连接"});int ticks=0;
    while(running){string command;while(commands.TryDequeue(out command))Command(command);try{Poll();}catch{Invalidate();}if(++ticks%10==0)Emit(new{type="heartbeat"});Thread.Sleep(150);}
  }
}

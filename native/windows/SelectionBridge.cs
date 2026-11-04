using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;

class SelectionBridge {
  [DllImport("kernel32.dll")] static extern ushort GetUserDefaultUILanguage();
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hwnd,ref Point point);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder s,int n);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h,int msg,IntPtr w,StringBuilder s);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h,int msg,IntPtr w,string s);
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h,int msg,out int a,out int b);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h,int index);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h,uint flags);
  [DllImport("user32.dll")] static extern bool IsChild(IntPtr parent,IntPtr child);
  [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint thread,ref GuiInfo info);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("shcore.dll")] static extern int SetProcessDpiAwareness(int awareness);
  // UIA hit testing and bounding rectangles use physical screen coordinates.
  static void UsePhysicalCoordinates(){
    try{if(SetProcessDpiAwarenessContext(new IntPtr(-4)))return;}catch(EntryPointNotFoundException){}
    try{if(SetProcessDpiAwareness(2)==0)return;}catch(EntryPointNotFoundException){}catch(DllNotFoundException){}
    SetProcessDPIAware();
  }
  [StructLayout(LayoutKind.Sequential)] struct Point {public int X,Y;}
  [StructLayout(LayoutKind.Sequential)] struct Rect {public int L,T,R,B;}
  [StructLayout(LayoutKind.Sequential)] struct GuiInfo {public int cbSize,flags;public IntPtr active,focus,capture,menuOwner,moveSize,caret;public Rect caretRect;}
  class Saved {public string Token,Text,Full,Key;public IntPtr Handle;public int Start,End;public uint Pid;public object Selection;}
  static JavaScriptSerializer json=new JavaScriptSerializer(){MaxJsonLength=2000000};
  static ConcurrentQueue<string> commands=new ConcurrentQueue<string>();
  static Saved saved;static uint host;static string lastKey="";static bool running=true;
  static AutomationElement lastTextElement;static IntPtr lastTextWindow;
  static void Emit(object value){Console.WriteLine(json.Serialize(value));Console.Out.Flush();}
  static void Invalidate(){if(saved!=null){saved=null;lastKey="";Emit(new{type="invalid"});}}
  static string WindowText(IntPtr h){var b=new StringBuilder(500001);SendMessage(h,13,(IntPtr)b.Capacity,b);return b.ToString();}
  static string ProcessName(uint pid){try{return Process.GetProcessById((int)pid).ProcessName;}catch{return "unknown";}}
  static bool Own(uint pid){return pid==host||pid==(uint)Process.GetCurrentProcess().Id;}
  // Embedded Chromium/WebView documents may be provided by a renderer process.
  // Validate their native-window ancestry instead of requiring the foreground PID.
  static bool BelongsToWindow(AutomationElement element,IntPtr foreground){
    var node=element;
    for(int depth=0;node!=null&&depth<24;depth++){
      if(node.Current.IsPassword)return false;
      IntPtr handle=(IntPtr)node.Current.NativeWindowHandle;
      if(handle!=IntPtr.Zero)
        return handle==foreground||IsChild(foreground,handle)||GetAncestor(handle,2)==foreground;
      node=TreeWalker.RawViewWalker.GetParent(node);
    }
    return false;
  }
  static bool ReadTextElement(AutomationElement element,IntPtr foreground,ref Point anchor,out string text,out string key){
    text="";key="";
    try{
      if(element==null||element.Current.IsPassword)return false;
      object pattern;if(!element.TryGetCurrentPattern(TextPattern.Pattern,out pattern))return false;
      if(!BelongsToWindow(element,foreground))return false;
      var ranges=((TextPattern)pattern).GetSelection();
      if(ranges==null||ranges.Length==0||ranges.Length>64)return false;
      var parts=new List<string>();var positions=new StringBuilder();int length=0;
      foreach(var range in ranges){
        string part=range.GetText(100001-length);
        if(String.IsNullOrEmpty(part))continue;
        length+=part.Length+(parts.Count>0?1:0);if(length>100000)return false;
        parts.Add(part);
        System.Windows.Rect[] rectangles;
        try{rectangles=range.GetBoundingRectangles();}
        catch(InvalidOperationException){continue;}
        catch(NotSupportedException){continue;}
        if(rectangles.Length>0){
          var first=rectangles[0];var last=rectangles[rectangles.Length-1];
          if(last.Width>0&&last.Height>0&&!Double.IsNaN(last.Right)&&!Double.IsInfinity(last.Right)&&!Double.IsNaN(last.Bottom)&&!Double.IsInfinity(last.Bottom)){
            anchor.X=(int)Math.Ceiling(last.Right)-1;anchor.Y=(int)Math.Ceiling(last.Bottom)-1;
            positions.Append((int)first.Left).Append(',').Append((int)first.Top).Append(',').Append(anchor.X).Append(',').Append(anchor.Y).Append(';');
          }
        }
      }
      text=String.Join("\n",parts.ToArray());if(String.IsNullOrWhiteSpace(text))return false;
      key=foreground+":"+String.Join(",",element.GetRuntimeId())+":"+positions+":"+text;
      lastTextElement=element;lastTextWindow=foreground;return true;
    }catch{return false;}
  }
  static bool ReadTextPath(AutomationElement start,IntPtr foreground,HashSet<string> visited,ref Point anchor,out string text,out string key){
    text="";key="";
    try{
      if(start==null||!BelongsToWindow(start,foreground))return false;
      var node=start;
      for(int depth=0;node!=null&&depth<24;depth++){
        if(node.Current.IsPassword)return false;
        string identity=String.Join(",",node.GetRuntimeId());
        if(visited.Add(identity)&&ReadTextElement(node,foreground,ref anchor,out text,out key))return true;
        IntPtr handle=(IntPtr)node.Current.NativeWindowHandle;
        if(handle==foreground)break;
        node=TreeWalker.RawViewWalker.GetParent(node);
      }
    }catch{}
    text="";key="";return false;
  }
  static bool ReadUiaSelection(IntPtr foreground,ref Point anchor,out string text,out string key){
    text="";key="";
    AutomationElement focused=null;
    try{focused=AutomationElement.FocusedElement;if(focused!=null&&focused.Current.IsPassword)return false;}catch{}
    var visited=new HashSet<string>();
    if(ReadTextPath(focused,foreground,visited,ref anchor,out text,out key))return true;
    try{
      var pointed=AutomationElement.FromPoint(new System.Windows.Point(anchor.X,anchor.Y));
      if(ReadTextPath(pointed,foreground,visited,ref anchor,out text,out key))return true;
    }catch{}
    // Moving from the selected text to the non-activating toolbar must not lose
    // the document. Re-query the last provider, never reuse its previous text.
    if(lastTextWindow==foreground&&ReadTextElement(lastTextElement,foreground,ref anchor,out text,out key))return true;
    lastTextElement=null;lastTextWindow=IntPtr.Zero;return false;
  }
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
    if(text.Length==0 && JavaSelection.IsAwtWindow(foreground)){
      var pointed=WindowFromPoint(anchor);uint pointedPid;GetWindowThreadProcessId(pointed,out pointedPid);
      var java=JavaSelection.Read(foreground,anchor.X,anchor.Y,GetAncestor(pointed,2)==foreground,pointedPid==host);
      if(java!=null){
        if(String.IsNullOrEmpty(java.Text)){Invalidate();return;}
        text=java.Text;key=java.Key;
        if(java.HasAnchor){anchor.X=java.X;anchor.Y=java.Y;}
      }
    }
    if(text.Length==0){
      if(!ReadUiaSelection(foreground,ref anchor,out text,out key)){Invalidate();return;}
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
        Emit(new{type="selectionSnapshot",id=id,selection=saved==null?null:saved.Selection,javaBridgeUnavailable=saved==null&&JavaSelection.NeedsSetup(GetForegroundWindow())});return;
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
    if(args.Length==1 && args[0]=="--display-language"){
      try { Console.WriteLine(CultureInfo.GetCultureInfo(GetUserDefaultUILanguage()).Name); }
      catch(CultureNotFoundException) { Console.WriteLine(CultureInfo.CurrentUICulture.Name); }
      return;
    }
    Console.OutputEncoding=new UTF8Encoding(false);Console.InputEncoding=new UTF8Encoding(false);UsePhysicalCoordinates();if(args.Length>0)UInt32.TryParse(args[0],out host);
    var input=new Thread(()=>{string line;while((line=Console.ReadLine())!=null)commands.Enqueue(line);running=false;});input.IsBackground=true;input.Start();
    Emit(new{type="ready",message="Windows UI Automation 已连接"});int ticks=0;
    while(running){JavaSelection.PumpMessages();string command;while(commands.TryDequeue(out command))Command(command);try{Poll();}catch{Invalidate();}if(++ticks%10==0)Emit(new{type="heartbeat"});Thread.Sleep(150);}
  }
}

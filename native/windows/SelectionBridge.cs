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
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr h,int msg,IntPtr w,StringBuilder s,uint flags,uint timeout,out UIntPtr result);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr h,int msg,IntPtr w,string s,uint flags,uint timeout,out UIntPtr result);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr h,int msg,out int a,out int b,uint flags,uint timeout,out UIntPtr result);
  // SMTO_BLOCK | SMTO_ABORTIFHUNG | SMTO_ERRORONEXIT. A non-responsive
  // editor must not indefinitely block our polling and command loop.
  const uint MessageFlags=0x23,MessageTimeout=300;
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h,int index);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h,uint flags);
  [DllImport("user32.dll")] static extern bool IsChild(IntPtr parent,IntPtr child);
  [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint thread,ref GuiInfo info);
  [DllImport("user32.dll")] static extern uint GetDoubleClickTime();
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
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
  static Saved saved;static uint host;static bool running=true;
  static SelectionInput input;
  static SelectionInteraction interaction;
  static uint probePid,cachedProcessPid;static string probeApp="",cachedProcessName="";
  static AutomationElement lastTextElement;static IntPtr lastTextWindow;
  static void Emit(object value){Console.WriteLine(json.Serialize(value));Console.Out.Flush();}
  static void Probe(string stage){Emit(new{type="probe",stage=stage,targetPid=probePid,app=probeApp});}
  static void ProbeTarget(uint pid){
    probePid=pid;
    if(pid!=cachedProcessPid){cachedProcessPid=pid;cachedProcessName=ProcessName(pid);}
    probeApp=cachedProcessName;
  }
  static void Idle(){probePid=0;probeApp="";Probe("idle");}
  static void OperationError(Exception error){Emit(new{type="operationError",code=error.GetType().Name});}
  static void Invalidate(){interaction.Clear();if(saved!=null){saved=null;Emit(new{type="invalid"});}}
  static void ReadInput(){foreach(var value in input.Drain())if(interaction.Receive(value,host))Invalidate();}
  static void ReadEditSelection(IntPtr h,out int start,out int end){
    Probe("edit-selection");
    UIntPtr result;
    if(SendMessageTimeout(h,0xB0,out start,out end,MessageFlags,MessageTimeout,out result)==IntPtr.Zero)
      throw new TimeoutException("目标应用响应超时，请稍后重试");
  }
  static string WindowText(IntPtr h){
    Probe("edit-text");
    var b=new StringBuilder(500001);UIntPtr result;
    if(SendMessageTimeout(h,13,(IntPtr)b.Capacity,b,MessageFlags,MessageTimeout,out result)==IntPtr.Zero)
      throw new TimeoutException("目标应用响应超时，请稍后重试");
    return b.ToString();
  }
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
      Probe("uia-pattern");
      object pattern;if(!element.TryGetCurrentPattern(TextPattern.Pattern,out pattern))return false;
      if(!BelongsToWindow(element,foreground))return false;
      Probe("uia-selection");var ranges=((TextPattern)pattern).GetSelection();
      if(ranges==null||ranges.Length==0||ranges.Length>64)return false;
      var parts=new List<string>();var positions=new StringBuilder();int length=0;
      foreach(var range in ranges){
        Probe("uia-text");string part=range.GetText(100001-length);
        if(String.IsNullOrEmpty(part))continue;
        length+=part.Length+(parts.Count>0?1:0);if(length>100000)return false;
        parts.Add(part);
        System.Windows.Rect[] rectangles;
        try{Probe("uia-bounds");rectangles=range.GetBoundingRectangles();}
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
    Probe("uia-focus");
    try{focused=AutomationElement.FocusedElement;if(focused!=null&&focused.Current.IsPassword)return false;}catch{}
    var visited=new HashSet<string>();
    Probe("uia-focused-path");if(ReadTextPath(focused,foreground,visited,ref anchor,out text,out key))return true;
    try{
      Probe("uia-point");var pointed=AutomationElement.FromPoint(new System.Windows.Point(anchor.X,anchor.Y));
      Probe("uia-point-path");if(ReadTextPath(pointed,foreground,visited,ref anchor,out text,out key))return true;
    }catch{}
    // Moving from the selected text to the non-activating toolbar must not lose
    // the document. Re-query the last provider, never reuse its previous text.
    Probe("uia-cached");if(lastTextWindow==foreground&&ReadTextElement(lastTextElement,foreground,ref anchor,out text,out key))return true;
    lastTextElement=null;lastTextWindow=IntPtr.Zero;return false;
  }
  static void Poll(bool force=false){
    IntPtr foreground=GetForegroundWindow();uint pid;uint thread=GetWindowThreadProcessId(foreground,out pid);
    if(interaction.DismissForApplication(pid,host)){interaction.CancelPending();Invalidate();}
    // Never re-read providers while the pointer travels to a non-activating
    // toolbar. UIA's focused/hit-tested element can change during mouse-down.
    long version=input.Version;
    if(!force&&!interaction.Pending(input.Now,foreground,version))return;
    if(Own(pid)){if(force)Invalidate();return;}
    if((GetAsyncKeyState(1)&0x8000)!=0){if(force)Invalidate();return;}
    if(!force&&(GetAsyncKeyState(16)&0x8000)!=0)return;
    ProbeTarget(pid);Probe("foreground");
    var info=new GuiInfo();info.cbSize=Marshal.SizeOf(info);GetGUIThreadInfo(thread,ref info);
    IntPtr target=info.focus;var cls=new StringBuilder(300);GetClassName(target,cls,cls.Capacity);
    string text="",full=null,key="";int start=0,end=0;bool replace=false;Point anchor;GetCursorPos(out anchor);
    if(cls.ToString().Equals("Edit",StringComparison.OrdinalIgnoreCase)||cls.ToString().StartsWith("WindowsForms10.EDIT",StringComparison.OrdinalIgnoreCase)){
      int style=GetWindowLong(target,-16);if((style&0x20)!=0){Invalidate();return;}
      ReadEditSelection(target,out start,out end);if(end>start){full=WindowText(target);if(end<=full.Length){text=full.Substring(start,end-start);replace=(style&0x800)==0;key=target+":"+start+":"+end+":"+full;if(info.caret!=IntPtr.Zero){anchor.X=info.caretRect.R;anchor.Y=info.caretRect.B;ClientToScreen(info.caret,ref anchor);}}}
    }
    if(text.Length==0 && JavaSelection.IsAwtWindow(foreground)){
      Probe("java-selection");
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
    if(input.Version!=version||GetForegroundWindow()!=foreground||String.IsNullOrWhiteSpace(text)||text.Length>100000){Invalidate();return;}
    if(!force)anchor=new Point{X=interaction.SelectionPoint.X,Y=interaction.SelectionPoint.Y};
    saved=new Saved{Token=Guid.NewGuid().ToString("N"),Text=text,Full=full,Key=key,Handle=replace?target:IntPtr.Zero,Start=start,End=end,Pid=pid};
    saved.Selection=new{token=saved.Token,text=text,app=ProcessName(pid),x=anchor.X,y=anchor.Y,canReplace=replace};
    interaction.Begin(pid,new System.Drawing.Point(anchor.X,anchor.Y));
    if(!force)Emit(new{type="selection",token=saved.Token,text=text,app=ProcessName(pid),x=anchor.X,y=anchor.Y,canReplace=replace});
  }
  static void Command(string line){
    string id="";try{
      var c=json.Deserialize<Dictionary<string,object>>(line);id=c.ContainsKey("id")?(string)c["id"]:"";string op=(string)c["op"];
      if(op=="quit"){running=false;return;}if(op=="invalidate"){interaction.CancelPending();Invalidate();return;}
      if(op=="toolbarBounds"){
        if(c.ContainsKey("x")&&c.ContainsKey("y")&&c.ContainsKey("width")&&c.ContainsKey("height")){
          var x=Convert.ToDouble(c["x"]);var y=Convert.ToDouble(c["y"]);var width=Convert.ToDouble(c["width"]);var height=Convert.ToDouble(c["height"]);
          if(!Double.IsNaN(x)&&!Double.IsInfinity(x)&&!Double.IsNaN(y)&&!Double.IsInfinity(y)&&width>0&&width<=100000&&height>0&&height<=100000&&Math.Abs(x)<=1000000&&Math.Abs(y)<=1000000)
            interaction.SetToolbar(new System.Drawing.Rectangle((int)Math.Floor(x),(int)Math.Floor(y),(int)Math.Ceiling(width),(int)Math.Ceiling(height)));
        }else interaction.SetToolbar(null);
        return;
      }
      if(op=="refresh"){
        ReadInput();interaction.CancelPending();
        try{Poll(true);}catch(Exception e){OperationError(e);Invalidate();}
        Emit(new{type="selectionSnapshot",id=id,selection=saved==null?null:saved.Selection,javaBridgeUnavailable=saved==null&&JavaSelection.NeedsSetup(GetForegroundWindow())});Idle();return;
      }
      if(op!="replace")return;
      if(saved==null||saved.Token!=(string)c["token"]||saved.Handle==IntPtr.Zero||!IsWindow(saved.Handle))throw new Exception("原选区已失效，请复制结果");
      ProbeTarget(saved.Pid);Probe("replace-validate");
      uint pid;GetWindowThreadProcessId(saved.Handle,out pid);uint front;GetWindowThreadProcessId(GetForegroundWindow(),out front);
      int a,b;ReadEditSelection(saved.Handle,out a,out b);
      if(pid!=saved.Pid||(!Own(front)&&front!=pid)||a!=saved.Start||b!=saved.End||WindowText(saved.Handle)!=saved.Full||(GetWindowLong(saved.Handle,-16)&0x820)!=0)throw new Exception("目标或选区已改变，已阻止替换");
      string replacement=(string)c["text"];if(replacement.Length>100000)throw new Exception("结果太长，请复制");
      UIntPtr result;
      Probe("replace-write");
      if(SendMessageTimeout(saved.Handle,0xC2,(IntPtr)1,replacement,MessageFlags,MessageTimeout,out result)==IntPtr.Zero)
        throw new TimeoutException("替换未确认，请检查目标内容，勿重复操作");
      Emit(new{type="response",id=id,ok=true});Invalidate();Idle();
    }catch(Exception e){OperationError(e);Emit(new{type="response",id=id,ok=false,error=e.Message});Idle();}
  }
  [STAThread] static void Main(string[] args){
    if(args.Length==1 && args[0]=="--display-language"){
      try { Console.WriteLine(CultureInfo.GetCultureInfo(GetUserDefaultUILanguage()).Name); }
      catch(CultureNotFoundException) { Console.WriteLine(CultureInfo.CurrentUICulture.Name); }
      return;
    }
    Console.OutputEncoding=new UTF8Encoding(false);Console.InputEncoding=new UTF8Encoding(false);UsePhysicalCoordinates();if(args.Length>0)UInt32.TryParse(args[0],out host);
    interaction=new SelectionInteraction((int)GetDoubleClickTime(),GetSystemMetrics(36),GetSystemMetrics(37));
    using(input=new SelectionInput()){
      if(!input.Installed){Emit(new{type="error",message="无法监听鼠标选区，请重启伴读雀后重试。"});return;}
      var reader=new Thread(()=>{string line;while((line=Console.ReadLine())!=null)commands.Enqueue(line);running=false;});reader.IsBackground=true;reader.Start();
      Emit(new{type="ready",message="Windows UI Automation 已连接"});int ticks=0;
      while(running){ReadInput();Probe("java-pump");JavaSelection.PumpMessages();string command;while(commands.TryDequeue(out command))Command(command);ReadInput();try{Poll();}catch(Exception e){OperationError(e);Invalidate();}Idle();if(++ticks%10==0)Emit(new{type="heartbeat"});Thread.Sleep(100);}
    }
  }
}

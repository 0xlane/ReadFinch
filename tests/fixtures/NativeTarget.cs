using System;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
class NativeTarget {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a,uint b,bool attach);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  static JavaScriptSerializer json=new JavaScriptSerializer();static Form form;static TextBox box;
  static void Reply(string id){Rectangle r=box.RectangleToScreen(box.ClientRectangle);Console.WriteLine(json.Serialize(new{id=id,hwnd=form.Handle.ToInt64(),foreground=GetForegroundWindow().ToInt64(),text=box.Text,start=box.SelectionStart,length=box.SelectionLength,x=r.X,y=r.Y,width=r.Width,height=r.Height}));Console.Out.Flush();}
  static void ActivateTarget(){uint pid;uint thread=GetWindowThreadProcessId(GetForegroundWindow(),out pid);uint own=GetCurrentThreadId();AttachThreadInput(own,thread,true);try{form.Activate();SetForegroundWindow(form.Handle);box.Focus();}finally{AttachThreadInput(own,thread,false);}}
  [STAThread] static void Main(string[] args){
    Console.OutputEncoding=new UTF8Encoding(false);SetProcessDPIAware();
    form=new Form{Text="ReadFinch native test target",Location=new Point(120,110),StartPosition=FormStartPosition.Manual,ClientSize=new Size(760,280)};
    if(Array.IndexOf(args,"--topmost")>=0)form.TopMost=true;
    box=new TextBox{Multiline=true,Location=new Point(20,20),Size=new Size(720,220),Font=new Font("Microsoft YaHei",16),Text="Small steps make a big difference.\r\n你好，世界！每一小步，都能带来改变。\r\nC:\\Projects\\ReadFinch\\src\\main.ts\r\nconst total = 42; // Hello 世界",HideSelection=false};form.Controls.Add(box);
    box.KeyDown+=(s,e)=>{if(e.Control&&e.KeyCode==Keys.A){box.SelectAll();e.SuppressKeyPress=true;}};
    form.Shown+=(s,e)=>{ActivateTarget();box.Select(0,box.Lines[0].Length);Reply("ready");};
    var reader=new Thread(()=>{string line;while((line=Console.ReadLine())!=null){string command=line;try{form.BeginInvoke((Action)(()=>{if(command=="quit"){form.Close();return;}if(command=="select"){ActivateTarget();box.Select(0,box.Lines[0].Length);}if(command=="writing"){ActivateTarget();box.Text="Don't 联网，if you known the release date of fable5 model?";box.SelectAll();}if(command=="change"){box.Select(2,5);}if(command=="clear"){ActivateTarget();box.Select(0,0);}Reply(command);if(command=="hang")Thread.Sleep(6000);}));}catch{return;}}});reader.IsBackground=true;reader.Start();Application.Run(form);
  }
}

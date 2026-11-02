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
  [STAThread] static void Main(){
    Console.OutputEncoding=new UTF8Encoding(false);SetProcessDPIAware();
    form=new Form{Text="TextHop native test target",Location=new Point(120,110),StartPosition=FormStartPosition.Manual,ClientSize=new Size(760,280)};
    box=new TextBox{Multiline=true,Location=new Point(20,20),Size=new Size(720,220),Font=new Font("Microsoft YaHei",16),Text="Small steps make a big difference.\r\n你好，世界！每一小步，都能带来改变。\r\nC:\\Projects\\TextHop\\src\\main.ts\r\nconst total = 42; // Hello 世界",HideSelection=false};form.Controls.Add(box);
    form.Shown+=(s,e)=>{ActivateTarget();box.Select(0,33);Reply("ready");};
    var reader=new Thread(()=>{string line;while((line=Console.ReadLine())!=null){string command=line;try{form.BeginInvoke((Action)(()=>{if(command=="quit"){form.Close();return;}if(command=="select"){ActivateTarget();box.Select(0,33);}if(command=="change"){box.Select(2,5);}if(command=="clear"){ActivateTarget();box.Select(0,0);}Reply(command);}));}catch{return;}}});reader.IsBackground=true;reader.Start();Application.Run(form);
  }
}

using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

// Fault injection for the helper spawned by selection-recovery-smoke.mjs.
class SuspendSelectionHelper {
  [DllImport("kernel32.dll")] static extern IntPtr OpenThread(uint access,bool inherit,uint id);
  [DllImport("kernel32.dll")] static extern uint SuspendThread(IntPtr thread);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static void Main(string[] args) {
    var process=Process.GetProcessById(Int32.Parse(args[0]));
    if(process.ProcessName!="readfinch-selection")throw new Exception("Expected selection test helper");
    foreach(ProcessThread thread in process.Threads) {
      var handle=OpenThread(2,false,(uint)thread.Id);
      if(handle==IntPtr.Zero)throw new Exception("Cannot open test thread");
      try { if(SuspendThread(handle)==UInt32.MaxValue)throw new Exception("Cannot suspend test thread"); }
      finally { CloseHandle(handle); }
    }
  }
}

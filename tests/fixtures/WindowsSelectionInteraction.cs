using System;
using System.Drawing;

class WindowsSelectionInteraction {
  static int cases;
  static void Check(bool value, string message) { if (!value) throw new Exception(message); cases++; }
  static readonly uint Source = 123, Host = 456;
  static readonly IntPtr Window = new IntPtr(99);
  static SelectionInteraction.Input Event(string kind, int x, int y, long time, uint pid = 123, bool shift = false, int delta = 0) {
    return new SelectionInteraction.Input { Kind = kind, Point = new Point(x,y), Time = time, Window = pid == Source ? Window : new IntPtr(100), Pid = pid, Shift = shift, Delta = delta };
  }
  static void Main() {
    var state = new SelectionInteraction(500, 4, 4);
    Check(!state.Pending(100, Window), "Idle/programmatic selections must not trigger reads");
    state.Receive(Event("down", 100,100,100),Host);
    state.Receive(Event("up",101,101,120),Host);
    Check(!state.Pending(130,Window), "A single click with jitter must not trigger a toolbar");
    state.Receive(Event("down",100,100,300),Host);
    state.Receive(Event("up",100,100,320),Host);
    Check(state.Pending(330,Window), "A double click should select a word");
    Check(!state.Pending(1121,Window), "Delayed reads must expire");
    state.Receive(Event("down",100,100,2000),Host);
    state.Receive(Event("move",120,100,2100),Host);
    state.Receive(Event("up",100,100,2200),Host);
    Check(state.Pending(2300,Window), "A drag that returns to its origin must still count");
    Check(!state.Pending(2300,new IntPtr(88)), "A gesture cannot select from another window");
    state.Receive(Event("down",100,100,3000),Host);
    state.Receive(Event("up",100,100,3100,Source,true),Host);
    Check(state.Pending(3200,Window), "Shift-click selection should work");
    state.Receive(Event("keyboard",0,0,3210),Host);
    Check(!state.Pending(3220,Window), "Ctrl+A/keyboard input cancels automatic reads");

    var anchor = new Point(-4,-60);
    state.Begin(Source,anchor);
    state.SetToolbar(new Rectangle(-580,-34,560,300));
    for(int step=0;step<=40;step++) {
      var p = new Point(-4 + (-571*step/40), -60 + (70*step/40));
      Check(!state.Receive(Event("move",p.X,p.Y,4000+step),Host), "The entire path to a wide toolbar must preserve its snapshot");
    }
    Check(!state.DismissForApplication(Source,Host), "Source focus must preserve selection");
    Check(!state.DismissForApplication(Host,Host), "Toolbar focus must preserve selection");
    Check(state.DismissForApplication(789,Host), "Switching to another application must dismiss");
    Check(!state.Receive(Event("down",-200,0,5000,Host),Host), "Toolbar mouse-down must not invalidate the pending click");
    state.Receive(Event("up",-200,0,5010,Host),Host);
    Check(!state.Pending(5020,Window), "Toolbar clicks must never trigger a new read/token");
    Check(!state.Receive(Event("scroll",-200,0,5100,Host,false,1200),Host), "Menu scrolling preserves selection");
    Check(state.Receive(Event("move",400,400,5200),Host), "Distant movement dismisses");
    Check(state.Receive(Event("scroll",400,400,5300,Source,false,120),Host), "Source scrolling dismisses");
    Check(state.Receive(Event("down",400,400,5400,Host),Host), "Clicking a different host window dismisses");
    state.Clear();
    Check(!state.DismissForApplication(789,Host), "A cleared lifetime must not dismiss unrelated selections");
    Check(state.Receive(Event("cancel",0,0,5500),Host), "Input queue overflow must discard stale gestures");
    Console.WriteLine("Passed " + cases + " Windows mouse-selection and toolbar-lifetime checks.");
  }
}

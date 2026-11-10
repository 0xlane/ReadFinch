using System;
using System.Drawing;

class WindowsSelectionInteraction {
  static int cases;
  static long inputVersion;
  static void Check(bool value, string message) { if (!value) throw new Exception(message); cases++; }
  static readonly uint Source = 123, Host = 456;
  static readonly IntPtr Window = new IntPtr(99);
  static SelectionInteraction.Input Event(string kind, int x, int y, long time, uint pid = 123, bool shift = false, int delta = 0) {
    return new SelectionInteraction.Input { Kind = kind, Point = new Point(x,y), Time = time, Version = kind == "move" ? inputVersion : ++inputVersion, Window = pid == Source ? Window : new IntPtr(100), Pid = pid, Shift = shift, Delta = delta };
  }
  static bool Pending(SelectionInteraction state, long time, IntPtr foreground) {
    return state.Pending(time,foreground,inputVersion);
  }
  static void Main() {
    var state = new SelectionInteraction(500, 4, 4);
    Check(!Pending(state,100,Window), "Idle/programmatic selections must not trigger reads");
    state.Receive(Event("down", 100,100,100),Host);
    state.Receive(Event("up",101,101,120),Host);
    Check(!Pending(state,130,Window), "A single click with jitter must not trigger a toolbar");
    state.Receive(Event("down",100,100,300),Host);
    state.Receive(Event("up",100,100,320),Host);
    Check(Pending(state,330,Window), "A double click should select a word");
    Check(!Pending(state,1121,Window), "Delayed reads must expire");
    state.Receive(Event("down",100,100,2000),Host);
    state.Receive(Event("move",120,100,2100),Host);
    state.Receive(Event("up",100,100,2200),Host);
    Check(Pending(state,2300,Window), "A drag that returns to its origin must still count");
    Check(!Pending(state,2300,new IntPtr(88)), "A gesture cannot select from another window");
    state.Receive(Event("down",100,100,3000),Host);
    state.Receive(Event("up",100,100,3100,Source,true),Host);
    Check(Pending(state,3200,Window), "Shift-click selection should work");
    state.Receive(Event("keyboard",0,0,3210),Host);
    Check(!Pending(state,3220,Window), "Ctrl+A/keyboard input cancels automatic reads");

    var interrupted = new SelectionInteraction(500,4,4);
    interrupted.Receive(Event("down",100,100,100),Host);
    interrupted.Receive(Event("keyboard",0,0,110),Host);
    interrupted.Receive(Event("move",160,100,120),Host);
    interrupted.Receive(Event("up",160,100,130),Host);
    Check(!Pending(interrupted,140,Window), "Keyboard input must cancel an unfinished mouse drag, including its later release");

    var clicks = new SelectionInteraction(500,4,4);
    clicks.Receive(Event("down",100,100,100),Host);
    clicks.Receive(Event("up",100,100,120),Host);
    clicks.Receive(Event("keyboard",0,0,130),Host);
    clicks.Receive(Event("down",100,100,160),Host);
    clicks.Receive(Event("up",100,100,180),Host);
    Check(!Pending(clicks,190,Window), "A single click after keyboard input must not reuse pre-keyboard double-click history");
    clicks.Receive(Event("down",100,100,210),Host);
    clicks.Receive(Event("up",100,100,230),Host);
    Check(Pending(clicks,240,Window), "A fresh double click after keyboard input must still select text");

    var delayed = new SelectionInteraction(500,4,4);
    delayed.Receive(Event("down",100,100,100),Host);
    delayed.Receive(Event("up",160,100,130),Host);
    Check(Pending(delayed,140,Window), "A current mouse gesture may start a read");
    Check(!delayed.Pending(140,Window,inputVersion+1), "A queued keyboard cancellation must prevent a read before it is drained");
    delayed.Receive(Event("move",200,100,150),Host);
    Check(!Pending(delayed,160,Window), "Mouse movement cannot revive a cancelled read");

    for(int i=0;i<10;i++) interrupted.Receive(Event("move",160+i*10,100,200+i*30),Host);
    Check(!Pending(interrupted,600,Window), "Pointer travel after Ctrl+A cannot start a new selection");

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
    Check(!Pending(state,5020,Window), "Toolbar clicks must never trigger a new read/token");
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

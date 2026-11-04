import java.awt.BorderLayout;
import java.awt.MouseInfo;
import java.awt.Point;
import java.awt.Robot;
import java.awt.event.KeyEvent;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import javax.swing.*;

public class SelectionSwingTarget {
  private static final String code = "HttpHeaders headers = new HttpHeaders();";
  private static final String selection = "HttpHeaders";
  private static final String paragraph = "alpha 你好 ".repeat(200);
  private static final JFrame window = new JFrame("ReadFinch Swing selection fixture " + ProcessHandle.current().pid());
  private static final JTextArea editor = new JTextArea(code + "\n" + paragraph);
  private static final JPasswordField password = new JPasswordField("fixture-password");
  private static final JButton toolWindow = new JButton("Tool window");
  private static Point previousPointer, testPointer;

  private static void select(String command) {
    if (command.equals("focus")) {
      System.out.println("active=" + window.isActive() + ", editorFocused=" + editor.isFocusOwner() + ", toolFocused=" + toolWindow.isFocusOwner());
      return;
    }
    if (command.equals("quit")) {
      if (testPointer != null && testPointer.equals(MouseInfo.getPointerInfo().getLocation())) {
        try { new Robot().mouseMove(previousPointer.x, previousPointer.y); }
        catch (java.awt.AWTException error) { throw new IllegalStateException(error); }
      }
      window.dispose();
      return;
    }
    if (command.equals("shortcut")) {
      if (!window.isActive() || !editor.isFocusOwner()) throw new IllegalStateException("Fixture is not focused");
      try {
        var robot = new Robot();
        int[] keys = { KeyEvent.VK_CONTROL, KeyEvent.VK_ALT, KeyEvent.VK_SHIFT, KeyEvent.VK_F10 };
        for (int key : keys) robot.keyPress(key);
        for (int i = keys.length - 1; i >= 0; i--) robot.keyRelease(keys[i]);
      } catch (java.awt.AWTException error) { throw new IllegalStateException(error); }
    } else if (command.equals("nontext")) {
      editor.select(0, selection.length());
      toolWindow.requestFocusInWindow();
      previousPointer = MouseInfo.getPointerInfo().getLocation();
      var visible = editor.getVisibleRect();
      testPointer = new Point(visible.x + 30, visible.y + 8);
      SwingUtilities.convertPointToScreen(testPointer, editor);
      try { new Robot().mouseMove(testPointer.x, testPointer.y); }
      catch (java.awt.AWTException error) { throw new IllegalStateException(error); }
    } else if (command.equals("password")) {
      password.requestFocusInWindow();
      password.selectAll();
    } else {
      editor.requestFocusInWindow();
      int start = command.equals("second") ? code.lastIndexOf(selection) : 0;
      int end = start + selection.length();
      if (command.equals("long")) {
        start = code.length() + 1;
        end = start + paragraph.length();
      }
      editor.select(start, command.equals("clear") ? start : end);
    }
    System.out.println(command);
  }
  public static void main(String[] args) throws Exception {
    SwingUtilities.invokeAndWait(() -> {
      window.setDefaultCloseOperation(JFrame.DISPOSE_ON_CLOSE);
      window.add(new JScrollPane(editor), BorderLayout.CENTER);
      window.add(toolWindow, BorderLayout.NORTH);
      window.add(password, BorderLayout.SOUTH);
      window.setBounds(100, 100, 650, 230);
      window.setVisible(true);
      window.toFront();
      editor.requestFocusInWindow();
    });
    System.out.println("ready " + ProcessHandle.current().pid());
    var input = new BufferedReader(new InputStreamReader(System.in));
    for (String line; (line = input.readLine()) != null;) {
      final String command = line;
      SwingUtilities.invokeAndWait(() -> select(command));
      if (command.equals("quit")) return;
    }
    SwingUtilities.invokeAndWait(window::dispose);
  }
}

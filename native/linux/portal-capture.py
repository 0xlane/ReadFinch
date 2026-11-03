#!/usr/bin/env python3
"""Interactive Screenshot portal; no global input or unrestricted screenshot access."""
import json, sys, uuid
try:
    from gi.repository import Gio, GLib
except ImportError:
    print(json.dumps({"error": "请安装 python3-gi 和 xdg-desktop-portal（KDE 还需要 xdg-desktop-portal-kde）"})); sys.exit(1)
bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
loop = GLib.MainLoop()
token = "readfinch_" + uuid.uuid4().hex
sender = bus.get_unique_name()[1:].replace('.', '_')
request_path = '/org/freedesktop/portal/desktop/request/' + sender + '/' + token
def response(connection, sender, object_path, interface, signal, params, data):
    code, result = params.unpack()
    print(json.dumps({"uri": result.get('uri')} if code == 0 else {"cancelled": True} if code == 1 else {"error": "截图门户未能完成截图"}), flush=True)
    loop.quit()
bus.signal_subscribe('org.freedesktop.portal.Desktop', 'org.freedesktop.portal.Request', 'Response', request_path, None, Gio.DBusSignalFlags.NONE, response, None)
def timeout():
    try: bus.call_sync('org.freedesktop.portal.Desktop', request_path, 'org.freedesktop.portal.Request', 'Close', None, None, Gio.DBusCallFlags.NONE, 2000, None)
    except Exception: pass
    print(json.dumps({"error": "截图门户超时，请检查桌面门户服务"}), flush=True); loop.quit(); return False
try:
    bus.call_sync('org.freedesktop.portal.Desktop','/org/freedesktop/portal/desktop','org.freedesktop.portal.Screenshot','Screenshot',GLib.Variant('(sa{sv})',('',{'handle_token':GLib.Variant('s',token),'interactive':GLib.Variant('b',True)})),None,Gio.DBusCallFlags.NONE,10000,None)
    GLib.timeout_add_seconds(90,timeout)
    loop.run()
except Exception:
    print(json.dumps({"error": "无法访问 Screenshot 门户，请检查 xdg-desktop-portal 服务"})); sys.exit(1)

// NSPanel interop inspired by goabstract/electron-panel-window (MIT).
// See PANEL-NOTICE.txt and THIRD_PARTY_NOTICES.md for source attribution.
#import <AppKit/AppKit.h>
#import <objc/message.h>
#import <objc/runtime.h>
#include <node_api.h>
#include <cstring>

static NSWindow* windowFromHandle(napi_env env, napi_callback_info info) {
  if (![NSThread isMainThread]) {
    return nil;
  }
  size_t argc = 1;
  napi_value argument;
  if (napi_get_cb_info(env, info, &argc, &argument, nullptr, nullptr) != napi_ok || argc != 1)
    return nil;
  bool isBuffer = false;
  napi_is_buffer(env, argument, &isBuffer);
  if (!isBuffer) return nil;
  void* data = nullptr;
  size_t length = 0;
  if (napi_get_buffer_info(env, argument, &data, &length) != napi_ok || length != sizeof(NSView*))
    return nil;
  NSView* __unsafe_unretained view = nil;
  std::memcpy(&view, data, sizeof(view));
  if (!view || ![view isKindOfClass:[NSView class]]) return nil;
  return view.window;
}

static napi_value boolean(napi_env env, bool value) {
  napi_value result;
  napi_get_boolean(env, value, &result);
  return result;
}

static char panelMarker;
static IMP originalCanBecomeMain = nullptr;
static BOOL canBecomeMain(id window, SEL selector) {
  if (objc_getAssociatedObject(window, &panelMarker)) return NO;
  return reinterpret_cast<BOOL (*)(id, SEL)>(originalCanBecomeMain)(window, selector);
}

static napi_value configure(napi_env env, napi_callback_info info) {
  NSWindow* window = windowFromHandle(env, info);
  Class electronPanel = NSClassFromString(@"ElectronNSPanel");
  SEL preventActivation = NSSelectorFromString(@"_setPreventsActivation:");
  if (!window || !electronPanel || ![window isKindOfClass:electronPanel] ||
      ![window respondsToSelector:preventActivation])
    return boolean(env, false);

  // Add a conditional method to Electron's panel class; never change an
  // instance's isa. AppKit installs KVO subclasses, and changing isa prevents
  // observer cleanup during NSWindow deallocation.
  if (!originalCanBecomeMain) {
    Method method = class_getInstanceMethod(electronPanel, @selector(canBecomeMainWindow));
    if (!method) return boolean(env, false);
    IMP original = method_getImplementation(method);
    if (!class_addMethod(electronPanel, @selector(canBecomeMainWindow),
                         reinterpret_cast<IMP>(canBecomeMain), method_getTypeEncoding(method)))
      return boolean(env, false);
    originalCanBecomeMain = original;
  }
  objc_setAssociatedObject(window, &panelMarker, @YES, OBJC_ASSOCIATION_RETAIN_NONATOMIC);

  // Electron's panel is an NSWindow subclass with a synthetic style mask. Its
  // WindowServer activation tag can remain unset, including on injected clicks.
  // Guard this compatibility selector; do not change the application's policy.
  // Upstream tracking: electron/electron#52914 and #53889.
  @try {
    reinterpret_cast<void (*)(id, SEL, BOOL)>(objc_msgSend)(window, preventActivation, YES);
    return boolean(env, true);
  } @catch (NSException*) {
    objc_setAssociatedObject(window, &panelMarker, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    return boolean(env, false);
  }
}

static napi_value makeKeyWindow(napi_env env, napi_callback_info info) {
  NSWindow* window = windowFromHandle(env, info);
  if (!window || !window.visible || ![window canBecomeKeyWindow]) return boolean(env, false);
  [window makeKeyWindow];
  return boolean(env, true);
}

static napi_value initialize(napi_env env, napi_value exports) {
  napi_property_descriptor methods[] = {
    {"configure", nullptr, configure, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"makeKeyWindow", nullptr, makeKeyWindow, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, 2, methods);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)

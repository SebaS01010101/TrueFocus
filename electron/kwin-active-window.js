const DBUS_SERVICE = "__DBUS_SERVICE__";
const DBUS_PATH = "__DBUS_PATH__";
const DBUS_INTERFACE = "__DBUS_INTERFACE__";

let trackedWindow = null;

function publishWindow(window) {
  const payload =
    window && window.normalWindow
      ? JSON.stringify({
          caption: window.caption,
          desktopFileName: window.desktopFileName || "",
          pid: window.pid || 0,
          resourceClass: window.resourceClass || "",
        })
      : "";

  callDBus(
    DBUS_SERVICE,
    DBUS_PATH,
    DBUS_INTERFACE,
    "UpdateActiveWindow",
    payload,
    function () {},
  );
}

function onTrackedWindowChanged() {
  publishWindow(trackedWindow);
}

function onTrackedWindowClosed() {
  trackedWindow = null;
  publishWindow(null);
}

function disconnectTrackedWindow() {
  if (!trackedWindow) {
    return;
  }

  trackedWindow.captionChanged.disconnect(onTrackedWindowChanged);
  trackedWindow.desktopFileNameChanged.disconnect(onTrackedWindowChanged);
  trackedWindow.windowClassChanged.disconnect(onTrackedWindowChanged);
  trackedWindow.closed.disconnect(onTrackedWindowClosed);
  trackedWindow = null;
}

function connectTrackedWindow(window) {
  if (!window || !window.normalWindow) {
    disconnectTrackedWindow();
    publishWindow(null);
    return;
  }

  if (trackedWindow === window) {
    publishWindow(trackedWindow);
    return;
  }

  disconnectTrackedWindow();
  trackedWindow = window;
  trackedWindow.captionChanged.connect(onTrackedWindowChanged);
  trackedWindow.desktopFileNameChanged.connect(onTrackedWindowChanged);
  trackedWindow.windowClassChanged.connect(onTrackedWindowChanged);
  trackedWindow.closed.connect(onTrackedWindowClosed);
  publishWindow(trackedWindow);
}

workspace.windowActivated.connect(connectTrackedWindow);
connectTrackedWindow(workspace.activeWindow);

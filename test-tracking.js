import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import dbus from "dbus-next";
import { activeWindow } from "get-windows";

const { Interface } = dbus.interface;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isPlasmaWaylandSession = () => {
  const sessionType = (process.env.XDG_SESSION_TYPE || "").toLowerCase();
  const desktop = `${process.env.XDG_CURRENT_DESKTOP || ""} ${process.env.DESKTOP_SESSION || ""}`.toLowerCase();

  return (
    sessionType === "wayland" &&
    (desktop.includes("kde") || desktop.includes("plasma"))
  );
};

async function runX11Test() {
  console.log("🕵️  Buscando ventana activa con get-windows...");

  try {
    const result = await activeWindow();

    if (result) {
      console.log("✅ ¡ÉXITO! Ventana detectada:");
      console.log("-----------------------------");
      console.log("App:", result.owner.name);
      console.log("Título:", result.title);
      console.log("Ruta:", result.owner.path);
      return;
    }

    console.log(
      "⚠️  La librería funcionó, pero no devolvió datos (¿Permisos o sesión Wayland?).",
    );
  } catch (error) {
    console.error("❌ ERROR FATAL:", error);
  }
}

async function runKWinTest() {
  const DBUS_SERVICE = "cl.ceisufro.TrueFocus.TestActiveWindowBridge";
  const DBUS_PATH = "/cl/ceisufro/TrueFocus/TestActiveWindowBridge";
  const DBUS_INTERFACE = "cl.ceisufro.TrueFocus.TestActiveWindowBridge";
  const KWIN_PLUGIN = "truefocus-test-active-window-tracker";
  const scriptTemplatePath = path.join(__dirname, "electron/kwin-active-window.js");
  const runtimeScriptPath = path.join(os.tmpdir(), "truefocus-test-kwin-active-window.js");
  let kwinScripting = null;
  let bus = null;
  let timeoutId = null;
  let finished = false;

  class TestActiveWindowBridge extends Interface {
    constructor(onUpdate) {
      super(DBUS_INTERFACE);
      this.onUpdate = onUpdate;
    }

    UpdateActiveWindow(payloadJson) {
      this.onUpdate(payloadJson);
      return true;
    }
  }

  TestActiveWindowBridge.configureMembers({
    methods: {
      UpdateActiveWindow: {
        inSignature: "s",
        outSignature: "b",
      },
    },
  });

  const cleanup = async () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    if (kwinScripting) {
      try {
        await kwinScripting.unloadScript(KWIN_PLUGIN);
      } catch {
        /* Script ya descargado */
      }
    }

    if (bus) {
      bus.disconnect();
      bus = null;
    }

    if (fs.existsSync(runtimeScriptPath)) {
      fs.unlinkSync(runtimeScriptPath);
    }
  };

  console.log("🕵️  Buscando ventana activa con KWin...");

  try {
    const template = fs.readFileSync(scriptTemplatePath, "utf-8");
    const runtimeScript = template
      .replaceAll("__DBUS_SERVICE__", DBUS_SERVICE)
      .replaceAll("__DBUS_PATH__", DBUS_PATH)
      .replaceAll("__DBUS_INTERFACE__", DBUS_INTERFACE);

    fs.writeFileSync(runtimeScriptPath, runtimeScript);

    bus = dbus.sessionBus();
    await bus.requestName(DBUS_SERVICE);
    bus.export(
      DBUS_PATH,
      new TestActiveWindowBridge((payloadJson) => {
        if (!payloadJson || finished) {
          return;
        }

        finished = true;

        try {
          const payload = JSON.parse(payloadJson);
          console.log("✅ ¡ÉXITO! Ventana detectada:");
          console.log("-----------------------------");
          console.log("Título:", payload.caption || "(sin título)");
          console.log(
            "Desktop file:",
            payload.desktopFileName || "(sin desktop file)",
          );
          console.log("PID:", payload.pid || "(sin PID)");
          console.log(
            "Resource class:",
            payload.resourceClass || "(sin resource class)",
          );
        } catch (error) {
          console.error("❌ No se pudo parsear la respuesta de KWin:", error);
        }

        void cleanup();
      }),
    );

    const scriptingObject = await bus.getProxyObject("org.kde.KWin", "/Scripting");
    kwinScripting = scriptingObject.getInterface("org.kde.kwin.Scripting");

    try {
      await kwinScripting.unloadScript(KWIN_PLUGIN);
    } catch {
      /* Script previo no cargado */
    }

    const loadScriptReply = await bus.call(
      new dbus.Message({
        destination: "org.kde.KWin",
        path: "/Scripting",
        interface: "org.kde.kwin.Scripting",
        member: "loadScript",
        signature: "ss",
        body: [runtimeScriptPath, KWIN_PLUGIN],
      }),
    );
    const scriptId = loadScriptReply.body[0];
    const scriptObject = await bus.getProxyObject(
      "org.kde.KWin",
      `/Scripting/Script${scriptId}`,
    );
    const scriptInterface = scriptObject.getInterface("org.kde.kwin.Script");

    await scriptInterface.run();

    timeoutId = setTimeout(async () => {
      if (finished) {
        return;
      }

      console.log(
        "⚠️  KWin no entregó una ventana activa normal antes del timeout.",
      );
      await cleanup();
    }, 10000);
  } catch (error) {
    console.error("❌ ERROR FATAL:", error);
    await cleanup();
  }
}

if (isPlasmaWaylandSession()) {
  await runKWinTest();
} else {
  await runX11Test();
}

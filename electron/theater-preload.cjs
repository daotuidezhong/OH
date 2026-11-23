// 放映厅场景页面（berry://game/theater.html）的 preload；B站视图不使用任何 preload。
const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("ohTheater", {
  init: () => ipcRenderer.invoke("theater:init"),
  setConfig: (config) => ipcRenderer.invoke("theater:config", config),
  setScreen: (rect, enlarged) => ipcRenderer.send("theater:screen", rect, enlarged),
  send: (text) => ipcRenderer.invoke("theater:send", text),
  navigate: (action) => ipcRenderer.send("theater:navigate", action),
  notebook: () => ipcRenderer.invoke("theater:notebook"),
  onState: (callback) => subscribe("theater:state", callback),
  onEnlarge: (callback) => subscribe("theater:enlarge", callback),
  close: () => ipcRenderer.send("theater:close"),
});

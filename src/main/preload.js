// Ponte segura entre a interface e o processo principal.
const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = ['log', 'monitor:sample', 'ping:sample', 'speed:progress', 'overlay:state', 'overlay:config', 'fps:download', 'bench:disk', 'games:applied', 'hw:sample'];

contextBridge.exposeInMainWorld('hs', {
  call: async (channel, ...args) => {
    const r = await ipcRenderer.invoke(channel, ...args);
    if (!r.ok) throw new Error(r.error);
    return r.data;
  },
  on: (channel, cb) => {
    if (!EVENTS.includes(channel)) { console.warn(`[preload] evento "${channel}" fora da lista EVENTS: adicione-o em preload.js`); return () => {}; }
    const fn = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  },
  resizeOverlay: (width, height) => ipcRenderer.send('overlay:resize', { width, height })
});

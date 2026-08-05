const { contextBridge, ipcRenderer, desktopCapturer } = require('electron');

contextBridge.exposeInMainWorld('capture', {
  takeScreenshot: async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 800 },
    });
    if (!sources.length) return null;
    // Return as base64 JPEG
    const img = sources[0].thumbnail;
    return img.toJPEG(35).toString('base64');
  },
  ready: () => ipcRenderer.send('capture-ready'),
  onCapture: (cb) => ipcRenderer.on('do-capture', () => cb()),
  sendResult: (b64) => ipcRenderer.send('capture-result', b64),
});

// Gera docs/images/banner.png (1280x640) a partir de tools/banner/banner.html.
// Uso: npx electron tools/banner/render.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 640, show: false, useContentSize: true, webPreferences: { offscreen: false } });
  await win.loadFile(path.join(__dirname, 'banner.html'));
  await new Promise((r) => setTimeout(r, 1200)); // fontes e imagens
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1280, height: 640 });
  const out = path.join(__dirname, '..', '..', 'docs', 'images', 'banner.png');
  fs.writeFileSync(out, img.toPNG());
  console.log('banner gerado:', out, img.getSize());
  app.quit();
});

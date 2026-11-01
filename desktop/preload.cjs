// What the desktop game offers the page: a way to quit (the main menu's Quit button).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cornerDesktop', { quit: () => ipcRenderer.send('quit') });

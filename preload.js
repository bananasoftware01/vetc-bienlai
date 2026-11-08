const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loginManual: () => ipcRenderer.invoke('login-manual'),
  signOut: () => ipcRenderer.invoke('sign-out'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  searchInvoices: (fromDate, toDate) => ipcRenderer.invoke('search-invoices', { fromDate, toDate }),
  startDownload: (invoices, targetFolder, concurrency) => ipcRenderer.invoke('start-download', { invoices, targetFolder, concurrency }),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  
  // Progress listeners
  onDownloadProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('download-progress', subscription);
    return () => ipcRenderer.removeListener('download-progress', subscription);
  },
  onDownloadComplete: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('download-complete', subscription);
    return () => ipcRenderer.removeListener('download-complete', subscription);
  }
});

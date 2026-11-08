const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let sessionCookies = '';

// Helper function to format filenames: YYYY-MM-DD_PlateNumber_InvoiceNumber.pdf
function getSanitizedFilename(invoice) {
  let dateStr = 'unknown-date';
  if (invoice.IssueDateFormat) {
    const match = invoice.IssueDateFormat.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      dateStr = `${match[3]}-${match[2]}-${match[1]}`; // YYYY-MM-DD
    }
  }
  const plate = (invoice.NumberPlate || 'unknown-plate').replace(/[^a-zA-Z0-9]/g, '');
  const invNo = invoice.InvNumber || invoice.receiptNo || 'unknown-no';
  return `${dateStr}_${plate}_${invNo}.pdf`;
}

// Generate Excel-friendly CSV Report (with UTF-8 BOM)
function generateCSVReport(invoices, targetFolder) {
  const headers = [
    'Số Hóa Đơn (Invoice Number)', 
    'Ngày Phát Hành (Issue Date)', 
    'Biển Số Xe (Plate Number)', 
    'Tổng Tiền (Amount)', 
    'Trạng Thái Tải (Download Status)', 
    'Tên File (Saved File Name)', 
    'Chi Tiết Lỗi (Error Details)'
  ];
  
  const rows = invoices.map(inv => {
    return [
      inv.InvNumber || inv.receiptNo || '',
      inv.IssueDateFormat || '',
      inv.NumberPlate || '',
      inv.totalAmount || inv.TotalAmountWvat || '',
      inv.downloadStatus || 'Chưa tải',
      inv.downloadFilename || '',
      (inv.downloadError || '').replace(/"/g, '""')
    ];
  });
  
  const BOM = '\uFEFF';
  const csvContent = BOM + [headers.join(','), ...rows.map(r => r.map(val => `"${val}"`).join(','))].join('\n');
  
  const now = new Date();
  const dateStr = now.getFullYear() + 
                  String(now.getMonth() + 1).padStart(2, '0') + 
                  String(now.getDate()).padStart(2, '0') + '_' +
                  String(now.getHours()).padStart(2, '0') +
                  String(now.getMinutes()).padStart(2, '0') +
                  String(now.getSeconds()).padStart(2, '0');
  
  const reportPath = path.join(targetFolder, `BaoCao_TaiHoaDon_${dateStr}.csv`);
  fs.writeFileSync(reportPath, csvContent, 'utf8');
  return reportPath;
}

// Fetch a single page of invoices from VETC FindInvoice/getdata API
async function fetchInvoicesPage(cookiesStr, fromDate, toDate, page, size) {
  const body = JSON.stringify({
    query: {
      FromDate: fromDate + " 00:00:00",
      ToDate: toDate + " 23:59:59",
      TransType: "",
      Status: "",
      TollInId: "",
      TollOutId: "",
      docType: "RECEIPT"
    },
    page: page,
    size: size
  });

  const response = await fetch('https://customer.vetc.com.vn/FindInvoice/getdata', {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json;charset=UTF-8',
      'Cookie': cookiesStr,
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: body
  });

  if (!response.ok) {
    throw new Error(`Yêu cầu tìm kiếm thất bại với mã lỗi HTTP ${response.status}`);
  }
  return await response.json();
}

class VetcAuthenticator {
  constructor() {
    this.authWindow = null;
    this.cookieListener = null;
  }



  // Interactive visible login
  async loginManual() {
    await session.defaultSession.clearStorageData({ storages: ['cookies'] });

    return new Promise((resolve, reject) => {
      this.authWindow = new BrowserWindow({
        width: 1000,
        height: 750,
        show: true,
        title: 'Đăng nhập VETC',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      let isProgrammaticClose = false;

      const loginTimeout = setTimeout(() => {
        this.cleanup();
        reject(new Error('Hết thời gian chờ đăng nhập (3 phút). Vui lòng thử lại.'));
      }, 180000);

      // Listen for the cookie to be set
      this.cookieListener = async (event, cookie, cause, removed) => {
        if (cookie.domain.includes('vetc.com.vn') && cookie.name === '.AspNet.ApplicationCookie_CUSTOMER' && !removed) {
          console.log('Manual: Auth cookie captured!');
          const cookies = await session.defaultSession.cookies.get({ url: 'https://customer.vetc.com.vn' });
          const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          clearTimeout(loginTimeout);
          isProgrammaticClose = true;
          this.cleanup();
          resolve(cookieStr);
        }
      };
      session.defaultSession.cookies.on('changed', this.cookieListener);

      this.authWindow.webContents.on('did-navigate', (event, url) => {
        console.log('Manual Navigation:', url);
      });

      this.authWindow.on('closed', () => {
        clearTimeout(loginTimeout);
        this.authWindow = null;
        if (!isProgrammaticClose) {
          this.cleanup();
          reject(new Error('Cửa sổ đăng nhập đã bị đóng bởi người dùng.'));
        }
      });

      this.authWindow.loadURL('https://customer.vetc.com.vn/Account/Login').catch(err => {
        if (err.code === 'ERR_ABORTED' || (err.message && err.message.includes('ERR_ABORTED'))) {
          console.log('Manual: Load aborted due to redirect, continuing...');
          return;
        }
        clearTimeout(loginTimeout);
        this.cleanup();
        reject(err);
      });
    });
  }

  cleanup() {
    if (this.authWindow) {
      try {
        this.authWindow.destroy();
      } catch (e) {
        // Safe check
      }
      this.authWindow = null;
    }
    if (this.cookieListener) {
      try {
        session.defaultSession.cookies.removeListener('changed', this.cookieListener);
      } catch (e) {
        // Safe check
      }
      this.cookieListener = null;
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 600,
    minWidth: 500,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handler Registrations


ipcMain.handle('login-manual', async () => {
  const auth = new VetcAuthenticator();
  try {
    sessionCookies = await auth.loginManual();
    
    // Smoothly expand main window to Dashboard dimensions upon success
    if (mainWindow) {
      mainWindow.setMinimumSize(900, 650);
      mainWindow.setSize(1200, 800, true);
      mainWindow.center();
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sign-out', async () => {
  sessionCookies = '';
  session.defaultSession.clearStorageData({ storages: ['cookies'] });
  
  // Smoothly shrink main window back to compact dimensions on sign-out
  if (mainWindow) {
    mainWindow.setMinimumSize(500, 600);
    mainWindow.setSize(500, 600, true);
    mainWindow.center();
  }
  return { success: true };
});

ipcMain.handle('select-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Chọn thư mục lưu hóa đơn PDF'
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});

ipcMain.handle('search-invoices', async (event, { fromDate, toDate }) => {
  if (!sessionCookies) {
    return { success: false, error: 'Chưa đăng nhập VETC. Vui lòng đăng nhập lại.' };
  }

  try {
    let allInvoices = [];
    let page = 1;
    let total = 0;

    // Fetch page 1 to discover total amount
    const firstResult = await fetchInvoicesPage(sessionCookies, fromDate, toDate, 1, 100);
    
    if (firstResult && firstResult.Data) {
      allInvoices = allInvoices.concat(firstResult.Data);
      total = firstResult.Total || 0;

      // Loop to fetch remainder pages
      while (allInvoices.length < total && page * 100 < total) {
        page++;
        const nextResult = await fetchInvoicesPage(sessionCookies, fromDate, toDate, page, 100);
        if (nextResult && nextResult.Data) {
          allInvoices = allInvoices.concat(nextResult.Data);
        } else {
          break;
        }
      }
    }

    return { success: true, invoices: allInvoices, total };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Perform concurrent downloads
ipcMain.handle('start-download', async (event, { invoices, targetFolder, concurrency }) => {
  const total = invoices.length;
  const concurrencyLimit = parseInt(concurrency) || 1;
  
  let nextIndex = 0;
  let completed = 0;

  async function downloadWorker() {
    while (nextIndex < total) {
      const currentIndex = nextIndex++;
      const inv = invoices[currentIndex];
      if (!inv) continue;

      // 1. Notify that download has started for this invoice
      inv.downloadStatus = 'Đang tải';
      event.sender.send('download-progress', { currentIndex, completed, total, invoice: inv });

      try {
        if (!inv.viewPdfUrl) {
          throw new Error('Không tìm thấy URL hóa đơn PDF (viewPdfUrl)');
        }

        const filename = getSanitizedFilename(inv);
        const filePath = path.join(targetFolder, filename);

        const res = await fetch(inv.viewPdfUrl);
        if (!res.ok) {
          throw new Error(`Lỗi tải file HTTP ${res.status}`);
        }

        const arrayBuffer = await res.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(arrayBuffer));

        inv.downloadStatus = 'Thành công';
        inv.downloadFilename = filename;
        inv.downloadError = '';
      } catch (err) {
        inv.downloadStatus = 'Lỗi';
        inv.downloadFilename = '';
        inv.downloadError = err.message;
      }

      completed++;
      // 2. Notify that download has finished (Success or Failed)
      event.sender.send('download-progress', { currentIndex, completed, total, invoice: inv });
    }
  }

  // Spawn parallel download workers
  const workers = [];
  const workerCount = Math.min(concurrencyLimit, total);
  for (let i = 0; i < workerCount; i++) {
    workers.push(downloadWorker());
  }
  await Promise.all(workers);

  // Generate CSV report
  let reportPath = '';
  try {
    reportPath = generateCSVReport(invoices, targetFolder);
  } catch (err) {
    console.error('Error generating CSV report:', err);
  }

  event.sender.send('download-complete', { reportPath, invoices });
  return { reportPath, invoices };
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  if (fs.existsSync(folderPath)) {
    shell.openPath(folderPath);
  }
});

ipcMain.handle('open-file', async (event, filePath) => {
  if (fs.existsSync(filePath)) {
    shell.openPath(filePath);
  }
});

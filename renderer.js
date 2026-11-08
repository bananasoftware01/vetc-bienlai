// State Management
let currentInvoices = []; // Full list returned from search
let selectedInvoices = []; // List selected for download
let targetFolder = localStorage.getItem('targetFolder') || '';
let lastReportPath = '';

// DOM Elements
const secLogin = document.getElementById('secLogin');
const secDashboard = document.getElementById('secDashboard');
const secProgress = document.getElementById('secProgress');
const secCompleted = document.getElementById('secCompleted');

const btnLoginInteractive = document.getElementById('btnLoginInteractive');
const btnBrowserIcon = document.getElementById('btnBrowserIcon');
const btnBrowserText = document.getElementById('btnBrowserText');
const btnBrowserSpinner = document.getElementById('btnBrowserSpinner');
const loginErrorBlock = document.getElementById('loginErrorBlock');
const loginErrorMsg = document.getElementById('loginErrorMsg');

const userStatusBlock = document.getElementById('userStatusBlock');
const loggedInUser = document.getElementById('loggedInUser');
const btnSignOut = document.getElementById('btnSignOut');

const txtTargetFolder = document.getElementById('txtTargetFolder');
const btnSelectFolder = document.getElementById('btnSelectFolder');
const txtFromDate = document.getElementById('txtFromDate');
const txtToDate = document.getElementById('txtToDate');
const btnSearch = document.getElementById('btnSearch');

const searchLoader = document.getElementById('searchLoader');
const searchResultsArea = document.getElementById('searchResultsArea');
const searchEmptyState = document.getElementById('searchEmptyState');
const lblTotalCount = document.getElementById('lblTotalCount');
const lblTotalAmount = document.getElementById('lblTotalAmount');
const lblSelectedCount = document.getElementById('lblSelectedCount');
const btnStartDownload = document.getElementById('btnStartDownload');

const tblInvoicesBody = document.querySelector('#tblInvoices tbody');
const chkHeaderSelectAll = document.getElementById('chkHeaderSelectAll');
const btnSelectAll = document.getElementById('btnSelectAll');
const btnDeselectAll = document.getElementById('btnDeselectAll');

const lblProgressPercentage = document.getElementById('lblProgressPercentage');
const lblProgressRatio = document.getElementById('lblProgressRatio');
const progressBarFill = document.getElementById('progressBarFill');
const lblCurrentDownloadingFile = document.getElementById('lblCurrentDownloadingFile');
const consoleLogs = document.getElementById('consoleLogs');

const lblSuccessCount = document.getElementById('lblSuccessCount');
const lblFailedCount = document.getElementById('lblFailedCount');
const lblSavedFolderLink = document.getElementById('lblSavedFolderLink');
const lblSavedCSVLink = document.getElementById('lblSavedCSVLink');

const btnOpenFolder = document.getElementById('btnOpenFolder');
const btnOpenCSV = document.getElementById('btnOpenCSV');
const btnBackToSearch = document.getElementById('btnBackToSearch');

// Initialize Dashboard UI Values
if (targetFolder) {
  txtTargetFolder.value = targetFolder;
}

// Set Default Date Range (Past 7 days)
const today = new Date();
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(today.getDate() - 7);

txtToDate.value = formatDateToISO(today);
txtFromDate.value = formatDateToISO(sevenDaysAgo);

// Helper to convert Date object to YYYY-MM-DD
function formatDateToISO(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Helper to convert YYYY-MM-DD input date string to DD/MM/YYYY for VETC API
function formatISOToDMY(isoString) {
  if (!isoString) return '';
  const parts = isoString.split('-');
  if (parts.length !== 3) return isoString;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// Currency Formatter
function formatCurrency(amount) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

// Screen Navigation
function showSection(section) {
  secLogin.style.display = 'none';
  secDashboard.style.display = 'none';
  secProgress.style.display = 'none';
  secCompleted.style.display = 'none';

  section.style.display = 'flex';
}

// ----------------------------------------------------
// LOGIN HANDLERS
// ----------------------------------------------------

btnLoginInteractive.addEventListener('click', async () => {
  setLoginLoading(true);
  loginErrorBlock.style.display = 'none';

  try {
    const res = await window.api.loginManual();
    if (res.success) {
      handleLoginSuccess('Đăng nhập trình duyệt');
    } else {
      showLoginError(res.error || 'Hủy bỏ đăng nhập hoặc lỗi xảy ra.');
    }
  } catch (err) {
    showLoginError(err.message || 'Hủy bỏ hoặc lỗi xảy ra trong quá trình đăng nhập.');
  } finally {
    setLoginLoading(false);
  }
});

function setLoginLoading(loading) {
  if (loading) {
    btnLoginInteractive.disabled = true;
    btnBrowserIcon.style.display = 'none';
    btnBrowserSpinner.style.display = 'inline-block';
    btnBrowserText.textContent = 'Đang mở cửa sổ đăng nhập...';
  } else {
    btnLoginInteractive.disabled = false;
    btnBrowserIcon.style.display = 'inline-block';
    btnBrowserSpinner.style.display = 'none';
    btnBrowserText.textContent = 'Đăng nhập qua Trình duyệt';
  }
}

function showLoginError(msg) {
  loginErrorMsg.textContent = msg;
  loginErrorBlock.style.display = 'flex';
}

function handleLoginSuccess(username) {
  loggedInUser.textContent = username;
  userStatusBlock.style.display = 'flex';
  showSection(secDashboard);
}

btnSignOut.addEventListener('click', async () => {
  await window.api.signOut();
  window.location.reload();
});

// ----------------------------------------------------
// DASHBOARD SEARCH & FILTER HANDLERS
// ----------------------------------------------------

btnSelectFolder.addEventListener('click', async () => {
  const path = await window.api.selectFolder();
  if (path) {
    targetFolder = path;
    txtTargetFolder.value = path;
    localStorage.setItem('targetFolder', path);
  }
});

btnSearch.addEventListener('click', async () => {
  const fromDate = txtFromDate.value;
  const toDate = txtToDate.value;

  if (!fromDate || !toDate) {
    alert('Vui lòng chọn đầy đủ khoảng ngày tìm kiếm.');
    return;
  }

  // Convert dates
  const fromDmy = formatISOToDMY(fromDate);
  const toDmy = formatISOToDMY(toDate);

  // Show Loading state
  searchLoader.style.display = 'flex';
  searchResultsArea.style.display = 'none';
  searchEmptyState.style.display = 'none';
  btnSearch.disabled = true;

  try {
    const res = await window.api.searchInvoices(fromDmy, toDmy);
    
    if (res.success) {
      currentInvoices = res.invoices || [];
      renderInvoicesTable();
    } else {
      alert(`Lỗi tìm kiếm: ${res.error}`);
      searchEmptyState.style.display = 'flex';
    }
  } catch (err) {
    alert(`Lỗi hệ thống: ${err.message}`);
    searchEmptyState.style.display = 'flex';
  } finally {
    searchLoader.style.display = 'none';
    btnSearch.disabled = false;
  }
});

function renderInvoicesTable() {
  tblInvoicesBody.innerHTML = '';
  chkHeaderSelectAll.checked = true;

  if (currentInvoices.length === 0) {
    searchResultsArea.style.display = 'none';
    searchEmptyState.style.display = 'flex';
    return;
  }

  currentInvoices.forEach((inv, index) => {
    const tr = document.createElement('tr');
    
    // Checkbox Column
    const tdCheck = document.createElement('td');
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = true;
    chk.dataset.index = index;
    chk.addEventListener('change', updateSelectionStats);
    tdCheck.appendChild(chk);
    tr.appendChild(tdCheck);

    // Issue Date Column
    const tdDate = document.createElement('td');
    tdDate.textContent = inv.IssueDateFormat || inv.receiptTime || 'N/A';
    tr.appendChild(tdDate);

    // Plate Number Column
    const tdPlate = document.createElement('td');
    tdPlate.textContent = inv.NumberPlate || 'Không rõ';
    tr.appendChild(tdPlate);

    // Invoice No Column
    const tdInvNo = document.createElement('td');
    tdInvNo.textContent = inv.InvNumber || inv.receiptNo || 'N/A';
    tr.appendChild(tdInvNo);

    // Transaction Type Column
    const tdTrans = document.createElement('td');
    tdTrans.textContent = inv.TollOutName || inv.TransTypeName || 'Giao dịch qua trạm';
    tr.appendChild(tdTrans);

    // Amount Column
    const tdAmount = document.createElement('td');
    tdAmount.className = 'text-right';
    tdAmount.textContent = formatCurrency(inv.totalAmount || inv.TotalAmountWvat || 0);
    tr.appendChild(tdAmount);

    tblInvoicesBody.appendChild(tr);
  });

  searchEmptyState.style.display = 'none';
  searchResultsArea.style.display = 'flex';
  
  updateSelectionStats();
}

function updateSelectionStats() {
  const rowCheckboxes = tblInvoicesBody.querySelectorAll('input[type="checkbox"]');
  let selectedCount = 0;
  let totalAmount = 0;
  selectedInvoices = [];

  rowCheckboxes.forEach(chk => {
    if (chk.checked) {
      selectedCount++;
      const index = parseInt(chk.dataset.index);
      const inv = currentInvoices[index];
      selectedInvoices.push(inv);
      totalAmount += (inv.totalAmount || inv.TotalAmountWvat || 0);
    }
  });

  lblTotalCount.textContent = currentInvoices.length;
  lblTotalAmount.textContent = formatCurrency(totalAmount);
  lblSelectedCount.textContent = selectedCount;

  // Header checkbox state mapping
  if (selectedCount === 0) {
    chkHeaderSelectAll.checked = false;
    chkHeaderSelectAll.indeterminate = false;
  } else if (selectedCount === rowCheckboxes.length) {
    chkHeaderSelectAll.checked = true;
    chkHeaderSelectAll.indeterminate = false;
  } else {
    chkHeaderSelectAll.checked = false;
    chkHeaderSelectAll.indeterminate = true;
  }
}

// Bulk Checkbox Actions
chkHeaderSelectAll.addEventListener('change', (e) => {
  const rowCheckboxes = tblInvoicesBody.querySelectorAll('input[type="checkbox"]');
  rowCheckboxes.forEach(chk => {
    chk.checked = e.target.checked;
  });
  updateSelectionStats();
});

btnSelectAll.addEventListener('click', () => {
  const rowCheckboxes = tblInvoicesBody.querySelectorAll('input[type="checkbox"]');
  rowCheckboxes.forEach(chk => {
    chk.checked = true;
  });
  updateSelectionStats();
});

btnDeselectAll.addEventListener('click', () => {
  const rowCheckboxes = tblInvoicesBody.querySelectorAll('input[type="checkbox"]');
  rowCheckboxes.forEach(chk => {
    chk.checked = false;
  });
  updateSelectionStats();
});

// ----------------------------------------------------
// DOWNLOAD OPERATION & PROGRESS
// ----------------------------------------------------

btnStartDownload.addEventListener('click', async () => {
  if (!targetFolder) {
    alert('Vui lòng chọn thư mục lưu hóa đơn PDF trước khi tải.');
    return;
  }

  if (selectedInvoices.length === 0) {
    alert('Vui lòng chọn ít nhất một hóa đơn để tải.');
    return;
  }

  // Get concurrency setting
  const selConcurrency = document.getElementById('selConcurrency');
  const concurrency = parseInt(selConcurrency.value) || 1;

  // Prep UI
  consoleLogs.innerHTML = '';
  updateProgressUI(0, selectedInvoices.length, 'Đang khởi tạo danh sách tải...');
  showSection(secProgress);

  // Trigger main process download
  try {
    const result = await window.api.startDownload(selectedInvoices, targetFolder, concurrency);
    // Navigation is handled via the 'download-complete' listener
  } catch (err) {
    alert(`Lỗi khi bắt đầu tải: ${err.message}`);
    showSection(secDashboard);
  }
});

function updateProgressUI(index, total, filename) {
  const percentage = total > 0 ? Math.round((index / total) * 100) : 0;
  lblProgressPercentage.textContent = `${percentage}%`;
  lblProgressRatio.textContent = `${index} / ${total} hóa đơn`;
  progressBarFill.style.width = `${percentage}%`;
  lblCurrentDownloadingFile.textContent = filename;
}

// IPC Progress listeners
const removeProgressList = window.api.onDownloadProgress((data) => {
  const { currentIndex, completed, total, invoice } = data;
  
  // Format descriptive name
  const invNo = invoice.InvNumber || invoice.receiptNo || 'N/A';
  const plate = invoice.NumberPlate || 'N/A';
  const desc = `${plate} (HĐ: ${invNo})`;

  if (invoice.downloadStatus === 'Đang tải') {
    // Only update active downloading status string, don't increment ratio yet
    lblCurrentDownloadingFile.textContent = `Đang tải: ${desc}`;
    appendLog(`[Đang tải] Bắt đầu tải hóa đơn số ${invNo} cho xe ${plate}...`, 'info');
  } else if (invoice.downloadStatus === 'Thành công') {
    updateProgressUI(completed, total, `Hoàn thành: ${desc}`);
    appendLog(`[Thành công] Đã lưu file: ${invoice.downloadFilename}`, 'success');
  } else if (invoice.downloadStatus === 'Lỗi') {
    updateProgressUI(completed, total, `Lỗi: ${desc}`);
    appendLog(`[Lỗi] Không thể tải hóa đơn ${invNo} (${plate}): ${invoice.downloadError}`, 'error');
  }
});

const removeCompleteList = window.api.onDownloadComplete((data) => {
  const { reportPath, invoices } = data;
  lastReportPath = reportPath;

  // Calculate success & failures
  let successCount = 0;
  let failedCount = 0;

  invoices.forEach(inv => {
    if (inv.downloadStatus === 'Thành công') {
      successCount++;
    } else {
      failedCount++;
    }
  });

  lblSuccessCount.textContent = successCount;
  lblFailedCount.textContent = failedCount;
  
  lblSavedFolderLink.textContent = targetFolder;
  lblSavedCSVLink.textContent = reportPath.split('/').pop() || reportPath; // Filename only

  showSection(secCompleted);
});

function appendLog(message, type = '') {
  const line = document.createElement('div');
  line.className = `console-line ${type}`;
  
  // Add timestamp
  const time = new Date().toLocaleTimeString('vi-VN');
  line.textContent = `[${time}] ${message}`;
  
  consoleLogs.appendChild(line);
  consoleLogs.scrollTop = consoleLogs.scrollHeight;
}

// Cleanup IPC listeners on window unload
window.addEventListener('beforeunload', () => {
  removeProgressList();
  removeCompleteList();
});

// ----------------------------------------------------
// COMPLETION SCREEN ACTIONS
// ----------------------------------------------------

btnOpenFolder.addEventListener('click', () => {
  if (targetFolder) {
    window.api.openFolder(targetFolder);
  }
});

lblSavedFolderLink.addEventListener('click', () => {
  if (targetFolder) {
    window.api.openFolder(targetFolder);
  }
});

btnOpenCSV.addEventListener('click', () => {
  if (lastReportPath) {
    window.api.openFile(lastReportPath);
  }
});

lblSavedCSVLink.addEventListener('click', () => {
  if (lastReportPath) {
    window.api.openFile(lastReportPath);
  }
});

btnBackToSearch.addEventListener('click', () => {
  showSection(secDashboard);
});

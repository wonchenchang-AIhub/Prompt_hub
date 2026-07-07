/**
 * Prompt Hub 每日複製統計報告
 * ─────────────────────────────────────────────────────────
 * 統計區間：每天上午 7:00 到隔天上午 7:00（24 小時為一期）
 * 寄信時間：隔天上午 7:00 自動寄出
 *
 * 安裝方式：
 * 1. 打開「Prompt Hub 複製紀錄回覆」這份 Google Sheet
 * 2. 上方選單：擴充功能 → Apps Script
 * 3. 把預設的程式碼全部刪除，貼上這整份檔案
 * 4. 點儲存（磁片圖示）
 * 5. 上方函式選單選 setupDailyTrigger，點執行（▶）
 *    → 第一次執行會跳出授權視窗，點允許
 *    → 如果之前已經設定過 9 點的觸發器，這次執行會自動移除舊的、換成 7 點
 * 6. 完成後，每天台北時間上午 7 點會自動寄一封日報到你的 Gmail，
 *    內容統計的是「前一天早上 7 點～今天早上 7 點」這 24 小時的複製紀錄
 *
 * 如果想立即測試效果，執行 sendDailyReport 這個函式即可馬上收到一封信
 * （測試時無論當下是幾點，一律計算「往前推 24 小時、對齊到最近一次上午 7 點」的區間）
 * ─────────────────────────────────────────────────────────
 */

// 收件者 email（預設寄給自己，也可以改成別的地址）
var REPORT_EMAIL = Session.getActiveUser().getEmail();

// 統計區間的起始時刻（24 小時制），對應「每天上午 7 點」
var REPORT_START_HOUR = 7;

// 欄位對應（依照 Google Sheet 目前的欄位順序）
var COL = {
  TIMESTAMP: 0,   // A 時間戳記（表單提交時間，Google 自動加）
  PROMPT_ID: 1,   // B prompt_id
  TITLE:     2,   // C prompt_title
  CATEGORY:  3,   // D category
  COPIED_AT: 4    // E copied_at（前端送出的 ISO 時間）
};

/**
 * 主程式：統計「上一個上午7點～這次上午7點」的資料並寄信
 */
function sendDailyReport() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Form_Responses')
              || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

  var data = sheet.getDataRange().getValues();
  // 第一列是標題列，從第二列開始才是資料
  var rows = data.slice(1);

  var tz = Session.getScriptTimeZone();
  var now = new Date();

  // periodEnd：把「現在」對齊到當天的上午 7 點
  // 觸發器固定在上午 7 點執行，所以 periodEnd 就是今天的 07:00
  var periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), REPORT_START_HOUR, 0, 0, 0);
  // 若手動測試時剛好在凌晨 0:00～07:00 之間執行，periodEnd 應往前推一天，避免區間算反
  if (now < periodEnd) {
    periodEnd.setDate(periodEnd.getDate() - 1);
  }
  // periodStart：periodEnd 往前推 24 小時，即前一天的上午 7 點
  var periodStart = new Date(periodEnd);
  periodStart.setDate(periodStart.getDate() - 1);

  // 篩選出「本期（periodStart ～ periodEnd）」的紀錄
  var periodRows = rows.filter(function(r) {
    var ts = r[COL.TIMESTAMP];
    if (!(ts instanceof Date)) return false;
    return ts >= periodStart && ts < periodEnd;
  });

  // 累計總筆數（全部歷史資料，不受本期區間限制）
  var totalCount = rows.filter(function(r) { return r[COL.TIMESTAMP] instanceof Date; }).length;

  // 本期新增筆數
  var periodNewCount = periodRows.length;

  // 依分類統計本期新增次數
  var catCounts = {};
  periodRows.forEach(function(r) {
    var cat = String(r[COL.CATEGORY] || '未分類');
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });

  // 依提示詞統計本期被複製最多次的前 5 名
  var titleCounts = {};
  periodRows.forEach(function(r) {
    var title = String(r[COL.TITLE] || '未命名');
    titleCounts[title] = (titleCounts[title] || 0) + 1;
  });
  var topTitles = Object.keys(titleCounts)
    .map(function(t) { return { title: t, count: titleCounts[t] }; })
    .sort(function(a, b) { return b.count - a.count; })
    .slice(0, 5);

  // 分類圖示對照表（跟網站上的一致）
  var CAT_ICONS = {
    'preset':   '⚙️ AI工具設定',
    'decision': '📊 決策與分析',
    'proposal': '📋 企劃與提案',
    'project':  '🗂️ 專案管理',
    'comms':    '💼 職場溝通',
    'writing':  '✍️ 文稿優化',
    'ai_roles': '🧠 策略智囊',
    'industry': '📈 產業分析',
    'sales':    '💰 行銷銷售',
    'research': '🔬 研究分析',
    'routine':  '📅 日常效率',
    'learning': '🎓 學習成長',
    'creative': '🎨 視覺創作',
    'life':     '✨ 生活娛樂'
  };

  // 組裝信件內容
  var periodStartLabel = Utilities.formatDate(periodStart, tz, 'yyyy/MM/dd HH:mm');
  var periodEndLabel = Utilities.formatDate(periodEnd, tz, 'yyyy/MM/dd HH:mm');
  var reportDateLabel = Utilities.formatDate(periodEnd, tz, 'yyyy/MM/dd');

  var body = '📊 Prompt Hub 每日使用報告\n';
  body += '統計區間：' + periodStartLabel + ' ～ ' + periodEndLabel + '\n';
  body += '─────────────────────────────\n\n';
  body += '累計複製總數：' + totalCount + '　　本期新增：+' + periodNewCount + '\n\n';
  body += '─────────────────────────────\n\n';

  body += '【各分類本期新增次數】\n';
  var catKeys = Object.keys(CAT_ICONS);
  catKeys.forEach(function(key) {
    var label = CAT_ICONS[key];
    var count = catCounts[key] || 0;
    if (count > 0) {
      body += label + '　+' + count + '\n';
    }
  });
  if (periodNewCount === 0) {
    body += '（本期無任何複製紀錄）\n';
  }

  body += '\n─────────────────────────────\n\n';

  if (topTitles.length > 0) {
    body += '【本期最常被複製的提示詞 TOP 5】\n';
    topTitles.forEach(function(item, i) {
      body += (i + 1) + '. ' + item.title + '　（' + item.count + ' 次）\n';
    });
  } else {
    body += '本期沒有任何提示詞被複製。\n';
  }

  body += '\n─────────────────────────────\n';
  body += '本信由 Prompt Hub 自動發送\n';

  var subject = '📊 Prompt Hub 日報 ' + reportDateLabel + ' 07:00 新增 +' + periodNewCount + ' 次';

  MailApp.sendEmail({
    to: REPORT_EMAIL,
    subject: subject,
    body: body
  });
}

/**
 * 測試專用：不受「上午7點」邊界限制，統計「過去24小時到現在」
 * 平常要驗證資料有沒有正確送進 Sheet，用這個函式即可，跟正式排程互不影響
 */
function sendTestReportNow() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Form_Responses')
              || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

  var data = sheet.getDataRange().getValues();
  var rows = data.slice(1);

  var tz = Session.getScriptTimeZone();
  var periodEnd = new Date();
  var periodStart = new Date(periodEnd);
  periodStart.setDate(periodStart.getDate() - 1);

  var periodRows = rows.filter(function(r) {
    var ts = r[COL.TIMESTAMP];
    if (!(ts instanceof Date)) return false;
    return ts >= periodStart && ts < periodEnd;
  });

  var totalCount = rows.filter(function(r) { return r[COL.TIMESTAMP] instanceof Date; }).length;
  var periodNewCount = periodRows.length;

  var catCounts = {};
  periodRows.forEach(function(r) {
    var cat = String(r[COL.CATEGORY] || '未分類');
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });

  var CAT_ICONS = {
    'preset':   '⚙️ AI工具設定',
    'decision': '📊 決策與分析',
    'proposal': '📋 企劃與提案',
    'project':  '🗂️ 專案管理',
    'comms':    '💼 職場溝通',
    'writing':  '✍️ 文稿優化',
    'ai_roles': '🧠 策略智囊',
    'industry': '📈 產業分析',
    'sales':    '💰 行銷銷售',
    'research': '🔬 研究分析',
    'routine':  '📅 日常效率',
    'learning': '🎓 學習成長',
    'creative': '🎨 視覺創作',
    'life':     '✨ 生活娛樂'
  };

  var periodStartLabel = Utilities.formatDate(periodStart, tz, 'yyyy/MM/dd HH:mm');
  var periodEndLabel = Utilities.formatDate(periodEnd, tz, 'yyyy/MM/dd HH:mm');

  var body = '🧪 Prompt Hub 測試報告（過去24小時到現在）\n';
  body += '統計區間：' + periodStartLabel + ' ～ ' + periodEndLabel + '\n';
  body += '─────────────────────────────\n\n';
  body += '累計複製總數：' + totalCount + '　　本期新增：+' + periodNewCount + '\n\n';

  body += '【各分類本期新增次數】\n';
  Object.keys(CAT_ICONS).forEach(function(key) {
    var count = catCounts[key] || 0;
    if (count > 0) {
      body += CAT_ICONS[key] + '　+' + count + '\n';
    }
  });
  if (periodNewCount === 0) {
    body += '（過去24小時無任何複製紀錄，代表表單或分頁對應可能有問題，需要進一步檢查）\n';
  }

  MailApp.sendEmail({
    to: REPORT_EMAIL,
    subject: '🧪 Prompt Hub 測試報告（過去24小時）',
    body: body
  });
}

/**
 * 設定每日自動觸發器（只需執行一次）
 * 設定為每天上午 7 點（依照試算表時區）自動執行 sendDailyReport，
 * 寄出的內容統計的是「前一天上午7點～今天上午7點」這 24 小時
 */
function setupDailyTrigger() {
  // 先移除舊的觸發器，避免重複建立（含之前設定的 9 點版本）
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'sendDailyReport') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // 建立新的每日觸發器：每天上午 7 點
  ScriptApp.newTrigger('sendDailyReport')
    .timeBased()
    .everyDays(1)
    .atHour(REPORT_START_HOUR)
    .create();

  Logger.log('每日觸發器已建立，將於每天上午 7 點寄送報告（統計前一天7點～今天7點）');
}

/**
 * 移除每日觸發器（如果想停用自動寄信）
 */
function removeDailyTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'sendDailyReport') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  Logger.log('已移除 ' + removed + ' 個觸發器');
}

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// SEALION API configuration
const SEALION_ENDPOINT_URL = process.env.SEALION_ENDPOINT_URL;
const SEALION_MODEL_ID = process.env.SEALION_MODEL_ID;

if (!SEALION_ENDPOINT_URL || !SEALION_MODEL_ID) {
  console.error('❌ SEALION_ENDPOINT_URL or SEALION_MODEL_ID not found in .env.local');
  process.exit(1);
}

async function translateText(chineseText, targetLanguage) {
  const languageMap = {
    'th': 'Thai',
    'id': 'Indonesian'
  };

  const prompt = `Translate the following Chinese text to ${languageMap[targetLanguage]}. Only return the translated text, no explanations:

"${chineseText}"`;

  try {
    const response = await fetch(`${SEALION_ENDPOINT_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: SEALION_MODEL_ID,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim().replace(/^"|"$/g, '');
  } catch (error) {
    console.error(`❌ Translation failed for "${chineseText}" to ${targetLanguage}:`, error);
    return chineseText; // Fallback to original text
  }
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current && current[key], obj);
}

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => {
    if (!current[key]) current[key] = {};
    return current[key];
  }, obj);
  target[lastKey] = value;
}

function getAllKeys(obj, prefix = '') {
  let keys = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys = keys.concat(getAllKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// Key mapping for comprehensive translation keys
const COMPREHENSIVE_TRANSLATIONS = {
  "dashboard.financialDashboard": "财务仪表板",
  "dashboard.welcome": "欢迎",
  "dashboard.welcomePersonalized": "欢迎, {name}!",
  "dashboard.intelligentCopilot": "您的智能财务副驾驶",
  "dashboard.totalIncome": "总收入",
  "dashboard.totalExpenses": "总支出",
  "dashboard.netProfit": "净利润",
  "dashboard.transactions": "交易记录",
  "dashboard.profitMargin": "利润率",
  "dashboard.periods.last60Days": "过去60天",
  "dashboard.periods.currentQuarter": "当前季度",
  "dashboard.periods.currentYear": "当前年度",
  "dashboard.trends.up": "上升",
  "dashboard.trends.down": "下降",
  "dashboard.trends.noChange": "无变化",
  "dashboard.trends.noTrend": "无趋势",
  "dashboard.trends.vsPrevPeriod": "vs 上期",
  "dashboard.displayedIn": "显示货币: {currency}",
  "dashboard.updated": "更新于",
  "dashboard.totalCount": "总计数",
  "dashboard.refreshData": "刷新数据",
  "dashboard.errorLoadingData": "加载数据时出错",
  "dashboard.retryLoading": "重试加载",
  "transactions.subtitle": "查看和管理您的多货币财务交易",
  "documents.upload.clickToUpload": "点击上传",
  "documents.upload.dropFilesHere": "拖拽文件到这里",
  "documents.upload.dropFileHere": "拖拽文件到这里",
  "documents.upload.uploadingFiles": "正在上传文件",
  "documents.upload.uploadingFile": "正在上传文件",
  "documents.upload.processingFiles": "处理文件 {current} / {total}",
  "documents.upload.pleaseWait": "请等待",
  "documents.upload.jpgPngPdfFiles": "JPG、PNG、PDF 文件",
  "documents.upload.multipleSupported": "支持多文件",
  "documents.upload.successfullyUploaded": "成功上传",
  "documents.upload.someUploadsFailed": "部分上传失败",
  "documents.upload.allUploadsFailed": "所有上传失败",
  "documents.upload.supportedFileTypes": "支持的文件类型",
  "documents.upload.images": "图片",
  "documents.upload.documents": "文档",
  "documents.upload.sizeLimit": "大小限制",
  "documents.upload.maximum10MB": "最大 10MB",
  "documents.upload.pdfConvertedOcr": "PDF 转换为 OCR",
  "documents.upload.validation.invalidFileType": "无效的文件类型。仅允许 JPG、PNG 和 PDF 文件。",
  "documents.upload.validation.fileTooLarge": "文件过大。最大大小为 10MB。",
  "documents.upload.validation.invalidFileExtension": "无效的文件扩展名。仅允许 .jpg、.png 和 .pdf 文件。",
  "expenseClaims.dashboard.adminDashboard": "管理员仪表板",
  "expenseClaims.dashboard.teamExpenseManagement": "团队费用管理",
  "expenseClaims.dashboard.myExpenseClaims": "我的费用报销",
  "expenseClaims.dashboard.processReimbursements": "处理报销并生成合规报告",
  "expenseClaims.dashboard.reviewApproveTeam": "审查和批准团队费用报销",
  "expenseClaims.dashboard.submitTrackClaims": "提交和跟踪您的费用报销",
  "expenseClaims.dashboard.captureReceipt": "拍摄收据",
  "expenseClaims.dashboard.manualEntry": "手动输入",
  "expenseClaims.dashboard.reviewClaims": "审核报销",
  "expenseClaims.dashboard.processPayments": "处理付款",
  "expenseClaims.dashboard.totalClaims": "总报销数",
  "expenseClaims.dashboard.pendingApproval": "待审批",
  "expenseClaims.dashboard.approvedAmount": "已批准金额",
  "expenseClaims.dashboard.rejected": "已拒绝",
  "expenseClaims.dashboard.overview": "概览",
  "expenseClaims.dashboard.approvals": "审批",
  "expenseClaims.dashboard.reimbursements": "报销",
  "expenseClaims.dashboard.categories": "类别",
  "expenseClaims.dashboard.reports": "报告",
  "chat.newChat": "新聊天"
};

async function translateMissingKeys(targetLanguage, existingTranslations = {}) {
  const result = { ...existingTranslations };
  const existingKeys = getAllKeys(existingTranslations);

  console.log(`🔄 Translating ${Object.keys(COMPREHENSIVE_TRANSLATIONS).length} comprehensive keys to ${targetLanguage.toUpperCase()}...`);

  for (const [key, chineseValue] of Object.entries(COMPREHENSIVE_TRANSLATIONS)) {
    // Skip if translation already exists
    if (existingKeys.includes(key)) {
      console.log(`⏭️ Skipping existing key: ${key}`);
      continue;
    }

    console.log(`🔄 Translating: ${key} = "${chineseValue}"`);
    const translatedValue = await translateText(chineseValue, targetLanguage);
    console.log(`✅ Result: "${translatedValue}"`);

    setNestedValue(result, key, translatedValue);

    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return result;
}

async function main() {
  const targetLanguage = process.argv[2];
  if (!targetLanguage || !['th', 'id'].includes(targetLanguage)) {
    console.error('❌ Usage: node translate-from-zh.js <th|id>');
    process.exit(1);
  }

  console.log(`🚀 Generating ${targetLanguage.toUpperCase()} translations from Chinese using SEALION API...`);

  // Load existing translations
  const targetPath = path.join(__dirname, '..', 'src', 'messages', `${targetLanguage}.json`);
  let existingTranslations = {};
  if (fs.existsSync(targetPath)) {
    existingTranslations = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  }

  const existingKeys = getAllKeys(existingTranslations);
  const comprehensiveKeys = Object.keys(COMPREHENSIVE_TRANSLATIONS);
  const missingKeys = comprehensiveKeys.filter(key => !existingKeys.includes(key));

  console.log(`📊 Statistics:`);
  console.log(`   - Comprehensive keys to add: ${comprehensiveKeys.length}`);
  console.log(`   - Existing keys: ${existingKeys.length}`);
  console.log(`   - Missing keys: ${missingKeys.length}`);

  if (missingKeys.length === 0) {
    console.log('✅ All comprehensive translations already exist!');
    return;
  }

  // Generate translations for missing keys
  const updatedTranslations = await translateMissingKeys(targetLanguage, existingTranslations);

  // Save updated translations
  fs.writeFileSync(targetPath, JSON.stringify(updatedTranslations, null, 2));
  console.log(`✅ Saved updated ${targetLanguage.toUpperCase()} translations to ${targetPath}`);
}

if (require.main === module) {
  main().catch(console.error);
}
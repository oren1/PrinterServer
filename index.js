require('dotenv').config();

const express = require('express');
const cors = require('cors')
const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');
const puppeteer = require('puppeteer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
require('./orderTypes'); // load JSDoc typedefs for Item/Order

const app = express();
const PORT = process.env.PORT || 3000;

// Receipt image width. 384px = 48mm thermal paper (standard).
const RECEIPT_WIDTH = 570;

// Parse JSON bodies so we can capture order objects
app.use(express.json());
app.use(cors());
/**
 * Generates a receipt HTML file in the root folder
 * @param {string} fileName - e.g., 'receipt.html'
 * @param {Object} data - { title: string, items: [{name, price}], total: string }
 * @returns {string} - full path to saved HTML file
 */
function createReceiptHTML(fileName, data) {
  const { title, items, total } = data;

  const itemRows = items.map(item => `
    <div class="row">
      <span>${item.name}</span>
      <span>${item.price}</span>
    </div>
  `).join('');

  const html = `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      width: 576px;
      font-family: Arial;
      background: white;
      color: black;
      margin: 0;
      padding: 0;
    }
    .title {
      text-align: center;
      font-size: 36px;
      font-weight: bold;
      margin: 10px 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      font-size: 26px;
      margin-top: 5px;
    }
    .line {
      border-top: 2px dashed black;
      margin: 15px 0;
    }
    .total {
      font-weight: bold;
      font-size: 28px;
    }
  </style>
</head>
<body>
  <div class="title">${title}</div>
  <div class="line"></div>
  ${itemRows}
  <div class="line"></div>
  <div class="row total">
    <span>סה״כ</span>
    <span>${total}</span>
  </div>
</body>
</html>
`;

  const filePath = path.join(__dirname, fileName);
  fs.writeFileSync(filePath, html, 'utf-8');

  return filePath;
}

/**
 * Create full receipt HTML with order details (meta, customer, items, totals).
 * @param {string} fileName
 * @param {Order} order
 * @returns {string} path to generated HTML
 */
function createOrderReceiptHTML(fileName, order) {
  const {
    orderNumber,
    status,
    recipientName,
    dateCreated,
    shippingTotal,
    total,
    billingAddress1,
    billingCity,
    billingPhone,
    apartmentNumber,
    streetNumber,
    items,
  } = order;

  const createdDate = dateCreated
    ? new Date(dateCreated).toLocaleString('he-IL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

  const printingDate = new Date().toLocaleString('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const streetLine = [billingAddress1, streetNumber].filter(Boolean).join(' ');

  const itemsRows = (items || [])
    .map(
      (item) => `
    <div class="item-row">
      <span class="item-name">${(item.name || '').replace(/</g, '&lt;')}</span>
      <span class="item-qty">x${item.quantity ?? ''}</span>
      <span class="item-total">${item.total ?? ''}</span>
    </div>`
    )
    .join('');

  const subtotalValue = (items || []).reduce((sum, item) => {
    const n = Number(String(item.total || '0').replace(',', '.'));
    return sum + (isNaN(n) ? 0 : n);
  }, 0);
  const subtotalText = subtotalValue ? subtotalValue.toFixed(2) : '';

  const html = `<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: ${RECEIPT_WIDTH}px;
      min-width: ${RECEIPT_WIDTH}px;
      max-width: ${RECEIPT_WIDTH}px;
      font-family: Arial, sans-serif;
      background: #fff;
      color: #000;
      padding: 24px 18px 32px;
      font-size: 34px;
      line-height: 1.5;
    }
    .header { text-align: center; margin-bottom: 16px; }
    .title { font-weight: bold; font-size: 46px; margin-bottom: 8px; }
    .sub { font-size: 30px; opacity: 0.9; }
    .line { border-top: 2px dashed #000; margin: 14px 0; }
    .meta, .customer { margin-bottom: 10px; font-size: 32px; }
    .section-title { font-weight: bold; font-size: 36px; margin: 12px 0 8px; }
    .items-header, .item-row {
      display: flex;
      flex-direction: row;
      font-size: 32px;
      padding: 8px 0;
    }
    .items-header { font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 10px; margin-bottom: 6px; }
    .item-name { flex: 1.6; }
    .item-qty { flex: 0.5; text-align: center; }
    .item-total { flex: 0.7; text-align: left; }
    .totals { margin-top: 12px; font-size: 32px; }
    .totals-row { display: flex; justify-content: space-between; margin-top: 8px; }
    .totals-row.total { font-weight: bold; font-size: 36px; border-top: 2px solid #000; padding-top: 10px; margin-top: 12px; }
    .footer { text-align: center; margin-top: 24px; font-size: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">Cookies Center</div>
      <div class="sub">הזמנה #${orderNumber || '-'}</div>
      <div class="sub">ח.פ 302601604</div>
      <div class="sub">ארלוזורוב 13</div>
      <div class="sub">בת ים</div>
      <div class="sub">טל׳ 0505714361</div>

  </div>
  <div class="meta">
    תאריך הזמנה: ${createdDate}<br />
    הודפס: ${printingDate}<br />
  </div>
  <div class="line"></div>
  <div class="section-title">פרטי לקוח</div>
  <div class="customer">
    שם: ${recipientName || '-'}<br />
    עיר: ${billingCity || '-'}<br />
    רחוב: ${streetLine || '-'}<br />
    דירה: ${apartmentNumber || '-'}<br />
    טלפון: ${billingPhone || '-'}
  </div>
  <div class="line"></div>
  <div class="section-title">מוצרים</div>
  <div class="items-header">
    <span class="item-name">פריט</span>
    <span class="item-qty">כמות</span>
    <span class="item-total">סה״כ</span>
  </div>
  ${itemsRows}
  <div class="line"></div>
  <div class="totals">
    <div class="totals-row"><span>סיכום פריטים</span><span>${subtotalText || ''}</span></div>
    <div class="totals-row"><span>משלוח</span><span>${shippingTotal ?? '0.00'}</span></div>
    <div class="totals-row total"><span>לתשלום</span><span>${total ?? ''}</span></div>
  </div>
  <div class="footer">תודה רבה וטעימה נעימה!</div>
</body>
</html>`;

  const filePath = path.join(__dirname, fileName);
  fs.writeFileSync(filePath, html, 'utf-8');
  return filePath;
}


// Simple example endpoint for testing the server
app.get('/test', (req, res) => {
  res.json({
    ok: true,
    message: 'Fresh test endpoint is working',
    timestamp: new Date().toISOString(),
  });
});

// Thermal printer status endpoint
app.get('/printer-status', async (req, res) => {
 const interfaceString = process.env.PRINTER_INTERFACE || 'printer:auto';
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: 'tcp://192.168.1.87:9100',
    // characterSet: CharacterSet.PC862_HEBREW
  });

  try {
    const isConnected = await printer.isPrinterConnected();
      printer.alignCenter();
      printer.bold(true);
      printer.println("קוקיס סנטר");

      printer.drawLine();
      printer.alignLeft();
      printer.println("Burger      25.00");
      printer.println("Fries       12.00");

      printer.drawLine();
      printer.bold(true);
      printer.println("TOTAL       37.00");
      console.log("before execute")
      await printer.execute();
      console.log("after execute")

    res.json({
      ok: true,
      message: 'Printer status fetched successfully',
      timestamp: new Date().toISOString(),
      printer: {
        interface: interfaceString,
        connected: isConnected,
      },
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: 'Failed to check printer status',
      timestamp: new Date().toISOString(),
      printer: {
        interface: interfaceString,
        connected: false,
        error: error?.message || 'Unknown error',
      },
    });
  }
});

/**
 * Capture an Order object and print a receipt from it.
 * Expects JSON body matching the Order typedef from `orderTypes.js`.
 */
app.post('/printer-canvas', async (req, res) => {
  /** @type {Order} */
  const order = req.body;

  // Basic validation that we actually got items
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    return res.status(400).json({
      ok: false,
      message: 'Invalid order payload: expected { items: Item[] }',
    });
  }

  // For debugging / capturing the raw order object
  console.log('Received order for printing:', JSON.stringify(order, null, 2));

  const interfaceString = process.env.PRINTER_INTERFACE;

  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: 'tcp://192.168.1.87',
  });

  try {
    // const receiptPath = createReceiptHTML('receipt.html', order);
    const receiptPath = createOrderReceiptHTML('receipt.html', order);

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.setViewport({
      width: RECEIPT_WIDTH,
      height: 800,
      deviceScaleFactor: 1,
    });
    await page.goto(`file://${receiptPath}`, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 200));

    const body = await page.$('body');
    const screenshot = await body.screenshot({ omitBackground: false });

    const image = await sharp(screenshot)
      .resize(RECEIPT_WIDTH)
      .grayscale()
      .threshold(160)
      .png()
      .toBuffer();

    const isConnected = await printer.isPrinterConnected();
    await printer.printImageBuffer(image);
    printer.println('');
    printer.println('');
    printer.println('');
    printer.cut()
    await printer.execute();

    await browser.close();

    res.json({
      ok: true,
      message: 'Order captured and sent to printer',
      timestamp: new Date().toISOString(),
      printer: {
        interface: interfaceString,
        connected: isConnected,
      },
      orderSummary: {
        orderNumber: order.orderNumber,
        items: order.items.length,
        total: order.total,
      },
    });
  } catch (error) {
    console.error('Error in /printer-canvas:', error);

    res.status(500).json({
      ok: false,
      message: 'Failed to render or print order',
      timestamp: new Date().toISOString(),
      printer: {
        interface: process.env.PRINTER_INTERFACE || 'unknown',
        connected: false,
        error: error?.message || 'Unknown error',
      },
    });
  }
});


app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

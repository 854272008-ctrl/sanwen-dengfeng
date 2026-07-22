const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const BASE = 'https://sanwen-dengfeng.onrender.com';
const OUT = '/Users/zztc/WorkBuddy/2026-07-22-15-49-13/罗浮山方案/作答页/qrcodes';
fs.mkdirSync(OUT, { recursive: true });

const ITEMS = [
  { name: '01-首页', path: '/' },
  { name: '02-第壹问-山脚之问', path: '/?v=q&q=1' },
  { name: '03-第贰问-半山之问', path: '/?v=q&q=2' },
  { name: '04-第叁问-登顶之问', path: '/?v=q&q=3' },
  { name: '05-回响墙-晚宴', path: '/?v=wall' }
];

(async () => {
  for (const it of ITEMS) {
    const url = BASE + it.path;
    const file = path.join(OUT, it.name + '.png');
    await QRCode.toFile(file, url, { width: 480, margin: 2, errorCorrectionLevel: 'M' });
    console.log('✓', it.name, url);
  }
  console.log('done:', OUT);
})();

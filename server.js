/**
 * 三罐储蓄 - 本机 Web 服务
 * 职责：托管静态页面 + 读写 data/data.json
 * 启动：node server.js  或  npm start
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'data', 'data.json');

/** 默认空数据结构 */
function defaultData() {
  return {
    version: 1,
    jars: {
      consumption: { name: '消费储蓄罐', amount: 0 },
      love: { name: '爱心储蓄罐', amount: 0 },
      super: { name: '超级存钱罐', amount: 0 },
    },
    logs: [],
    weeklyRecords: [],
    achievements: [],
  };
}

/** 确保 data.json 存在 */
function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData(), null, 2), 'utf8');
  }
}

function readData() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    // 文件损坏时回退默认，避免服务挂掉
    const data = defaultData();
    writeData(data);
    return data;
  }
}

function writeData(data) {
  ensureDataFile();
  // 先写临时文件再 rename，降低写到一半断电导致坏文件的风险
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

/** 静态资源 MIME */
function mimeOf(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
  };
  return map[ext] || 'application/octet-stream';
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** 简易校验：必须是对象且含 jars */
function isValidData(data) {
  return (
    data &&
    typeof data === 'object' &&
    data.jars &&
    typeof data.jars === 'object' &&
    Array.isArray(data.logs) &&
    Array.isArray(data.weeklyRecords)
  );
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // ---------- API ----------
  if (pathname === '/api/data') {
    if (req.method === 'GET') {
      return sendJson(res, 200, readData());
    }
    if (req.method === 'PUT') {
      try {
        const raw = await readBody(req);
        const data = JSON.parse(raw);
        if (!isValidData(data)) {
          return sendJson(res, 400, { error: '数据结构不合法' });
        }
        writeData(data);
        return sendJson(res, 200, { ok: true });
      } catch (e) {
        return sendJson(res, 400, { error: '无法解析 JSON：' + (e.message || e) });
      }
    }
    res.writeHead(405, { Allow: 'GET, PUT' });
    return res.end();
  }

  // ---------- 静态文件 ----------
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  // 防止路径穿越
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      return res.end(err.code === 'ENOENT' ? 'Not Found' : 'Server Error');
    }
    res.writeHead(200, { 'Content-Type': mimeOf(filePath) });
    res.end(content);
  });
});

ensureDataFile();
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  三罐储蓄服务已启动');
  console.log(`  本机访问:   http://localhost:${PORT}`);
  console.log(`  局域网访问: http://<本机IP>:${PORT}`);
  console.log(`  数据文件:   ${DATA_FILE}`);
  console.log('');
});

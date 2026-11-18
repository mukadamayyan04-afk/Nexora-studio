import type { NexoraProject, ProjectTemplate } from '../src/types/nexora.ts';
import { DEFAULT_USER_ID, dbAppendProjectHistory } from './database.ts';
import { detectAndroidToolchain, upsertProject, validateProjectStructure, workspaceFileManager } from './projectEngine.ts';
import { appendProjectVersion } from './versionHistory.ts';

const TASKFLOW_SERVER_JS = `import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const DB_FILE = path.join(__dirname, 'db', 'store.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

function ensureDb() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      tasks: [
        { id: 't-1', title: 'Configure API health route', status: 'done', priority: 'high', createdAt: new Date().toISOString() },
        { id: 't-2', title: 'Verify persistent database writes', status: 'in_progress', priority: 'medium', createdAt: new Date().toISOString() }
      ],
      sessions: []
    }, null, 2));
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDb(data) {
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/api/health') {
    const db = readDb();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, service: process.env.APP_TITLE || 'TaskFlow Server', taskCount: db.tasks.length }));
  }

  if (url.pathname === '/api/tasks' && req.method === 'GET') {
    const db = readDb();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ tasks: db.tasks }));
  }

  if (url.pathname === '/api/tasks' && req.method === 'POST') {
    const body = await readBody(req);
    const title = String(body.title || '').trim();
    if (!title) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Task title is required.' }));
    }
    const db = readDb();
    const item = {
      id: 't-' + crypto.randomBytes(3).toString('hex'),
      title,
      status: body.status || 'open',
      priority: body.priority || 'medium',
      createdAt: new Date().toISOString()
    };
    db.tasks.unshift(item);
    writeDb(db);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ task: item, tasks: db.tasks }));
  }

  if (url.pathname.startsWith('/api/tasks/') && req.method === 'PATCH') {
    const id = url.pathname.split('/').pop();
    const body = await readBody(req);
    const db = readDb();
    db.tasks = db.tasks.map((t) => (t.id === id ? { ...t, ...body } : t));
    writeDb(db);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ tasks: db.tasks }));
  }

  if (url.pathname.startsWith('/api/tasks/') && req.method === 'DELETE') {
    const id = url.pathname.split('/').pop();
    const db = readDb();
    db.tasks = db.tasks.filter((t) => t.id !== id);
    writeDb(db);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ tasks: db.tasks }));
  }

  const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\\/+/, '');
  const target = path.join(PUBLIC_DIR, rel);
  if (target.startsWith(PUBLIC_DIR) && fs.existsSync(target) && fs.statSync(target).isFile()) {
    const ext = path.extname(target);
    const mime = ext === '.css' ? 'text/css' : ext === '.js' ? 'application/javascript' : 'text/html';
    res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8' });
    return res.end(fs.readFileSync(target));
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(path.join(PUBLIC_DIR, 'index.html')));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Full-stack app running on http://127.0.0.1:' + PORT);
});
`;

const TASKFLOW_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>TaskFlow Full-Stack Workspace</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, -apple-system, sans-serif; }
    body { margin: 0; background: #0c0d14; color: #eceaf4; padding: 24px; }
    .wrap { max-width: 720px; margin: 0 auto; }
    .card { background: #151722; border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; padding: 20px; margin-bottom: 16px; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    p { margin: 0 0 16px; color: #9aa0b8; font-size: 13px; }
    form { display: flex; gap: 8px; flex-wrap: wrap; }
    input, select { background: #0b0c12; color: #fff; border: 1px solid rgba(255,255,255,0.14); border-radius: 8px; padding: 10px 12px; font-size: 13px; }
    input { flex: 1; min-width: 180px; }
    button { background: linear-gradient(135deg,#8b5cf6,#06b6d4); border: 0; color: #fff; font-weight: 600; border-radius: 8px; padding: 10px 16px; cursor: pointer; font-size: 13px; }
    .task { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 10px; background: #0f1019; border: 1px solid rgba(255,255,255,0.06); margin-top: 8px; font-size: 13px; }
    .badge { font-size: 11px; padding: 2px 8px; border-radius: 6px; background: rgba(6,182,212,0.18); color: #67e8f9; margin-left: 8px; }
    .del { background: rgba(239,68,68,0.18); color: #fca5a5; padding: 6px 10px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>TaskFlow Full-Stack App</h1>
      <p id="status">Connecting to backend API...</p>
      <form id="taskForm">
        <input id="titleInput" placeholder="Add a persistent task..." required />
        <select id="priorityInput">
          <option value="high">High</option>
          <option value="medium" selected>Medium</option>
          <option value="low">Low</option>
        </select>
        <button type="submit">Add Task</button>
      </form>
    </div>
    <div class="card">
      <strong style="font-size:13px">Saved Tasks (Backend DB)</strong>
      <div id="list"></div>
    </div>
  </div>
  <script>
    const apiBase = window.location.pathname.endsWith('/') ? '.' : window.location.pathname;
    const statusEl = document.getElementById('status');
    const listEl = document.getElementById('list');
    function render(tasks) {
      listEl.innerHTML = tasks.map(t =>
        '<div class="task"><div><span>' + t.title.replace(/</g,'&lt;') + '</span><span class="badge">' + t.priority + ' · ' + t.status + '</span></div>' +
        '<div style="display:flex;gap:6px"><button onclick="toggleTask(\\'' + t.id + '\\',\\'' + (t.status==='done'?'open':'done') + '\\')">Toggle</button>' +
        '<button class="del" onclick="deleteTask(\\'' + t.id + '\\')">Delete</button></div></div>'
      ).join('') || '<p style="margin-top:12px">No tasks saved yet.</p>';
    }
    async function load() {
      try {
        const res = await fetch('api/tasks');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        statusEl.textContent = 'Connected to Node Backend DB · ' + data.tasks.length + ' record(s) persisted';
        render(data.tasks);
      } catch (err) {
        statusEl.textContent = 'Start the Backend Server runner in the workspace to activate persistent API routes.';
      }
    }
    window.toggleTask = async (id, status) => {
      const res = await fetch('api/tasks/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      const data = await res.json();
      render(data.tasks || []);
    };
    window.deleteTask = async (id) => {
      const res = await fetch('api/tasks/' + id, { method: 'DELETE' });
      const data = await res.json();
      render(data.tasks || []);
    };
    document.getElementById('taskForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('titleInput');
      const priority = document.getElementById('priorityInput').value;
      const res = await fetch('api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: input.value, priority }) });
      if (res.ok) {
        const data = await res.json();
        input.value = '';
        render(data.tasks || []);
      }
    });
    load();
  </script>
</body>
</html>`;

const GAME_2D_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no" />
  <title>Neon Drift Velocity 2D</title>
  <style>
    html,body{margin:0;height:100%;background:#070810;color:#eef2ff;font-family:system-ui,sans-serif;overflow:hidden;display:flex;flex-direction:column}
    .hud{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#111322;border-bottom:1px solid rgba(255,255,255,0.08);font-size:12px}
    canvas{flex:1;width:100%;display:block;touch-action:none}
    .controls{display:flex;justify-content:center;gap:12px;padding:10px;background:#111322;border-top:1px solid rgba(255,255,255,0.08)}
    button{background:#1f233a;color:#e4e1e9;border:1px solid rgba(139,92,246,0.45);border-radius:8px;padding:8px 16px;font-weight:600;cursor:pointer}
  </style>
</head>
<body>
  <div class="hud">
    <span id="score">SCORE: 0</span>
    <span id="best">BEST: 0</span>
    <button id="pauseBtn" type="button">Pause</button>
    <button id="restartBtn" type="button">Restart</button>
  </div>
  <canvas id="game"></canvas>
  <div class="controls">
    <button id="leftBtn" type="button">◀ Left</button>
    <button id="boostBtn" type="button">⚡ Boost</button>
    <button id="rightBtn" type="button">Right ▶</button>
  </div>
  <script>
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    let w = 400, h = 400, paused = false, gameOver = false, score = 0;
    let best = Number(localStorage.getItem('neon_drift_best') || 0);
    document.getElementById('best').textContent = 'BEST: ' + best;
    const player = { x: 0.5, y: 0.82, vx: 0, boost: 0 };
    const obstacles = [];
    const keys = { left: false, right: false, boost: false };

    function resize(){ w = canvas.width = canvas.clientWidth; h = canvas.height = canvas.clientHeight; }
    window.addEventListener('resize', resize); resize();

    function playTone(freq, dur) {
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ac.createOscillator(); const g = ac.createGain();
        osc.type = 'triangle'; osc.frequency.value = freq; g.gain.value = 0.05;
        osc.connect(g); g.connect(ac.destination); osc.start();
        setTimeout(() => { osc.stop(); ac.close(); }, dur);
      } catch {}
    }

    function reset(){
      obstacles.length = 0; score = 0; gameOver = false; paused = false;
      player.x = 0.5; player.vx = 0;
      document.getElementById('pauseBtn').textContent = 'Pause';
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true;
      if (e.key === ' ') keys.boost = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
      if (e.key === ' ') keys.boost = false;
    });

    const bindHold = (id, key) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', () => { keys[key] = true; });
      el.addEventListener('pointerup', () => { keys[key] = false; });
      el.addEventListener('pointerleave', () => { keys[key] = false; });
    };
    bindHold('leftBtn', 'left'); bindHold('rightBtn', 'right'); bindHold('boostBtn', 'boost');

    document.getElementById('pauseBtn').onclick = () => {
      paused = !paused;
      document.getElementById('pauseBtn').textContent = paused ? 'Resume' : 'Pause';
    };
    document.getElementById('restartBtn').onclick = reset;

    let frame = 0;
    function tick() {
      requestAnimationFrame(tick);
      if (paused || gameOver) return;
      frame++;
      const speedMult = keys.boost ? 1.7 : 1.0;
      if (keys.left) player.vx -= 0.0022;
      if (keys.right) player.vx += 0.0022;
      player.vx *= 0.86;
      player.x = Math.max(0.1, Math.min(0.9, player.x + player.vx));

      if (frame % Math.max(18, Math.floor(34 / speedMult)) === 0) {
        obstacles.push({ x: 0.14 + Math.random() * 0.72, y: -0.05, r: 16 });
      }

      ctx.fillStyle = '#070810';
      ctx.fillRect(0, 0, w, h);

      // Lane grid
      ctx.strokeStyle = 'rgba(6,182,212,0.16)';
      ctx.lineWidth = 2;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo((w * i) / 4, 0); ctx.lineTo((w * i) / 4, h); ctx.stroke();
      }

      // Player racer
      const px = player.x * w, py = player.y * h;
      ctx.fillStyle = keys.boost ? '#4cd7f6' : '#8b5cf6';
      ctx.beginPath();
      ctx.moveTo(px, py - 18); ctx.lineTo(px + 14, py + 16); ctx.lineTo(px - 14, py + 16); ctx.closePath();
      ctx.fill();

      for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        o.y += 0.008 * speedMult;
        const ox = o.x * w, oy = o.y * h;
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(ox - 14, oy - 14, 28, 28);
        if (Math.hypot(px - ox, py - oy) < 24) {
          gameOver = true;
          playTone(150, 180);
          if (score > best) { best = score; localStorage.setItem('neon_drift_best', String(best)); }
          document.getElementById('best').textContent = 'BEST: ' + best;
          ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = '#fff'; ctx.font = 'bold 22px system-ui'; ctx.textAlign = 'center';
          ctx.fillText('CRASHED · SCORE ' + score, w / 2, h / 2);
        }
        if (o.y > 1.1) { obstacles.splice(i, 1); score += keys.boost ? 20 : 10; }
      }
      document.getElementById('score').textContent = 'SCORE: ' + score;
    }
    tick();
  </script>
</body>
</html>`;

const GAME_3D_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Orbital Vector 3D</title>
  <style>
    html,body{margin:0;height:100%;background:#06070d;color:#e4e1e9;font-family:system-ui,sans-serif;overflow:hidden;display:flex;flex-direction:column}
    .bar{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;background:#121320;border-bottom:1px solid rgba(255,255,255,0.08);font-size:12px}
    canvas{flex:1;width:100%;display:block}
    .pad{display:flex;justify-content:center;gap:10px;padding:8px;background:#121320}
    button{background:#1b1d30;color:#fff;border:1px solid rgba(6,182,212,0.45);border-radius:8px;padding:7px 14px;cursor:pointer;font-size:12px}
  </style>
</head>
<body>
  <div class="bar">
    <span id="hud">SCORE: 0 · SHIELD: 100%</span>
    <div>
      <button id="togglePause">Pause</button>
      <button id="resetBtn">Restart</button>
    </div>
  </div>
  <canvas id="view"></canvas>
  <div class="pad">
    <button id="btnL">◀ Yaw Left</button>
    <button id="btnF">⚡ Fire Laser</button>
    <button id="btnR">Yaw Right ▶</button>
  </div>
  <script>
    const c = document.getElementById('view'), g = c.getContext('2d');
    let w=400, h=400, yaw=0, score=0, shield=100, paused=false;
    const targets = Array.from({length:12}, () => ({ x:(Math.random()-0.5)*4, y:(Math.random()-0.5)*2, z:2 + Math.random()*8 }));
    const bolts = [];
    function resize(){ w=c.width=c.clientWidth; h=c.height=c.clientHeight; }
    window.addEventListener('resize', resize); resize();
    const held = { l:false, r:false };
    window.addEventListener('keydown', e => {
      if(e.key==='ArrowLeft'||e.key==='a') held.l=true;
      if(e.key==='ArrowRight'||e.key==='d') held.r=true;
      if(e.key===' ') bolts.push({ x:yaw*1.6, y:0, z:0.6 });
    });
    window.addEventListener('keyup', e => {
      if(e.key==='ArrowLeft'||e.key==='a') held.l=false;
      if(e.key==='ArrowRight'||e.key==='d') held.r=false;
    });
    document.getElementById('btnL').onpointerdown = () => held.l=true;
    document.getElementById('btnL').onpointerup = () => held.l=false;
    document.getElementById('btnR').onpointerdown = () => held.r=true;
    document.getElementById('btnR').onpointerup = () => held.r=false;
    document.getElementById('btnF').onclick = () => bolts.push({ x:yaw*1.6, y:0, z:0.6 });
    document.getElementById('togglePause').onclick = () => { paused=!paused; document.getElementById('togglePause').textContent = paused?'Resume':'Pause'; };
    document.getElementById('resetBtn').onclick = () => { score=0; shield=100; yaw=0; paused=false; };

    function proj(x, y, z) {
      const f = Math.min(w, h) * 0.7 / Math.max(0.2, z);
      return { sx: w/2 + (x - yaw*1.6) * f, sy: h/2 + y * f, s: f };
    }
    function loop() {
      requestAnimationFrame(loop);
      if (paused || shield <= 0) return;
      if (held.l) yaw -= 0.04;
      if (held.r) yaw += 0.04;
      g.fillStyle = '#06070d'; g.fillRect(0,0,w,h);

      // 3D Horizon Grid
      g.strokeStyle = 'rgba(139,92,246,0.22)';
      for(let z=1; z<=10; z++) {
        const p1 = proj(-6, 1.5, z), p2 = proj(6, 1.5, z);
        g.beginPath(); g.moveTo(p1.sx, p1.sy); g.lineTo(p2.sx, p2.sy); g.stroke();
      }

      for(const t of targets) {
        t.z -= 0.035;
        if (t.z < 0.4) { t.z = 9; t.x = (Math.random()-0.5)*4; shield = Math.max(0, shield - 15); }
        const p = proj(t.x, t.y, t.z);
        const sz = Math.max(4, p.s * 0.32);
        g.strokeStyle = '#4cd7f6'; g.lineWidth = 2;
        g.strokeRect(p.sx - sz/2, p.sy - sz/2, sz, sz);
      }

      for(let i=bolts.length-1; i>=0; i--) {
        const b = bolts[i];
        b.z += 0.25;
        const p = proj(b.x, b.y, b.z);
        g.fillStyle = '#a855f7';
        g.beginPath(); g.arc(p.sx, p.sy, Math.max(2, p.s*0.09), 0, Math.PI*2); g.fill();
        for (const t of targets) {
          if (Math.abs(t.z - b.z) < 0.6 && Math.hypot(t.x - b.x, t.y - b.y) < 0.55) {
            score += 50; t.z = 9; t.x = (Math.random()-0.5)*4; bolts.splice(i,1); break;
          }
        }
        if (b && b.z > 10) bolts.splice(i, 1);
      }
      document.getElementById('hud').textContent = 'SCORE: ' + score + ' · SHIELD: ' + shield + '%';
    }
    loop();
  </script>
</body>
</html>`;

export const STARTER_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'tpl-fullstack-taskflow',
    name: 'Full-Stack TaskFlow App (Node + DB + API)',
    type: 'website',
    category: 'Full-Stack Web',
    description:
      'Complete full-stack web app with isolated Node HTTP API server, persistent JSON store, CRUD forms, and dark glass UI.',
    techStack: ['Node.js HTTP', 'REST API', 'Persistent JSON DB', 'HTML5', 'CSS3'],
    defaultPrompt:
      'Build a full-stack task management web app with REST API endpoints, persistent database storage, create/toggle/delete actions, and dark UI.',
    previewHtml: TASKFLOW_HTML,
    envVars: [{ key: 'APP_TITLE', value: 'TaskFlow Full-Stack Server' }],
    files: [
      {
        path: 'package.json',
        language: 'json',
        content: JSON.stringify(
          {
            name: 'taskflow-fullstack',
            version: '1.0.0',
            type: 'module',
            scripts: { start: 'node server.js' },
          },
          null,
          2
        ),
      },
      { path: 'server.js', language: 'javascript', content: TASKFLOW_SERVER_JS },
      { path: 'public/index.html', language: 'html', content: TASKFLOW_HTML },
      {
        path: 'db/store.json',
        language: 'json',
        content: JSON.stringify(
          {
            tasks: [
              {
                id: 't-1',
                title: 'Verify live backend API persistence',
                status: 'open',
                priority: 'high',
                createdAt: new Date().toISOString(),
              },
            ],
          },
          null,
          2
        ),
      },
    ],
  },
  {
    id: 'tpl-express-api-tester',
    name: 'Backend REST API & Live Tester',
    type: 'website',
    category: 'Backend API',
    description:
      'Zero-dependency Node API microservice with /api/health, /api/items persistence, and built-in interactive request inspector.',
    techStack: ['Node.js', 'REST API', 'JSON DB', 'Interactive Client'],
    defaultPrompt: 'Create a backend REST API service with health monitoring and persistent JSON item store.',
    previewHtml: TASKFLOW_HTML,
    envVars: [{ key: 'API_MODE', value: 'production' }],
    files: [
      {
        path: 'package.json',
        language: 'json',
        content: JSON.stringify(
          { name: 'nexora-api-service', version: '1.0.0', type: 'module', scripts: { start: 'node server.js' } },
          null,
          2
        ),
      },
      { path: 'server.js', language: 'javascript', content: TASKFLOW_SERVER_JS },
      { path: 'public/index.html', language: 'html', content: TASKFLOW_HTML },
    ],
  },
  {
    id: 'tpl-android-compose',
    name: 'Android Jetpack Compose Material 3 Starter',
    type: 'android-apk',
    category: 'Android App',
    description:
      'Complete Gradle + Kotlin + Jetpack Compose Android project with Material 3 dark theme, AndroidManifest.xml, and launcher resources.',
    techStack: ['Kotlin', 'Jetpack Compose', 'Material 3', 'Gradle KTS'],
    defaultPrompt:
      'Create an Android Jetpack Compose application with Material 3 dark theme, navigation tabs, and interactive dashboard cards.',
    previewHtml:
      '<!doctype html><html><body style="margin:0;background:#0a0a0f;color:#e4e1e9;font-family:system-ui;padding:24px"><div style="border:1px solid rgba(139,92,246,0.4);border-radius:20px;padding:20px;background:#14141f"><div style="font-size:11px;color:#4cd7f6;margin-bottom:6px">ANDROID COMPOSE UI SIMULATION</div><h2 style="margin:0 0 8px;font-size:18px">Compose Material 3 App</h2><p style="margin:0;color:#958ea0;font-size:13px">Includes MainActivity.kt, Theme.kt, Gradle scripts, and AndroidManifest.xml ready for Android Studio build.</p></div></body></html>',
    files: [
      { path: 'settings.gradle.kts', language: 'gradle', content: 'rootProject.name = "NexoraComposeApp"\ninclude(":app")\n' },
      {
        path: 'build.gradle.kts',
        language: 'gradle',
        content: 'plugins {\n  id("com.android.application") version "8.5.0" apply false\n  id("org.jetbrains.kotlin.android") version "2.0.0" apply false\n}\n',
      },
      {
        path: 'app/build.gradle.kts',
        language: 'gradle',
        content:
          'plugins {\n  id("com.android.application")\n  id("org.jetbrains.kotlin.android")\n}\nandroid {\n  namespace = "com.nexora.app"\n  compileSdk = 35\n  defaultConfig {\n    applicationId = "com.nexora.app"\n    minSdk = 24\n    targetSdk = 35\n    versionCode = 1\n    versionName = "1.0"\n  }\n}\n',
      },
      {
        path: 'app/src/main/AndroidManifest.xml',
        language: 'xml',
        content:
          '<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n  <application android:label="Nexora App" android:theme="@style/Theme.Nexora">\n    <activity android:name=".MainActivity" android:exported="true">\n      <intent-filter>\n        <action android:name="android.intent.action.MAIN" />\n        <category android:name="android.intent.category.LAUNCHER" />\n      </intent-filter>\n    </activity>\n  </application>\n</manifest>\n',
      },
      {
        path: 'app/src/main/java/com/nexora/app/MainActivity.kt',
        language: 'kotlin',
        content:
          'package com.nexora.app\n\nimport android.os.Bundle\nimport androidx.activity.ComponentActivity\nimport androidx.activity.compose.setContent\nimport androidx.compose.material3.*\nimport androidx.compose.foundation.layout.*\nimport androidx.compose.ui.Modifier\nimport androidx.compose.ui.unit.dp\n\nclass MainActivity : ComponentActivity() {\n  override fun onCreate(savedInstanceState: Bundle?) {\n    super.onCreate(savedInstanceState)\n    setContent {\n      Surface(modifier = Modifier.fillMaxSize()) {\n        Column(modifier = Modifier.padding(24.dp)) {\n          Text("Nexora Material 3 Starter")\n        }\n      }\n    }\n  }\n}\n',
      },
      {
        path: 'app/src/main/res/values/strings.xml',
        language: 'xml',
        content: '<resources><string name="app_name">Nexora App</string></resources>\n',
      },
    ],
  },
  {
    id: 'tpl-2d-neon-drift',
    name: '2D Neon Drift Racer (Playable + Audio)',
    type: 'game-2d',
    category: '2D Game',
    gameGenre: 'Racing',
    description:
      'Playable HTML5 2D racing game with keyboard & mobile touch steering, nitro boost, Web Audio synth, localStorage high scores, and Android WebView shell.',
    techStack: ['HTML5 Canvas', 'Web Audio API', 'LocalStorage Save', 'Android WebView'],
    defaultPrompt:
      'Build a playable 2D neon drift racing game with keyboard/touch steering, nitro boost, pause/restart, and saved best scores.',
    previewHtml: GAME_2D_HTML,
    files: [
      { path: 'app/src/main/assets/index.html', language: 'html', content: GAME_2D_HTML },
      { path: 'settings.gradle.kts', language: 'gradle', content: 'rootProject.name = "NeonDrift2D"\ninclude(":app")\n' },
      {
        path: 'app/build.gradle.kts',
        language: 'gradle',
        content:
          'plugins { id("com.android.application") }\nandroid {\n  namespace = "com.nexora.game"\n  compileSdk = 35\n  defaultConfig { applicationId = "com.nexora.game"; minSdk = 24; targetSdk = 35 }\n}\n',
      },
      {
        path: 'app/src/main/AndroidManifest.xml',
        language: 'xml',
        content:
          '<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n  <application android:label="Neon Drift 2D">\n    <activity android:name=".MainActivity" android:exported="true">\n      <intent-filter><action android:name="android.intent.action.MAIN" /><category android:name="android.intent.category.LAUNCHER" /></intent-filter>\n    </activity>\n  </application>\n</manifest>\n',
      },
      {
        path: 'app/src/main/java/com/nexora/game/MainActivity.kt',
        language: 'kotlin',
        content:
          'package com.nexora.game\nimport android.os.Bundle\nimport android.webkit.WebView\nimport androidx.activity.ComponentActivity\nclass MainActivity : ComponentActivity() {\n  override fun onCreate(savedInstanceState: Bundle?) {\n    super.onCreate(savedInstanceState)\n    val wv = WebView(this)\n    wv.settings.javaScriptEnabled = true\n    wv.loadUrl("file:///android_asset/index.html")\n    setContentView(wv)\n  }\n}\n',
      },
    ],
  },
  {
    id: 'tpl-3d-orbital-vector',
    name: '3D Orbital Vector Arena (Playable)',
    type: 'game-3d',
    category: '3D Game',
    gameGenre: 'Adventure',
    description:
      'Perspective 3D projection arcade shooter with horizon grid, yaw controls, laser targeting, shield HUD, and Android wrapper.',
    techStack: ['3D Perspective Canvas', 'Touch + Keyboard', 'Android WebView'],
    defaultPrompt:
      'Create a 3D perspective space arcade game with yaw steering, laser firing, shield meter, and pause/restart controls.',
    previewHtml: GAME_3D_HTML,
    files: [
      { path: 'app/src/main/assets/index.html', language: 'html', content: GAME_3D_HTML },
      { path: 'settings.gradle.kts', language: 'gradle', content: 'rootProject.name = "OrbitalVector3D"\ninclude(":app")\n' },
      {
        path: 'app/build.gradle.kts',
        language: 'gradle',
        content:
          'plugins { id("com.android.application") }\nandroid {\n  namespace = "com.nexora.game3d"\n  compileSdk = 35\n  defaultConfig { applicationId = "com.nexora.game3d"; minSdk = 24; targetSdk = 35 }\n}\n',
      },
      {
        path: 'app/src/main/AndroidManifest.xml',
        language: 'xml',
        content:
          '<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n  <application android:label="Orbital Vector 3D">\n    <activity android:name=".MainActivity" android:exported="true">\n      <intent-filter><action android:name="android.intent.action.MAIN" /><category android:name="android.intent.category.LAUNCHER" /></intent-filter>\n    </activity>\n  </application>\n</manifest>\n',
      },
      {
        path: 'app/src/main/java/com/nexora/game/MainActivity.kt',
        language: 'kotlin',
        content:
          'package com.nexora.game\nimport android.os.Bundle\nimport android.webkit.WebView\nimport androidx.activity.ComponentActivity\nclass MainActivity : ComponentActivity() {\n  override fun onCreate(savedInstanceState: Bundle?) {\n    super.onCreate(savedInstanceState)\n    val wv = WebView(this)\n    wv.settings.javaScriptEnabled = true\n    wv.loadUrl("file:///android_asset/index.html")\n    setContentView(wv)\n  }\n}\n',
      },
    ],
  },
];

export function listTemplates(): ProjectTemplate[] {
  return STARTER_TEMPLATES;
}

export async function createProjectFromTemplate(input: {
  templateId: string;
  customName?: string;
  customPrompt?: string;
  ownerId?: string;
}): Promise<NexoraProject> {
  const tpl = STARTER_TEMPLATES.find((t) => t.id === input.templateId);
  if (!tpl) {
    throw new Error(`Template "${input.templateId}" not found.`);
  }

  const ownerId = input.ownerId || DEFAULT_USER_ID;
  const projectId = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const toolchain = await detectAndroidToolchain();
  const clonedFiles = tpl.files.map((f) => ({ ...f }));
  const diagnostics = validateProjectStructure(clonedFiles, tpl.type);
  const name = input.customName?.trim() || tpl.name;
  const prompt = input.customPrompt?.trim() || tpl.defaultPrompt;

  workspaceFileManager.ensureWorkspaceDirectories(projectId, ['src', 'public', 'db']);

  let project: NexoraProject = {
    id: projectId,
    ownerId,
    name,
    type: tpl.type,
    prompt,
    gameGenre: tpl.gameGenre,
    selectedModelId: 'template-library',
    selectedProviderName: 'Nexora Template',
    smartRouting: true,
    generationStatus: 'completed',
    generationStep: `Created from template "${tpl.name}"`,
    generationProgress: 100,
    generationError: null,
    files: clonedFiles,
    pendingAssets: [],
    previewHtml: tpl.previewHtml,
    chat: [
      {
        id: `msg-tpl-${Date.now()}`,
        role: 'assistant',
        content: `Initialized from template **${tpl.name}** (${tpl.techStack.join(', ')}). All starter files are ready to edit, test, or run.`,
        modifiedFiles: clonedFiles.map((f) => f.path),
        timestamp: now,
      },
    ],
    build: {
      status: 'idle',
      logs: [`[${new Date().toLocaleTimeString()}] Initialized workspace from template "${tpl.name}" (${clonedFiles.length} files).`],
      diagnostics,
      apkAvailable: false,
      toolchain,
      timestamp: now,
    },
    envVars: tpl.envVars ? tpl.envVars.map((e) => ({ ...e })) : [],
    importMetadata: {
      source: 'template',
      detectedFramework: tpl.category,
      dependencies: tpl.techStack,
      warnings: [],
    },
    history: [
      {
        id: `hist-${Date.now()}`,
        action: 'created_from_template',
        detail: `Created "${name}" from template ${tpl.id}.`,
        timestamp: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  project = appendProjectVersion(project, 'Template Initial State', 'template', `Cloned from ${tpl.name}`);
  const saved = upsertProject(project);
  return dbAppendProjectHistory(saved.id, 'template_ready', `Workspace ready (${clonedFiles.length} files).`, ownerId) || saved;
}

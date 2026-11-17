// Rodnye Education — сервер мини-приложения в Telegram.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { q, one, migrate } = require('./lib/db');
const { verifyInitData } = require('./lib/auth');
const C = require('./lib/content');
const L = require('./lib/logic');
const bot = require('./lib/bot');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const fail = (code, msg) => { throw new HttpError(code, msg); };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 64 * 1024) { reject(new HttpError(413, 'Слишком большой запрос')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'Неверный JSON')); } });
    req.on('error', reject);
  });
}
const json = (res, code, data) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); };
const displayName = u => [u.first_name, u.last_name ? u.last_name[0] + '.' : ''].filter(Boolean).join(' ') || (u.username ? '@' + u.username : 'Студент');

// ---------- авторизация через Telegram ----------
async function auth(req) {
  const tgUser = verifyInitData(req.headers['x-init-data'], process.env.BOT_TOKEN);
  if (!tgUser) fail(401, 'Открой приложение через бота в Telegram');
  const user = await bot.upsertUser(tgUser);
  // если куратор заранее открыл доступ по нику — привязываем
  if (user.username) {
    const inv = await q(`DELETE FROM invites WHERE username=$1 RETURNING *`, [user.username]);
    for (const i of inv) await q(`INSERT INTO enrollments (user_id, course_id, stream, tariff) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, course_id) DO UPDATE SET tariff=EXCLUDED.tariff, stream=EXCLUDED.stream`, [user.id, i.course_id, i.stream, i.tariff]);
  }
  return user;
}
const course = id => C.courses[id] || fail(404, 'Курс не найден');
async function needEnrollment(user, courseId) { return (await L.enrollment(user.id, courseId)) || fail(403, 'Нет доступа к курсу'); }
const needAdmin = user => user.is_admin || fail(403, 'Только для куратора');
async function needUnlocked(user, courseId, lessonId) {
  const st = await L.state(user.id, courseId);
  if (lessonId === 'FINAL') return st.final.unlocked ? st : fail(403, 'Итоговый тест ещё закрыт');
  const l = st.lessons.find(x => x.id === lessonId) || fail(404, 'Урок не найден');
  return l.unlocked ? st : fail(403, 'Урок ещё закрыт');
}

// ---------- маршруты ----------
const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

route('GET', '/health', async () => ({ ok: true }));

route('GET', '/api/me', async (req, user) => {
  const ens = await q(`SELECT * FROM enrollments WHERE user_id=$1`, [user.id]);
  const out = [];
  for (const c of C.catalog.courses) {
    const en = ens.find(e => e.course_id === c.id);
    let pct = 0;
    if (en && C.courses[c.id]) { const st = await L.state(user.id, c.id); pct = Math.round(st.doneCount / st.total * 100); }
    out.push({ id: c.id, title: c.title, kind: c.kind, url: c.url || null, available: !!C.courses[c.id], enrolled: !!en,
      tariff: en?.tariff || null, stream: en?.stream || null, start: C.courses[c.id] && en ? C.stream(C.courses[c.id], en.stream).start : null, pct });
  }
  if (!ens.length && !user.is_admin)
    await q(`INSERT INTO reminders_sent (user_id, kind, day) VALUES ($1,'request',$2) ON CONFLICT DO NOTHING RETURNING kind`, [user.id, C.today()])
      .then(r => r.length && bot.notifyAdmins(`Новая заявка на доступ: ${displayName(user)}${user.username ? ' (@' + user.username + ')' : ''}. Открой доступ в панели куратора.`, 'Панель куратора'));
  return { user: { id: user.id, name: displayName(user), username: user.username, isAdmin: user.is_admin }, courses: out, today: C.today() };
});

route('GET', '/api/course/:id', async (req, user, p) => {
  const c = course(p.id);
  const en = user.is_admin ? await L.enrollment(user.id, c.id) : await needEnrollment(user, c.id);
  return C.publicCourse(c, en ? en.stream : c.current_stream);
});

route('GET', '/api/state/:id', async (req, user, p) => {
  course(p.id); await needEnrollment(user, p.id);
  await L.touch(user.id, null);       // заход в приложение считается активностью дня
  return L.state(user.id, p.id);
});

route('POST', '/api/watched', async (req, user, p, b) => {
  const c = course(b.course); await needEnrollment(user, c.id); await needUnlocked(user, c.id, b.lesson);
  await L.upsertProgress(user.id, c.id, b.lesson, { watched: true });
  const got = (await L.award(user.id, c.id, L.POINTS.video, 'video', b.lesson)) + (await L.completeIfReady(user.id, c.id, b.lesson));
  await L.touch(user.id, c.id);
  return { got, state: await L.state(user.id, c.id) };
});

route('POST', '/api/quiz/check', async (req, user, p, b) => {
  const c = course(b.course); await needEnrollment(user, c.id);
  const quiz = C.quizOf(c, b.lesson) || fail(404, 'Теста нет');
  const question = quiz.questions[b.qi] || fail(404, 'Вопрос не найден');
  return { correct: C.isCorrect(question, b.answer), right: Array.isArray(question.c) ? question.c : [question.c] };
});

route('POST', '/api/quiz/submit', async (req, user, p, b) => {
  const c = course(b.course); await needEnrollment(user, c.id); await needUnlocked(user, c.id, b.lesson);
  const quiz = C.quizOf(c, b.lesson) || fail(404, 'Теста нет');
  const answers = Array.isArray(b.answers) ? b.answers : [];
  const score = quiz.questions.filter((qq, i) => C.isCorrect(qq, answers[i])).length;
  const pass = score >= quiz.pass;
  let got = 0;
  if (b.lesson === 'FINAL') {
    if (pass) {
      await L.upsertProgress(user.id, c.id, 'FINAL', { quiz_score: score, quiz_ok: true, done_at: new Date().toISOString() });
      await bot.notifyAdmins(`${displayName(user)} сдал(а) итоговый тест: ${score} из ${quiz.questions.length}.`);
    }
  } else if (pass) {
    const prev = await one(`SELECT quiz_ok FROM progress WHERE user_id=$1 AND course_id=$2 AND lesson_id=$3`, [user.id, c.id, b.lesson]);
    if (!prev?.quiz_ok) await L.upsertProgress(user.id, c.id, b.lesson, { quiz_score: score, quiz_ok: true });
    got += await L.award(user.id, c.id, score * L.POINTS.quizAnswer, 'quiz', b.lesson);
    got += await L.completeIfReady(user.id, c.id, b.lesson);
  }
  await L.touch(user.id, c.id);
  return { score, of: quiz.questions.length, need: quiz.pass, pass, got, state: await L.state(user.id, c.id) };
});

route('POST', '/api/homework', async (req, user, p, b) => {
  const c = course(b.course); const en = await needEnrollment(user, c.id); await needUnlocked(user, c.id, b.lesson);
  const lesson = c.lessonById[b.lesson];
  if (!lesson?.homework) fail(400, 'В этом уроке нет домашки');
  const answer = String(b.answer || '').trim().slice(0, 4000);
  if (!answer) fail(400, 'Добавь ответ или ссылку');
  const prev = await q(`SELECT status, late FROM homework WHERE user_id=$1 AND course_id=$2 AND lesson_id=$3 ORDER BY submitted_at`, [user.id, c.id, lesson.id]);
  if (prev.length && prev[prev.length - 1].status !== 'back') fail(409, 'Домашка уже сдана');
  const late = prev.length ? prev[0].late : C.today() > C.deadline(c, en.stream, lesson);
  const reviewed = L.REVIEWED(en.tariff);
  await q(`INSERT INTO homework (user_id, course_id, lesson_id, answer, status, late, tariff) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [user.id, c.id, lesson.id, answer, reviewed ? 'wait' : 'self', late, en.tariff]);
  let got = 0;
  if (!reviewed && !late) got += await L.award(user.id, c.id, L.POINTS.homeworkSelf, 'homework', lesson.id);
  got += await L.completeIfReady(user.id, c.id, lesson.id);
  await L.touch(user.id, c.id);
  return { got, late, state: await L.state(user.id, c.id) };
});

route('GET', '/api/rating/:id', async (req, user, p) => {
  const c = course(p.id);
  const en = user.is_admin ? (await L.enrollment(user.id, c.id)) || { stream: c.current_stream } : await needEnrollment(user, c.id);
  const rows = await q(`SELECT u.id, u.first_name, u.last_name, u.username, COALESCE(SUM(pt.amount),0)::int AS points
    FROM enrollments e JOIN users u ON u.id=e.user_id LEFT JOIN points pt ON pt.user_id=u.id AND pt.course_id=e.course_id
    WHERE e.course_id=$1 AND e.stream=$2 GROUP BY u.id ORDER BY points DESC, u.id`, [c.id, en.stream]);
  return rows.map(r => ({ name: displayName(r), points: r.points, me: String(r.id) === String(user.id) }));
});

route('GET', '/api/trainer', async () => C.trainer);
route('POST', '/api/trainer', async (req, user, p, b) => {
  const c = course(b.course); await needEnrollment(user, c.id);
  const g = C.trainer.games.find(x => x.id === b.game) || fail(404, 'Игра не найдена');
  const answers = Array.isArray(b.answers) ? b.answers : [];
  const score = g.rounds.filter((r, i) => Number(answers[i]) === r.c).length;
  const got = await L.award(user.id, c.id, score * L.POINTS.trainerAnswer, 'trainer', `${g.id}:${C.today()}`);
  await L.touch(user.id, c.id);
  return { score, of: g.rounds.length, got };
});

route('POST', '/api/consult', async (req, user, p, b) => {
  const c = course(b.course); const en = await needEnrollment(user, c.id);
  if (en.tariff !== 'Родной') fail(403, 'Консультация входит в тариф «Родной»');
  await bot.notifyAdmins(`${displayName(user)}${user.username ? ' (@' + user.username + ')' : ''} хочет записаться на консультацию с основателем агентства.`);
  return { ok: true };
});

// ---------- куратор ----------
route('GET', '/api/admin/overview', async (req, user) => {
  needAdmin(user);
  const students = [];
  const rows = await q(`SELECT u.*, e.course_id, e.stream, e.tariff,
      (SELECT to_char(max(day),'YYYY-MM-DD') FROM activity_days a WHERE a.user_id=u.id) AS last_day,
      (SELECT COALESCE(SUM(amount),0)::int FROM points pt WHERE pt.user_id=u.id AND pt.course_id=e.course_id) AS points
    FROM enrollments e JOIN users u ON u.id=e.user_id ORDER BY e.created_at DESC`);
  for (const r of rows) {
    const c = C.courses[r.course_id]; if (!c) continue;
    const st = await L.state(r.id, r.course_id);
    const next = st.lessons.find(l => !l.done);
    students.push({ id: r.id, name: displayName(r), username: r.username, course: r.course_id, courseTitle: c.title, tariff: r.tariff, stream: r.stream,
      pct: Math.round(st.doneCount / st.total * 100), at: next ? c.lessonById[next.id].title : 'Все уроки пройдены', lastDay: r.last_day, points: r.points, hasTg: !!r.tg_id });
  }
  const requests = (await q(`SELECT u.* FROM users u WHERE NOT u.is_admin AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id=u.id) ORDER BY u.created_at DESC LIMIT 100`))
    .map(u => ({ id: u.id, name: displayName(u), username: u.username, since: u.created_at }));
  const invites = await q(`SELECT username, course_id, tariff, stream FROM invites ORDER BY created_at DESC`);
  return { today: C.today(), students, requests, invites, courses: C.catalog.courses.filter(c => C.courses[c.id]).map(c => ({ id: c.id, title: c.title, tariffs: C.courses[c.id].tariffs.map(t => t.name), stream: C.courses[c.id].current_stream })) };
});

route('POST', '/api/admin/enroll', async (req, user, p, b) => {
  needAdmin(user);
  const c = course(b.course);
  if (!c.tariffs.some(t => t.name === b.tariff)) fail(400, 'Неизвестный тариф');
  const stream = String(b.stream || c.current_stream);
  let target = null;
  if (b.userId) target = await one(`SELECT * FROM users WHERE id=$1`, [b.userId]);
  else if (b.username) {
    const uname = String(b.username).trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9_]{4,32}$/.test(uname)) fail(400, 'Проверь ник: только латиница, цифры и _');
    target = await one(`SELECT * FROM users WHERE username=$1`, [uname]);
    if (!target) {
      await q(`INSERT INTO invites (username, course_id, stream, tariff) VALUES ($1,$2,$3,$4) ON CONFLICT (username) DO UPDATE SET course_id=EXCLUDED.course_id, stream=EXCLUDED.stream, tariff=EXCLUDED.tariff`, [uname, c.id, stream, b.tariff]);
      return { ok: true, invited: true, message: `@${uname} ещё не открывал бота. Доступ откроется, когда он нажмёт /start в @${process.env.BOT_USERNAME || 'боте'}.` };
    }
  }
  if (!target) fail(404, 'Пользователь не найден');
  await q(`INSERT INTO enrollments (user_id, course_id, stream, tariff) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, course_id) DO UPDATE SET tariff=EXCLUDED.tariff, stream=EXCLUDED.stream`, [target.id, c.id, stream, b.tariff]);
  if (target.tg_id) await bot.send(target.tg_id, `Доступ к курсу «${c.title}» открыт. Тариф «${b.tariff}».`, 'Открыть курс');
  return { ok: true, message: `Доступ открыт: ${displayName(target)}` };
});

route('GET', '/api/admin/homework', async (req, user) => {
  needAdmin(user);
  const rows = await q(`SELECT h.*, u.first_name, u.last_name, u.username FROM homework h JOIN users u ON u.id=h.user_id
    ORDER BY (h.status='wait') DESC, h.submitted_at DESC LIMIT 300`);
  return rows.map(h => ({ id: h.id, name: displayName(h), username: h.username, course: h.course_id, lesson: C.courses[h.course_id]?.lessonById[h.lesson_id]?.title || h.lesson_id,
    answer: h.answer, status: h.status, late: h.late, tariff: h.tariff, comment: h.comment, submitted: h.submitted_at }));
});

route('POST', '/api/admin/homework/:id', async (req, user, p, b) => {
  needAdmin(user);
  if (!['ok', 'back'].includes(b.status)) fail(400, 'Статус: ok или back');
  const h = await one(`UPDATE homework SET status=$2, comment=$3, reviewed_at=now() WHERE id=$1 AND status='wait' RETURNING *`, [p.id, b.status, (b.comment || '').slice(0, 2000) || null]);
  if (!h) fail(409, 'Домашка уже проверена');
  let got = 0;
  if (b.status === 'ok' && !h.late) got = await L.award(h.user_id, h.course_id, L.POINTS.homework, 'homework', h.lesson_id);
  const u = await one(`SELECT tg_id FROM users WHERE id=$1`, [h.user_id]);
  const title = C.courses[h.course_id]?.lessonById[h.lesson_id]?.title;
  if (u?.tg_id) await bot.send(u.tg_id, b.status === 'ok'
    ? `Куратор принял домашку по уроку «${title}».${got ? ` +${got} баллов.` : h.late ? ' Сдана после дедлайна, поэтому без баллов.' : ''}${h.comment ? '\n\nКомментарий: ' + h.comment : ''}`
    : `Домашку по уроку «${title}» вернули на доработку.${h.comment ? '\n\nКомментарий: ' + h.comment : ''}`, 'Открыть урок');
  return { ok: true, got };
});

route('POST', '/api/admin/remind', async (req, user, p, b) => {
  needAdmin(user);
  const t = await one(`SELECT u.tg_id, u.first_name, e.course_id FROM users u JOIN enrollments e ON e.user_id=u.id WHERE u.id=$1 LIMIT 1`, [b.userId]);
  if (!t?.tg_id) fail(404, 'Студент ещё не открывал бота');
  const st = await L.state(b.userId, t.course_id);
  const next = st && st.lessons.find(l => l.unlocked && !l.done);
  const title = next && C.courses[t.course_id].lessonById[next.id].title;
  await bot.send(t.tg_id, `${t.first_name || 'Привет'}, ${title ? `тебя ждёт урок «${title}».` : 'загляни в курс.'} Огонёк можно вернуть сегодня.`, 'Открыть курс');
  return { ok: true };
});

// ---------- HTTP ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'POST' && url.pathname === '/bot') {
      if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.WEBHOOK_SECRET) return json(res, 403, { ok: false });
      const upd = await readBody(req);
      bot.handleUpdate(upd).catch(e => console.warn('[bot] update:', e.message));
      return json(res, 200, { ok: true });
    }
    for (const r of routes) {
      const m = r.method === req.method && url.pathname.match(r.re);
      if (!m) continue;
      const body = req.method === 'POST' ? await readBody(req) : {};
      const user = url.pathname.startsWith('/api/') ? await auth(req) : null;
      return json(res, 200, await r.fn(req, user, m.groups || {}, body));
    }
    if (req.method === 'GET') return serveStatic(url.pathname, res);
    json(res, 404, { error: 'Не найдено' });
  } catch (e) {
    if (e instanceof HttpError) return json(res, e.code, { error: e.message });
    console.error(e);
    json(res, 500, { error: 'Ошибка сервера' });
  }
}

function serveStatic(p, res) {
  const file = path.normalize(path.join(PUBLIC, p === '/' ? 'index.html' : p));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return json(res, 404, { error: 'Не найдено' });
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

async function main() {
  await migrate();
  http.createServer(handle).listen(PORT, '0.0.0.0', () => console.log(`Сервер запущен на порту ${PORT}`));
  await bot.setup();
  bot.startScheduler();
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { handle, main };

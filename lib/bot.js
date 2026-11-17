// Бот: кнопка открытия приложения, команды, напоминания и уведомления.
const { q, one } = require('./db');
const C = require('./content');
const L = require('./logic');

const TOKEN = process.env.BOT_TOKEN;
const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

async function api(method, body) {
  if (!TOKEN) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {})
    });
    const j = await r.json();
    if (!j.ok) console.warn(`[bot] ${method}: ${j.description}`);
    return j.ok ? j.result : null;
  } catch (e) { console.warn(`[bot] ${method}: ${e.message}`); return null; }
}

const openButton = (text = 'Открыть курс') => ({ inline_keyboard: [[{ text, web_app: { url: APP_URL } }]] });
const send = (chatId, text, button) => api('sendMessage', { chat_id: chatId, text, reply_markup: button ? openButton(button) : undefined });
const notifyAdmins = (text, button) => Promise.all(ADMIN_IDS.map(id => send(id, text, button)));

async function setup() {
  if (!TOKEN || !APP_URL) { console.warn('[bot] BOT_TOKEN или APP_URL не заданы — бот выключен'); return; }
  await api('setWebhook', { url: `${APP_URL}/bot`, secret_token: process.env.WEBHOOK_SECRET, allowed_updates: ['message'] });
  await api('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Курс', web_app: { url: APP_URL } } });
  await api('setMyCommands', { commands: [{ command: 'start', description: 'Открыть курс' }, { command: 'id', description: 'Мой Telegram ID' }] });
  console.log('[bot] webhook и кнопка меню настроены');
}

async function upsertUser(u) {
  return one(`INSERT INTO users (tg_id, username, first_name, last_name, is_admin, last_seen_at)
    VALUES ($1,$2,$3,$4,$5, now())
    ON CONFLICT (tg_id) DO UPDATE SET username=EXCLUDED.username, first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name,
      is_admin=EXCLUDED.is_admin, last_seen_at=now()
    RETURNING *`, [u.id, (u.username || '').toLowerCase() || null, u.first_name || null, u.last_name || null, ADMIN_IDS.includes(String(u.id))]);
}

async function handleUpdate(update) {
  const m = update.message;
  if (!m || !m.from || !m.text) return;
  await upsertUser(m.from);
  if (m.text.startsWith('/id')) return send(m.chat.id, `Твой Telegram ID: ${m.from.id}`);
  if (m.text.startsWith('/start')) {
    return send(m.chat.id, 'Привет! Это приложение курсов Rodnye Education. Нажми кнопку ниже, чтобы открыть свои курсы.', 'Открыть курс');
  }
}

// ---------- напоминания ----------
function moscowHour() {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: C.TZ, hour: '2-digit', hour12: false }).format(new Date()));
}
async function once(userId, kind, fn) {
  const r = await q(`INSERT INTO reminders_sent (user_id, kind, day) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING kind`, [userId, kind, C.today()]);
  if (r.length) await fn();
}

async function activeStudents() {
  const rows = await q(`SELECT u.id, u.tg_id, u.first_name, e.course_id, e.stream, e.tariff,
      (SELECT to_char(max(day),'YYYY-MM-DD') FROM activity_days a WHERE a.user_id=u.id) AS last_day
    FROM enrollments e JOIN users u ON u.id=e.user_id WHERE u.tg_id IS NOT NULL`);
  const today = C.today();
  return rows.filter(r => { const c = C.courses[r.course_id]; if (!c) return false; const s = C.stream(c, r.stream); return s.start <= today && today <= s.end; });
}

async function runReminders() {
  const hour = moscowHour(), today = C.today();
  const dow = new Date(today + 'T12:00:00Z').getUTCDay();
  for (const s of await activeStudents()) {
    const st = await L.state(s.id, s.course_id);
    if (!st) continue;
    const course = C.courses[s.course_id];
    const next = st.lessons.find(l => l.unlocked && !l.done);
    const nextTitle = next && course.lessonById[next.id].title;
    const activeToday = s.last_day === today;
    const away = s.last_day ? Math.round((Date.parse(today) - Date.parse(s.last_day)) / 86400000) : null;

    if (hour === 10 && next && !activeToday)
      await once(s.id, 'morning', () => send(s.tg_id, `Доброе утро! Сегодня урок «${nextTitle}».${st.streak ? ` Огонёк: ${st.streak} дн. подряд.` : ''}`, 'Открыть урок'));
    if (hour === 20 && st.streak > 0 && !activeToday)
      await once(s.id, 'evening', () => send(s.tg_id, `До полуночи 4 часа. Пройди урок или тренажёр, чтобы огонёк (${st.streak} дн.) не погас.`, 'Открыть курс'));
    if (hour === 12 && (away === 3 || away === 7) && next)
      await once(s.id, 'away', () => send(s.tg_id, `Давно не виделись. Ты остановился на уроке «${nextTitle}». Возвращайся, всё сохранено.`, 'Продолжить'));
    if (hour === 12 && dow === 5) {
      const due = st.lessons.filter(l => { const cl = course.lessonById[l.id]; return l.open && cl.homework && !l.hw && C.deadline(course, s.stream, cl) === C.addDays(today, 1); });
      if (due.length) await once(s.id, 'deadline', () => send(s.tg_id, `Завтра дедлайн по домашкам: ${due.map(l => '«' + course.lessonById[l.id].title + '»').join(', ')}. После дедлайна баллы за них не начислятся.`, 'Сдать домашку'));
    }
  }
  if (hour === 10) {
    const w = await one(`SELECT count(*)::int AS n FROM homework WHERE status='wait'`);
    const admins = await q(`SELECT id, tg_id FROM users WHERE is_admin`);
    for (const a of admins) if (w.n) await once(a.id, 'admin-summary', () => send(a.tg_id, `Домашек ждут проверки: ${w.n}.`, 'Открыть панель куратора'));
  }
}

function startScheduler() {
  setInterval(() => runReminders().catch(e => console.warn('[reminders]', e.message)), 10 * 60 * 1000);
}

module.exports = { api, send, notifyAdmins, setup, handleUpdate, upsertUser, runReminders, startScheduler, ADMIN_IDS };

// Правила курса: открытие уроков, баллы, огонёк, домашки.
const { q, one } = require('./db');
const C = require('./content');

const POINTS = { video: 10, quizAnswer: 6, lesson: 20, homework: 30, homeworkSelf: 10, trainerAnswer: 10, streak7: 50 };
const REVIEWED = t => t !== 'Троюродный';

async function award(userId, courseId, amount, reason, ref) {
  const r = await q(`INSERT INTO points (user_id, course_id, amount, reason, ref) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (user_id, course_id, reason, ref) DO NOTHING RETURNING id`, [userId, courseId, amount, reason, String(ref)]);
  return r.length ? amount : 0;
}

// Отмечаем активность за сегодня. Каждые 7 дней подряд — бонус.
async function touch(userId, courseId) {
  const day = C.today();
  const ins = await q(`INSERT INTO activity_days (user_id, day) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING day`, [userId, day]);
  const s = await streak(userId);
  if (ins.length && s > 0 && s % 7 === 0 && courseId) await award(userId, courseId, POINTS.streak7, 'streak7', day);
  return s;
}

async function streak(userId) {
  const rows = await q(`SELECT to_char(day,'YYYY-MM-DD') AS d FROM activity_days WHERE user_id=$1 AND day > ($2::date - 400) ORDER BY day DESC`, [userId, C.today()]);
  const days = new Set(rows.map(r => r.d));
  let d = C.today(), n = 0;
  if (!days.has(d)) d = C.addDays(d, -1);           // огонёк не гаснет, пока не закончился сегодняшний день
  while (days.has(d)) { n++; d = C.addDays(d, -1); }
  return n;
}

async function enrollment(userId, courseId) {
  return one(`SELECT * FROM enrollments WHERE user_id=$1 AND course_id=$2`, [userId, courseId]);
}

// Полное состояние студента по курсу.
async function state(userId, courseId) {
  const course = C.courses[courseId];
  const en = await enrollment(userId, courseId);
  if (!course || !en) return null;
  const prog = await q(`SELECT lesson_id, watched, quiz_score, quiz_ok, done_at FROM progress WHERE user_id=$1 AND course_id=$2`, [userId, courseId]);
  const hw = await q(`SELECT DISTINCT ON (lesson_id) id, lesson_id, status, late, comment, answer, submitted_at FROM homework
    WHERE user_id=$1 AND course_id=$2 ORDER BY lesson_id, submitted_at DESC`, [userId, courseId]);
  const pts = await one(`SELECT COALESCE(SUM(amount),0)::int AS total FROM points WHERE user_id=$1 AND course_id=$2`, [userId, courseId]);
  const P = Object.fromEntries(prog.map(p => [p.lesson_id, p]));
  const H = Object.fromEntries(hw.map(h => [h.lesson_id, h]));
  const today = C.today();
  let prevDone = true;
  const lessons = course.lessons.map(l => {
    const p = P[l.id] || {};
    const open = C.moduleOpens(course, en.stream, l.moduleId) <= today;
    const unlocked = open && prevDone;
    const done = !!p.done_at;
    prevDone = done;
    return { id: l.id, unlocked, open, done, watched: !!p.watched, quizOk: !!p.quiz_ok, quizScore: p.quiz_score ?? null,
      hw: H[l.id] ? { status: H[l.id].status, late: H[l.id].late, comment: H[l.id].comment, answer: H[l.id].answer } : null };
  });
  const allDone = lessons.every(l => l.done);
  const fp = P.FINAL || {};
  const finalOpen = C.stream(course, en.stream).final <= today;
  return {
    tariff: en.tariff, stream: en.stream, reviewed: REVIEWED(en.tariff), points: pts.total, streak: await streak(userId), today,
    lessons, final: { unlocked: finalOpen && allDone, open: finalOpen, done: !!fp.done_at, score: fp.quiz_score ?? null },
    doneCount: lessons.filter(l => l.done).length, total: lessons.length
  };
}

async function upsertProgress(userId, courseId, lessonId, fields) {
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  const set = cols.map((c, i) => `${c}=$${i + 4}`).join(', ');
  await q(`INSERT INTO progress (user_id, course_id, lesson_id, ${cols.join(', ')}) VALUES ($1,$2,$3,${cols.map((_, i) => `$${i + 4}`).join(',')})
    ON CONFLICT (user_id, course_id, lesson_id) DO UPDATE SET ${set}`, [userId, courseId, lessonId, ...vals]);
}

// Урок пройден, когда просмотрено видео, сдан тест (если есть) и сдана домашка (если есть).
async function completeIfReady(userId, courseId, lessonId) {
  const course = C.courses[courseId];
  const l = course.lessonById[lessonId];
  const p = await one(`SELECT * FROM progress WHERE user_id=$1 AND course_id=$2 AND lesson_id=$3`, [userId, courseId, lessonId]);
  if (!p || p.done_at) return 0;
  const hw = l.homework ? await one(`SELECT id FROM homework WHERE user_id=$1 AND course_id=$2 AND lesson_id=$3 LIMIT 1`, [userId, courseId, lessonId]) : true;
  if (p.watched && (!l.quiz || p.quiz_ok) && hw) {
    await q(`UPDATE progress SET done_at=now() WHERE user_id=$1 AND course_id=$2 AND lesson_id=$3`, [userId, courseId, lessonId]);
    return award(userId, courseId, POINTS.lesson, 'lesson', lessonId);
  }
  return 0;
}

module.exports = { POINTS, REVIEWED, award, touch, streak, state, enrollment, upsertProgress, completeIfReady };

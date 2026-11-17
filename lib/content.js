// Программа курсов лежит в папке content/*.json. Чтобы поменять уроки, тесты или даты,
// правим JSON и заново деплоим.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'content');
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));

const catalog = read('courses.json');
const trainer = read('trainer.json');
const courses = {};
for (const c of catalog.courses) if (c.file) courses[c.id] = prepare(read(c.file));

function prepare(c) {
  c.lessons = [];
  c.modules.forEach((m, mi) => m.lessons.forEach((l, li) => c.lessons.push({ ...l, mi, li, moduleId: m.id })));
  c.lessonById = Object.fromEntries(c.lessons.map(l => [l.id, l]));
  c.final_test.id = 'FINAL';
  return c;
}

const TZ = 'Europe/Moscow';
// Сегодняшняя дата по Москве в виде YYYY-MM-DD. TODAY_OVERRIDE — только для проверки.
function today() {
  if (process.env.TODAY_OVERRIDE) return process.env.TODAY_OVERRIDE;
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function addDays(day, n) { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function saturdayOf(day) { const d = new Date(day + 'T12:00:00Z'); return addDays(day, (6 - d.getUTCDay() + 7) % 7); }

function stream(course, streamId) { return course.streams[streamId] || course.streams[course.current_stream]; }
function moduleOpens(course, streamId, moduleId) { return stream(course, streamId).modules[moduleId]; }
function deadline(course, streamId, lesson) { return saturdayOf(moduleOpens(course, streamId, lesson.moduleId)); }

// Курс для отправки в приложение: без правильных ответов в тестах.
function publicCourse(course, streamId) {
  const s = stream(course, streamId);
  const strip = qz => qz && qz.map(x => ({ q: x.q, a: x.a, multi: Array.isArray(x.c) }));
  return {
    id: course.id, title: course.title, kind: course.kind, welcome: course.welcome,
    stream: streamId, schedule: s, tariffs: course.tariffs, library: course.library,
    modules: course.modules.map(m => ({
      id: m.id, title: m.title, opens: s.modules[m.id],
      lessons: m.lessons.map(l => ({ id: l.id, title: l.title, video: l.video, extra_videos: l.extra_videos || [],
        materials: l.materials || [], note: l.note || null, homework: l.homework || null,
        deadline: l.homework ? saturdayOf(s.modules[m.id]) : null, quiz: strip(l.quiz) }))
    })),
    final_test: { id: 'FINAL', opens: s.final, pass: course.final_test.pass, of: course.final_test.questions.length,
      intro: course.final_test.intro, quiz: strip(course.final_test.questions) }
  };
}

function quizOf(course, lessonId) {
  if (lessonId === 'FINAL') return { questions: course.final_test.questions, pass: course.final_test.pass };
  const l = course.lessonById[lessonId];
  if (!l || !l.quiz) return null;
  return { questions: l.quiz, pass: Math.ceil(l.quiz.length * 0.6) };
}

function isCorrect(question, answer) {
  if (Array.isArray(question.c)) {
    const a = Array.isArray(answer) ? [...new Set(answer.map(Number))].sort() : [];
    const c = [...question.c].sort();
    return a.length === c.length && a.every((x, i) => x === c[i]);
  }
  return Number(answer) === question.c;
}

module.exports = { catalog, courses, trainer, today, addDays, saturdayOf, stream, moduleOpens, deadline, publicCourse, quizOf, isCorrect, TZ };

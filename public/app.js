// Rodnye Education — мини-приложение. Данные приходят с сервера (/api/*).
const tg = window.Telegram && window.Telegram.WebApp;
const INIT = (tg && tg.initData) || (location.hash.startsWith('#dev=') ? decodeURIComponent(location.hash.slice(5)) : '');
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const n1 = n % 10; if (n > 10 && n < 20) return c; if (n1 > 1 && n1 < 5) return b; if (n1 === 1) return a; return c; };
const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const fmt = s => { if (!s) return ''; const [y, m, d] = s.slice(0, 10).split('-').map(Number); return `${d} ${MON[m - 1]}`; };
const NUM = { 'Нулевой': '00', 'Первый': '01', 'Второй': '02', 'Третий': '03', 'Четвертый': '04', 'Пятый': '05', 'Шестой': '06', 'Седьмой': '07', 'Восьмой': '08' };
const modNum = t => NUM[t.split(' ')[0]] || '··';

async function api(path, body) {
  const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-init-data': INIT }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Ошибка сети, попробуй ещё раз');
  return j;
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2400); }
const haptic = ok => { try { tg && tg.HapticFeedback.notificationOccurred(ok ? 'success' : 'error'); } catch {} };
function openLink(url) { if (tg && tg.openLink) tg.openLink(url); else window.open(url, '_blank', 'noopener'); }

// ---------- состояние ----------
const S = { me: null, view: 'student', courseId: null, course: null, st: null, tab: 'course', open: null, quiz: null, game: null, trainer: null, rating: null, showInc: false, admin: null, hw: null, adminTab: 'people', busy: false };
const lessonsFlat = () => S.course.modules.flatMap((m, mi) => m.lessons.map((l, li) => ({ ...l, mi, li, mod: m })));
const lst = id => S.st.lessons.find(x => x.id === id);
const tariff = () => S.course.tariffs.find(t => t.name === S.st.tariff);

const STAGES = [
  { name: 'Гусеница', from: 0, svg: '<svg width="34" height="20" viewBox="0 0 34 20"><g fill="currentColor"><circle cx="5" cy="12" r="4"/><circle cx="12" cy="11" r="4.5"/><circle cx="20" cy="11" r="4.5"/><circle cx="28" cy="9" r="5"/></g></svg>' },
  { name: 'Куколка', from: 35, svg: '<svg width="34" height="20" viewBox="0 0 34 20"><ellipse cx="17" cy="11" rx="6" ry="8.5" fill="currentColor"/><path d="M17 1v2" stroke="currentColor" stroke-width="2"/></svg>' },
  { name: 'Бабочка', from: 75, svg: '<svg width="34" height="20" viewBox="0 0 34 20"><g fill="currentColor"><path d="M16 10C10 0 2 2 4 9c1 4 7 4 12 1z"/><path d="M18 10C24 0 32 2 30 9c-1 4-7 4-12 1z"/><path d="M16 11c-5 2-8 7-5 8s5-3 5-8zM18 11c5 2 8 7 5 8s-5-3-5-8z"/></g></svg>' }
];
const ICON = {
  course: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h6a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h6"/></svg>',
  train: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
  rate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/></svg>',
  lib: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 13.5a7 7 0 0 1 4 6.5"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/></svg>'
};

// ---------- загрузка ----------
async function boot() {
  if (tg) { tg.ready(); tg.expand(); try { tg.setHeaderColor('#ffffff'); tg.setBackgroundColor('#f4f4f6'); } catch {} tg.BackButton.onClick(goBack); }
  if (!INIT) { $('#main').innerHTML = `<div class="center"><div><h1 class="h1" style="font-size:22px">Открой приложение через бота</h1><p class="lead">Найди в Telegram бота курса и нажми «Открыть курс».</p></div></div>`; return; }
  try { S.me = await api('/api/me'); } catch (e) { return fatal(e); }
  const enrolled = S.me.courses.filter(c => c.enrolled);
  if (S.me.user.isAdmin && !enrolled.length) { S.view = 'curator'; await loadAdmin(); }
  else if (enrolled.length === 1) await openCourse(enrolled[0].id);
  render();
}
function fatal(e) { $('#main').innerHTML = `<div class="center"><div><p class="lead">${esc(e.message)}</p><button class="btn" style="margin-top:12px" data-act="reload">Попробовать снова</button></div></div>`; }

async function openCourse(id) {
  S.courseId = id; S.tab = 'course'; S.open = null;
  [S.course, S.st] = await Promise.all([api('/api/course/' + id), api('/api/state/' + id)]);
}
async function refreshState() { S.st = await api('/api/state/' + S.courseId); }
async function loadAdmin() { [S.admin, S.hw] = await Promise.all([api('/api/admin/overview'), api('/api/admin/homework')]); }

// ---------- отрисовка ----------
function render() {
  const m = $('#main'), tabs = $('#tabs');
  const isAdmin = S.me && S.me.user.isAdmin;
  if (S.view === 'curator') {
    $('#stats').innerHTML = `<span class="chip">Куратор</span>${S.me.courses.some(c => c.enrolled) ? '<button class="chip" data-act="view" data-v="student">Студент</button>' : ''}`;
    const T = [['people', 'Студенты'], ['inbox', 'Домашки'], ['rate', 'Рейтинг']];
    tabs.style.display = ''; tabs.style.gridTemplateColumns = 'repeat(3,1fr)';
    tabs.innerHTML = T.map(([k, l]) => `<button data-act="atab" data-t="${k}" ${S.adminTab === k ? 'aria-current="page"' : ''}>${ICON[k]}${l}</button>`).join('');
    m.innerHTML = S.adminTab === 'people' ? viewPeople() : S.adminTab === 'inbox' ? viewInbox() : viewRating(true);
    backButton(false); return;
  }
  if (!S.courseId) {
    $('#stats').innerHTML = isAdmin ? '<button class="chip" data-act="view" data-v="curator">Куратор</button>' : '';
    tabs.style.display = 'none'; m.innerHTML = viewHome(); backButton(false); return;
  }
  $('#stats').innerHTML = `<span class="chip fire" title="Дней подряд"><svg width="12" height="14" viewBox="0 0 12 14"><path d="M6 0c1 3 5 4 5 8a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3C5 5 4 3 6 0z" fill="#e0655f"/></svg><span class="pixel">${S.st.streak}</span></span><span class="chip xp"><span class="pixel">${S.st.points}</span> баллов</span>${isAdmin ? '<button class="chip" data-act="view" data-v="curator">Куратор</button>' : ''}`;
  tabs.style.display = ''; tabs.style.gridTemplateColumns = '';
  const T = [['course', 'Курс'], ['train', 'Тренажёр'], ['rate', 'Рейтинг'], ['lib', 'Материалы'], ['me', 'Я']];
  tabs.innerHTML = T.map(([k, l]) => `<button data-act="tab" data-t="${k}" ${S.tab === k ? 'aria-current="page"' : ''}>${ICON[k]}${l}</button>`).join('');
  if (S.tab === 'course') m.innerHTML = S.open ? viewLesson() : viewCourse();
  if (S.tab === 'train') m.innerHTML = S.game ? viewGame() : viewTrainer();
  if (S.tab === 'rate') m.innerHTML = viewRating();
  if (S.tab === 'lib') m.innerHTML = viewLib();
  if (S.tab === 'me') m.innerHTML = viewMe();
  backButton(!!(S.open || S.game));
}
function backButton(on) { if (!tg) return; on ? tg.BackButton.show() : tg.BackButton.hide(); }
function goBack() { if (S.open) { S.open = null; S.quiz = null; } else if (S.game) S.game = null; render(); window.scrollTo(0, 0); }

function viewHome() {
  const cs = S.me.courses;
  return `<div class="rubric">Личный кабинет</div><h1 class="h1">Мои <span class="hl">курсы</span></h1>
  <div class="cards">${cs.map(c => {
    if (!c.enrolled) return `<button class="card" data-act="shop" data-url="${esc(c.url || '')}" style="background:var(--grey);border-color:transparent">
      <span class="ico" style="background:var(--pink)">${esc(c.title[0])}</span><span class="t"><small>${esc(c.kind)}</small><b>${esc(c.title)}</b><small>Не куплен · узнать о курсе</small></span><span class="tag" style="background:var(--bg)">→</span></button>`;
    return `<button class="card" data-act="course" data-c="${c.id}" style="align-items:stretch"><span class="ico" style="background:var(--green-soft)">${esc(c.title[0])}</span>
      <span class="t" style="display:grid;gap:6px"><span><small>${esc(c.kind)} · тариф «${esc(c.tariff)}»</small><b>${esc(c.title)}</b><small>${c.stream} поток · старт ${fmt(c.start)}</small></span>
      <span class="bar"><i style="width:${c.pct}%"></i></span><small>Пройдено ${c.pct}%</small></span></button>`;
  }).join('')}</div>
  ${!cs.some(c => c.enrolled) ? `<div class="block"><h3>Доступ ещё не открыт</h3><div class="why">Куратор получил заявку и откроет доступ после оплаты. Бот пришлёт сообщение, когда всё будет готово.</div></div>` : ''}`;
}

function parts(l) { return ['Видео' + (l.extra_videos.length ? ' ×' + (l.extra_videos.length + 1) : ''), l.quiz && 'тест', l.homework && 'задание'].filter(Boolean).join(' · '); }
function hwTag(l, s) {
  if (!s.done) return '';
  if (!l.homework) return '<span class="tag ok">Пройден</span>';
  const h = s.hw; if (!h) return '';
  return h.status === 'self' ? '<span class="tag ok">Сдано</span>' : h.status === 'ok' ? '<span class="tag ok">Принято</span>' : h.status === 'back' ? '<span class="tag back">На доработку</span>' : '<span class="tag wait">На проверке</span>';
}
function viewCourse() {
  const all = lessonsFlat(), done = S.st.doneCount, total = S.st.total, p = Math.round(done / total * 100);
  const cur = all.find(l => !lst(l.id).done && lst(l.id).unlocked);
  const back = all.find(l => lst(l.id).hw && lst(l.id).hw.status === 'back');
  let h = `${S.me.courses.filter(c => c.enrolled).length > 1 ? '<button class="back" data-act="home">← Мои курсы</button>' : ''}
  <div class="rubric">${S.st.stream} поток · тариф «${esc(S.st.tariff)}»</div><h1 class="h1">${esc(S.course.title)}</h1>
  <button class="note" data-act="inc" style="text-align:left;cursor:pointer;background:none">Что входит в тариф ${S.showInc ? '↑' : '↓'}</button>
  ${S.showInc ? `<div class="mock-post" style="margin-top:8px">${tariff().includes.map(x => '· ' + esc(x)).join('<br>')}</div>` : ''}
  <div class="today">
    <div class="today-row"><span>Пройдено <b class="pixel">${p}%</b></span><small style="color:var(--muted)">${done} из ${total} уроков</small></div>
    <div class="bar"><i style="width:${p}%"></i></div>
    ${back ? `<div class="today-row"><div><div class="rubric" style="margin:0;color:var(--bad)">Вернули на доработку</div><div>${esc(back.title)}</div></div><button class="btn violet small" data-act="open" data-id="${back.id}">Открыть</button></div>` : ''}
    ${cur ? `<div class="today-row"><div><div class="rubric" style="margin:0">Следующий урок</div><div>${esc(cur.title)}</div></div><button class="btn violet small" data-act="open" data-id="${cur.id}">Продолжить</button></div>`
      : `<div class="why">${done === total ? 'Все уроки пройдены.' : 'Новые уроки откроются по расписанию.'}</div>`}
  </div>`;
  S.course.modules.forEach((m, mi) => {
    const ls = all.filter(l => l.mi === mi), d = ls.filter(l => lst(l.id).done).length, open = m.opens <= S.st.today;
    const ws = (S.course.schedule.workshops || []).includes(m.opens);
    h += `<section class="module"><div class="mod-head"><span class="pixel">${modNum(m.title)}</span><h2>${esc(m.title)}</h2><small>${open ? d + '/' + ls.length : 'с ' + fmt(m.opens)}</small></div>${ws ? `<p class="note" style="margin:-4px 0 10px">На этой неделе — воркшоп</p>` : ''}<div class="lessons">`;
    ls.forEach(l => {
      const s = lst(l.id), lock = !s.unlocked && !s.done, isCur = cur && cur.id === l.id;
      h += `<button class="lesson ${s.done ? 'done' : ''} ${isCur ? 'current' : ''} ${lock ? 'locked' : ''}" ${lock ? 'disabled aria-disabled="true"' : ''} data-act="open" data-id="${l.id}">
        <span class="dot">${s.done ? '✓' : String(l.li + 1).padStart(2, '0')}</span>
        <span class="t"><b>${esc(l.title)}</b><small>${lock ? (open ? 'Откроется после предыдущего урока' : 'Откроется ' + fmt(m.opens)) : parts(l)}</small></span>${s.done ? hwTag(l, s) : isCur ? '<span class="tag go">Сейчас</span>' : ''}</button>`;
    });
    h += `</div></section>`;
  });
  const f = S.course.final_test, fs = S.st.final;
  h += `<section class="module"><div class="mod-head"><span class="pixel">✓</span><h2>Итоговый тест</h2><small>${fs.open ? '' : 'с ' + fmt(f.opens)}</small></div>
    <button class="lesson ${fs.done ? 'done' : ''} ${!fs.unlocked && !fs.done ? 'locked' : ''}" ${!fs.unlocked && !fs.done ? 'disabled' : ''} data-act="open" data-id="FINAL">
    <span class="dot">${fs.done ? '✓' : '01'}</span><span class="t"><b>Итоговый тест</b><small>${fs.done ? `Зачёт: ${fs.score} из ${f.of}` : !fs.open ? 'Откроется ' + fmt(f.opens) : !fs.unlocked ? 'Откроется после всех уроков' : `${f.of} вопросов · нужно ${f.pass} верных · сертификат`}</small></span></button></section>`;
  return h;
}

function matsHtml(l) {
  if (!l.materials.length && !l.note) return '';
  return `<div class="block"><h3>Материалы урока</h3>${l.note ? `<div class="why">${esc(l.note)}</div>` : ''}<div class="opts">${l.materials.map(([t, u]) =>
    `<a class="opt" href="${esc(u)}" data-act="link" data-url="${esc(u)}"><span>${esc(t)}</span><span style="color:var(--violet)">↗</span></a>`).join('')}</div></div>`;
}
const player = (id, title) => `<div class="video" style="margin-top:14px"><iframe src="https://kinescope.io/embed/${esc(id)}" title="${esc(title)}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer; clipboard-write" allowfullscreen></iframe></div>`;

function viewLesson() {
  const isFinal = S.open === 'FINAL';
  const l = isFinal ? { id: 'FINAL', title: 'Итоговый тест', quiz: S.course.final_test.quiz, video: null, extra_videos: [], materials: [], homework: null } : lessonsFlat().find(x => x.id === S.open);
  const s = isFinal ? { watched: true, quizOk: S.st.final.done, done: S.st.final.done, hw: null } : lst(l.id);
  const steps = [l.video && ['Видео', s.watched], l.quiz && ['Тест', s.quizOk], l.homework && ['Задание', !!s.hw]].filter(Boolean);
  const on = steps.findIndex(x => !x[1]);
  let h = `<button class="back" data-act="close">← Карта курса</button>
  <div class="rubric">${isFinal ? 'Финал курса' : `Модуль ${modNum(l.mod.title)} · урок ${String(l.li + 1).padStart(2, '0')}`}</div><h1 class="h1">${esc(l.title)}</h1>`;
  if (isFinal) h += `<div class="block"><div class="why">${esc(S.course.final_test.intro)}</div></div>`;
  if (l.video) h += player(l.video, l.title) + l.extra_videos.map(([t, id]) => `<p class="note">${esc(t)}</p>${player(id, t)}`).join('');
  h += `<div class="steps" style="grid-template-columns:repeat(${steps.length},1fr)">${steps.map((x, i) => `<div class="${x[1] ? 'step ok' : i === on ? 'step on' : 'step'}">${i + 1} · ${x[0]}</div>`).join('')}</div>`;

  if (l.video && !s.watched) {
    h += `<div class="block"><div class="why">Посмотри видео до конца и отметь, что урок просмотрен.</div><button class="btn" data-act="watched" ${S.busy ? 'disabled' : ''}>Я посмотрел урок</button></div>`;
  } else if (l.quiz && !s.quizOk) {
    h += viewQuiz(l);
  } else if (l.homework && (!s.hw || s.hw.status === 'back')) {
    const reviewed = S.st.reviewed, late = S.st.today > l.deadline;
    h += `<div class="block"><h3>Домашнее задание</h3>
      ${s.hw && s.hw.status === 'back' ? `<div class="mock-post" style="border-color:var(--bad)"><small>Вернули на доработку</small>${esc(s.hw.comment || 'Посмотри замечания куратора в сообщении от бота.')}</div>` : ''}
      <div class="mock-post" style="white-space:pre-line">${esc(l.homework)}</div>
      <div class="why"><b>Сдать до субботы, ${fmt(l.deadline)}.</b>${late ? ' Дедлайн прошёл: домашку можно сдать, но баллы за неё не начислятся.' : ''}</div>
      <label for="hw">Ответ или ссылка</label><textarea id="hw" rows="4" placeholder="Вставь текст или ссылку на Google Диск"></textarea>
      <button class="btn violet" data-act="sendhw" ${S.busy ? 'disabled' : ''}>${reviewed ? 'Отправить на проверку' : 'Сдать задание'}</button>
      <div class="why">${reviewed ? 'Куратор отвечает в течение 48 часов. Следующий урок откроется сразу.' : 'В тарифе «Троюродный» куратор видит ответ, но не проверяет его и не даёт обратную связь.'}</div></div>`;
  } else if (isFinal) {
    h += `<div class="cert"><div class="rubric">Сертификат</div><div class="pixel">Зачёт</div><b>${esc(S.me.user.name)}</b><div class="why">прошёл(ла) курс «${esc(S.course.title)}»</div><div class="why">${S.st.final.score} из ${S.course.final_test.of} верных ответов</div></div>`;
  } else {
    const all = lessonsFlat(), nx = all[all.findIndex(x => x.id === l.id) + 1];
    const hs = s.hw;
    h += `<div class="block"><h3>Урок пройден</h3>
      ${l.homework && hs ? `<div class="why">Домашка: ${hs.status === 'ok' ? 'принята куратором.' : hs.status === 'self' ? 'сдана.' : 'на проверке, ответ в течение 48 часов.'}${hs.late ? ' Сдана после дедлайна, без баллов.' : ''}</div>${hs.comment ? `<div class="mock-post"><small>Комментарий куратора</small>${esc(hs.comment)}</div>` : ''}<div class="mock-post"><small>Твой ответ</small>${esc(hs.answer)}</div>` : ''}
      ${nx && lst(nx.id).unlocked ? `<button class="btn violet" data-act="open" data-id="${nx.id}">Следующий урок: ${esc(nx.title)}</button>` : nx ? `<div class="why">Следующий урок откроется ${fmt(nx.mod.opens)}.</div>` : ''}</div>`;
  }
  return h + (isFinal ? '' : matsHtml(l));
}

function viewQuiz(l) {
  const Q = S.quiz || (S.quiz = { lesson: l.id, qi: 0, answers: [], sel: [], res: null });
  const q = l.quiz[Q.qi];
  if (Q.done) {
    const r = Q.done;
    return `<div class="block"><h3>Результат</h3><div class="q">${r.score} из ${r.of}</div>
      <div class="why">${r.pass ? 'Тест сдан.' : `Нужно ${r.need} верных. Попробуй ещё раз.`}</div>
      <button class="btn" data-act="${r.pass ? 'quizok' : 'quizretry'}">${r.pass ? 'Дальше' : 'Пройти заново'}</button></div>`;
  }
  const ans = Q.res, right = ans ? ans.right : [];
  return `<div class="block"><div class="today-row"><h3>Тест</h3><small class="pixel" style="color:var(--violet)">${Q.qi + 1}/${l.quiz.length}</small></div>
    <div class="q">${esc(q.q)}</div>${q.multi ? '<div class="why">Здесь несколько верных ответов.</div>' : ''}
    <div class="opts">${q.a.map((o, i) => {
      let c = ''; const mine = q.multi ? Q.sel.includes(i) : Q.answers[Q.qi] === i;
      if (ans) { if (right.includes(i)) c = 'right'; else if (mine) c = 'wrong'; } else if (q.multi && mine) c = 'sel';
      return `<button class="opt ${c}" data-act="${q.multi ? 'toggle' : 'pick'}" data-i="${i}" ${ans || S.busy ? 'disabled' : ''}>${q.multi ? (mine ? '☑ ' : '☐ ') : ''}${esc(o)}</button>`;
    }).join('')}</div>
    ${q.multi && !ans ? `<button class="btn" data-act="check" ${Q.sel.length ? '' : 'disabled'}>Проверить</button>` : ''}
    ${ans ? `<div class="why"><b>${ans.correct ? 'Верно.' : 'Не совсем.'}</b> ${ans.correct ? '' : 'Правильный ответ: ' + right.map(i => esc(q.a[i])).join('; ')}</div>
      <button class="btn" data-act="nextq" ${S.busy ? 'disabled' : ''}>${Q.qi < l.quiz.length - 1 ? 'Следующий вопрос' : 'Завершить тест'}</button>` : ''}
  </div>`;
}

function viewTrainer() {
  if (!S.trainer) { api('/api/trainer').then(t => { S.trainer = t; render(); }).catch(e => toast(e.message)); return '<div class="center"><div class="spinner"></div></div>'; }
  return `<div class="rubric">Тренажёр</div><h1 class="h1">Практика за <span class="hl">2 минуты</span></h1>
  <p class="lead">Короткие задания по SMM. Баллы начисляются за первое прохождение в день.</p>
  <div class="cards">${S.trainer.games.map(g => `<button class="card" data-act="game" data-g="${g.id}"><span class="ico" style="background:var(--pink)">${g.rounds.length}</span><span class="t"><b>${esc(g.title)}</b><small>${g.rounds.length} ${plural(g.rounds.length, 'раунд', 'раунда', 'раундов')}</small></span><span class="tag go">+${g.rounds.length * 10}</span></button>`).join('')}</div>`;
}
function viewGame() {
  const G = S.game, g = S.trainer.games.find(x => x.id === G.id);
  if (G.r >= g.rounds.length) return `<button class="back" data-act="endgame">← Тренажёр</button><div class="rubric">${esc(g.title)}</div><h1 class="h1">Готово: <span class="hl">${G.score} из ${g.rounds.length}</span></h1>
    <p class="lead">${G.got ? `+${G.got} баллов.` : 'Баллы за эту игру сегодня уже начислены.'}</p><div style="margin-top:16px"><button class="btn violet" data-act="endgame">К тренажёру</button></div>`;
  const R = g.rounds[G.r], picked = G.answers[G.r];
  return `<button class="back" data-act="endgame">← Тренажёр</button><div class="rubric">${esc(g.title)} · раунд <span class="pixel">${G.r + 1}/${g.rounds.length}</span></div>
  <h1 class="h1" style="font-size:20px">${esc(R.q)}</h1>${R.post ? `<div class="mock-post" style="margin-top:12px"><small>Пример</small>${esc(R.post)}</div>` : ''}
  <div class="vs" style="margin-top:14px">${R.a.map((o, i) => { let c = ''; if (picked !== undefined) { if (i === R.c) c = 'right'; else if (i === picked) c = 'wrong'; }
    return `<button class="opt ${c}" data-act="gpick" data-i="${i}" ${picked !== undefined ? 'disabled' : ''}>${esc(o)}</button>`; }).join('')}</div>
  ${picked !== undefined ? `<p class="why" style="margin-top:12px"><b>${picked === R.c ? 'Верно.' : 'Нет.'}</b> ${esc(R.why || '')}</p><button class="btn" data-act="gnext">Дальше</button>` : ''}`;
}

function viewRating(cur) {
  const cid = S.courseId || 'smm';
  if (!S.rating) { api('/api/rating/' + cid).then(r => { S.rating = r; render(); }).catch(e => toast(e.message)); return '<div class="center"><div class="spinner"></div></div>'; }
  const all = S.rating, myPos = all.findIndex(x => x.me) + 1;
  const gap = myPos > 3 && all[2] ? all[2].points - all[myPos - 1].points + 1 : 0;
  return `<div class="rubric">Рейтинг потока</div><h1 class="h1">Топ-3 получают <span class="hl">личный разбор</span> аккаунта</h1>
  <div class="prize"><span class="pixel">03</span><div>Три места с призом. Итоги в последний день обучения.</div></div>
  ${!cur && myPos ? (myPos <= 3 ? `<p class="note">Ты в призовой тройке. Держи огонёк, чтобы не выпасть.</p>` : `<p class="note">До 3 места: <b class="pixel">${gap}</b> ${plural(gap, 'балл', 'балла', 'баллов')}.</p>`) : ''}
  <div class="rows">${all.map((x, i) => `<div class="row ${x.me && !cur ? 'me' : ''} ${i < 3 ? 'top' : ''}"><span class="pos">${i + 1}</span><span class="ava" style="background:${['#7e71ee', '#a6c653', '#4a3687', '#e8a33c', '#b2abf3', '#5c4bb5'][i % 6]}">${esc(x.name[0])}</span>
    <span class="n">${esc(x.name)}${i < 3 ? '<small>Разбор аккаунта</small>' : ''}</span><span class="pts">${x.points}</span></div>`).join('') || '<p class="note">Пока пусто.</p>'}</div>
  <p class="note">Баллы: видео — 10, верный ответ в тесте — 6, урок пройден — 20, принятая домашка — 30 (после дедлайна — 0), задание в «Троюродном» — 10, тренажёр — 10 за ответ, огонёк 7 дней подряд — 50.</p>`;
}

function viewLib() {
  const all = lessonsFlat();
  const files = all.flatMap(l => l.materials.filter(([t]) => /Шаблон|Брифинг|^Контент-план$|Отчёт RE|Пресеты|Карта|Примеры/.test(t)).map(([t, u]) => ({ t, u, l })));
  const kind = t => /Шаблон|^Контент-план$|Отчёт|Брифинг/.test(t) ? 'Шаблон' : /Пресеты/.test(t) ? 'Пресеты' : /Карта/.test(t) ? 'Гайд' : 'Примеры';
  return `<div class="rubric">Материалы</div><h1 class="h1">Шаблоны и <span class="hl">гайды</span></h1>
  <p class="lead">Всё из уроков в одном месте. Файл открывается вместе со своим уроком.</p>
  <div class="lib">${files.map(f => { const s = lst(f.l.id), lock = !s.unlocked && !s.done;
    const inner = `<span class="kind">${kind(f.t)}</span><b>${esc(f.t)}</b><small>${lock ? 'Откроется с уроком' : 'Урок'} «${esc(f.l.title)}»</small>`;
    return lock ? `<div class="file locked">${inner}</div>` : `<a class="file" href="${esc(f.u)}" data-act="link" data-url="${esc(f.u)}" style="text-decoration:none;color:inherit">${inner}</a>`; }).join('')}</div>
  <div class="block"><h3>Электронная библиотека</h3><div class="why">${esc(S.course.library.intro)}</div>
  <div class="opts">${S.course.library.items.map(([t, u]) => `<a class="opt" href="${esc(u)}" data-act="link" data-url="${esc(u)}" style="font-size:13px">${esc(t)}</a>`).join('')}</div></div>`;
}

function viewMe() {
  const p = Math.round(S.st.doneCount / S.st.total * 100), si = p >= 75 ? 2 : p >= 35 ? 1 : 0;
  const hws = S.st.lessons.filter(l => l.hw), ok = hws.filter(l => l.hw.status === 'ok').length;
  const sch = S.course.schedule, rod = S.st.tariff === 'Родной';
  return `<div class="rubric">Мой путь</div><h1 class="h1">Сейчас ты <span class="hl">${STAGES[si].name.toLowerCase()}</span></h1>
  <p class="lead">Путь студента «Родных»: из гусеницы в бабочку. ${si < 2 ? `Следующая стадия — на ${STAGES[si + 1].from}% курса.` : 'Осталось сдать итоговый тест.'}</p>
  <div class="meta-path">${STAGES.map((s, i) => `<div class="stage ${i === si ? 'on' : i < si ? 'past' : ''}">${s.svg}${s.name}<br><small>${s.from}%</small></div>`).join('')}</div>
  <div class="tiles">
    <div class="tile"><div class="pixel">${S.st.streak}</div><small>${plural(S.st.streak, 'день', 'дня', 'дней')} подряд с огоньком</small></div>
    <div class="tile"><div class="pixel">${S.st.points}</div><small>баллов в рейтинге</small></div>
    <div class="tile"><div class="pixel">${p}%</div><small>курса пройдено</small></div>
    ${S.st.reviewed ? `<div class="tile"><div class="pixel">${ok}<span style="color:var(--muted)">/${hws.length}</span></div><small>домашек принято</small></div>` : `<div class="tile"><div class="pixel">${hws.length}</div><small>заданий сдано</small></div>`}
  </div>
  <div class="block"><h3>Расписание потока</h3><div class="why">Обучение до ${fmt(sch.end)}, итоговый тест — ${fmt(sch.final)}.${rod ? ` Потом стажировка в агентстве «Родные» (${esc(sch.internship)}) и аттестация ${fmt(sch.attestation)}.` : ''}</div></div>
  ${rod ? `<div class="block"><h3>Консультация с основателем агентства</h3><div class="why">Входит в тариф «Родной». Нажми кнопку, и мы напишем тебе, чтобы выбрать время.</div><button class="btn ghost" data-act="consult">Записаться</button></div>` : ''}
  <div class="block"><h3>Сертификат</h3><div class="why">${S.st.final.done ? 'Получен. Открой итоговый тест в карте курса, чтобы посмотреть.' : `Откроется после итогового теста: ${S.course.final_test.of} вопросов, нужно ${S.course.final_test.pass} верных ответов.`}</div><div class="bar green"><i style="width:${p}%"></i></div></div>`;
}

// ---------- куратор ----------
function courseSelect(id, sel) { return `<select class="input" id="${id}">${S.admin.courses.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select>`; }
function tariffSelect(id) { const c = S.admin.courses[0]; return `<select class="input" id="${id}">${c.tariffs.map(t => `<option ${t === 'Родной' ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`; }
const daysAgo = d => d ? Math.round((Date.parse(S.admin.today) - Date.parse(d)) / 86400000) : null;
function viewPeople() {
  if (!S.admin) return '<div class="center"><div class="spinner"></div></div>';
  const A = S.admin, st = [...A.students].sort((a, b) => (daysAgo(b.lastDay) ?? 999) - (daysAgo(a.lastDay) ?? 999));
  const gone = st.filter(s => (daysAgo(s.lastDay) ?? 999) >= 3).length, wait = (S.hw || []).filter(h => h.status === 'wait').length;
  const avg = st.length ? Math.round(st.reduce((a, s) => a + s.pct, 0) / st.length) : 0;
  return `<div class="rubric">Панель куратора</div><h1 class="h1">Студенты</h1>
  <div class="tiles">
    <div class="tile"><div class="pixel">${st.length - gone}<span style="color:var(--muted)">/${st.length}</span></div><small>заходили за 3 дня</small></div>
    <div class="tile ${gone ? 'alert' : ''}"><div class="pixel">${gone}</div><small>пропали на 3+ дня</small></div>
    <div class="tile"><div class="pixel">${avg}%</div><small>средний прогресс</small></div>
    <div class="tile ${wait ? 'alert' : ''}"><div class="pixel">${wait}</div><small>домашек ждут проверки</small></div>
  </div>
  ${A.requests.length ? `<div class="section-title"><h2>Заявки на доступ</h2><small>открыли бота без доступа</small></div><div class="list">${A.requests.map(r => `<div class="st">
    <div class="st-top"><span class="n">${esc(r.name)}<small>${r.username ? '@' + esc(r.username) : 'без ника'}</small></span></div>
    <div class="row2">${courseSelect('rc' + r.id, 'smm')}${tariffSelect('rt' + r.id)}</div>
    <button class="btn violet small" data-act="enroll" data-uid="${r.id}">Открыть доступ</button></div>`).join('')}</div>` : ''}
  <div class="block"><h3>Открыть доступ по нику</h3><div class="why">Если студент ещё не открывал бота. Доступ включится, когда он нажмёт /start.</div>
    <input class="input" id="nick" placeholder="@username" autocomplete="off"><div class="row2">${courseSelect('nc', 'smm')}${tariffSelect('nt')}</div>
    <button class="btn violet" data-act="invite">Открыть доступ</button>
    ${A.invites.length ? `<div class="why">Ждут входа: ${A.invites.map(i => '@' + esc(i.username) + ' (' + esc(i.tariff) + ')').join(', ')}</div>` : ''}</div>
  <div class="section-title"><h2>Все студенты</h2><small>сначала те, кто пропал</small></div>
  <div class="list">${st.map(s => { const d = daysAgo(s.lastDay); const risk = d === null || d >= 7 ? 'back' : d >= 3 ? 'wait' : 'ok';
    const lbl = d === null ? 'не заходил' : d === 0 ? 'сегодня' : d === 1 ? 'вчера' : `${d} ${plural(d, 'день', 'дня', 'дней')} назад`;
    return `<div class="st"><div class="st-top"><span class="n">${esc(s.name)}<small>${esc(s.tariff)} · ${esc(s.at)} · ${s.points} б.</small></span><span class="tag ${risk}">${lbl}</span></div>
    <div class="bar ${risk === 'ok' ? 'green' : ''}"><i style="width:${s.pct}%"></i></div>
    ${(d === null || d >= 3) && s.hasTg ? `<button class="btn ghost small" data-act="remind" data-uid="${s.id}">Напомнить через бота</button>` : ''}</div>`; }).join('') || '<p class="note">Пока нет студентов.</p>'}</div>`;
}
function viewInbox() {
  if (!S.hw) return '<div class="center"><div class="spinner"></div></div>';
  const review = S.hw.filter(h => h.status !== 'self'), selfs = S.hw.filter(h => h.status === 'self');
  const wait = review.filter(h => h.status === 'wait'), done = review.filter(h => h.status !== 'wait').slice(0, 30);
  const card = h => `<div class="hw"><div class="st-top"><span class="n">${esc(h.name)}<small>${esc(h.tariff)} · ${esc(h.lesson)} · ${fmt(h.submitted)}</small></span>
    ${h.late ? '<span class="tag back">После дедлайна</span>' : ''}${h.status !== 'self' && h.status !== 'wait' ? `<span class="tag ${h.status === 'ok' ? 'ok' : 'back'}">${h.status === 'ok' ? 'Принято' : 'Вернул'}</span>` : ''}</div>
    <div class="ans" style="white-space:pre-line">${linkify(h.answer)}</div>
    ${h.status === 'wait' ? `<textarea id="cm${h.id}" rows="2" placeholder="Комментарий студенту (необязательно)"></textarea>
    <div class="hw-actions"><button class="btn violet small" data-act="hwok" data-id="${h.id}">${h.late ? 'Принять без баллов' : 'Принять +30'}</button><button class="btn ghost small" data-act="hwback" data-id="${h.id}">На доработку</button></div>` : h.comment ? `<div class="why">Комментарий: ${esc(h.comment)}</div>` : ''}</div>`;
  return `<div class="rubric">Домашки</div><h1 class="h1">Ждут проверки: <span class="hl pixel">${wait.length}</span></h1>
  <p class="lead">Срок ответа — 48 часов. После дедлайна домашку проверяешь, но баллы не начисляются. Студент получает уведомление от бота.</p>
  <div class="list">${wait.map(card).join('') || '<p class="note">Все домашки проверены.</p>'}</div>
  <div class="section-title"><h2>Троюродный</h2><small>без проверки, только просмотр</small></div>
  <div class="list">${selfs.slice(0, 50).map(card).join('') || '<p class="note">Пока ничего не сдано.</p>'}</div>
  ${done.length ? `<div class="section-title"><h2>Проверенные</h2><small>последние 30</small></div><div class="list">${done.map(card).join('')}</div>` : ''}`;
}
function linkify(t) { return esc(t).replace(/(https?:\/\/[^\s<]+)/g, m => `<a href="${m}" data-act="link" data-url="${m}" style="color:var(--violet)">${m}</a>`); }

// ---------- действия ----------
async function busy(fn) { if (S.busy) return; S.busy = true; render(); try { await fn(); } catch (e) { toast(e.message); haptic(false); } finally { S.busy = false; render(); } }
const gotToast = (n, what) => n && toast(`+${n} баллов · ${what}`);

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === 'link') { e.preventDefault(); return openLink(b.dataset.url); }
  if (a === 'reload') return location.reload();
  if (a === 'shop') return b.dataset.url ? openLink(b.dataset.url) : null;
  if (a === 'view') { S.view = b.dataset.v; S.rating = null; if (S.view === 'curator') await busy(loadAdmin); else { if (!S.courseId) { const en = S.me.courses.filter(c => c.enrolled); if (en.length === 1) await busy(() => openCourse(en[0].id)); } render(); } window.scrollTo(0, 0); return; }
  if (a === 'atab') { S.adminTab = b.dataset.t; S.rating = null; if (S.adminTab !== 'rate') await busy(loadAdmin); else render(); window.scrollTo(0, 0); return; }
  if (a === 'course') { await busy(() => openCourse(b.dataset.c)); return; }
  if (a === 'home') { S.courseId = null; S.me = await api('/api/me'); render(); return; }
  if (a === 'tab') { S.tab = b.dataset.t; S.open = null; S.game = null; S.quiz = null; if (S.tab === 'rate') S.rating = null; render(); window.scrollTo(0, 0); return; }
  if (a === 'inc') { S.showInc = !S.showInc; return render(); }
  if (a === 'open') { S.open = b.dataset.id; S.quiz = null; S.tab = 'course'; render(); window.scrollTo(0, 0); return; }
  if (a === 'close') return goBack();
  if (a === 'watched') return busy(async () => { const r = await api('/api/watched', { course: S.courseId, lesson: S.open }); S.st = r.state; gotToast(r.got, 'урок'); });
  if (a === 'pick' || a === 'check' || a === 'toggle') {
    const Q = S.quiz, l = S.open === 'FINAL' ? { quiz: S.course.final_test.quiz } : lessonsFlat().find(x => x.id === S.open), q = l.quiz[Q.qi];
    if (a === 'toggle') { const i = +b.dataset.i; Q.sel = Q.sel.includes(i) ? Q.sel.filter(x => x !== i) : [...Q.sel, i]; return render(); }
    const answer = q.multi ? Q.sel : +b.dataset.i;
    Q.answers[Q.qi] = answer;
    return busy(async () => { Q.res = await api('/api/quiz/check', { course: S.courseId, lesson: S.open, qi: Q.qi, answer }); haptic(Q.res.correct); });
  }
  if (a === 'nextq') {
    const Q = S.quiz, n = S.open === 'FINAL' ? S.course.final_test.quiz.length : lessonsFlat().find(x => x.id === S.open).quiz.length;
    if (Q.qi < n - 1) { Q.qi++; Q.res = null; Q.sel = []; return render(); }
    return busy(async () => { const r = await api('/api/quiz/submit', { course: S.courseId, lesson: S.open, answers: Q.answers }); Q.done = r; if (r.pass) { gotToast(r.got, 'тест'); } haptic(r.pass); S.pendingState = r.state; });
  }
  if (a === 'quizretry') { S.quiz = null; return render(); }
  if (a === 'quizok') { if (S.pendingState) S.st = S.pendingState; S.pendingState = null; S.quiz = null; render(); return; }
  if (a === 'sendhw') {
    const v = $('#hw').value.trim(); if (!v) return toast('Добавь ответ или ссылку');
    return busy(async () => { const r = await api('/api/homework', { course: S.courseId, lesson: S.open, answer: v }); S.st = r.state; toast(r.late ? 'Сдано после дедлайна, без баллов' : r.got ? `+${r.got} баллов` : 'Отправлено'); haptic(true); });
  }
  if (a === 'game') { S.game = { id: b.dataset.g, r: 0, answers: [], score: 0 }; return render(); }
  if (a === 'gpick') { const g = S.trainer.games.find(x => x.id === S.game.id), i = +b.dataset.i; S.game.answers[S.game.r] = i; if (i === g.rounds[S.game.r].c) S.game.score++; haptic(i === g.rounds[S.game.r].c); return render(); }
  if (a === 'gnext') { const g = S.trainer.games.find(x => x.id === S.game.id); S.game.r++;
    if (S.game.r >= g.rounds.length) return busy(async () => { const r = await api('/api/trainer', { course: S.courseId, game: g.id, answers: S.game.answers }); S.game.got = r.got; await refreshState(); });
    return render(); }
  if (a === 'endgame') { S.game = null; return render(); }
  if (a === 'consult') return busy(async () => { await api('/api/consult', { course: S.courseId }); toast('Заявка отправлена, тебе напишут'); });
  if (a === 'enroll') { const uid = b.dataset.uid; return busy(async () => { const r = await api('/api/admin/enroll', { userId: uid, course: $('#rc' + uid).value, tariff: $('#rt' + uid).value }); toast(r.message); await loadAdmin(); }); }
  if (a === 'invite') { const nick = $('#nick').value.trim(); if (!nick) return toast('Введи ник в Telegram');
    return busy(async () => { const r = await api('/api/admin/enroll', { username: nick, course: $('#nc').value, tariff: $('#nt').value }); toast(r.message); await loadAdmin(); }); }
  if (a === 'remind') return busy(async () => { await api('/api/admin/remind', { userId: b.dataset.uid }); toast('Напоминание отправлено'); });
  if (a === 'hwok' || a === 'hwback') { const id = b.dataset.id, comment = ($('#cm' + id) || {}).value || '';
    if (a === 'hwback' && !comment.trim()) return toast('Напиши, что доработать');
    return busy(async () => { const r = await api('/api/admin/homework/' + id, { status: a === 'hwok' ? 'ok' : 'back', comment }); toast(a === 'hwok' ? (r.got ? 'Принято, +30 баллов студенту' : 'Принято без баллов') : 'Вернул на доработку'); S.hw = await api('/api/admin/homework'); }); }
});

boot();

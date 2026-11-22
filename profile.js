'use strict';

/* Ходи Броди — логика профиля.
   Ключи localStorage и структура данных сохранены, поэтому уже накопленный
   демо-прогресс продолжает работать после редизайна. */

const STORAGE_KEY = 'brodi-new-concept-v2';
const PROFILE_KEY = 'brodi-profile-v1';

const places = window.BRODI_PLACES || [];
const products = [
  { id: 'tee', name: 'Футболка «Я бродил»', description: 'Мягкая база и немного городского характера.', cost: 340, icon: 'shirt', art: 'shirt-look', ribbon: 'Одежда' },
  { id: 'tote', name: 'Шопер «Маршрут дня»', description: 'Для маленьких находок по дороге домой.', cost: 240, icon: 'bag', art: 'tote-look', ribbon: 'На каждый день' },
  { id: 'boot-keychain', name: 'Бутсы-брелок', description: 'Символ твоих приключений — всегда с собой.', cost: 180, icon: 'boot', art: 'boot-look', ribbon: 'Знак бродилки' }
];
const offers = [
  { id: 'ticket5', name: '−5% на билет', cost: 160 },
  { id: 'ticket10', name: '−10% на билет', cost: 300 }
];
const allGoals = [...offers, ...products];
const interestOptions = ['Еда', 'Развлечения', 'С детьми', 'Активный отдых'];
const tabs = ['reviews', 'info', 'tasks', 'places', 'boots', 'journey', 'interests', 'shop'];

const $ = selector => document.querySelector(selector);
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`;

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') || {};
  } catch (error) {
    return {};
  }
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function fmt(n) {
  return Number(n).toLocaleString('ru-RU');
}

let state = read(STORAGE_KEY);
let profile = read(PROFILE_KEY);
let pending = null;
let taskFilter = 'active';
let placeFilter = 'saved';
let historyFilter = 'all';

function normalize() {
  state.balance = Number.isFinite(state.balance) && state.balance >= 0 ? Math.floor(state.balance) : 0;
  for (const key of ['done', 'owned', 'redeemed', 'history', 'activeTasks', 'favorites']) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
  for (const key of ['done', 'activeTasks', 'favorites']) {
    state[key] = [...new Set(state[key].filter(id => places.some(p => p.id === id)))];
  }
  state.activeTasks = state.activeTasks.filter(id => !state.done.includes(id));
  if (typeof profile.name !== 'string') profile.name = 'Гость';
  if (!Array.isArray(profile.interests)) profile.interests = [];
  profile.interests = profile.interests.filter(value => interestOptions.includes(value));
  if (!allGoals.some(goal => goal.id === profile.goalId)) {
    const legacy = allGoals.find(goal => goal.cost === Number(profile.goal));
    profile.goalId = legacy ? legacy.id : 'ticket5';
  }
}

normalize();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch (error) {
    toast('Не удалось сохранить данные в этом браузере');
  }
}

function totalEarned() {
  return places.filter(p => state.done.includes(p.id)).reduce((sum, p) => sum + p.reward, 0);
}

function totalSpent() {
  return [...products.filter(p => state.owned.includes(p.id)), ...offers.filter(o => state.redeemed.includes(o.id))]
    .reduce((sum, item) => sum + item.cost, 0);
}

function placeUrl(place) {
  return `index.html?place=${encodeURIComponent(place.id)}#map-section`;
}

function currentTab() {
  const tab = location.hash.slice(1);
  if (tab === 'favorites') return 'places';
  return tabs.includes(tab) ? tab : 'info';
}

function heading(title, description, link, linkText) {
  return `
    <div class="panel-heading">
      <div>
        <h2>${title}</h2>
        <p>${description}</p>
      </div>
      ${link ? `<a class="panel-link" href="${link}">${linkText} ↗</a>` : ''}
    </div>`;
}

/* Изображения мест могут отсутствовать — карточка перестраивается без фото. */
function bindImageFallbacks() {
  document.querySelectorAll('img[data-fallback]').forEach(img => {
    if (img.dataset.fallbackBound) return;
    img.dataset.fallbackBound = 'true';
    const fail = () => {
      const card = img.closest('[data-media]');
      if (card) card.classList.add('has-no-image');
      img.remove();
    };
    if (img.complete && img.naturalWidth === 0) {
      fail();
      return;
    }
    img.addEventListener('error', fail, { once: true });
  });
}

function render() {
  normalize();
  $('#profile-name').textContent = profile.name || 'Гость';
  $('#top-tasks').textContent = state.done.length;
  $('#top-owned').textContent = state.owned.length + state.redeemed.length;
  $('#top-balance').textContent = fmt(state.balance);

  const tab = currentTab();
  document.querySelectorAll('[data-tab]').forEach(link => {
    const active = link.dataset.tab === tab;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  const panels = { info, tasks, placesPage, wallet, journey, interests, shop, reviews };
  const panel = tab === 'places' ? panels.placesPage : tab === 'boots' ? panels.wallet : panels[tab];
  $('#profile-content').innerHTML = panel();
  bindImageFallbacks();
}

function goalMarkup() {
  const goal = allGoals.find(item => item.id === profile.goalId) || offers[0];
  const remaining = Math.max(goal.cost - state.balance, 0);
  const percent = Math.min(100, Math.round((state.balance / goal.cost) * 100));
  return `
    <div class="goal-card">
      <span class="micro-label">Твоя цель</span>
      <h3>${esc(goal.name)}</h3>
      <div class="goal-line">
        <span>${fmt(Math.min(state.balance, goal.cost))} / ${fmt(goal.cost)} бутс</span>
        <span>${percent}%</span>
      </div>
      <div class="goal-bar"
           role="progressbar"
           aria-valuenow="${Math.min(state.balance, goal.cost)}"
           aria-valuemin="0"
           aria-valuemax="${goal.cost}"
           aria-label="Накопление на ${esc(goal.name)}">
        <span style="width:${percent}%"></span>
      </div>
      <p>${remaining ? `До цели ещё ${fmt(remaining)} бутс` : 'На эту награду уже хватает бутс!'}</p>
      <a class="text-action" href="${remaining ? 'index.html#map-section' : '#shop'}">${remaining ? 'Найти задания' : 'Открыть лавку'} →</a>
    </div>`;
}

/* Обзор ------------------------------------------------------------------- */
function info() {
  const active = places.find(p => state.activeTasks.includes(p.id));
  const recommended = places.find(p => !state.done.includes(p.id) && (!profile.interests.length || profile.interests.includes(p.category)));
  const featured = active || recommended;

  return `
    <div class="profile-panel">
      <div class="overview-heading">
        <div>
          <span class="overview-kicker">Твой город · твоя история</span>
          <h2>Привет, ${esc(profile.name || 'Гость')}<span>.</span></h2>
          <p>Все твои открытия собраны здесь.</p>
        </div>
        <a class="panel-link" href="index.html#map-section">На карту ↗</a>
      </div>

      <div class="overview-feature-grid">
        <div class="discovery-card">
          <div class="discovery-top">
            <span>${active ? 'Твоё задание' : 'Идея для открытия'}</span>
            <span>01 / Город</span>
          </div>
          <div class="discovery-main${featured ? '' : ' has-no-image'}" data-media>
            <div>
              ${featured ? `<span class="discovery-category">${esc(featured.category)} · ${esc(featured.city)}</span>
              <h3>${esc(featured.name)}</h3>
              <p>${active ? esc(featured.task) : 'Место из городской подборки. Открой его на карте и узнай о задании.'}</p>
              <a href="${placeUrl(featured)}">${active ? 'Продолжить' : 'Открыть место'} <span aria-hidden="true">↗</span></a>` : `
              <h3>Всё впереди</h3>
              <p>Пока подходящих невыполненных заданий нет. Загляни на карту или измени интересы.</p>
              <a href="index.html#map-section">Открыть карту ↗</a>`}
            </div>
            ${featured ? `<img src="${esc(featured.image)}" alt="" loading="lazy" decoding="async" data-fallback>` : ''}
          </div>
        </div>
        <div class="overview-goal-wrap">${goalMarkup()}</div>
      </div>

      <div class="overview-section-head">
        <div>
          <span class="overview-kicker">Коротко о главном</span>
          <h3>Твои открытия</h3>
        </div>
        <a class="overview-history" href="#journey">Моя история ↗</a>
      </div>

      <div class="overview-links">
        <a href="#tasks">
          <span class="overview-link-number">01</span>
          <span><b>Мои задания</b><small>${state.activeTasks.length} активных · ${state.done.length} выполнено</small></span>
          <span class="overview-link-arrow" aria-hidden="true">↗</span>
        </a>
        <a href="#places">
          <span class="overview-link-number">02</span>
          <span><b>Мои места</b><small>${state.favorites.length} в избранном</small></span>
          <span class="overview-link-arrow" aria-hidden="true">↗</span>
        </a>
        <a href="#journey">
          <span class="overview-link-number">03</span>
          <span><b>Мой путь</b><small>${state.done.length} из ${places.length} заданий</small></span>
          <span class="overview-link-arrow" aria-hidden="true">↗</span>
        </a>
      </div>
    </div>`;
}

/* Задания ----------------------------------------------------------------- */
function taskCard(place, done) {
  return `
    <article class="activity-card" data-media>
      <img src="${esc(place.image)}" alt="" loading="lazy" decoding="async" data-fallback>
      <div class="activity-info">
        <div class="activity-top">
          <span class="status-pill${done ? ' done' : ''}">${done ? 'Выполнено' : 'В процессе'}</span>
          <b class="activity-reward">${done ? '✓' : `+${place.reward}`} бутс</b>
        </div>
        <h3>${esc(place.name)}</h3>
        <p>${esc(place.task)}</p>
        <small>${done ? 'Отмечено пользователем · ' : '📍 '}${esc(place.city)} · ${esc(place.category)}</small>
        <div class="activity-links">
          <a href="${placeUrl(place)}">${done ? 'Открыть место' : 'Продолжить задание'} →</a>
          ${done ? '' : `<button type="button" data-remove-task="${esc(place.id)}">Убрать из активных</button>`}
        </div>
      </div>
    </article>`;
}

function tasks() {
  const list = places.filter(p => (taskFilter === 'active' ? state.activeTasks.includes(p.id) : state.done.includes(p.id)));
  return `
    <div class="profile-panel">
      ${heading('Мои задания', 'Здесь собраны твои городские приключения.', 'index.html#map-section', 'На карту')}
      <div class="subtabs" role="group" aria-label="Фильтр заданий">
        <button type="button" data-task-filter="active" class="${taskFilter === 'active' ? 'active' : ''}" aria-pressed="${taskFilter === 'active'}">Активные <span>${state.activeTasks.length}</span></button>
        <button type="button" data-task-filter="done" class="${taskFilter === 'done' ? 'active' : ''}" aria-pressed="${taskFilter === 'done'}">Выполненные <span>${state.done.length}</span></button>
      </div>
      <div class="activity-list">
        ${list.length ? list.map(p => taskCard(p, taskFilter === 'done')).join('') : `
        <div class="empty-message">
          ${taskFilter === 'active'
            ? 'Пока нет активных заданий. Открой место на карте и нажми «Взять задание».'
            : 'Ты ещё не отметил выполненные задания. Впереди столько интересного!'}
          <br><a class="mini-link" href="index.html#map-section">На карту →</a>
        </div>`}
      </div>
      <p class="inline-note">В демо задания отмечаются вручную, посещения не проверяются.</p>
    </div>`;
}

/* Мои места --------------------------------------------------------------- */
function placesPage() {
  const list = places.filter(p => (placeFilter === 'saved' ? state.favorites.includes(p.id) : state.done.includes(p.id)));
  return `
    <div class="profile-panel">
      ${heading('Мои места', 'Места, которые хочется посетить, и твои открытия.', 'index.html#map-section', 'Найти места')}
      <div class="subtabs" role="group" aria-label="Фильтр мест">
        <button type="button" data-place-filter="saved" class="${placeFilter === 'saved' ? 'active' : ''}" aria-pressed="${placeFilter === 'saved'}">Хочу посетить <span>${state.favorites.length}</span></button>
        <button type="button" data-place-filter="visited" class="${placeFilter === 'visited' ? 'active' : ''}" aria-pressed="${placeFilter === 'visited'}">Отмечено посещённым <span>${state.done.length}</span></button>
      </div>
      <div class="places-grid">
        ${list.length ? list.map(p => `
        <article class="place-card" data-media>
          <img src="${esc(p.image)}" alt="" loading="lazy" decoding="async" data-fallback>
          <div>
            <span class="place-category">${esc(p.category)}</span>
            <h3>${esc(p.name)}</h3>
            <p>${esc(p.address)}</p>
            ${placeFilter === 'visited' ? '<small>Посещение отмечено пользователем</small>' : ''}
            <div class="place-card-actions">
              <a href="${placeUrl(p)}">На карте →</a>
              ${state.favorites.includes(p.id)
                ? `<button type="button" data-remove-favorite="${esc(p.id)}" aria-label="Убрать ${esc(p.name)} из избранного">♥ Убрать</button>`
                : `<button type="button" data-add-favorite="${esc(p.id)}">♡ Сохранить</button>`}
            </div>
          </div>
        </article>`).join('') : `
        <div class="empty-message">
          ${placeFilter === 'saved'
            ? 'Здесь появятся места, которые ты сохранишь на карте.'
            : 'Здесь появятся места, где ты самостоятельно отметил выполнение задания.'}
          <br><a class="mini-link" href="index.html#map-section">Исследовать карту →</a>
        </div>`}
      </div>
      <p class="inline-note">Это локальный список прототипа. Он не синхронизирован с избранным официального сайта.</p>
    </div>`;
}

/* Бутсы ------------------------------------------------------------------- */
function wallet() {
  const filtered = state.history.filter(item => {
    if (historyFilter === 'all') return true;
    return historyFilter === 'earn' ? item.amount > 0 : item.amount < 0;
  });

  const rows = filtered.slice(0, 40).map(item => {
    const date = new Date(item.date);
    const formatted = Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    return `
      <div class="history-row">
        <div>
          <b>${esc(item.title || 'Операция')}</b>
          <small>${formatted}${formatted ? ' · ' : ''}демо-операция</small>
        </div>
        <strong class="${item.amount < 0 ? 'minus' : ''}">${item.amount > 0 ? '+' : ''}${fmt(item.amount)} бутс</strong>
      </div>`;
  }).join('');

  return `
    <div class="profile-panel">
      ${heading('Мои бутсы', 'Твой баланс, цели и история городских приключений.', 'index.html#map-section', 'Заработать ещё')}
      <div class="wallet-hero">
        <div>
          <span class="wallet-hero-label">Твой баланс</span>
          <div class="wallet-total">${fmt(state.balance)} <small>бутс</small></div>
          <p class="wallet-description">Выполняй задания, копи и выбирай свои награды.</p>
        </div>
        <div class="wallet-hero-icon" aria-hidden="true">${icon('boot')}</div>
      </div>
      <div class="wallet-stats">
        <div><span>Всего заработано</span><b>${fmt(totalEarned())} <small>бутс</small></b></div>
        <div><span>Потрачено</span><b>${fmt(totalSpent())} <small>бутс</small></b></div>
        <div><span>Заданий выполнено</span><b>${state.done.length} <small>из ${places.length}</small></b></div>
      </div>
      <div class="wallet-content">
        <div class="inner-card">
          <h3>История бутс</h3>
          <p>Начисления и обмены в этом демо.</p>
          <div class="subtabs compact" role="group" aria-label="Фильтр истории">
            ${[['all', 'Все'], ['earn', 'Начисления'], ['spend', 'Списания']].map(([key, label]) => `
              <button type="button" data-history-filter="${key}" class="${historyFilter === key ? 'active' : ''}" aria-pressed="${historyFilter === key}">${label}</button>`).join('')}
          </div>
          <div class="history-list">
            ${rows || '<div class="empty-message">Операций в этом разделе пока нет.</div>'}
          </div>
          ${!state.history.length && (state.done.length || state.owned.length || state.redeemed.length)
            ? '<p class="inline-note">Ранние операции до появления истории не записаны.</p>'
            : ''}
        </div>
        <div class="inner-card inner-card--bare">
          <h3>Копилка цели</h3>
          <p>Выбери награду и следи за прогрессом.</p>
          <label class="sr-only" for="goal-select">Награда для накопления</label>
          <select id="goal-select" class="goal-select">
            ${allGoals.map(item => `<option value="${esc(item.id)}" ${profile.goalId === item.id ? 'selected' : ''}>${esc(item.name)} — ${item.cost} бутс</option>`).join('')}
          </select>
          ${goalMarkup()}
        </div>
      </div>
      <details class="rules">
        <summary>Как работают бутсы?</summary>
        <p>В демо бутсы начисляются после самостоятельной отметки задания. Их можно обменять на демонстрационные награды. Настоящие скидки, выдача мерча и проверка посещений не подключены. Правила реальной программы ещё не утверждены.</p>
      </details>
    </div>`;
}

/* Мой путь ---------------------------------------------------------------- */
function journey() {
  const count = state.done.length;
  const achievements = [
    { title: 'Первый шаг', desc: 'Выполни первое задание', icon: 'spark', ok: count >= 1 },
    { title: 'Новый вкус', desc: 'Выполни задание в категории «Еда»', icon: 'cup', ok: places.some(p => state.done.includes(p.id) && p.category === 'Еда') },
    { title: 'Любитель приключений', desc: 'Открой развлекательное место', icon: 'star', ok: places.some(p => state.done.includes(p.id) && p.category === 'Развлечения') },
    { title: 'Исследователь', desc: `Выполни все ${places.length} заданий`, icon: 'pin', ok: places.length > 0 && count >= places.length }
  ];

  return `
    <div class="profile-panel">
      ${heading('Мой путь', 'Каждое открытие — часть твоей истории.', 'index.html#map-section', 'Открыть карту')}
      <div class="journey-banner">
        <div>
          <span class="micro-label">Твоя история</span>
          <h3>${count ? `Уже ${count} из ${places.length} заданий позади` : 'Первое открытие впереди'}</h3>
          <p>Ты заработал ${fmt(totalEarned())} бутс и отметил ${count} мест.</p>
        </div>
        <div class="journey-circle" aria-hidden="true">${icon('pin')}</div>
      </div>
      <h3 class="section-subtitle">Твои достижения</h3>
      <div class="achievements">
        ${achievements.map(a => `
          <div class="achievement${a.ok ? ' unlocked' : ''}">
            <div class="achievement-icon">${icon(a.icon)}</div>
            <b>${a.title}</b>
            <small>${a.ok ? 'Получено ✓' : a.desc}</small>
          </div>`).join('')}
      </div>
      <p class="inline-note">Достижения рассчитываются по заданиям, отмеченным в этом браузере.</p>
    </div>`;
}

/* Интересы ---------------------------------------------------------------- */
function interests() {
  const selected = profile.interests;
  const recommended = selected.length ? places.filter(p => selected.includes(p.category) && !state.done.includes(p.id)) : [];

  return `
    <div class="profile-panel">
      ${heading('Мои интересы', 'Выбери, что нравится — покажем подходящие задания.')}
      <div class="interest-intro">
        <div>
          <span class="micro-label">Найди своё</span>
          <h3>Как тебе нравится отдыхать?</h3>
          <p>Отмечай несколько вариантов. Выбор можно изменить в любой момент.</p>
        </div>
        <div class="interest-spark" aria-hidden="true">${icon('spark')}</div>
      </div>
      <div class="interest-chips" role="group" aria-label="Интересы">
        ${interestOptions.map(option => `
          <button type="button"
                  data-interest="${esc(option)}"
                  aria-pressed="${selected.includes(option)}"
                  class="${selected.includes(option) ? 'active' : ''}">${selected.includes(option) ? '✓ ' : ''}${esc(option)}</button>`).join('')}
      </div>
      <h3 class="section-subtitle">${selected.length ? 'Подходит тебе' : 'Выбери интересы'}</h3>
      <p class="section-desc">${selected.length
        ? 'Задания из отмеченных категорий, которые ты ещё не выполнил.'
        : 'Мы покажем подходящие места из текущего демо-каталога.'}</p>
      <div class="activity-list">
        ${selected.length
          ? (recommended.length
            ? recommended.map(p => `
              <article class="recommend-row" data-media>
                <img src="${esc(p.image)}" alt="" loading="lazy" decoding="async" data-fallback>
                <div>
                  <span>${esc(p.category)} · +${p.reward} бутс</span>
                  <b>${esc(p.name)}</b>
                  <small>${esc(p.city)}</small>
                </div>
                <a href="${placeUrl(p)}">Посмотреть →</a>
              </article>`).join('')
            : '<div class="empty-message">Подходящих невыполненных заданий пока нет. Попробуй выбрать другую категорию.</div>')
          : ''}
      </div>
      <p class="inline-note">Рекомендации формируются по выбранным категориям и сохраняются на этом устройстве.</p>
    </div>`;
}

/* Своя лавка -------------------------------------------------------------- */
function shop() {
  return `
    <div class="profile-panel">
      <div class="shop-head">
        <div>
          <span class="eyebrow eyebrow--light">Забрать за бутсы</span>
          <h2>Своя лавка</h2>
          <p>Копи впечатления — выбирай награды для себя.</p>
        </div>
        <a class="shop-wallet" href="#boots">${icon('boot')} ${fmt(state.balance)} бутс</a>
      </div>

      <h3 class="shop-section-title">Мерч Ходи Броди</h3>
      <div class="shop-grid">
        ${products.map(p => {
          const owned = state.owned.includes(p.id);
          const enough = state.balance >= p.cost;
          return `
          <article class="product-card">
            <div class="product-visual ${p.art}" aria-hidden="true">
              <span class="product-ribbon">${esc(p.ribbon)}</span>
              ${icon(p.icon)}
            </div>
            <div class="product-copy">
              <h3>${esc(p.name)}</h3>
              <p>${esc(p.description)}</p>
              <div class="product-buy">
                <span class="product-cost">${icon('boot')} ${p.cost} бутс</span>
                ${owned
                  ? '<span class="owned-label">В коллекции ✓</span>'
                  : `<button type="button" data-buy="${esc(p.id)}" ${enough ? '' : 'disabled'}>${enough ? 'Обменять' : `Нужно ещё ${p.cost - state.balance}`}</button>`}
              </div>
              ${owned ? '' : `<button type="button" class="set-goal" data-goal="${esc(p.id)}">${profile.goalId === p.id ? '✓ Твоя цель' : '☆ Копить на это'}</button>`}
            </div>
          </article>`;
        }).join('')}
      </div>

      <h3 class="shop-section-title">Скидки на билеты</h3>
      <div class="shop-discount-grid">
        ${offers.map(o => {
          const redeemed = state.redeemed.includes(o.id);
          const enough = state.balance >= o.cost;
          return `
          <div class="discount-card">
            <div class="discount-icon" aria-hidden="true">${icon('ticket')}</div>
            <div class="discount-copy">
              <b>${esc(o.name)}</b>
              <span>${o.cost} бутс · демо-награда</span>
              ${redeemed ? '' : `<button type="button" class="set-goal" data-goal="${esc(o.id)}">${profile.goalId === o.id ? '✓ Твоя цель' : '☆ Копить на это'}</button>`}
            </div>
            <button type="button"
                    class="exchange-button"
                    data-redeem="${esc(o.id)}"
                    ${redeemed || !enough ? 'disabled' : ''}>${redeemed ? 'Получено' : enough ? 'Обменять' : `Нужно ещё ${o.cost - state.balance}`}</button>
          </div>`;
        }).join('')}
      </div>

      <div class="collection" id="my-rewards">
        <div class="collection-header">
          <div>
            <span class="micro-label">Всё найдётся здесь</span>
            <h3>Мои награды</h3>
          </div>
          <span>${state.owned.length + state.redeemed.length} в коллекции</span>
        </div>
        <p>${state.owned.length || state.redeemed.length
          ? 'Твои полученные демо-награды.'
          : 'Здесь появятся товары и скидки, которые ты обменяешь на бутсы.'}</p>
        <div class="collection-list">
          ${products.filter(p => state.owned.includes(p.id)).map(p => `<span class="collection-chip">${esc(p.name)} ✓</span>`).join('')}
          ${offers.filter(o => state.redeemed.includes(o.id)).map(o => `<span class="collection-chip">${esc(o.name)} ✓</span>`).join('')}
        </div>
      </div>
      <p class="shop-disclaimer">Мерч, стоимость и скидки — примеры для концепта. Обмен не создаёт реальный заказ, билет или промокод. Информация сохраняется только в этом браузере.</p>
    </div>`;
}

/* Отзывы ------------------------------------------------------------------ */
function reviews() {
  return `
    <div class="profile-panel">
      <div class="empty-large">
        ${heading('Отзывы', 'Твои впечатления о местах города.')}
        <span class="empty-icon" aria-hidden="true">${icon('star')}</span>
        <h3>Здесь будут твои отзывы</h3>
        <p>В демо-профиле отзывы не подключены к основному сайту.</p>
        <a class="mini-link" href="https://hodi-brodi.ru/places/">Посмотреть места →</a>
      </div>
    </div>`;
}

/* Уведомления и обвязка --------------------------------------------------- */
let toastTimer;
function toast(message) {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-visible'), 3500);
}

const header = $('.site-header');
const onScroll = () => {
  if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

const menuButton = $('.menu-button');
const mobileNav = $('#mobile-nav');

function setMenu(open) {
  if (!menuButton || !mobileNav) return;
  mobileNav.classList.toggle('is-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  menuButton.innerHTML = `<svg aria-hidden="true"><use href="#i-${open ? 'close' : 'menu'}"/></svg>`;
}

if (menuButton) {
  menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuButton && menuButton.getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    menuButton.focus();
  }
});

document.querySelectorAll('.brand img').forEach(img => {
  const fail = () => {
    img.closest('.brand')?.classList.add('is-empty');
    img.remove();
  };
  if (img.complete && img.naturalWidth === 0) fail();
  img.addEventListener('error', fail, { once: true });
});

/* События ----------------------------------------------------------------- */
document.addEventListener('click', event => {
  if (event.target.closest('#edit-profile')) {
    $('#name-input').value = profile.name === 'Гость' ? '' : profile.name;
    $('#edit-dialog').showModal();
    return;
  }

  if (event.target.closest('.dialog-x') || event.target.closest('.dialog-cancel')) {
    event.target.closest('dialog')?.close();
    return;
  }

  const taskTab = event.target.closest('[data-task-filter]');
  if (taskTab) {
    taskFilter = taskTab.dataset.taskFilter;
    render();
    return;
  }

  const placeTab = event.target.closest('[data-place-filter]');
  if (placeTab) {
    placeFilter = placeTab.dataset.placeFilter;
    render();
    return;
  }

  const historyTab = event.target.closest('[data-history-filter]');
  if (historyTab) {
    historyFilter = historyTab.dataset.historyFilter;
    render();
    return;
  }

  const removeTask = event.target.closest('[data-remove-task]');
  if (removeTask) {
    state.activeTasks = state.activeTasks.filter(id => id !== removeTask.dataset.removeTask);
    save();
    render();
    toast('Задание убрано из активных');
    return;
  }

  const removeFavorite = event.target.closest('[data-remove-favorite]');
  if (removeFavorite) {
    state.favorites = state.favorites.filter(id => id !== removeFavorite.dataset.removeFavorite);
    save();
    render();
    toast('Место удалено из избранного');
    return;
  }

  const addFavorite = event.target.closest('[data-add-favorite]');
  if (addFavorite) {
    const id = addFavorite.dataset.addFavorite;
    if (!state.favorites.includes(id)) state.favorites.push(id);
    save();
    render();
    toast('Место сохранено');
    return;
  }

  const interest = event.target.closest('[data-interest]');
  if (interest) {
    const name = interest.dataset.interest;
    if (!interestOptions.includes(name)) return;
    profile.interests = profile.interests.includes(name)
      ? profile.interests.filter(value => value !== name)
      : [...profile.interests, name];
    save();
    render();
    return;
  }

  const goal = event.target.closest('[data-goal]');
  if (goal) {
    if (!allGoals.some(item => item.id === goal.dataset.goal)) return;
    profile.goalId = goal.dataset.goal;
    save();
    render();
    toast('Цель добавлена в копилку');
    return;
  }

  const buy = event.target.closest('[data-buy]');
  const redeem = event.target.closest('[data-redeem]');
  if (buy || redeem) {
    const item = buy ? products.find(p => p.id === buy.dataset.buy) : offers.find(o => o.id === redeem.dataset.redeem);
    if (!item || state.balance < item.cost) return;
    pending = { item, type: buy ? 'product' : 'offer' };
    $('#confirm-text').textContent = `Обменять ${item.cost} бутс на «${item.name}»?`;
    $('#confirm-dialog').showModal();
    return;
  }

  if (event.target.closest('#confirm-action')) {
    if (!pending) return;
    const { item, type } = pending;
    const ownedList = type === 'product' ? state.owned : state.redeemed;
    if (state.balance < item.cost || ownedList.includes(item.id)) {
      pending = null;
      $('#confirm-dialog').close();
      return;
    }
    state.balance -= item.cost;
    ownedList.push(item.id);
    state.history.unshift({
      type: 'spend',
      title: `${type === 'product' ? 'Мерч: ' : 'Скидка: '}${item.name}`,
      amount: -item.cost,
      date: new Date().toISOString()
    });
    pending = null;
    save();
    $('#confirm-dialog').close();
    render();
    toast('Демо-награда добавлена в коллекцию');
    return;
  }

  if (event.target.closest('.mobile-nav a')) setMenu(false);
});

$('#edit-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#name-input').value.trim();
  if (!name) {
    $('#name-input').focus();
    return;
  }
  profile.name = name;
  save();
  $('#edit-dialog').close();
  render();
  toast('Имя сохранено в этом браузере');
});

document.addEventListener('change', event => {
  if (event.target.id === 'goal-select') {
    profile.goalId = event.target.value;
    save();
    render();
  }
});

window.addEventListener('hashchange', () => {
  if (location.hash === '#favorites') placeFilter = 'saved';
  render();
});

window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY || event.key === PROFILE_KEY) {
    state = read(STORAGE_KEY);
    profile = read(PROFILE_KEY);
    render();
  }
});

render();

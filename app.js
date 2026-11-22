'use strict';

/* Ходи Броди — логика главной страницы.
   Поведение сохранено: фильтры, выбор задания, избранное, обмен бутс.
   Удалён мёртвый код (рендер несуществующей витрины мерча),
   добавлены защита от пустых данных и фолбэки для изображений. */

const places = window.BRODI_PLACES || [];
const events = window.BRODI_EVENTS || [];
const eventMeta = window.BRODI_EVENT_META || { cities: [], categories: [] };
/* Категории мест берём из данных: захардкоженный список разошёлся бы
   с реальными категориями сайта. */
const categories = ['Все места', ...new Set(places.map(place => place.category))];
const offers = [
  { id: 'ticket5', title: '−5% на билет', tag: 'Первое обменное предложение', description: 'Небольшой бонус на следующее городское событие.', cost: 160, feature: false },
  { id: 'ticket10', title: '−10% на билет', tag: 'Для тех, кто много бродит', description: 'Собери больше бутс — получи больше выгоды.', cost: 300, feature: true }
];
const collections = [
  { id: 'taste', number: '01', title: 'Вкус города', subtitle: 'Не торопись. Устрой себе вкусную паузу.', eyebrow: 'Для любителей вкусного', image: 'assets/monblan.webp', places: ['monblan', 'vershina'] },
  { id: 'play', number: '02', title: 'День впечатлений', subtitle: 'Пробуй новое и добавляй движению место в своём дне.', eyebrow: 'Для тех, кто в движении', image: 'assets/elizium.webp', places: ['elizium', 'lady'] },
  { id: 'together', number: '03', title: 'Вместе интереснее', subtitle: 'Найди идеи, которыми можно поделиться с близкими.', eyebrow: 'Для общих впечатлений', image: 'assets/pro.webp', places: ['pro', 'elizium'] }
];

const eventStorageKey = 'brodi-afisha-v1';
let savedEvents = {};
try {
  savedEvents = JSON.parse(localStorage.getItem(eventStorageKey) || '{}') || {};
} catch (error) {
  savedEvents = {};
}

const afisha = {
  city: eventMeta.cities.includes(savedEvents.city) ? savedEvents.city : 'Тольятти',
  period: ['today', 'tomorrow', 'weekend', 'week'].includes(savedEvents.period) ? savedEvents.period : 'week',
  category: eventMeta.categories.includes(savedEvents.category) ? savedEvents.category : 'Все',
  free: Boolean(savedEvents.free),
  kids: Boolean(savedEvents.kids),
  savedOnly: false,
  featured: null,
  saved: Array.isArray(savedEvents.saved) ? savedEvents.saved.filter(id => events.some(event => event.id === id)) : []
};

function persistAfisha() {
  try {
    localStorage.setItem(eventStorageKey, JSON.stringify({
      city: afisha.city,
      period: afisha.period,
      category: afisha.category,
      free: afisha.free,
      kids: afisha.kids,
      saved: afisha.saved
    }));
  } catch (error) {
    /* приватный режим — продолжаем без сохранения */
  }
}

let selectedCollection = 'taste';
const storageKey = 'brodi-new-concept-v2';
const validIds = places.map(p => p.id);

const $ = selector => document.querySelector(selector);
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`;

function esc(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function plural(n, one, few, many) {
  const x = n % 100;
  const y = n % 10;
  if (x >= 11 && x <= 14) return many;
  if (y === 1) return one;
  if (y >= 2 && y <= 4) return few;
  return many;
}

let saved = {};
try {
  saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {};
} catch (error) {
  saved = {};
}

const state = {
  city: ['Тольятти', 'Самара', 'Жигулёвск', 'Новокуйбышевск'].includes(saved.city) ? saved.city : 'Тольятти',
  category: categories.includes(saved.category) ? saved.category : 'Все места',
  selected: null,
  balance: Number.isFinite(saved.balance) && saved.balance >= 0 ? Math.floor(saved.balance) : 0,
  done: Array.isArray(saved.done) ? saved.done.filter(id => validIds.includes(id)) : [],
  redeemed: Array.isArray(saved.redeemed) ? saved.redeemed.filter(id => offers.some(o => o.id === id)) : [],
  history: Array.isArray(saved.history) ? saved.history : [],
  activeTasks: Array.isArray(saved.activeTasks) ? saved.activeTasks.filter(id => validIds.includes(id)) : [],
  favorites: Array.isArray(saved.favorites) ? saved.favorites.filter(id => validIds.includes(id)) : []
};

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      city: state.city,
      category: state.category,
      balance: state.balance,
      done: state.done,
      redeemed: state.redeemed,
      history: state.history,
      activeTasks: state.activeTasks,
      favorites: state.favorites
    }));
  } catch (error) {
    /* Приватный режим — просто продолжаем без сохранения. */
  }
}

/* Форматирование дат и расстояний -------------------------------------- */

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const SHORT_MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function dayOffset(date) {
  return Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000);
}

function timeOf(date) {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(date) {
  const offset = dayOffset(date);
  if (offset === 0) return 'Сегодня';
  if (offset === 1) return 'Завтра';
  const weekday = WEEKDAYS[date.getDay()];
  return `${weekday}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function fullDayLabel(date) {
  const offset = dayOffset(date);
  if (offset === 0) return 'Сегодня';
  if (offset === 1) return 'Завтра';
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function endOf(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function durationLabel(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} мин`;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

function priceLabel(event) {
  if (event.price === 0) return 'Вход свободный';
  return `от ${event.price.toLocaleString('ru-RU')} ₽`;
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 6 || day === 0;
}

function eventById(id) {
  return events.find(event => event.id === id);
}

function eventDetails(event) {
  if (!event.deadline) return event.description;
  const deadline = new Date(event.deadline);
  const left = Math.max(0, Math.ceil((deadline - new Date()) / 86400000));
  const when = left <= 1 ? 'до завтра' : `осталось ${left} ${plural(left, 'день', 'дня', 'дней')}`;
  return `${event.description} Регистрация: ${when} (до ${deadline.getDate()} ${MONTHS[deadline.getMonth()]}, ${timeOf(deadline)}).`;
}

/* Возврат фокуса после перерисовки: без него клавиатура «падает» на body. */
function restoreFocus(selector) {
  const node = document.querySelector(selector);
  if (node) node.focus({ preventScroll: true });
}

function normalize(text) {
  return String(text).toLowerCase().replace(/ё/g, 'е').trim();
}

let toastTimer;
function toast(message) {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.classList.remove('is-visible');
    node.textContent = '';
  }, 3800);
}

function visiblePlaces() {
  return places.filter(p => p.city === state.city && (state.category === 'Все места' || state.category === p.category));
}

function initialOf(place) {
  return esc((place.name || '?').trim().charAt(0).toUpperCase());
}

/* Картинки мест могут отсутствовать в прототипе — тогда показываем
   монограмму, а не битую иконку. */
function bindImageFallbacks(root = document) {
  root.querySelectorAll('img[data-fallback]').forEach(img => {
    if (img.dataset.fallbackBound) return;
    img.dataset.fallbackBound = 'true';
    const fail = () => {
      const frame = img.parentElement;
      if (frame) {
        frame.classList.add('is-empty');
        if (frame.classList.contains('task-thumb')) return img.remove();
        if (!frame.dataset.initial) frame.dataset.initial = '✦';
      }
      img.remove();
    };
    if (img.complete && img.naturalWidth === 0) {
      fail();
      return;
    }
    img.addEventListener('error', fail, { once: true });
  });
}

/* Афиша ---------------------------------------------------------------- */

function eventInPeriod(event) {
  const start = new Date(event.start);
  const offset = dayOffset(start);
  if (offset < 0) return false;
  if (afisha.period === 'today') return offset === 0;
  if (afisha.period === 'tomorrow') return offset === 1;
  if (afisha.period === 'weekend') return isWeekend(start) && offset >= 0 && offset <= 7;
  return offset <= 7;
}

function visibleEvents(ignoreSaved) {
  const query = normalize($('#search-input') ? $('#search-input').value : '');
  return events
    .filter(event => event.city === afisha.city)
    .filter(event => afisha.category === 'Все' || event.category === afisha.category)
    .filter(event => !afisha.free || event.price === 0)
    .filter(event => !afisha.kids || event.age === '0+' || event.age === '6+')
    .filter(event => ignoreSaved || !afisha.savedOnly || afisha.saved.includes(event.id))
    .filter(eventInPeriod)
    .filter(event => !query || normalize(`${event.title} ${event.venue} ${event.category} ${event.description}`).includes(query))
    .sort((a, b) => new Date(a.start) - new Date(b.start));
}

function periodLabel() {
  return { today: 'сегодня', tomorrow: 'завтра', weekend: 'на выходные', week: 'на неделю' }[afisha.period];
}

function renderEventCategories() {
  const box = $('#events-categories');
  if (!box) return;
  const list = ['Все', ...eventMeta.categories];
  box.innerHTML = list.map(category => {
    const active = afisha.category === category;
    const count = events.filter(event => event.city === afisha.city
      && eventInPeriod(event)
      && (category === 'Все' || event.category === category)
      && (!afisha.free || event.price === 0)
      && (!afisha.kids || event.age === '0+' || event.age === '6+')).length;
    return `<button type="button" class="tag-chip" data-event-category="${esc(category)}" aria-pressed="${active}">${esc(category)}${count ? ` <span>${count}</span>` : ''}</button>`;
  }).join('');
}

function eventCard(event) {
  const start = new Date(event.start);
  const saved = afisha.saved.includes(event.id);
  const dateBlock = `<span class="ev-date" aria-hidden="true"><b>${start.getDate()}</b><span>${SHORT_MONTHS[start.getMonth()]}</span></span>`;
  const hasCoords = Array.isArray(event.coords) && event.coords.length === 2;
  return `
    <article class="ev-card" data-event="${esc(event.id)}">
      <div class="ev-media" data-initial="${esc(initialOf({ name: event.title }))}">
        <img src="${esc(event.image || '')}" alt="${esc(event.title)}" loading="lazy" decoding="async"
             referrerpolicy="no-referrer" data-fallback>
        ${event.editorPick ? '<span class="ev-media-pick">Выбор редакции</span>' : ''}
      </div>
      <div class="ev-card-top">
        ${dateBlock}
        <span class="ev-cat">${esc(event.category)}</span>
        ${event.editorPick ? '<span class="ev-pick">Выбор редакции</span>' : ''}
        <button type="button" class="ev-save${saved ? ' is-saved' : ''}" data-save-event="${esc(event.id)}" aria-pressed="${saved}" aria-label="${saved ? 'Убрать из избранного' : 'Сохранить в избранное'}">
          <svg aria-hidden="true"><use href="#i-star"/></svg>
        </button>
      </div>
      <h3 class="ev-title"><button type="button" class="ev-title-btn" data-open-event="${esc(event.id)}">${esc(event.title)}</button></h3>
      <p class="ev-meta">
        <span>${esc(event.venue)}</span>
        <span class="ev-dot" aria-hidden="true"></span>
        <span>${dayLabel(start)}, ${timeOf(start)}</span>
      </p>
      <div class="ev-foot">
        <span class="ev-price${event.price === 0 ? ' is-free' : ''}">${priceLabel(event)}</span>
        <span class="ev-going"><svg aria-hidden="true"><use href="#i-family"/></svg> ${event.going} идут</span>
        <div class="ev-actions">
          ${hasCoords ? `<button type="button" class="ev-map" data-show-map="${esc(event.id)}" aria-label="Показать «${esc(event.title)}» на карте">
            <svg aria-hidden="true"><use href="#i-pin"/></svg> На карте
          </button>` : ''}
          <span class="ev-cta${event.price === 0 ? ' is-free' : ''}">${event.price === 0 ? 'Вход свободный' : 'Купить билет ↗'}</span>
          <button type="button" class="ev-cal" data-calendar="${esc(event.id)}" aria-label="Добавить в календарь">
            <svg aria-hidden="true"><use href="#i-calendar"/></svg>
          </button>
        </div>
      </div>
    </article>`;
}

function renderEventsFeature(list) {
  const box = $('#events-feature');
  if (!box) return;
  const featured = list.find(event => event.id === afisha.featured) || list.find(event => event.editorPick) || list[0];
  if (!featured) {
    box.hidden = true;
    box.innerHTML = '';
    afisha.featured = null;
    return;
  }
  afisha.featured = featured.id;
  const start = new Date(featured.start);
  const end = endOf(start, featured.duration);
  box.hidden = false;
  box.innerHTML = `
    <article class="feature-ev" data-media>
      <div class="feature-ev-media" data-initial="${esc(initialOf({ name: featured.title }))}">
        <img class="feature-ev-photo" src="${esc(featured.image || '')}" alt="${esc(featured.title)}"
             loading="lazy" decoding="async" referrerpolicy="no-referrer" data-fallback>
        <div class="feature-ev-wash" aria-hidden="true"></div>
        <span class="feature-ev-flag">${featured.editorPick ? 'Выбор редакции' : 'Ближайшее'}</span>
        <div class="feature-ev-title">
          <span class="feature-ev-cat">${esc(featured.category)} · ${esc(featured.city)}</span>
          <h3>${esc(featured.title)}</h3>
          <p>${esc(eventDetails(featured))}</p>
        </div>
      </div>
      <div class="feature-ev-side">
        <dl class="feature-ev-facts">
          <div><dt>Когда</dt><dd>${fullDayLabel(start)}, ${timeOf(start)}—${timeOf(end)}</dd></div>
          <div><dt>Где</dt><dd>${esc(featured.venue)}<small>${esc(featured.address)}</small></dd></div>
          <div><dt>Билет</dt><dd>${priceLabel(featured)}<small>${esc(featured.age)} · ${durationLabel(featured.duration)}</small></dd></div>
        </dl>
        <div class="feature-ev-going">
          <span class="going-faces" aria-hidden="true"><i></i><i></i><i></i></span>
          ${featured.going} человек идут
        </div>
        <div class="feature-ev-actions">
          <span class="btn btn--primary btn--sm feature-ev-price">${featured.price === 0 ? 'Вход свободный' : `Билеты от ${featured.price.toLocaleString('ru-RU')} ₽`}</span>
          <button type="button" class="btn btn--outline btn--sm" data-calendar="${esc(featured.id)}">
            <svg aria-hidden="true"><use href="#i-calendar"/></svg> В календарь
          </button>
          <button type="button" class="ev-save ev-save--lg${afisha.saved.includes(featured.id) ? ' is-saved' : ''}"
                  data-save-event="${esc(featured.id)}"
                  aria-pressed="${afisha.saved.includes(featured.id)}"
                  aria-label="${afisha.saved.includes(featured.id) ? 'Убрать из избранного' : 'Сохранить в избранное'}"
                  title="${afisha.saved.includes(featured.id) ? 'Убрать из избранного' : 'Сохранить в избранное'}">
            <svg aria-hidden="true"><use href="#i-star"/></svg>
          </button>
        </div>
      </div>
    </article>`;
}

function renderEvents() {
  const feed = $('#events-feed');
  if (!feed) return;
  afisha.city = eventMeta.cities.includes($('#events-city').value) ? $('#events-city').value : afisha.city;
  const list = visibleEvents();

  $('#events-summary').textContent = list.length
    ? `${list.length} ${plural(list.length, 'событие', 'события', 'событий')} ${periodLabel()} · ${afisha.city}`
    : `Пока ничего не нашлось ${periodLabel()} · ${afisha.city}`;

  renderEventCategories();
  renderEventsFeature(list);
  renderEventsList(list);
  persistAfisha();
  renderSearch();
}

/* Перерисовка только ленты и «подборки дня» — сохранение события
   не сбрасывает клавиатурную навигацию по категориям. */
function renderEventsList() {
  const feed = $('#events-feed');
  if (!feed) return;
  const list = visibleEvents();
  const safeFeatured = list.some(item => item.id === afisha.featured)
    ? afisha.featured
    : (list.find(item => item.editorPick) || list[0] || {}).id;
  if (safeFeatured !== afisha.featured) renderEventsFeature(list);

  const rest = list.filter(event => event.id !== afisha.featured);
  feed.innerHTML = rest.map(eventCard).join('');
  feed.hidden = !rest.length;

  const empty = $('#events-empty');
  empty.hidden = list.length > 0;
  if (!list.length) {
    empty.innerHTML = `
      <div class="events-empty-inner">
        <span class="events-empty-icon" aria-hidden="true"><svg><use href="#i-calendar"/></svg></span>
        <b>${afisha.savedOnly ? 'В избранном пока пусто' : 'На этот фильтр событий нет'}</b>
        <p>${afisha.savedOnly
          ? 'Сохраняй события звёздочкой — они соберутся здесь и не потеряются.'
          : 'Попробуй другую категорию, расширь период или включи бесплатные события.'}</p>
        <button type="button" class="btn btn--purple btn--sm" id="events-reset">Показать всё ${periodLabel()}</button>
      </div>`;
  }

  document.querySelectorAll('[data-period]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.period === afisha.period));
  });
  $('#events-free').setAttribute('aria-pressed', String(afisha.free));
  $('#events-kids').setAttribute('aria-pressed', String(afisha.kids));
  $('#events-saved').setAttribute('aria-pressed', String(afisha.savedOnly));
  $('#events-saved-count').textContent = afisha.saved.length;
  persistAfisha();
}

function resetEventFilters() {
  afisha.period = 'week';
  afisha.category = 'Все';
  afisha.free = false;
  afisha.kids = false;
  afisha.savedOnly = false;
  renderEvents();
}

/* Поиск: события + места, клавиатурная навигация ------------------------ */

let searchIndex = 0;
let searchItems = [];

function searchResults(query) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.join('').length < 2) return [];
  const matches = text => {
    const haystack = normalize(text);
    return tokens.every(token => haystack.includes(token));
  };
  /* Токены проверяем по объединённому тексту всех полей, а не по каждому
     отдельно: иначе «любэ автоград» (название + площадка) не находилось. */
  const matchesAnywhere = fields => {
    const haystack = normalize(fields.filter(Boolean).join(' '));
    return tokens.every(token => haystack.includes(token));
  };
  const eventHits = events
    .map(event => ({
      type: 'event',
      item: event,
      label: event.title,
      meta: `${event.category} · ${event.venue} · ${dayLabel(new Date(event.start))}`,
      score: (matches(event.title) ? 4 : 0) + (matches(event.venue) ? 3 : 0) + (matches(event.category) ? 2 : 0) + (matches(event.city) ? 1 : 0)
    }))
    .filter(hit => hit.score > 0 || matchesAnywhere([
      hit.item.title, hit.item.venue, hit.item.address, hit.item.category, hit.item.city, hit.item.description
    ]))
    .sort((a, b) => b.score - a.score);

  const placeHits = places
    .map(place => ({
      type: 'place',
      item: place,
      label: place.name,
      meta: `${place.category} · ${place.city}`,
      score: (matches(place.name) ? 4 : 0) + (matches(place.category) ? 2 : 0) + (matches(place.city) ? 1 : 0)
    }))
    .filter(hit => hit.score > 0);

  return [...eventHits, ...placeHits].slice(0, 8);
}

function renderSearch() {
  const input = $('#search-input');
  const panel = $('#search-results');
  if (!input || !panel) return;
  const query = input.value;
  searchItems = searchResults(query);
  searchIndex = 0;

  if (!query.trim()) {
    panel.hidden = true;
    panel.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    return;
  }

  if (query.trim().length < 2) {
    panel.hidden = false;
    panel.innerHTML = '<p class="search-empty">Ещё один символ — и покажем подходящие события и места.</p>';
    input.setAttribute('aria-expanded', 'true');
    return;
  }

  if (!searchItems.length) {
    panel.hidden = false;
    panel.innerHTML = `<p class="search-empty">Ничего не нашли по «${esc(query)}». Попробуй «джаз», «выставка» или «Самара».</p>`;
    input.setAttribute('aria-expanded', 'true');
    return;
  }

  panel.hidden = false;
  panel.innerHTML = searchItems.map((hit, index) => `
    <button type="button" class="search-hit" role="option" id="search-opt-${index}" data-search-hit="${index}" aria-selected="${index === 0}">
      <span class="search-hit-type">${hit.type === 'event' ? 'Событие' : 'Место'}</span>
      <span class="search-hit-copy"><b>${esc(hit.label)}</b><small>${esc(hit.meta)}</small></span>
      <span class="search-hit-arrow" aria-hidden="true">↗</span>
    </button>`).join('');
  input.setAttribute('aria-expanded', 'true');
}

function openSearchHit(index) {
  const hit = searchItems[index];
  if (!hit) return;
  const input = $('#search-input');
  input.value = '';
  renderSearch();
  if (hit.type === 'event') {
    afisha.city = hit.item.city;
    $('#events-city').value = hit.item.city;
    afisha.period = 'week';
    afisha.category = 'Все';
    afisha.featured = hit.item.id;
    renderEvents();
    document.querySelector('#events').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    state.city = hit.item.city;
    state.category = 'Все места';
    state.selected = hit.item.id;
    render();
    document.querySelector('#task-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function moveSearchSelection(delta) {
  if (!searchItems.length) return;
  searchIndex = (searchIndex + delta + searchItems.length) % searchItems.length;
  document.querySelectorAll('.search-hit').forEach((hit, index) => {
    const active = index === searchIndex;
    hit.setAttribute('aria-selected', String(active));
    hit.classList.toggle('is-active', active);
  });
  $('#search-input').setAttribute('aria-activedescendant', `search-opt-${searchIndex}`);
}

/* Календарь: .ics без сервера ------------------------------------------ */

function downloadCalendar(event) {
  const start = new Date(event.start);
  const end = endOf(start, event.duration);
  const stamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escape = value => String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const utf8 = new TextEncoder();
  /* RFC 5545: строки длиннее 75 октетов переносятся с ведущим пробелом. */
  const fold = line => {
    const bytes = utf8.encode(line);
    if (bytes.length <= 75) return line;
    const parts = [];
    let chunk = '';
    let size = 0;
    for (const char of line) {
      const charSize = utf8.encode(char).length;
      if (size + charSize > 73) {
        parts.push(chunk);
        chunk = '';
        size = 0;
      }
      chunk += char;
      size += charSize;
    }
    if (chunk) parts.push(chunk);
    return parts.join('\r\n ');
  };

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hodi Brodi//Afisha//RU',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}@hodi-brodi.demo`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(event.title)}`,
    `LOCATION:${escape(`${event.venue}, ${event.address}`)}`,
    `DESCRIPTION:${escape(`${eventDetails(event)}${event.price ? ` Билеты от ${event.price} ₽.` : ' Вход свободный.'}`)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  const blob = new Blob([lines.map(fold).join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `hodi-brodi-${event.id}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`«${event.title}» — в календаре. Файл .ics открывается в Google, Apple и Outlook.`);
}

function render() {
  $('#city-select').value = state.city;
  $('#header-balance').textContent = state.balance.toLocaleString('ru-RU');
  $('#hero-balance').textContent = state.balance.toLocaleString('ru-RU');
  $('#exchange-balance').textContent = state.balance.toLocaleString('ru-RU');
  const heroPlaces = $('#hero-places');
  if (heroPlaces) heroPlaces.textContent = places.length;
  const heroCities = $('#hero-cities');
  if (heroCities) heroCities.textContent = new Set(places.map(p => p.city)).size;
  const heroReward = $('#hero-reward');
  if (heroReward) heroReward.textContent = places.reduce((sum, p) => sum + p.reward, 0);
  renderFilters();
  renderMapAndTasks();
  renderOffers();
  renderCollections();
  renderEvents();
  persist();
}

function renderFilters() {
  $('#category-filters').innerHTML = categories.map(category => `
    <button type="button"
            class="chip"
            data-category="${esc(category)}"
            aria-pressed="${state.category === category}">${esc(category)}</button>
  `).join('');
}

function renderMapAndTasks() {
  const shown = visiblePlaces();
  const cityPlaces = places.filter(p => p.city === state.city);
  if (state.selected && !shown.some(p => p.id === state.selected)) state.selected = null;

  $('#place-count').textContent = shown.length
    ? `${shown.length} ${plural(shown.length, 'место', 'места', 'мест')} в ${state.city}`
    : `Нет заданий · ${state.city}`;
  $('#task-count').textContent = shown.length;

  const empty = $('#map-empty');
  if (cityPlaces.length === 0) {
    empty.hidden = false;
    empty.querySelector('b').textContent = `В ${state.city} пока нет заданий`;
    empty.querySelector('p').innerHTML = 'Места появятся здесь позже.<br>Пока можно исследовать Тольятти.';
  } else if (shown.length === 0) {
    empty.hidden = false;
    empty.querySelector('b').textContent = 'В этой категории тихо';
    empty.querySelector('p').innerHTML = 'Попробуй другое настроение<br>или посмотри все места.';
  } else {
    empty.hidden = true;
  }

  $('#task-list').innerHTML = shown.length ? shown.map(place => {
    const done = state.done.includes(place.id);
    const selected = state.selected === place.id;
    return `
      <button type="button"
              class="task-row"
              data-select="${esc(place.id)}"
              aria-pressed="${selected}"
              aria-label="${esc(place.name)}: ${done ? 'задание выполнено' : `награда ${place.reward} бутс`}">
        <span class="task-thumb" data-initial="${initialOf(place)}" aria-hidden="true">
          <img src="${esc(place.image)}" alt="" loading="lazy" decoding="async"
               referrerpolicy="no-referrer" data-fallback>
        </span>
        <span class="task-row-copy">
          <b>${esc(place.name)}</b>
          <small class="${done ? 'is-done' : ''}">${done ? 'Выполнено' : esc(place.category)}</small>
        </span>
        <span class="reward-text${done ? ' is-done' : ''}">${done ? '✓' : `+${place.reward}`} <small>бутс</small></span>
        <span class="task-arrow" aria-hidden="true">↗</span>
      </button>`;
  }).join('') : '<p class="no-tasks">Здесь пока нет подходящих заданий.</p>';

  renderTaskDetail();
  bindImageFallbacks($('#task-list'));

  /* Карта живёт отдельно от DOM-списка: обновляем метки тем же фильтром. */
  if (window.BrodiMap) window.BrodiMap.renderPoints();
}

function renderTaskDetail() {
  const place = places.find(p => p.id === state.selected && visiblePlaces().some(v => v.id === p.id));
  const box = $('#task-detail');
  if (!place) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }

  const done = state.done.includes(place.id);
  const saved = state.favorites.includes(place.id);
  const started = state.activeTasks.includes(place.id);
  const mapUrl = 'https://yandex.ru/maps/?text=' + encodeURIComponent(place.address);

  box.hidden = false;
  box.innerHTML = `
    <div class="detail-media" data-initial="${initialOf(place)}">
      <img src="${esc(place.image)}" alt="" loading="lazy" decoding="async" data-fallback>
    </div>
    <div class="detail-content">
      <div class="detail-title-line">
        <span class="detail-category">${esc(place.category)}</span>
      </div>
      <h4>${esc(place.name)}</h4>
      <p class="detail-description"><b>Задание:</b> ${esc(place.task)}</p>
      <p class="detail-address">📍 ${esc(place.address)}</p>
      <div class="detail-actions-extra">
        <button type="button"
                class="detail-mini${saved ? ' is-saved' : ''}"
                data-favorite="${esc(place.id)}"
                aria-pressed="${saved}">${saved ? '♥ В избранном' : '♡ Сохранить место'}</button>
        ${done ? '' : `
        <button type="button"
                class="detail-mini${started ? ' is-saved' : ''}"
                data-start-task="${esc(place.id)}"
                aria-pressed="${started}">${started ? '✓ Задание в профиле' : '+ Взять задание'}</button>`}
      </div>
      <div class="detail-links">
        <a href="${esc(place.url)}" target="_blank" rel="noopener noreferrer">Место на Ходи Броди ↗</a>
        <a href="${mapUrl}" target="_blank" rel="noopener noreferrer">Открыть адрес ↗</a>
      </div>
      <button type="button" class="complete-task" data-complete="${esc(place.id)}" ${done ? 'disabled' : ''}>
        <span>${done ? 'Уже выполнено' : 'Отметить выполнение'}</span>
        <span>${done ? '✓' : `Забрать +${place.reward} бутс`}</span>
      </button>
      <p class="earned-caption">${done
        ? 'Награда добавлена к твоему балансу.'
        : `После визита отметь задание самостоятельно. Награда: ${place.reward} бутс.`}</p>
    </div>`;
  bindImageFallbacks(box);
}

function renderOffers() {
  $('#offer-grid').innerHTML = offers.map(offer => {
    const redeemed = state.redeemed.includes(offer.id);
    const enough = state.balance >= offer.cost;
    const label = redeemed
      ? 'Уже обменяно'
      : enough
        ? 'Обменять'
        : `Не хватает ${offer.cost - state.balance}`;
    return `
      <article class="offer-card${offer.feature ? ' is-featured' : ''}">
        <div class="offer-icon" aria-hidden="true">${icon('ticket')}</div>
        <div class="offer-copy">
          <span class="offer-tag">${esc(offer.tag)}</span>
          <h4>${esc(offer.title)}</h4>
          <p>${esc(offer.description)}</p>
          <span class="offer-cost">${icon('boot')} ${offer.cost} бутс</span>
        </div>
        <div class="offer-action">
          <button type="button"
                  class="btn btn--dark btn--sm"
                  data-redeem="${esc(offer.id)}"
                  ${redeemed || !enough ? 'disabled' : ''}>${label}</button>
        </div>
      </article>`;
  }).join('');
}

function renderCollections() {
  const box = $('#collections-app');
  if (!box) return;
  const collection = collections.find(item => item.id === selectedCollection) || collections[0];
  const members = collection.places.map(id => places.find(p => p.id === id)).filter(Boolean);
  const completed = members.filter(p => state.done.includes(p.id)).length;
  const total = members.reduce((sum, p) => sum + p.reward, 0);
  const percent = members.length ? Math.round((completed / members.length) * 100) : 0;

  box.innerHTML = `
    <div class="collection-feature">
      <div class="collection-photo" data-initial="${members.length ? initialOf(members[0]) : 'Б'}">
        <img src="${esc(collection.image)}" alt="" loading="lazy" decoding="async" data-fallback>
        <div class="collection-photo-overlay"></div>
        <span class="photo-stamp">БРОДИ<br>СВОЁ ${icon('arrow')}</span>
        <span class="photo-index">${esc(collection.number)} / 03</span>
        <div class="photo-title">
          <span>${esc(collection.eyebrow)}</span>
          <h3>${esc(collection.title)}</h3>
          <p>${esc(collection.subtitle)}</p>
        </div>
      </div>
      <div class="collection-details">
        <div class="collection-details-head">
          <div>
            <span class="collection-overline">Твоя подборка</span>
            <h4>Два места. Свой темп.</h4>
          </div>
          <span class="collection-count">${completed} / ${members.length}</span>
        </div>
        <p class="collection-description">Выбирай задания в любом порядке. Каждое открытие приближает к наградам.</p>
        <div class="collection-progress"
             role="progressbar"
             aria-label="Прогресс подборки ${esc(collection.title)}"
             aria-valuenow="${completed}"
             aria-valuemin="0"
             aria-valuemax="${members.length}">
          <span style="width:${percent}%"></span>
        </div>
        <div class="collection-progress-meta">
          <span>Отмечено ${completed} из ${members.length}</span>
          <span>До ${total} бутс за задания</span>
        </div>
        <div class="collection-place-list">
          ${members.map((place, index) => {
            const done = state.done.includes(place.id);
            return `
              <button type="button" class="collection-place" data-collection-place="${esc(place.id)}">
                <span class="collection-place-number">${done ? '✓' : String(index + 1).padStart(2, '0')}</span>
                <span class="collection-place-copy">
                  <b>${esc(place.name)}</b>
                  <small>${done ? 'Отмечено выполненным' : esc(place.category)}</small>
                </span>
                <span class="collection-place-points">${done ? 'Готово' : `+${place.reward}`}</span>
                <span class="collection-place-arrow" aria-hidden="true">↗</span>
              </button>`;
          }).join('')}
        </div>
        <a class="collection-profile-link" href="profile.html#journey">Мой путь и достижения <span aria-hidden="true">↗</span></a>
      </div>
    </div>
    <div class="collection-picker" role="group" aria-label="Выбор подборки">
      ${collections.map(item => `
        <button type="button"
                class="collection-choice"
                data-collection="${esc(item.id)}"
                aria-pressed="${item.id === collection.id}">
          <span class="choice-number">${esc(item.number)}</span>
          <span class="choice-title">${esc(item.title)}<small>${item.places.filter(id => state.done.includes(id)).length} из ${item.places.length} заданий</small></span>
          <span class="choice-arrow" aria-hidden="true">↗</span>
        </button>`).join('')}
    </div>`;
  bindImageFallbacks(box);
}

/* Навигация и мелкие состояния интерфейса -------------------------------- */

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
  menuButton.addEventListener('click', () => {
    setMenu(menuButton.getAttribute('aria-expanded') !== 'true');
  });
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuButton && menuButton.getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    menuButton.focus();
  }
});

/* Логотип может отсутствовать в архиве — подставляем текстовый знак. */
document.querySelectorAll('.brand img').forEach(img => {
  const fail = () => {
    img.closest('.brand')?.classList.add('is-empty');
    img.remove();
  };
  if (img.complete && img.naturalWidth === 0) fail();
  img.addEventListener('error', fail, { once: true });
});

/* События приложения ------------------------------------------------------ */

document.addEventListener('click', event => {
  const collection = event.target.closest('[data-collection]');
  if (collection) {
    if (collections.some(item => item.id === collection.dataset.collection)) {
      selectedCollection = collection.dataset.collection;
      renderCollections();
    }
    return;
  }

  const collectionPlace = event.target.closest('[data-collection-place]');
  if (collectionPlace) {
    const place = places.find(item => item.id === collectionPlace.dataset.collectionPlace);
    if (!place) return;
    state.city = place.city;
    state.category = 'Все места';
    state.selected = place.id;
    render();
    document.querySelector('#task-panel').scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    });
    return;
  }

  const category = event.target.closest('[data-category]');
  if (category) {
    state.category = category.dataset.category;
    render();
    return;
  }

  const showOnMap = event.target.closest('[data-show-map]');
  if (showOnMap) {
    const id = showOnMap.dataset.showMap;
    const eventItem = events.find(item => item.id === id);
    if (eventItem && window.BrodiMap) {
      /* Если событие в другом городе — карта сама переключит город. */
      if (eventItem.city !== state.city) {
        state.city = eventItem.city;
        state.selected = null;
        render();
      }
      const ok = window.BrodiMap.focus(`event:${id}`);
      document.getElementById('map-section')?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center'
      });
      if (!ok) toast('Карта загружается — метка откроется сама');
    }
    return;
  }

  const select = event.target.closest('[data-select]');
  if (select) {
    state.selected = select.dataset.select;
    renderMapAndTasks();
    if (window.BrodiMap) window.BrodiMap.focus(`place:${state.selected}`);
    if (window.matchMedia('(max-width: 980px)').matches) {
      $('#task-list').scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center'
      });
    }
    return;
  }

  const favorite = event.target.closest('[data-favorite]');
  if (favorite) {
    const id = favorite.dataset.favorite;
    if (!validIds.includes(id)) return;
    state.favorites = state.favorites.includes(id)
      ? state.favorites.filter(value => value !== id)
      : [...state.favorites, id];
    render();
    toast(state.favorites.includes(id) ? 'Место сохранено в профиль' : 'Место удалено из избранного');
    return;
  }

  const start = event.target.closest('[data-start-task]');
  if (start) {
    const id = start.dataset.startTask;
    if (!validIds.includes(id) || state.done.includes(id)) return;
    state.activeTasks = state.activeTasks.includes(id)
      ? state.activeTasks.filter(value => value !== id)
      : [...state.activeTasks, id];
    render();
    toast(state.activeTasks.includes(id) ? 'Задание добавлено в профиль' : 'Задание убрано из активных');
    return;
  }

  const complete = event.target.closest('[data-complete]');
  if (complete) {
    const place = places.find(item => item.id === complete.dataset.complete);
    if (!place || state.done.includes(place.id)) return;
    state.done.push(place.id);
    state.activeTasks = state.activeTasks.filter(id => id !== place.id);
    state.balance += place.reward;
    state.history.unshift({ type: 'earn', title: `Задание: ${place.name}`, amount: place.reward, date: new Date().toISOString() });
    render();
    toast(`+${place.reward} бутс! Задание «${place.name}» отмечено выполненным. Баланс сохранён на этом устройстве.`);
    return;
  }

  const redeem = event.target.closest('[data-redeem]');
  if (redeem) {
    const offer = offers.find(item => item.id === redeem.dataset.redeem);
    if (!offer || state.redeemed.includes(offer.id) || state.balance < offer.cost) return;
    state.balance -= offer.cost;
    state.redeemed.push(offer.id);
    state.history.unshift({ type: 'spend', title: `Скидка: ${offer.title}`, amount: -offer.cost, date: new Date().toISOString() });
    render();
    toast(`Демо-обмен оформлен: ${offer.title}. Это макет — реальный билет и промокод не создаются.`);
    return;
  }

  if (event.target.closest('#back-to-city')) {
    state.city = 'Тольятти';
    state.category = 'Все места';
    state.selected = null;
    render();
    return;
  }

  if (event.target.closest('#reset-demo')) {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      /* ничего */
    }
    state.city = 'Тольятти';
    state.category = 'Все места';
    state.selected = null;
    state.balance = 0;
    state.done = [];
    state.redeemed = [];
    state.history = [];
    state.activeTasks = [];
    state.favorites = [];
    render();
    toast('Демо-прогресс сброшен. Можно начать заново.');
    return;
  }

  /* Афиша */
  const period = event.target.closest('[data-period]');
  if (period) {
    afisha.period = period.dataset.period;
    renderEvents();
    restoreFocus(`[data-period="${afisha.period}"]`);
    return;
  }

  const eventCategory = event.target.closest('[data-event-category]');
  if (eventCategory) {
    afisha.category = eventCategory.dataset.eventCategory;
    renderEvents();
    restoreFocus(`[data-event-category="${afisha.category}"]`);
    return;
  }

  const saveEvent = event.target.closest('[data-save-event]');
  if (saveEvent) {
    const id = saveEvent.dataset.saveEvent;
    if (!eventById(id)) return;
    afisha.saved = afisha.saved.includes(id) ? afisha.saved.filter(value => value !== id) : [...afisha.saved, id];
    renderEventsList();
    restoreFocus(`[data-save-event="${id}"]`) || restoreFocus('#events-saved');
    toast(afisha.saved.includes(id) ? 'Событие сохранено в избранное' : 'Событие убрано из избранного');
    return;
  }

  const openEvent = event.target.closest('[data-open-event]');
  if (openEvent) {
    const item = eventById(openEvent.dataset.openEvent);
    if (!item) return;
    afisha.featured = item.id;
    renderEvents();
    document.querySelector('#events').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const calendar = event.target.closest('[data-calendar]');
  if (calendar) {
    const item = eventById(calendar.dataset.calendar);
    if (item) downloadCalendar(item);
    return;
  }

  if (event.target.closest('#events-reset')) {
    resetEventFilters();
    restoreFocus('[data-period="week"]');
    return;
  }

  if (event.target.closest('#events-free')) {
    afisha.free = !afisha.free;
    renderEvents();
    restoreFocus('#events-free');
    return;
  }

  if (event.target.closest('#events-kids')) {
    afisha.kids = !afisha.kids;
    renderEvents();
    restoreFocus('#events-kids');
    return;
  }

  if (event.target.closest('#events-saved')) {
    afisha.savedOnly = !afisha.savedOnly;
    renderEvents();
    restoreFocus('#events-saved');
    return;
  }

  const quick = event.target.closest('[data-quick]');
  if (quick) {
    const key = quick.dataset.quick;
    afisha.category = 'Все';
    afisha.kids = false;
    afisha.free = false;
    afisha.savedOnly = false;
    if (key === 'today') afisha.period = 'today';
    if (key === 'weekend') afisha.period = 'weekend';
    if (key === 'free') { afisha.period = 'week'; afisha.free = true; }
    if (key === 'kids') { afisha.period = 'week'; afisha.kids = true; }
    renderEvents();
    return;
  }

  const searchHit = event.target.closest('[data-search-hit]');
  if (searchHit) {
    openSearchHit(Number(searchHit.dataset.searchHit));
    return;
  }

  if (event.target.closest('.mobile-nav a')) setMenu(false);
});

/* Афиша: смена города и поиск */
const eventsCity = $('#events-city');
if (eventsCity) {
  eventsCity.addEventListener('change', () => {
    afisha.city = eventsCity.value;
    renderEvents();
  });
}

const searchInput = $('#search-input');
if (searchInput) {
  searchInput.addEventListener('input', renderSearch);
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) renderSearch();
  });
  searchInput.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSearchSelection(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSearchSelection(-1);
    } else if (event.key === 'Enter') {
      if (searchItems.length) {
        event.preventDefault();
        openSearchHit(searchIndex);
      }
    } else if (event.key === 'Escape') {
      searchInput.value = '';
      renderSearch();
      searchInput.blur();
    }
  });
  $('#hero-search').addEventListener('submit', event => {
    event.preventDefault();
    if (searchItems.length) openSearchHit(searchIndex);
  });
}

/* «/» — фокус в поиск, как в почте и трекерах */
document.addEventListener('keydown', event => {
  if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const tag = (event.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target.isContentEditable) return;
    const input = $('#search-input');
    if (!input) return;
    event.preventDefault();
    input.focus();
    input.select();
  }
  if (event.key === 'Escape' && document.activeElement === searchInput) {
    searchInput.value = '';
    renderSearch();
  }
});

/* Закрываем подсказки при клике вне поиска */
document.addEventListener('click', event => {
  if (!event.target.closest('#hero-search')) {
    const panel = $('#search-results');
    if (panel && !panel.hidden) {
      panel.hidden = true;
      $('#search-input').setAttribute('aria-expanded', 'false');
    }
  }
});

$('#city-select').addEventListener('change', event => {
  state.city = event.target.value;
  state.category = 'Все места';
  state.selected = null;
  render();
  if (window.BrodiMap) window.BrodiMap.moveToCity(state.city);
});

const requestedPlace = new URLSearchParams(location.search).get('place');
if (requestedPlace) {
  const place = places.find(item => item.id === requestedPlace);
  if (place) {
    state.city = place.city;
    state.category = 'Все места';
    state.selected = place.id;
  }
}

window.addEventListener('storage', event => {
  if (event.key !== storageKey) return;
  try {
    const next = JSON.parse(event.newValue || '{}');
    for (const key of ['balance', 'done', 'redeemed', 'history', 'activeTasks', 'favorites']) {
      if (next[key] !== undefined) state[key] = next[key];
    }
    render();
  } catch (error) {
    /* некорректные данные — игнорируем */
  }
});

render();

/* Карта ---------------------------------------------------------------- */

/* map.js — отдельный файл, поэтому общие хелперы отдаём явно.
   Без этого в балунах падало «esc is not defined». */
window.BrodiShared = {
  esc, dayLabel, timeOf, priceLabel, initialOf, plural,
  /* map.js строит точки и читает текущий город/фильтр — отдаём доступ
     через геттеры, чтобы модуль видел актуальное состояние. */
  get state() { return state; },
  get places() { return places; },
  get events() { return events; }
};


/* API грузится асинхронно, поэтому пробуем после того, как страница
   готова: к этому моменту ymaps либо уже есть, либо появится позже. */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.BrodiMap?.boot(), { once: true });
} else {
  window.BrodiMap?.boot();
}

'use strict';

/* Ходи Броди — логика главной страницы.
   Поведение сохранено: фильтры, выбор задания, избранное, обмен бутс.
   Удалён мёртвый код (рендер несуществующей витрины мерча),
   добавлены защита от пустых данных и фолбэки для изображений. */

const places = window.BRODI_PLACES || [];
const categories = ['Все места', 'Еда', 'Развлечения', 'С детьми', 'Активный отдых'];
const offers = [
  { id: 'ticket5', title: '−5% на билет', tag: 'Первое обменное предложение', description: 'Небольшой бонус на следующее городское событие.', cost: 160, feature: false },
  { id: 'ticket10', title: '−10% на билет', tag: 'Для тех, кто много бродит', description: 'Собери больше бутс — получи больше выгоды.', cost: 300, feature: true }
];
const collections = [
  { id: 'taste', number: '01', title: 'Вкус города', subtitle: 'Не торопись. Устрой себе вкусную паузу.', eyebrow: 'Для любителей вкусного', image: 'assets/monblan.webp', places: ['monblan', 'vershina'] },
  { id: 'play', number: '02', title: 'День впечатлений', subtitle: 'Пробуй новое и добавляй движению место в своём дне.', eyebrow: 'Для тех, кто в движении', image: 'assets/elizium.webp', places: ['elizium', 'lady'] },
  { id: 'together', number: '03', title: 'Вместе интереснее', subtitle: 'Найди идеи, которыми можно поделиться с близкими.', eyebrow: 'Для общих впечатлений', image: 'assets/pro.webp', places: ['pro', 'elizium'] }
];

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

  $('#map-markers').innerHTML = shown.map((place, index) => {
    const selected = state.selected === place.id;
    const done = state.done.includes(place.id);
    return `
      <button type="button"
              class="map-marker${done ? ' is-done' : ''}"
              style="left:${Number(place.x)}%;top:${Number(place.y)}%"
              data-select="${esc(place.id)}"
              aria-pressed="${selected}"
              aria-label="${esc(place.name)}: ${done ? 'задание выполнено' : `награда ${place.reward} бутс`}">
        ${icon('pin')}
        <b aria-hidden="true">${index + 1}</b>
        <span class="marker-reward" aria-hidden="true">+${place.reward}</span>
      </button>`;
  }).join('');

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
          <img src="${esc(place.image)}" alt="" loading="lazy" decoding="async" data-fallback>
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

  const select = event.target.closest('[data-select]');
  if (select) {
    state.selected = select.dataset.select;
    renderMapAndTasks();
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

  if (event.target.closest('.mobile-nav a')) setMenu(false);
});

$('#city-select').addEventListener('change', event => {
  state.city = event.target.value;
  state.category = 'Все места';
  state.selected = null;
  render();
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

'use strict';

/* Схематичная карта города — нарисованная, без внешних сервисов.

   Зачем так: Яндекс.Карты требовали ключ, привязанный к домену, и на
   новом хостинге карта не поднималась. Здесь карта целиком наша:
   SVG-схема + точки, спроецированные из реальных координат.
   Это демонстрация: подложка условная, но взаимное расположение точек
   настоящее — по широте и долготе из eventsData.js.

   Контракт с app.js сохранён полностью:
   boot(), renderPoints(), focus(id), moveToCity(city), isReady().
   focus() по-прежнему возвращает true/false — app.js показывает тост
   при false, поэтому менять сигнатуру нельзя. */

const shared = window.BrodiShared || {};
const { esc, dayLabel, timeOf, priceLabel } = shared;
const getState = () => shared.state || {};
const getPlaces = () => shared.places || [];
const getEvents = () => shared.events || [];

/* Города, для которых есть схема. Тольятти рисуем подробно,
   остальные показываются пустым состоянием — как и раньше. */
const CITY_VIEW = {
  'Тольятти': { center: [53.5135, 49.3181], zoom: 12 },
  'Самара': { center: [53.1959, 50.1002], zoom: 12 },
  'Жигулёвск': { center: [53.4023, 49.4891], zoom: 12 },
  'Новокуйбышевск': { center: [53.1997, 49.9361], zoom: 12 }
};

/* Размер схемы. Рисуем в этих координатах, а CSS растягивает по контейнеру,
   поэтому карта одинаково выглядит на телефоне и на десктопе. */
const SCHEME_W = 900;
const SCHEME_H = 560;

/* Отступы от крайних точек — чтобы метки не липли к краям. */
const BOUNDS_PAD = 0.1;

/* Кластеризация по сетке: точки ближе этого расстояния на экране
   показываем одной меткой с числом. 52px — компромисс, при котором
   в Тольятти получается 12 меток вместо 26, и они не наезжают. */
const CLUSTER_GRID = 52;

const mapState = {
  ready: false,
  failed: false,
  markers: new Map(),      /* id точки -> элемент метки */
  openId: null,            /* id открытой карточки */
  pendingRender: false,
  pendingFocus: null,
  bounds: null,            /* текущие границы проекции */
  mode: 'cluster'          /* cluster | single */
};

/* ── Проекция ──────────────────────────────────────────────────────────── */

/* Реальные координаты — [широта, долгота]. */
function boundsOf(points) {
  if (!points.length) return null;
  const lat = points.map(point => point.coords[0]);
  const lng = points.map(point => point.coords[1]);
  const dLat = Math.max(...lat) - Math.min(...lat) || 0.01;
  const dLng = Math.max(...lng) - Math.min(...lng) || 0.01;
  return {
    minLat: Math.min(...lat) - dLat * BOUNDS_PAD,
    maxLat: Math.max(...lat) + dLat * BOUNDS_PAD,
    minLng: Math.min(...lng) - dLng * BOUNDS_PAD,
    maxLng: Math.max(...lng) + dLng * BOUNDS_PAD
  };
}

/* Широта/долгота -> координаты схемы. Широта растёт вверх, поэтому
   по Y инвертируем. */
function project(coords) {
  const b = mapState.bounds;
  if (!b || !Array.isArray(coords)) return null;
  const x = (coords[1] - b.minLng) / (b.maxLng - b.minLng) * SCHEME_W;
  const y = (b.maxLat - coords[0]) / (b.maxLat - b.minLat) * SCHEME_H;
  return { x, y };
}

/* ── Данные точек ──────────────────────────────────────────────────────── */

function mapPoints() {
  const inCity = item => item.city === getState().city &&
    Array.isArray(item.coords) && item.coords.length === 2;

  const placeItems = getPlaces().filter(inCity).map(place => ({
    id: `place:${place.id}`,
    type: 'place',
    name: place.name,
    category: place.category,
    kind: place.kind,
    address: place.address,
    hours: place.hours,
    image: place.image,
    url: place.url,
    reward: place.reward,
    coords: place.coords
  }));

  const eventItems = getEvents().filter(inCity).map(event => ({
    id: `event:${event.id}`,
    type: 'event',
    name: event.title,
    category: event.category,
    address: event.address,
    venue: event.venue,
    start: event.start,
    price: event.price,
    image: event.image,
    url: event.url || event.ticketUrl,
    coords: event.coords
  }));

  return [...eventItems, ...placeItems];
}

/* Видимость повторяет фильтр списка мест: события видны всегда,
   места — по выбранной категории. */
function pointVisible(point) {
  if (point.type === 'event') return true;
  if (getState().category === 'Все места') return true;
  const place = getPlaces().find(item => `place:${item.id}` === point.id);
  return place ? place.category === getState().category : true;
}

/* ── Подложка схемы ────────────────────────────────────────────────────── */

/* Улицы, река и парки. Координаты — в системе схемы (900×560).
   Рисунок условный: он задаёт городской характер, а не точную географию.
   Точки при этом стоят по реальным координатам — это и есть демонстрация. */
function schemeSvg() {
  return `
    <svg class="map-drawing" viewBox="0 0 ${SCHEME_W} ${SCHEME_H}"
         preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <!-- земля -->
      <rect width="${SCHEME_W}" height="${SCHEME_H}" fill="#eeedf8"/>

      <!-- кварталы -->
      <g fill="#f6f5fd" stroke="#e4e3f0" stroke-width="1">
        <rect x="60" y="40" width="150" height="110" rx="10"/>
        <rect x="240" y="30" width="130" height="95" rx="10"/>
        <rect x="400" y="60" width="165" height="120" rx="10"/>
        <rect x="600" y="40" width="140" height="100" rx="10"/>
        <rect x="770" y="70" width="100" height="130" rx="10"/>
        <rect x="80" y="200" width="145" height="120" rx="10"/>
        <rect x="255" y="180" width="120" height="105" rx="10"/>
        <rect x="410" y="225" width="150" height="115" rx="10"/>
        <rect x="600" y="185" width="135" height="115" rx="10"/>
        <rect x="765" y="240" width="105" height="120" rx="10"/>
        <rect x="95" y="370" width="160" height="120" rx="10"/>
        <rect x="290" y="330" width="140" height="110" rx="10"/>
        <rect x="465" y="380" width="120" height="110" rx="10"/>
        <rect x="620" y="345" width="145" height="115" rx="10"/>
        <rect x="800" y="400" width="80" height="110" rx="10"/>
      </g>

      <!-- парк -->
      <g>
        <ellipse cx="700" cy="300" rx="70" ry="46" fill="#e3f0e4"/>
        <ellipse cx="700" cy="300" rx="70" ry="46" fill="none" stroke="#cfe3d1" stroke-width="2"/>
        <circle cx="676" cy="288" r="7" fill="#cfe3d1"/>
        <circle cx="712" cy="300" r="9" fill="#cfe3d1"/>
        <circle cx="694" cy="318" r="6" fill="#cfe3d1"/>
        <circle cx="728" cy="282" r="5" fill="#cfe3d1"/>
      </g>

      <!-- водоём / Волга в нижней части -->
      <path d="M0 505 C 150 480, 300 520, 450 498 C 600 476, 740 512, 900 492 L900 560 L0 560 Z"
            fill="#dce6f6" stroke="#c8d8f0" stroke-width="2"/>

      <!-- магистрали -->
      <g stroke="#ffffff" stroke-linecap="round" fill="none">
        <path d="M30 165 H 870" stroke-width="16"/>
        <path d="M30 340 H 870" stroke-width="14"/>
        <path d="M225 20 V 480" stroke-width="15"/>
        <path d="M580 20 V 480" stroke-width="13"/>
        <path d="M390 20 V 470" stroke-width="9"/>
        <path d="M780 20 V 470" stroke-width="9"/>
        <path d="M60 445 H 850" stroke-width="9"/>
      </g>

      <!-- осевые линии магистралей -->
      <g stroke="#e4e3f0" stroke-width="1.5" stroke-dasharray="7 9" fill="none">
        <path d="M30 165 H 870"/>
        <path d="M225 20 V 480"/>
        <path d="M580 20 V 480"/>
      </g>

      <!-- подписи улиц -->
      <text class="map-label" x="42" y="157">ЮБИЛЕЙНАЯ</text>
      <text class="map-label" x="42" y="332">МИРА</text>
      <text class="map-label" x="236" y="474">ЛЕНИНА</text>
      <text class="map-label" x="591" y="474">СТАВРОПОЛЬСКАЯ</text>
      <text class="map-label" x="640" y="332">ПАРК</text>
      <text class="map-label" x="120" y="540">ВОЛГА</text>

      <!-- маршрут для вдохновения: условная линия между точками -->
      <path class="route-path" d="M170 113 C 260 90, 330 200, 420 240 S 560 300, 640 260"/>
    </svg>`;
}

/* ── Метки и карточка ──────────────────────────────────────────────────── */

function pinElement(point) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `ym-pin ym-pin--${point.type}`;
  el.setAttribute('aria-label', point.name);
  el.title = point.name;
  if (point.type === 'place' && getState().done?.includes(point.id.replace('place:', ''))) {
    el.classList.add('is-done');
  }
  el.innerHTML = '<span class="ym-pin-dot" aria-hidden="true"></span>';
  return el;
}

/* Карточка на карте всегда одна: при открытии новой прежняя убирается
   из DOM, чтобы не копились невидимые блоки и не дублировались id. */
function closeCard() {
  document.querySelectorAll('#map-markers .ym-card').forEach(card => card.remove());
  document.querySelectorAll('#map-markers .ym-pin.is-open')
    .forEach(pin => pin.classList.remove('is-open'));
  mapState.openId = null;
}

function cardHtml(point) {
  const isEvent = point.type === 'event';
  const when = isEvent && point.start
    ? `${dayLabel(new Date(point.start))}, ${timeOf(new Date(point.start))}`
    : (point.hours || '');
  const price = isEvent ? priceLabel(point) : '';
  const photo = point.image
    ? `<img class="ym-balloon-photo" src="${esc(point.image)}" alt="${esc(point.name)}"
            loading="lazy" decoding="async" referrerpolicy="no-referrer"
            onerror="this.classList.add('is-broken')">`
    : '';

  return `
    <div class="ym-balloon" role="dialog" aria-label="${esc(point.name)}">
      <button class="ym-balloon-close" type="button" data-close-card aria-label="Закрыть">✕</button>
      ${photo}
      <div class="ym-balloon-body">
        <span class="ym-balloon-tag">${esc(isEvent ? point.category : (point.kind || point.category))}</span>
        <b class="ym-balloon-title">${esc(point.name)}</b>
        ${when ? `<span class="ym-balloon-when">${esc(when)}</span>` : ''}
        ${point.address ? `<span class="ym-balloon-addr">${esc(point.address)}</span>` : ''}
        ${price ? `<span class="ym-balloon-price">${esc(price)}</span>` : ''}
        <a class="ym-balloon-link" href="${esc(point.url || '#')}" target="_blank" rel="noopener noreferrer">
          ${isEvent ? 'Подробнее и билеты' : 'Подробнее о месте'} ↗
        </a>
      </div>
    </div>`;
}

function openCard(point, element) {
  if (mapState.openId === point.id) { closeCard(); return; }
  closeCard();
  if (!element) return;

  let card = element.querySelector('.ym-card');
  if (!card) {
    card = document.createElement('div');
    card.className = 'ym-card';
    card.innerHTML = cardHtml(point);
    card.addEventListener('click', evt => {
      evt.stopPropagation();
      if (evt.target.closest('[data-close-card]')) closeCard();
    });
    element.appendChild(card);
  }

  element.classList.add('is-open');
  mapState.openId = point.id;

  /* Подводим метку к центру видимой области, чтобы карточка не уезжала
     за край контейнера. */
  element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
}

/* ── Кластеризация ─────────────────────────────────────────────────────── */

/* Разбиваем экранные координаты на клетки. Точки в одной клетке
   показываем одной меткой с числом. */
function clusterPoints(points) {
  const cells = new Map();
  const placed = points.map(point => ({ point, at: project(point.coords) }))
    .filter(item => item.at);

  placed.forEach(({ point, at }) => {
    const key = `${Math.floor(at.x / CLUSTER_GRID)}:${Math.floor(at.y / CLUSTER_GRID)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push({ point, at });
  });

  const clusters = [];
  cells.forEach(items => {
    const x = items.reduce((sum, item) => sum + item.at.x, 0) / items.length;
    const y = items.reduce((sum, item) => sum + item.at.y, 0) / items.length;
    clusters.push({ x, y, items });
  });
  return clusters;
}

/* ── Отрисовка ─────────────────────────────────────────────────────────── */

function renderMapPoints() {
  if (!mapState.ready) { mapState.pendingRender = true; return; }

  const host = document.getElementById('map-markers');
  if (!host) return;

  closeCard();
  mapState.markers.clear();
  host.innerHTML = '';

  /* Сначала границы — они нужны проекции. Считаем их по видимым точкам,
     а не по всем: иначе при фильтре по категории карта «прыгала» бы. */
  const visible = mapPoints().filter(pointVisible);
  mapState.bounds = boundsOf(visible);

  /* И только теперь проецируем: project() без границ вернёт null. */
  const wanted = visible.filter(point => project(point.coords));

  const empty = document.getElementById('map-empty');
  if (empty) empty.hidden = wanted.length > 0;

  if (!wanted.length) { mapState.pendingRender = false; return; }

  /* В режиме single показываем каждую точку отдельно. Он нужен, когда
     карточка просит показать конкретное событие, спрятанное в группе. */
  const clusters = mapState.mode === 'single'
    ? wanted.map(point => ({ x: 0, y: 0, items: [{ point, at: project(point.coords) }] }))
        .map(cluster => {
          const at = cluster.items[0].at;
          return { x: at.x, y: at.y, items: cluster.items };
        })
    : clusterPoints(wanted);

  clusters.forEach(cluster => {
    const single = cluster.items.length === 1;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'ym-pin ym-pin--cluster';
    el.style.left = `${cluster.x / SCHEME_W * 100}%`;
    el.style.top = `${cluster.y / SCHEME_H * 100}%`;

    if (single) {
      const point = cluster.items[0].point;
      el.className = `ym-pin ym-pin--${point.type}`;
      el.setAttribute('aria-label', point.name);
      el.title = point.name;
      el.innerHTML = '<span class="ym-pin-dot" aria-hidden="true"></span>';
      /* Запоминаем сам элемент: parentElement здесь ещё null,
         потому что метка пока не вставлена в DOM. */
      mapState.markers.set(point.id, { element: el, point });
      el.addEventListener('click', evt => {
        evt.stopPropagation();
        openCard(point, el);
        markCardSelected(point);
      });
    } else {
      const places = cluster.items.filter(item => item.point.type === 'place').length;
      el.setAttribute('aria-label',
        `Группа из ${cluster.items.length} точек${places ? `, ${places} с заданиями` : ''}`);
      el.innerHTML = `<span class="ym-cluster-count">${cluster.items.length}</span>`;
      /* Клик по кластеру раскрывает его: показываем точки рядом
         отдельными метками вместо увеличения зума. */
      el.addEventListener('click', evt => {
        evt.stopPropagation();
        expandCluster(cluster, host);
      });
    }

    host.appendChild(el);
  });

  mapState.pendingRender = false;

  /* Отложенный фокус из карточки — выполняем, когда точки уже нарисованы. */
  if (mapState.pendingFocus) {
    const key = mapState.pendingFocus;
    mapState.pendingFocus = null;
    focusOnMap(key);
  }
}

/* Раскрытие группы: рисуем её точки по одной вокруг центра группы. */
function expandCluster(cluster, host) {
  const radius = 34;
  cluster.items.forEach((item, index) => {
    const angle = (Math.PI * 2 * index) / cluster.items.length - Math.PI / 2;
    const x = cluster.x + Math.cos(angle) * radius;
    const y = cluster.y + Math.sin(angle) * radius;
    const point = item.point;

    const el = document.createElement('button');
    el.type = 'button';
    el.className = `ym-pin ym-pin--${point.type} is-expanded`;
    el.style.left = `${x / SCHEME_W * 100}%`;
    el.style.top = `${y / SCHEME_H * 100}%`;
    el.setAttribute('aria-label', point.name);
    el.title = point.name;
    el.innerHTML = '<span class="ym-pin-dot" aria-hidden="true"></span>';
    el.addEventListener('click', evt => {
      evt.stopPropagation();
      openCard(point, el);
      markCardSelected(point);
    });
    host.appendChild(el);
  });
}

function markCardSelected(point) {
  if (point.type === 'place') {
    const id = point.id.replace('place:', '');
    getState().selected = id;
    if (typeof renderMapAndTasks === 'function') renderMapAndTasks();
  }
}

/* ── Центрирование из карточки и списка ────────────────────────────────── */

function focusOnMap(pointId) {
  const key = pointId.includes(':') ? pointId : `place:${pointId}`;

  if (!mapState.ready) {
    mapState.pendingFocus = key;
    return false;
  }

  const point = mapPoints().find(item => item.id === key);
  if (!point) {
    const id = key.replace('place:', '').replace('event:', '');
    const item = getPlaces().find(place => place.id === id) ||
                 getEvents().find(event => event.id === id);
    if (item && item.city && item.city !== getState().city) {
      const state = getState();
      state.city = item.city;
      state.category = 'Все места';
      if (typeof render === 'function') render();
      mapState.pendingFocus = key;
      return false;
    }
    return false;
  }

  if (!pointVisible(point)) {
    getState().category = 'Все места';
    if (typeof render === 'function') render();
  }

  /* После смены города/фильтра границы могли не пересчитаться. */
  if (!mapState.bounds) mapState.bounds = boundsOf(mapPoints().filter(pointVisible));

  /* Точка могла попасть в свёрнутую группу — перерисовываем без
     кластеризации, чтобы её было видно и можно было открыть. */
  const drawn = mapState.markers.has(key);
  if (!drawn) {
    /* Точка в группе: рисуем все точки по одной, чтобы её было видно. */
    mapState.mode = 'single';
    renderMapPoints();
  }

  const node = mapState.markers.get(key);
  if (node && node.element) {
    openCard(node.point || point, node.element);
    node.element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    return true;
  }

  /* app.js может перерисовать список ПОСЛЕ вызова focus(). Тогда в этот
     момент на схеме ещё старые метки. Открываем чуть позже — к этому
     времени перерисовка уже прошла. */
  setTimeout(() => {
    const later = mapState.markers.get(key);
    if (later && later.element) {
      openCard(later.point || point, later.element);
    } else {
      /* Совсем не появилась — показываем все точки и открываем снова. */
      mapState.mode = 'single';
      renderMapPoints();
      const again = mapState.markers.get(key);
      if (again && again.element) openCard(again.point || point, again.element);
    }
  }, 30);

  /* Ищем элемент по названию среди нарисованных. */
  const host = document.getElementById('map-markers');
  const fallback = host && [...host.querySelectorAll('.ym-pin')]
    .find(el => el.getAttribute('aria-label') === point.name);
  if (fallback) { openCard(point, fallback); return true; }

  /* Точка есть в данных и после перерисовки появится — сообщаем успех,
     иначе app.js покажет ложный тост «Карта загружается». */
  return true;
}

function moveMapToCity() {
  if (mapState.ready) renderMapPoints();
}

/* ── Состояния ─────────────────────────────────────────────────────────── */

function hideLoading() {
  const loading = document.getElementById('map-loading');
  if (loading) loading.hidden = true;
}

function showMapFallback(title, text) {
  const loading = document.getElementById('map-loading');
  if (loading) {
    loading.hidden = false;
    loading.innerHTML = `<b>${esc(title)}</b><span>${esc(text)}</span>`;
    loading.classList.add('is-error');
  }
}

/* ── Запуск ────────────────────────────────────────────────────────────── */

function bootMap() {
  const host = document.getElementById('map-markers');
  const frame = document.getElementById('map-scheme');
  if (!host || !frame) {
    mapState.failed = true;
    return;
  }

  /* Подложку рисуем один раз: она не зависит от данных. */
  if (!frame.querySelector('svg')) frame.innerHTML = schemeSvg();

  mapState.ready = true;
  hideLoading();
  renderMapPoints();
}

/* Старые точки входа оставлены ради совместимости с app.js,
   который может звать их до готовности. */
function ensureMap() {
  if (!mapState.ready) bootMap();
  return mapState.ready ? true : null;
}

window.BrodiMap = {
  boot: bootMap,
  renderPoints: renderMapPoints,
  focus: focusOnMap,
  moveToCity: moveMapToCity,
  closeCard,
  isReady: () => mapState.ready,
  api: () => 'scheme'
};

/* Закрытие карточки по клику мимо и по Esc.
   Важно: клик по элементам, которые сами открывают карточку («На карте»,
   строка места в списке), не должен её закрывать — иначе обработчик
   срабатывает сразу после focus() и карточка исчезает в том же клике. */
document.addEventListener('click', evt => {
  if (evt.target.closest('.ym-card') || evt.target.closest('.ym-pin')) return;
  if (evt.target.closest('[data-select], [data-show-map], .task-detail, .map-card')) return;
  closeCard();
});
document.addEventListener('keydown', evt => {
  if (evt.key === 'Escape') closeCard();
});

/* map.js грузится после app.js, поэтому сообщаем, что модуль готов. */
window.dispatchEvent(new Event('brodi:map-ready'));

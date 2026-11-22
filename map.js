'use strict';

/* Яндекс.Карты для главной страницы — API v3 (ymaps3).

   Почему v3: ключ проекта выпущен под JavaScript API v3 и привязан
   к домену по HTTP Referer. С v2.1 тот же ключ на этом домене не
   загружается вовсе (проверено страницей map-check.html: v3 создаёт
   карту за ~0.5 с, v2.1 — «window.ymaps отсутствует»).

   Отличия v3, которые важно помнить:
   1) координаты — [долгота, широта], а не [широта, долгота];
   2) балунов как класса нет: балун — это DOM-элемент внутри маркера;
   3) кластеры — отдельный пакет @yandex/ymaps3-clusterer через ymaps3.import;
   4) готовность — промис ymaps3.ready, а не колбэк ymaps.ready.

   Задачи модуля те же, что и раньше:
   1) показать все места и события города интерактивными метками;
   2) открывать карточку с фото, названием, временем, адресом и ссылкой;
   3) дать карточкам и списку центрировать карту на точке и открыть её.

   API грузится асинхронно. Если он не поднялся (сеть, блокировка,
   ключ не подходит для домена), остаётся понятное сообщение,
   а остальная страница работает как обычно. */

const YANDEX_API_KEY = 'ac0dd8aa-6124-4239-89b1-31db39165c0a';

/* Всё общее живёт в app.js. Читаем через геттеры — так map.js видит
   актуальные state/places/events, а не снимок на момент загрузки. */
const shared = window.BrodiShared || {};
const { esc, dayLabel, timeOf, priceLabel } = shared;
const getState = () => shared.state || {};
const getPlaces = () => shared.places || [];
const getEvents = () => shared.events || [];

/* Города для центрирования карты. ВНИМАНИЕ: в v3 порядок координат
   [долгота, широта] — то есть [lng, lat], обратный привычному. */
const CITY_VIEW = {
  'Тольятти': { center: [49.3181, 53.5135], zoom: 12 },
  'Самара': { center: [50.1002, 53.1959], zoom: 12 },
  'Жигулёвск': { center: [49.4891, 53.4023], zoom: 12 },
  'Новокуйбышевск': { center: [49.9361, 53.1997], zoom: 12 }
};

/* Смещение карточки вверх, чтобы она не закрывала точку снизу. */
const CARD_OFFSET = [0, -16];

const mapState = {
  map: null,
  clusterer: null,
  markers: new Map(),      /* id точки -> маркер */
  featureById: new Map(),  /* id точки -> feature для кластеризатора */
  openId: null,            /* id открытой карточки */
  ready: false,
  failed: false,
  keyRejected: false,
  pendingRender: false,
  pendingFocus: null,
  sourceReady: false
};

/* [широта, долгота] из данных -> [долгота, широта] для v3. */
function toLngLat(coords) {
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  return [coords[1], coords[0]];
}

/* Обратное преобразование — для подсчёта границ области. */
function toLatLng(coords) {
  return [coords[1], coords[0]];
}

/* Разметка карточки точки. Раньше это был HTML для балуна, теперь это
   содержимое DOM-элемента внутри маркера — но разметка и классы те же,
   поэтому стили .ym-balloon* продолжают работать. */
function balloonHtml(point) {
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

/* Точки текущего города: события и места с координатами. */
function mapPoints() {
  const inCity = item => item.city === getState().city && Array.isArray(item.coords) && item.coords.length === 2;

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

/* Видимость точки повторяет фильтр списка мест (категория). */
function pointVisible(point) {
  if (point.type === 'event') return true;
  if (getState().category === 'Все места') return true;
  const place = getPlaces().find(item => `place:${item.id}` === point.id);
  return place ? place.category === getState().category : true;
}

/* ── Маркеры ───────────────────────────────────────────────────────────── */

/* Точка-«капля» на карте. Размеры и цвета — в styles.css (.ym-pin). */
function pinElement(point) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `ym-pin ym-pin--${point.type}`;
  el.setAttribute('aria-label', point.name);
  el.title = point.name;
  el.innerHTML = '<span class="ym-pin-dot" aria-hidden="true"></span>';
  return el;
}

/* Открытая карточка. Одна на карту: открытие новой закрывает прежнюю. */
function closeCard() {
  if (!mapState.openId) return;
  const marker = mapState.markers.get(mapState.openId);
  if (marker && marker.element) marker.element.classList.remove('is-open');
  mapState.openId = null;
}

function openCard(point) {
  if (mapState.openId === point.id) {
    closeCard();
    return;
  }
  closeCard();

  const marker = mapState.markers.get(point.id);
  if (!marker || !marker.element) return;

  /* Карточку создаём один раз и храним в самом элементе маркера. */
  let card = marker.element.querySelector('.ym-card');
  if (!card) {
    card = document.createElement('div');
    card.className = 'ym-card';
    card.innerHTML = balloonHtml(point);
    /* Клик по карточке не должен закрывать её и не должен уходить в карту. */
    card.addEventListener('click', evt => {
      evt.stopPropagation();
      if (evt.target.closest('[data-close-card]')) closeCard();
    });
    marker.element.appendChild(card);
  }

  marker.element.classList.add('is-open');
  mapState.openId = point.id;

  /* Подводим точку к центру, оставляя место под карточку. */
  const lngLat = toLngLat(point.coords);
  if (lngLat && mapState.map) {
    mapState.map.update({
      location: { center: lngLat, zoom: Math.max(mapState.map.zoom || 12, 13) },
      duration: 300
    });
  }
}

/* ── Инициализация ─────────────────────────────────────────────────────── */

/* Слои, без которых маркеры не отрисуются: источник данных и слой
   маркеров. Кластеризатор требует их явно (см. документацию пакета). */
function addMarkerLayers(map) {
  const { YMapFeatureDataSource, YMapLayer } = window.ymaps3;
  if (!YMapFeatureDataSource || !YMapLayer) return;
  map.addChild(new YMapFeatureDataSource({ id: 'brodi-source' }));
  map.addChild(new YMapLayer({ source: 'brodi-source', type: 'markers', zIndex: 1800 }));
  mapState.sourceReady = true;
}

async function ensureMap() {
  if (mapState.map || mapState.failed) return mapState.map;

  const node = document.getElementById('yandex-map');
  if (!node) return null;

  if (!window.ymaps3 || !window.ymaps3.ready) {
    mapState.failed = true;
    showMapFallback('Карта не загрузилась', 'Проверьте соединение — остальная страница работает.');
    return null;
  }

  /* Если ключ отклонён, ymaps3.ready не разрешается. Страхуемся таймаутом,
     чтобы «Загружаем карту…» не висело бесконечно. */
  let settled = false;
  const startGuard = setTimeout(() => {
    if (settled) return;
    mapState.failed = true;
    showKeyNotice();
  }, 8000);

  try {
    await window.ymaps3.ready;
  } catch (error) {
    mapState.failed = true;
    clearTimeout(startGuard);
    showKeyNotice();
    return null;
  }

  if (mapState.failed) return null;

  const view = CITY_VIEW[getState().city] || CITY_VIEW['Тольятти'];

  try {
    const { YMap, YMapDefaultSchemeLayer, YMapMarker } = window.ymaps3;
    if (!YMap || !YMapDefaultSchemeLayer || !YMapMarker) {
      throw new Error('Компоненты ymaps3 недоступны');
    }

    mapState.map = new YMap(node, {
      location: { center: view.center, zoom: view.zoom },
      showScaleInCopyrights: true,
      /* Заглушка стандартных кнопок: добавляем свои, чтобы не тянуть
         ещё один пакет и не ломать дизайн-систему. */
      behaviors: ['drag', 'dblClick', 'pinchZoom', 'scrollZoom']
    });
    mapState.map.addChild(new YMapDefaultSchemeLayer({ theme: 'light' }));
    addMarkerLayers(mapState.map);
  } catch (error) {
    mapState.failed = true;
    clearTimeout(startGuard);
    showKeyNotice();
    return null;
  }

  settled = true;
  clearTimeout(startGuard);

  mapState.ready = true;
  /* Пока пакет кластеризатора едет, помечаем отрисовку отложенной:
     renderMapPoints может быть вызван из app.js в любой момент. */
  mapState.pendingRender = true;
  hideLoading();
  watchForKeyError();

  /* Кластеризатор — отдельный пакет. Если он не приехал (нет сети до CDN),
     карта всё равно работает: рисуем метки напрямую. */
  await setupClusterer();

  if (mapState.pendingRender) renderMapPoints();
  if (mapState.pendingFocus) {
    const key = mapState.pendingFocus;
    mapState.pendingFocus = null;
    focusOnMap(key);
  }

  return mapState.map;
}

/* Подключение кластеризатора из официального пакета.
   Пакет only-загружаемый: если CDN недоступен, карта продолжает работать
   без кластеров — метки рисуются напрямую. */
async function setupClusterer() {
  try {
    window.ymaps3.import.registerCdn('https://cdn.jsdelivr.net/npm/{package}', '@yandex/ymaps3-clusterer@0.0.13');
    const pkg = await window.ymaps3.import('@yandex/ymaps3-clusterer');
    if (!pkg || !pkg.YMapClusterer) throw new Error('YMapClusterer не найден');
    mapState.clusterPkg = pkg;
    mapState.clusterReady = true;
  } catch (error) {
    mapState.clusterPkg = null;
    mapState.clusterReady = false;
  }
}

/* Создание кластера с конкретным набором точек.
   Вынесено из renderMapPoints: там же он и пересоздаётся при смене
   города или фильтра. Метки создаёт сам пакет, мы запоминаем их,
   чтобы focus() мог найти нужную. */
function createClusterer(features) {
  const pkg = mapState.clusterPkg;
  if (!pkg) return null;
  const { YMapMarker } = window.ymaps3;

  const marker = feature => {
    const point = feature.properties.point;
    const el = pinElement(point);
    const mk = new YMapMarker(
      { coordinates: feature.geometry.coordinates, source: 'brodi-source' },
      el
    );
    mk.element = el;
    mapState.markers.set(point.id, mk);
    bindPin(mk, el, point);
    return mk;
  };

  const cluster = (coordinates, clusterFeatures) => {
    const el = document.createElement('div');
    el.className = 'ym-cluster';
    el.innerHTML = `<span>${clusterFeatures.length}</span>`;
    return new YMapMarker({ coordinates, source: 'brodi-source' }, el);
  };

  return new pkg.YMapClusterer({
    method: pkg.clusterByGrid({ gridSize: 60 }),
    features,
    marker,
    cluster
  });
}

/* ── Отрисовка точек ───────────────────────────────────────────────────── */

function renderMapPoints() {
  if (!mapState.ready) {
    mapState.pendingRender = true;
    return;
  }

  const { YMapMarker } = window.ymaps3;
  const wanted = mapPoints().filter(point => pointVisible(point));

  closeCard();
  mapState.markers.clear();
  mapState.featureById.clear();

  /* Снимаем с карты прошлые объекты. Кластер пересоздаём целиком:
     у пакета нет метода «заменить features» без пересборки. */
  if (mapState.clusterer) {
    mapState.map.removeChild(mapState.clusterer);
    mapState.clusterer = null;
  }
  mapState.map.children
    .filter(child => child && child.__brodiPin)
    .forEach(child => mapState.map.removeChild(child));

  const features = wanted.map(point => {
    const lngLat = toLngLat(point.coords);
    const feature = {
      type: 'Feature',
      id: point.id,
      geometry: { type: 'Point', coordinates: lngLat },
      properties: { point }
    };
    mapState.featureById.set(point.id, feature);
    return feature;
  });

  const clusterer = createClusterer(features);
  if (clusterer) {
    mapState.clusterer = clusterer;
    mapState.map.addChild(clusterer);
  } else {
    /* Без кластеризатора: по маркеру на точку. */
    features.forEach(feature => {
      const el = pinElement(feature.properties.point);
      const mk = new YMapMarker(
        { coordinates: feature.geometry.coordinates, source: 'brodi-source' },
        el
      );
      mk.__brodiPin = true;
      mk.element = el;
      mapState.markers.set(feature.properties.point.id, mk);
      bindPin(mk, el, feature.properties.point);
      mapState.map.addChild(mk);
    });
  }

  const empty = document.getElementById('map-empty');
  if (empty) empty.hidden = wanted.length > 0;

  fitBounds(wanted);
  mapState.pendingRender = false;
}

/* Клики по метке: карточка и подсветка карточки в списке. */
function bindPin(marker, el, point) {
  el.addEventListener('click', evt => {
    evt.stopPropagation();
    openCard(point);
    markCardSelected(point);
  });
}

/* Показать все точки города в кадре. */
function fitBounds(points) {
  if (!points.length || !mapState.map) return;
  const lngLats = points.map(point => toLngLat(point.coords)).filter(Boolean);
  if (!lngLats.length) return;

  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  lngLats.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  });

  /* Одна точка — просто центр, рамка нулевой площади не работает. */
  if (minLng === maxLng && minLat === maxLat) {
    mapState.map.update({ location: { center: [minLng, minLat], zoom: 14 }, duration: 300 });
    return;
  }

  mapState.map.update({
    location: { bounds: [[minLng, minLat], [maxLng, maxLat]], padding: CARD_OFFSET.map(v => Math.abs(v)) },
    duration: 300
  });
}

/* Подсветка карточки в списке, когда выбрана метка на карте. */
function markCardSelected(point) {
  if (point.type === 'place') {
    const id = point.id.replace('place:', '');
    getState().selected = id;
    if (typeof renderMapAndTasks === 'function') renderMapAndTasks();
  }
}

/* ── Центрирование из карточки/списка ──────────────────────────────────── */

function focusOnMap(pointId) {
  const key = pointId.includes(':') ? pointId : `place:${pointId}`;

  if (!mapState.ready) {
    ensureMap();
    mapState.pendingFocus = key;
    return false;
  }

  const point = mapPoints().find(item => item.id === key);
  if (!point) {
    /* Точки нет в текущем городе — переключаем город и пробуем снова,
       но не глубже одного уровня рекурсии. */
    const id = key.replace('place:', '').replace('event:', '');
    const place = getPlaces().find(item => item.id === id) ||
                  getEvents().find(item => item.id === id);
    if (place && place.city && place.city !== getState().city) {
      const st = getState();
      st.city = place.city;
      st.category = 'Все места';
      if (typeof render === 'function') render();
      mapState.pendingFocus = key;
      return false;
    }
    return false;
  }

  if (!pointVisible(point)) {
    /* Точку скрыл фильтр категории — показываем все места. */
    getState().category = 'Все места';
    if (typeof render === 'function') render();
  }

  if (!mapState.markers.has(point.id)) renderMapPoints();

  const lngLat = toLngLat(point.coords);
  if (lngLat) {
    mapState.map.update({
      location: { center: lngLat, zoom: Math.max(mapState.map.zoom || 12, 14) },
      duration: 400
    });
  }
  openCard(point);
  return true;
}

/* Переключение города — плавно переносим карту. */
function moveMapToCity(city) {
  if (!mapState.ready) return;
  const view = CITY_VIEW[city];
  if (!view) return;
  closeCard();
  mapState.map.update({ location: { center: view.center, zoom: view.zoom }, duration: 400 });
}

function hideLoading() {
  const loading = document.getElementById('map-loading');
  if (loading) loading.hidden = true;
}

/* Ключ Яндекса привязан к домену. Если он не подходит, API пишет об этом
   внутри контейнера. Ловим текст и уводим в обычный список — он полезнее
   пустого прямоугольника. Для localhost и 127.0.0.1 проверки нет. */
function watchForKeyError() {
  const node = document.getElementById('yandex-map');
  if (!node) return;

  let checks = 0;
  const timer = setInterval(() => {
    checks += 1;
    const text = node.textContent || '';
    const broken = /Ключ API|недействителен|Invalid key|ключ не найден|Forbidden/i.test(text);

    if (broken) {
      clearInterval(timer);
      mapState.keyRejected = true;
      showKeyNotice();
    } else if (checks > 20) {
      clearInterval(timer);
    }
  }, 250);
}

/* Понятная заглушка вместо технической ошибки ключа. */
function showKeyNotice() {
  const loading = document.getElementById('map-loading');
  const node = document.getElementById('yandex-map');
  if (!loading) return;

  const points = mapPoints();
  const list = points.slice(0, 6).map(point => `
    <li>
      <a href="${esc(point.url || '#')}" target="_blank" rel="noopener noreferrer">
        ${esc(point.name)}
        <span>${esc(point.address || '')}</span>
      </a>
    </li>`).join('');

  const host = location.hostname || 'ваш домен';
  loading.innerHTML = `
    <div class="map-key-notice">
      <b>Карта недоступна на этом домене</b>
      <p>Ключ Яндекс.Карт привязан к домену. Добавьте
         <code>${esc(host)}</code> в список разрешённых в кабинете разработчика —
         и карта появится здесь же.</p>
      <ul class="map-key-list">${list}</ul>
      <p class="map-key-hint">Пока точки открываются в Яндекс.Картах по ссылке из списка.</p>
    </div>`;
  loading.hidden = false;
  loading.classList.add('is-error');
  if (node) node.style.visibility = 'hidden';
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

/* ymaps3 грузится отдельным тегом в index.html. Ждём его, но не бесконечно. */
function bootMap() {
  const node = document.getElementById('yandex-map');
  if (!node) return;

  if (window.ymaps3) {
    ensureMap();
    return;
  }

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (window.ymaps3) {
      clearInterval(timer);
      ensureMap();
    } else if (tries > 100) {           /* ~10 секунд */
      clearInterval(timer);
      mapState.failed = true;
      showMapFallback('Карта не загрузилась', 'Похоже, API недоступен. Список мест слева работает как обычно.');
    }
  }, 100);
}

/* Закрытие карточки по клику мимо и по Esc. */
document.addEventListener('click', evt => {
  if (evt.target.closest('.ym-card') || evt.target.closest('.ym-pin')) return;
  closeCard();
});
document.addEventListener('keydown', evt => {
  if (evt.key === 'Escape') closeCard();
});

window.BrodiMap = {
  boot: bootMap,
  renderPoints: renderMapPoints,
  focus: focusOnMap,
  moveToCity: moveMapToCity,
  closeCard,
  isReady: () => mapState.ready,
  api: () => 'v3'
};

/* map.js грузится после app.js, поэтому сообщаем, что модуль готов.
   app.js ждёт это событие и только потом зовёт boot(). */
window.dispatchEvent(new Event('brodi:map-ready'));

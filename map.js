'use strict';

/* Яндекс.Карты для главной страницы.

   Задачи модуля:
   1) показать все места и события города интерактивными метками;
   2) открывать кастомный балун с фото, названием, временем, адресом
      и кнопкой перехода;
   3) дать карточкам и списку возможность центрировать карту на точке
      и открыть её балун.

   API грузится асинхронно, поэтому модуль умеет работать в двух режимах:
   карта уже готова — рисуем сразу; не готова — ждём.
   Если API не загрузился (сеть, блокировка, лимит ключа), остаётся
   статичный блок с понятным сообщением, остальная страница работает. */

const YANDEX_API_KEY = 'ac0dd8aa-6124-4239-89b1-31db39165c0a';

/* Всё общее живёт в app.js. Читаем через геттеры — так map.js видит
   актуальные state/places/events, а не снимок на момент загрузки. */
const shared = window.BrodiShared || {};
const { esc, dayLabel, timeOf, priceLabel } = shared;
const getState = () => shared.state || {};
const getPlaces = () => shared.places || [];
const getEvents = () => shared.events || [];

/* Города для центрирования карты. Координаты центра и комфортный зум. */
const CITY_VIEW = {
  'Тольятти': { center: [53.5135, 49.3181], zoom: 12 },
  'Самара': { center: [53.1959, 50.1002], zoom: 12 },
  'Жигулёвск': { center: [53.4023, 49.4891], zoom: 12 },
  'Новокуйбышевск': { center: [53.1997, 49.9361], zoom: 12 }
};

const mapState = {
  map: null,
  clusterer: null,
  placemarks: new Map(),   /* id точки -> метка */
  ready: false,
  failed: false,
  pendingRender: false
};

/* html для балуна. Собирается вручную: ymaps принимает только строку,
   поэтому все внешние значения прогоняем через esc() из app.js. */
function balloonHtml(point) {
  const isEvent = point.type === 'event';
  const when = isEvent && point.start
    ? `${dayLabel(new Date(point.start))}, ${timeOf(new Date(point.start))}`
    : (point.hours || '');
  const price = isEvent ? priceLabel(point) : '';
  const photo = point.image
    ? `<img class="ym-balloon-photo" src="${esc(point.image)}" alt="${esc(point.name)}"
            loading="lazy" decoding="async" referrerpolicy="no-referrer"
            data-fallback onerror="this.classList.add('is-broken')">`
    : '';

  return `
    <div class="ym-balloon">
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

function placemarkPreset(type) {
  return type === 'event' ? 'islands#violetDotIcon' : 'islands#blueDotIcon';
}

/* Ленивая инициализация: API может загрузиться позже app.js. */
function ensureMap() {
  if (mapState.map || mapState.failed) return mapState.map;

  if (!window.ymaps || typeof window.ymaps.ready !== 'function') {
    mapState.failed = true;
    showMapFallback('Карта не загрузилась', 'Проверьте соединение — остальная страница работает.');
    return null;
  }

  /* Если ключ отклонён, колбэк ready() не вызывается вообще — карта
     зависала на «Загружаем карту…». Поэтому страхуемся таймаутом. */
  let started = false;
  const startGuard = setTimeout(() => {
    if (started) return;
    mapState.failed = true;
    showKeyNotice();
  }, 8000);

  window.ymaps.ready(() => {
    const node = document.getElementById('yandex-map');
    if (!node) return;
    started = true;
    clearTimeout(startGuard);

    const view = CITY_VIEW[getState().city] || CITY_VIEW['Тольятти'];
    mapState.map = new window.ymaps.Map(node, {
      center: view.center,
      zoom: view.zoom,
      controls: ['zoomControl', 'geolocationControl']
    }, {
      suppressMapOpenBlock: true,
      yandexMapDisablePoiInteractivity: true
    });

    mapState.clusterer = new window.ymaps.Clusterer({
      preset: 'islands#invertedVioletClusterIcons',
      groupByCoordinates: false,
      clusterDisableClickZoom: false,
      hasBalloon: false
    });
    mapState.map.geoObjects.add(mapState.clusterer);

    mapState.ready = true;
    const loading = document.getElementById('map-loading');
    if (loading) loading.hidden = true;

    renderMapPoints();
    watchForKeyError();
  });

  return null;
}

/* Отрисовка меток для текущего города и фильтра. */
function renderMapPoints() {
  if (!mapState.ready) {
    mapState.pendingRender = true;
    return;
  }

  const wanted = mapPoints().filter(point => pointVisible(point));
  const clusterer = mapState.clusterer;
  clusterer.removeAll();
  mapState.placemarks.clear();

  /* Балун отдаём самому API через balloonContentBody: это штатный путь.
     Отдельный ymaps.Balloon(map) создавать не нужно — документация прямо
     не рекомендует, и вместе с openBalloonOnClick получалось два балуна. */
  const marks = wanted.map(point => {
    const placemark = new window.ymaps.Placemark(point.coords, {
      balloonContentBody: balloonHtml(point),
      hintContent: point.name
    }, {
      preset: placemarkPreset(point.type),
      openBalloonOnClick: true,
      balloonPanelMaxMapArea: 0,
      balloonMaxWidth: 300
    });

    placemark.events.add('click', () => markCardSelected(point));

    /* Фото в балуне внешнее: если не загрузится — прячем его, чтобы
       балун не показывал пустую рамку. */
    placemark.events.add('balloonopen', () => {
      const img = document.querySelector('.ym-balloon-photo');
      if (!img || img.dataset.guard) return;
      img.dataset.guard = '1';
      const hide = () => img.classList.add('is-broken');
      if (img.complete && img.naturalWidth === 0) hide();
      img.addEventListener('error', hide, { once: true });
    });

    mapState.placemarks.set(point.id, placemark);
    return placemark;
  });

  clusterer.add(marks);

  const empty = document.getElementById('map-empty');
  if (empty) empty.hidden = wanted.length > 0;

  if (wanted.length) {
    const bounds = window.ymaps.util.bounds.fromPoints(wanted.map(point => point.coords));
    if (bounds) {
      mapState.map.setBounds(bounds, { checkZoomRange: true, duration: 300 });
    }
  }

  mapState.pendingRender = false;
}

/* Видимость точки повторяет фильтр списка мест (категория). */
function pointVisible(point) {
  if (point.type === 'event') return true;
  if (getState().category === 'Все места') return true;
  const place = getPlaces().find(item => `place:${item.id}` === point.id);
  return place ? place.category === getState().category : true;
}

/* Подсветка карточки в списке, когда выбрана метка на карте. */
function markCardSelected(point) {
  const id = point.type === 'place' ? point.id.replace('place:', '') : point.id.replace('event:', '');
  if (point.type === 'place') {
    getState().selected = id;
    renderMapAndTasks();
  }
}

/* Центрирование на точке из карточки/списка + открытие балуна. */
function focusOnMap(pointId) {
  const key = pointId.includes(':') ? pointId : `place:${pointId}`;

  if (!mapState.ready) {
    const started = ensureMap();
    if (!started) {
      showMapFallback('Карта ещё загружается', 'Через пару секунд попробуйте снова.');
      return false;
    }
    mapState.pendingFocus = key;
    return false;
  }

  const placemark = mapState.placemarks.get(key);
  if (!placemark) {
    /* Точки нет в текущем городе/фильтре — пробуем найти и переключиться. */
    const point = mapPoints().find(item => item.id === key);
    if (!point) {
      const place = getPlaces().find(item => item.id === key.replace('place:', ''));
      if (place && place.city !== getState().city) {
        const st = getState();
        st.city = place.city;
        st.category = 'Все места';
        render();
        mapState.pendingFocus = key;
        return false;
      }
      return false;
    }
  }

  mapState.map.panTo(placemark.geometry.getCoordinates(), {
    flying: true,
    duration: 400,
    checkZoomRange: true
  }).then(() => {
    /* Штатный балун метки: открывается поверх кластера, умеет autoPan. */
    if (typeof placemark.balloon?.open === 'function') {
      placemark.balloon.open();
    } else if (typeof mapState.map.balloon?.open === 'function') {
      mapState.map.balloon.open(placemark.geometry.getCoordinates(), placemark.properties.getAll());
    }
  });

  return true;
}

/* Переключение города — плавно переносим карту. */
function moveMapToCity(city) {
  if (!mapState.ready) return;
  const view = CITY_VIEW[city];
  if (!view) return;
  mapState.map.setCenter(view.center, view.zoom, { duration: 400 });
}

/* Ключ Яндекса привязан к домену, и на чужом домене API отрисует
   «Ключ API недействителен». Ловим это по тексту ошибки внутри контейнера
   и уводим в обычный список — он полезнее пустого прямоугольника.
   Для localhost и 127.0.0.1 Яндекс проверку домена не делает. */
function watchForKeyError() {
  const node = document.getElementById('yandex-map');
  if (!node) return;

  let checks = 0;
  const timer = setInterval(() => {
    checks += 1;
    const text = node.textContent || '';
    const broken = /Ключ API|недействителен|Invalid key|ключ не найден/i.test(text);

    if (broken) {
      clearInterval(timer);
      mapState.keyRejected = true;
      showKeyNotice();
    } else if (checks > 20) {
      clearInterval(timer);
    }
  }, 250);
}

/* Понятная заглушка вместо «Ключ API недействителен». */
function showKeyNotice() {
  const loading = document.getElementById('map-loading');
  const node = document.getElementById('yandex-map');
  if (!loading) return;

  const city = getState().city || 'Тольятти';
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

/* API грузится с async — ждём его, но не бесконечно. */
function bootMap() {
  const node = document.getElementById('yandex-map');
  if (!node) return;

  if (window.ymaps) {
    ensureMap();
    return;
  }

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (window.ymaps) {
      clearInterval(timer);
      ensureMap();
    } else if (tries > 100) {          /* ~10 секунд */
      clearInterval(timer);
      mapState.failed = true;
      showMapFallback('Карта не загрузилась', 'Похоже, API недоступен. Список мест слева работает как обычно.');
    }
  }, 100);
}

window.BrodiMap = {
  boot: bootMap,
  renderPoints: renderMapPoints,
  focus: focusOnMap,
  moveToCity: moveMapToCity,
  isReady: () => mapState.ready
};

/* map.js грузится после app.js, поэтому сообщаем, что модуль готов.
   app.js ждёт это событие и только потом зовёт boot(). */
window.dispatchEvent(new Event('brodi:map-ready'));

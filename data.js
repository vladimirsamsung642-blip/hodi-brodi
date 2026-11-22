'use strict';

/* Каталог для прототипа.

   Данные — реальные, с https://hodi-brodi.ru (см. eventsData.js).
   Здесь они приводятся к форме, которую ждёт приложение: места получают
   награду в бутсах и координаты, события — длительность и флаги.

   Координаты [широта, долгота] нужны Яндекс.Картам. Раньше карта была
   рисованной схемой с процентами x/y — эти поля остались для совместимости,
   но больше не используются для позиционирования. */

const realPlaces = (window.BRODI_REAL_PLACES || []).map((place, index) => ({
  ...place,
  reward: [80, 80, 100, 80, 100, 80, 100, 120, 80][index] || 80,
  task: place.task || defaultTask(place),
  /* Позиция на схеме (легаси, не используется картой). */
  x: place.x || 20 + ((index * 17) % 70),
  y: place.y || 30 + ((index * 23) % 55)
}));

function defaultTask(place) {
  const byCategory = {
    'Вкус города': 'Загляни на завтрак или обед и найди свой новый любимый вкус.',
    'Тело в тонусе': 'Попробуй тренировку и добавь движения в свой день.',
    'Территория детства': 'Проведи время с ребёнком в игровом пространстве.',
    'Город не спит': 'Начни вечер с этого места и забери бутсы.',
    'Релакс': 'Выдохни и восстановись после рабочей недели.'
  };
  return byCategory[place.category] || 'Открой новое место в городе и забери бутсы.';
}

const realEvents = (window.BRODI_REAL_EVENTS || []).map(event => ({
  ...event,
  /* Поля, которых нет в источнике, но которые нужны интерфейсу. */
  editorPick: Boolean(event.editorPick),
  going: event.going || 0
}));

window.BRODI_PLACES = realPlaces;
window.BRODI_EVENTS = realEvents;

/* Города и категории берём из самих данных — чтобы фильтры не расходились
   со списком событий. */
const uniqueBy = (list, key) => [...new Set(list.map(item => item[key]).filter(Boolean))];

window.BRODI_EVENT_META = {
  cities: uniqueBy(realEvents, 'city'),
  categories: uniqueBy(realEvents, 'category'),
  source: 'https://hodi-brodi.ru',
  updated: '2026-11-22'
};

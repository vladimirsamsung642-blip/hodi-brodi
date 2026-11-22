'use strict';

/* Демо-каталог мест. Данные взяты из прототипа. */
window.BRODI_PLACES = [
  {id:'monblan',name:'Монблан',city:'Тольятти',category:'Еда',task:'Загляни на завтрак или обед и найди свой новый любимый вкус.',reward:80,address:'г. Тольятти, ул. Баныкина, 21Г',description:'Ресторан в новом корпусе отеля «Альпен парк»: завтраки, обеды и ужины.',image:'assets/monblan.webp',url:'https://hodi-brodi.ru/places/monblan/',x:27,y:48},
  {id:'vershina',name:'Вершина',city:'Тольятти',category:'Еда',task:'Устрой вкусную паузу в городской прогулке.',reward:80,address:'г. Тольятти, ул. Баныкина, 21Б',description:'Ресторан для встреч с близкими, деловых встреч и праздников.',image:'assets/vershina.webp',url:'https://hodi-brodi.ru/places/vershina/',x:38,y:73},
  {id:'elizium',name:'Элизиум',city:'Тольятти',category:'Развлечения',task:'Выбери игру или квест и попробуй новый формат отдыха.',reward:100,address:'г. Тольятти, Цветной бульвар, 29А',description:'Пространство развлечений: квесты, лазертаг и другие игры.',image:'assets/elizium.webp',url:'https://hodi-brodi.ru/places/elizium/',x:68,y:46},
  {id:'pro',name:'Про.Праздник',city:'Тольятти',category:'С детьми',task:'Открой для себя игровое пространство или мастер-класс.',reward:80,address:'г. Тольятти, ул. Дзержинского, 25А, 1 этаж',description:'Интерактивный детский парк и пространство для праздников и мастер-классов.',image:'assets/pro.webp',url:'https://hodi-brodi.ru/places/interaktivnyij-park-pro-pr4zdnik/',x:54,y:76},
  {id:'lady',name:'Lady Jump',city:'Тольятти',category:'Активный отдых',task:'Попробуй активную тренировку и добавь движения в свой день.',reward:100,address:'г. Тольятти, ул. Дзержинского, 25А',description:'Студия групповых тренировок на батутах под ритмичную музыку.',image:'assets/lady.jpeg',url:'https://hodi-brodi.ru/places/lady-jump/',x:80,y:67}
];

/* Демо-афиша.
   Даты считаются от текущего дня при загрузке страницы, поэтому подборка
   «Сегодня / Завтра / Выходные» всегда актуальна и не устаревает.
   События, цены и счётчики «идут» — вымышленные, для демонстрации механики. */
(function () {
  const base = new Date();
  base.setHours(0, 0, 0, 0);

  const day = offset => {
    const date = new Date(base);
    date.setDate(date.getDate() + offset);
    return date;
  };

  /* Время в конкретный день от сегодняшнего. */
  const at = (offset, hours, minutes) => {
    const date = day(offset);
    date.setHours(hours, minutes || 0, 0, 0);
    return date.toISOString();
  };

  /* Ближайшее время через N часов — чтобы «сегодня» всегда было в будущем. */
  const soon = hoursAhead => {
    const date = new Date();
    date.setSeconds(0, 0);
    date.setMinutes(date.getMinutes() < 30 ? 30 : 0);
    if (date.getMinutes() === 0) date.setHours(date.getHours() + 1);
    date.setHours(date.getHours() + hoursAhead);
    return date.toISOString();
  };

  /* Дедлайн приёма заявок — ближайший конец недели, но не в прошлом. */
  const deadline = (() => {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    date.setHours(23, 59, 0, 0);
    return date.toISOString();
  })();

  const dow = base.getDay(); // 0 — воскресенье, 6 — суббота
  let satOffset = (6 - dow + 7) % 7;
  let sunOffset = satOffset + 1;
  if (dow === 0) {
    satOffset = 6;
    sunOffset = 0;
  }

  const events = [
    {id:'e-jazz',title:'Ночь джаза на Волге',city:'Тольятти',venue:'Тольяттинская филармония',address:'ул. Победы, Автозаводский район',category:'Музыка',start:soon(2),duration:120,price:700,age:'12+',going:214,editorPick:true,
      description:'Большой джазовый вечер: квартет саксофониста, вокальные стандарты и импровизация на тему волжских мелодий. Вход по билетам, свободная посадка.'},
    {id:'e-walk',title:'Пешая экскурсия «Городские истории»',city:'Тольятти',venue:'Краеведческий музей',address:'бульвар Ленина, Центральный район',category:'Экскурсии',start:soon(4),duration:90,price:0,age:'6+',going:38,
      description:'Полтора часа по кварталам старого Ставрополя: дворы, мозаики, дом купца и истории жителей. Сбор у главного входа в музей.'},
    {id:'e-market',title:'Маркет локальных брендов «Своё»',city:'Тольятти',venue:'ТРК «Аэрохолл»',address:'Южное шоссе, Автозаводский район',category:'Маркет',start:at(1,11,0),duration:480,price:0,age:'0+',going:156,editorPick:true,
      description:'Сорок мастеров и небольших брендов: керамика, одежда, свечи, кофе и еда. На входе — карта маркета и расписание мастер-классов.'},
    {id:'e-theatre',title:'Спектакль «Три сестры»',city:'Тольятти',venue:'ТЮЗ «Дилижанс»',address:'ул. Свердлова, Центральный район',category:'Театр',start:at(1,18,30),duration:165,price:900,age:'16+',going:87,
      description:'Новая редакция чеховской пьесы: два акта, живая музыка и сцена-трансформер. После спектакля — короткое обсуждение с режиссёром.'},
    {id:'e-lecture',title:'Лекция «Как читать город»',city:'Тольятти',venue:'Библиотека им. Крупской',address:'ул. Мира, Центральный район',category:'Лекции',start:at(1,19,0),duration:90,price:0,age:'12+',going:42,deadline,
      description:'Урбанист рассказывает, как по фасадам и дворам читать историю района: от первой застройки до современных муралов. Нужна регистрация.'},
    {id:'e-openair',title:'Кинопоказ под открытым небом',city:'Тольятти',venue:'Парк истории техники',address:'Южное шоссе, Автозаводский район',category:'Кино',start:at(satOffset,20,0),duration:120,price:0,age:'12+',going:183,editorPick:true,
      description:'Летний экран у экспозиции техники: культовое кино о городе и короткометражки местных авторов. Приходите со своим пледом.'},
    {id:'e-yoga',title:'Йога на набережной',city:'Тольятти',venue:'Набережная 6 квартала',address:'Приморский бульвар',category:'Спорт',start:at(satOffset,9,0),duration:60,price:0,age:'16+',going:64,
      description:'Час мягкой практики на воздухе для любого уровня. Коврик и вода — с собой; тренер подскажет упрощённые варианты.'},
    {id:'e-brunch',title:'Воскресный бранч с шефом',country:'',city:'Тольятти',venue:'Монблан',address:'ул. Баныкина, 21Г',category:'Еда',start:at(sunOffset,12,0),duration:120,price:1500,age:'18+',going:52,placeId:'monblan',
      description:'Пять подач, разговоры о продуктах и разбор одного блюда вместе с шефом. Мест немного: посадка за общим столом.'},
    {id:'e-expo',title:'Выставка «Волга: 60 кадров»',city:'Тольятти',venue:'Краеведческий музей',address:'бульвар Ленина, Центральный район',category:'Выставки',start:at(sunOffset,10,0),duration:600,price:250,age:'0+',going:91,
      description:'Шестьдесят фотографий о жизни реки: рыбаки, баржи, пляжи и рассветы. Вход по сеансам, аудиогид включён в билет.'},
    {id:'e-standup',title:'Стендап: открытый микрофон',city:'Самара',venue:'Дом молодёжи',address:'ул. Куйбышева, Самарский район',category:'Театр',start:at(1,20,0),duration:120,price:500,age:'18+',going:120,
      description:'Двенадцать коротких сетов от новых и уже знакомых комиков. Первый ряд — только для смелых.'},
    {id:'e-foodfest',title:'Фестиваль уличной еды',city:'Самара',venue:'Набережная Волги',address:'Ленинский район',category:'Еда',start:at(satOffset,12,0),duration:480,price:0,age:'0+',going:340,editorPick:true,
      description:'Двадцать фуд-точек, музыка на открытой сцене и маркет посуды. Вход свободный, оплата на площадке.'}
  ];

  window.BRODI_EVENTS = events;
  window.BRODI_EVENT_META = {
    cities: ['Тольятти', 'Самара', 'Жигулёвск', 'Новокуйбышевск'],
    categories: ['Музыка', 'Театр', 'Выставки', 'Лекции', 'Маркет', 'Кино', 'Спорт', 'Экскурсии', 'Еда', 'Дети']
  };
})();

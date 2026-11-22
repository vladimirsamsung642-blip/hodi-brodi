'use strict';
const places=window.BRODI_PLACES;
const categories=['Все места','Еда','Развлечения','С детьми','Активный отдых'];
const offers=[
  {id:'ticket5',title:'−5% на билет',tag:'ПЕРВОЕ ОБМЕННОЕ ПРЕДЛОЖЕНИЕ',description:'Небольшой бонус на следующее городское событие.',cost:160,feature:false},
  {id:'ticket10',title:'−10% на билет',tag:'ДЛЯ ТЕХ, КТО МНОГО БРОДИТ',description:'Собери больше бутс — получи больше выгоды.',cost:300,feature:true}
];
const products=[
  {id:'tee',name:'Футболка «Я бродил»',description:'Мягкая база и немного городского характера.',cost:340,icon:'shirt',art:'shirt-look',ribbon:'ОДЕЖДА'},
  {id:'tote',name:'Шопер «Маршрут дня»',description:'Для маленьких находок по дороге домой.',cost:240,icon:'bag',art:'tote-look',ribbon:'НА КАЖДЫЙ ДЕНЬ'},
  {id:'boot-keychain',name:'Бутсы-брелок',description:'Символ твоих приключений — всегда с собой.',cost:180,icon:'boot',art:'boot-look',ribbon:'ЗНАК БРОДИЛКИ'}
];
const collections=[
 {id:'taste',number:'01',title:'Вкус города',subtitle:'Не торопись. Устрой себе вкусную паузу.',eyebrow:'ДЛЯ ЛЮБИТЕЛЕЙ ВКУСНОГО',image:'assets/monblan.webp',places:['monblan','vershina']},
 {id:'play',number:'02',title:'День впечатлений',subtitle:'Пробуй новое и добавляй движению место в своём дне.',eyebrow:'ДЛЯ ТЕХ, КТО В ДВИЖЕНИИ',image:'assets/elizium.webp',places:['elizium','lady']},
 {id:'together',number:'03',title:'Вместе интереснее',subtitle:'Найди идеи, которыми можно поделиться с близкими.',eyebrow:'ДЛЯ ОБЩИХ ВПЕЧАТЛЕНИЙ',image:'assets/pro.webp',places:['pro','elizium']}
];
let selectedCollection='taste';
const validIds=places.map(p=>p.id);const storageKey='brodi-new-concept-v2';
let saved={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')||{}}catch(e){}
const state={city:['Тольятти','Самара','Жигулёвск','Новокуйбышевск'].includes(saved.city)?saved.city:'Тольятти',category:categories.includes(saved.category)?saved.category:'Все места',selected:null,balance:Number.isFinite(saved.balance)&&saved.balance>=0?Math.floor(saved.balance):0,done:Array.isArray(saved.done)?saved.done.filter(id=>validIds.includes(id)):[],owned:Array.isArray(saved.owned)?saved.owned.filter(id=>products.some(p=>p.id===id)):[],redeemed:Array.isArray(saved.redeemed)?saved.redeemed.filter(id=>offers.some(o=>o.id===id)):[],history:Array.isArray(saved.history)?saved.history:[],activeTasks:Array.isArray(saved.activeTasks)?saved.activeTasks.filter(id=>validIds.includes(id)):[],favorites:Array.isArray(saved.favorites)?saved.favorites.filter(id=>validIds.includes(id)):[]};
const $=s=>document.querySelector(s);const icon=name=>`<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`;
function persist(){try{localStorage.setItem(storageKey,JSON.stringify({city:state.city,category:state.category,balance:state.balance,done:state.done,owned:state.owned,redeemed:state.redeemed,history:state.history,activeTasks:state.activeTasks,favorites:state.favorites}))}catch(e){}}
function plural(n,one,few,many){const x=n%100,y=n%10;return x>=11&&x<=14?many:y===1?one:y>=2&&y<=4?few:many}
function visiblePlaces(){return places.filter(p=>p.city===state.city&&(state.category==='Все места'||state.category===p.category))}
let toastTimer;function toast(message){const node=$('#toast');node.textContent=message;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),3800)}
function render(){
  $('#city-select').value=state.city;
  $('#header-balance').textContent=state.balance.toLocaleString('ru-RU');
  $('#hero-balance').textContent=state.balance.toLocaleString('ru-RU');
  $('#exchange-balance').textContent=state.balance.toLocaleString('ru-RU');
  renderFilters();renderMapAndTasks();renderOffers();renderCollections();persist();
}
function renderFilters(){
  $('#category-filters').innerHTML=categories.map(category=>`<button type="button" class="category-button ${state.category===category?'active':''}" data-category="${category}" aria-pressed="${state.category===category}">${category}</button>`).join('');
}
function renderMapAndTasks(){
  const shown=visiblePlaces();const cityPlaces=places.filter(p=>p.city===state.city);
  if(state.selected&&!shown.some(p=>p.id===state.selected))state.selected=null;
  $('#place-count').textContent=shown.length?`${shown.length} ${plural(shown.length,'место','места','мест')} в ${state.city}`:`Нет заданий · ${state.city}`;
  $('#task-count').textContent=shown.length;
  $('#map-markers').innerHTML=shown.map((p,i)=>`<button type="button" class="map-marker ${state.selected===p.id?'selected':''} ${state.done.includes(p.id)?'done':''}" style="left:${p.x}%;top:${p.y}%" data-select="${p.id}" aria-label="${p.name}, награда ${p.reward} бутс" aria-pressed="${state.selected===p.id}">${icon('pin')}<b>${i+1}</b><span class="marker-reward">+${p.reward}</span></button>`).join('');
  $('#map-empty').hidden=cityPlaces.length>0;
  if(cityPlaces.length===0){$('#map-empty').querySelector('b').textContent=`В ${state.city} пока нет заданий`;$('#map-empty').querySelector('p').innerHTML='Места появятся здесь позже.<br>Пока можно исследовать Тольятти.'}else if(shown.length===0){$('#map-empty').hidden=false;$('#map-empty').querySelector('b').textContent='В этой категории тихо';$('#map-empty').querySelector('p').innerHTML='Попробуй другое настроение<br>или посмотри все места.'}else{$('#map-empty').hidden=true}
  $('#task-list').innerHTML=shown.length?shown.map(p=>{const done=state.done.includes(p.id);return `<button type="button" class="task-row ${state.selected===p.id?'selected':''} ${done?'completed':''}" data-select="${p.id}" aria-label="${p.name}, ${done?'задание выполнено':`награда ${p.reward} бутс`}" aria-pressed="${state.selected===p.id}"><img class="task-thumb" src="${p.image}" alt="" loading="lazy"><span class="task-row-copy"><b>${p.name}</b><small>${done?'Выполнено':p.category}</small></span><span class="reward-text">${done?'✓':`+${p.reward}`} <span>бутс</span></span><span class="task-select" aria-hidden="true">↗</span></button>`}).join(''):'<p class="no-tasks">Здесь пока нет подходящих заданий.</p>';
  renderTaskDetail();
}
function renderTaskDetail(){
  const place=places.find(p=>p.id===state.selected&&visiblePlaces().some(v=>v.id===p.id));const box=$('#task-detail');
  if(!place){box.hidden=true;box.innerHTML='';return}
  const done=state.done.includes(place.id);const mapUrl='https://yandex.ru/maps/?text='+encodeURIComponent(place.address);
  box.hidden=false;box.innerHTML=`<img class="detail-image" src="${place.image}" alt="${place.name}" loading="lazy"><div class="detail-content"><div class="detail-title-line"><span class="detail-category">${place.category}</span></div><h4>${place.name}</h4><p class="detail-description"><b>Задание:</b> ${place.task}</p><p class="detail-address">📍 ${place.address}</p><div class="detail-actions-extra"><button type="button" class="detail-mini ${state.favorites.includes(place.id)?'is-saved':''}" data-favorite="${place.id}" aria-pressed="${state.favorites.includes(place.id)}">${state.favorites.includes(place.id)?'♥ В избранном':'♡ Сохранить место'}</button>${!done?`<button type="button" class="detail-mini ${state.activeTasks.includes(place.id)?'is-saved':''}" data-start-task="${place.id}" aria-pressed="${state.activeTasks.includes(place.id)}">${state.activeTasks.includes(place.id)?'✓ Задание в профиле':'+ Взять задание'}</button>`:''}</div><div class="detail-links"><a href="${place.url}" target="_blank" rel="noopener noreferrer">Место на Ходи Броди ↗</a><a href="${mapUrl}" target="_blank" rel="noopener noreferrer">Открыть адрес ↗</a></div><button type="button" class="complete-task" data-complete="${place.id}" ${done?'disabled':''}><span>${done?'Уже выполнено':'Отметить выполнение'}</span><span>${done?'✓':`Забрать +${place.reward} бутс`}</span></button><p class="earned-caption">${done?'Награда добавлена к твоему балансу.':`После визита отметь задание самостоятельно. Награда: ${place.reward} бутс.`}</p></div>`;
}
function renderOffers(){
  $('#offer-grid').innerHTML=offers.map(o=>{const redeemed=state.redeemed.includes(o.id),enough=state.balance>=o.cost;return `<article class="offer-card ${o.feature?'featured':''}"><div class="offer-icon">${icon('ticket')}</div><div class="offer-copy"><span class="offer-tag">${o.tag}</span><h4>${o.title}</h4><p>${o.description}</p><span class="offer-cost">${icon('boot')} ${o.cost} бутс</span></div><div class="offer-action"><button type="button" data-redeem="${o.id}" ${redeemed||!enough?'disabled':''}>${redeemed?'Уже обменяно':enough?'Обменять':'Не хватает '+(o.cost-state.balance)}</button></div></article>`}).join('');
}
function renderCollections(){
  const box=$('#collections-app');if(!box)return;
  const c=collections.find(x=>x.id===selectedCollection)||collections[0];
  const members=c.places.map(id=>places.find(p=>p.id===id)).filter(Boolean);
  const completed=members.filter(p=>state.done.includes(p.id)).length;
  const total=members.reduce((sum,p)=>sum+p.reward,0);
  box.innerHTML=`<div class="collection-feature"><div class="collection-photo"><img src="${c.image}" alt="" loading="lazy"><div class="collection-photo-overlay"></div><span class="photo-stamp">БРОДИ<br>СВОЁ <i>↗</i></span><div class="photo-title"><span>${c.eyebrow}</span><h3>${c.title}</h3><p>${c.subtitle}</p></div><span class="photo-index">${c.number} / 03</span></div><div class="collection-details"><div class="collection-details-head"><div><span class="collection-overline">ТВОЯ ПОДБОРКА</span><h4>Два места. Свой темп.</h4></div><span class="collection-count">${completed} / ${members.length}</span></div><p class="collection-description">Выбирай задания в любом порядке. Каждое открытие приближает к наградам.</p><div class="collection-progress" role="progressbar" aria-label="Прогресс подборки ${c.title}" aria-valuenow="${completed}" aria-valuemin="0" aria-valuemax="${members.length}"><span style="width:${members.length?completed/members.length*100:0}%"></span></div><div class="collection-progress-meta"><span>ОТМЕЧЕНО ${completed} ИЗ ${members.length}</span><span>ДО ${total} БУТС ЗА ЗАДАНИЯ</span></div><div class="collection-place-list">${members.map((p,i)=>{let done=state.done.includes(p.id);return `<button type="button" class="collection-place" data-collection-place="${p.id}"><span class="collection-place-number">${done?'✓':String(i+1).padStart(2,'0')}</span><span class="collection-place-copy"><b>${p.name}</b><small>${done?'Отмечено выполненным':p.category}</small></span><span class="collection-place-points">${done?'Готово':`+${p.reward}`}</span><span class="collection-place-arrow">↗</span></button>`}).join('')}</div><a class="collection-profile-link" href="profile.html#journey">Мой путь и достижения <span>↗</span></a></div></div><div class="collection-picker" aria-label="Выбор подборки">${collections.map(item=>`<button type="button" class="collection-choice ${item.id===c.id?'active':''}" data-collection="${item.id}" aria-pressed="${item.id===c.id}"><span class="choice-number">${item.number}</span><span class="choice-title">${item.title}<small>${item.places.filter(id=>state.done.includes(id)).length} из ${item.places.length} заданий</small></span><span class="choice-arrow">↗</span></button>`).join('')}</div>`;
}
function renderProducts(){
  $('#merch-grid').innerHTML=products.map(p=>{const owned=state.owned.includes(p.id),enough=state.balance>=p.cost;return `<article class="product-card"><div class="product-visual ${p.art}"><span class="product-ribbon">${p.ribbon}</span>${icon(p.icon)}</div><div class="product-copy"><h3>${p.name}</h3><p>${p.description}</p><div class="product-buy"><span class="product-cost">${icon('boot')} ${p.cost} бутс</span>${owned?'<span class="owned-label">В твоей коллекции ✓</span>':`<button type="button" data-buy="${p.id}" ${enough?'':'disabled'}>${enough?'Забрать':'Нужно ещё '+(p.cost-state.balance)}</button>`}</div></div></article>`}).join('');
}
document.addEventListener('click',event=>{
  const collection=event.target.closest('[data-collection]');if(collection){if(collections.some(c=>c.id===collection.dataset.collection)){selectedCollection=collection.dataset.collection;renderCollections()}return}
  const collectionPlace=event.target.closest('[data-collection-place]');if(collectionPlace){const p=places.find(x=>x.id===collectionPlace.dataset.collectionPlace);if(!p)return;state.city=p.city;state.category='Все места';state.selected=p.id;render();document.querySelector('#task-panel').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});return}
  const category=event.target.closest('[data-category]');if(category){state.category=category.dataset.category;render();return}
  const select=event.target.closest('[data-select]');if(select){state.selected=select.dataset.select;renderMapAndTasks();return}
  const favorite=event.target.closest('[data-favorite]');if(favorite){const id=favorite.dataset.favorite;if(!validIds.includes(id))return;state.favorites=state.favorites.includes(id)?state.favorites.filter(v=>v!==id):[...state.favorites,id];render();toast(state.favorites.includes(id)?'Место сохранено в профиль':'Место удалено из избранного');return}
  const start=event.target.closest('[data-start-task]');if(start){const id=start.dataset.startTask;if(!validIds.includes(id)||state.done.includes(id))return;state.activeTasks=state.activeTasks.includes(id)?state.activeTasks.filter(v=>v!==id):[...state.activeTasks,id];render();toast(state.activeTasks.includes(id)?'Задание добавлено в профиль':'Задание убрано из активных');return}
  const complete=event.target.closest('[data-complete]');if(complete){const p=places.find(item=>item.id===complete.dataset.complete);if(!p||state.done.includes(p.id))return;state.done.push(p.id);state.activeTasks=state.activeTasks.filter(id=>id!==p.id);state.balance+=p.reward;state.history.unshift({type:'earn',title:`Задание: ${p.name}`,amount:p.reward,date:new Date().toISOString()});render();toast(`+${p.reward} бутс! Задание «${p.name}» отмечено выполненным. Баланс сохранён на этом устройстве.`);return}
  const redeem=event.target.closest('[data-redeem]');if(redeem){const o=offers.find(item=>item.id===redeem.dataset.redeem);if(!o||state.redeemed.includes(o.id)||state.balance<o.cost)return;state.balance-=o.cost;state.redeemed.push(o.id);state.history.unshift({type:'spend',title:`Скидка: ${o.title}`,amount:-o.cost,date:new Date().toISOString()});render();toast(`Демо-обмен оформлен: ${o.title}. Это макет — реальный билет и промокод не создаются.`);return}
  const buy=event.target.closest('[data-buy]');if(buy){const product=products.find(item=>item.id===buy.dataset.buy);if(!product||state.owned.includes(product.id)||state.balance<product.cost)return;state.balance-=product.cost;state.owned.push(product.id);state.history.unshift({type:'spend',title:`Мерч: ${product.name}`,amount:-product.cost,date:new Date().toISOString()});render();toast(`«${product.name}» добавлен в демо-коллекцию. Реальный заказ не оформляется.`);return}
  if(event.target.closest('#back-to-city')){state.city='Тольятти';state.category='Все места';state.selected=null;render();return}
  if(event.target.closest('#reset-demo')){try{localStorage.removeItem(storageKey)}catch(e){}state.city='Тольятти';state.category='Все места';state.selected=null;state.balance=0;state.done=[];state.owned=[];state.redeemed=[];state.history=[];state.activeTasks=[];state.favorites=[];render();toast('Демо-прогресс сброшен. Можно начать заново.');return}
  if(event.target.closest('.menu-button')){const nav=$('.mobile-nav');const open=nav.classList.toggle('open');$('.menu-button').setAttribute('aria-expanded',String(open));$('.menu-button').setAttribute('aria-label',open?'Закрыть меню':'Открыть меню');return}
  if(event.target.closest('.mobile-nav a')){$('.mobile-nav').classList.remove('open');$('.menu-button').setAttribute('aria-expanded','false')}
});
$('#city-select').addEventListener('change',event=>{state.city=event.target.value;state.category='Все места';state.selected=null;render()});
const requestedPlace=new URLSearchParams(location.search).get('place');
if(requestedPlace){const place=places.find(p=>p.id===requestedPlace);if(place){state.city=place.city;state.category='Все места';state.selected=place.id}}
window.addEventListener('storage',event=>{if(event.key!==storageKey)return;try{const next=JSON.parse(event.newValue||'{}');for(const key of ['balance','done','owned','redeemed','history','activeTasks','favorites'])if(next[key]!==undefined)state[key]=next[key];render()}catch(e){}});
render();

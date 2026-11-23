#!/bin/sh
# Сборка папки для загрузки на хостинг (Layero и любой другой статик-хостинг).
#
# В dist попадает только то, что должно быть на сайте. Служебные файлы
# репозитория (AUDIT.md, PRODUCT.md, README*, serve.py, vercel.json)
# в сборку не входят: vercel.json не нужен на другом хосте, а остальное —
# документация проекта.
#
# Запуск:  sh build-dist.sh

set -e
cd "$(dirname "$0")"

DIST=dist

rm -rf "$DIST"
mkdir -p "$DIST/assets"

# Страницы
cp index.html profile.html "$DIST"/

# Стили и скрипты
cp styles.css profile.css "$DIST"/
cp app.js map.js data.js eventsData.js profile.js "$DIST"/

# Диагностика карты: помогает проверить ключ на новом домене.
cp map-check.html map-v3-check.html "$DIST"/

# Картинки проекта
cp assets/* "$DIST/assets"/

# Отключает сборку Jekyll на GitHub Pages; другим хостам не мешает.
touch "$DIST/.nojekyll"

# Архив для загрузки через панель Layero (перетащить папку или архив).
rm -f layero-dist.zip
(cd "$DIST" && zip -qr ../layero-dist.zip . -x '.*')

echo "Готово."
echo "  папка:  $DIST/"
echo "  архив:  layero-dist.zip"
echo
echo "Проверка комплектности:"
for f in index.html profile.html styles.css app.js map.js data.js eventsData.js profile.js; do
  if [ -f "$DIST/$f" ]; then printf "  ok   %s\n" "$f"; else printf "  НЕТ  %s\n" "$f"; fi
done

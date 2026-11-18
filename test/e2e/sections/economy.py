"""Раздел «economy» проверки в браузере. Запуск: npm run e2e -- economy"""
from common import *

@section('economy', 'хозяйство и подать: полосы категорий с ведомостью, дорожка сезонов с уроком, курс, нижние черты, плата подати, зоны сторон')
async def s_economy(br, errs):
    pg = await open_game(br, errs, 'замок')
    await pg.click("button[data-tab='eco']")
    CATS = """()=>[...document.querySelectorAll('#eco-cats .cat')].map(c=>({cat:c.dataset.cat, name:c.querySelector('.cat-name').textContent,
      v:parseFloat(c.querySelector('.cat-v').textContent.replace(',','.')), note:c.querySelector('.cat-note').textContent,
      floor:!!c.querySelector('.bar .floor'), ledger:c.querySelector('.ledger').textContent, lines:c.querySelectorAll('.ledger .ll').length,
      shown:getComputedStyle(c.querySelector('.ledger')).display!=='none'}))"""
    SIDES_JS = "()=>[...document.querySelectorAll('#eco-sides .side[data-side]')].map(s=>({side:s.dataset.side, text:s.textContent, zone:s.querySelector('.zone').textContent}))"
    TAX = "()=>document.getElementById('tax-line').textContent"
    cats = await pg.evaluate(CATS)
    ok('четыре категории: люди, еда, товары, серебро', [c['name'] for c in cats] == ['Люди', 'Еда', 'Товары', 'Серебро'], cats)
    ok('стартовые запасы на полосах', [c['v'] for c in cats] == [8, 3, 1, 2], [c['v'] for c in cats])
    ok('у еды и серебра есть нижняя черта, у людей и товаров нет', [c['floor'] for c in cats] == [False, True, False, True])
    ok('прогноз вилкой у запасов: слово и «от … до …»', all(re.search(r'(с запасом|впритык|не хватит|пусто) \(от [\d,]+ до [\d,]+\)', c['note']) for c in cats[1:]), [c['note'] for c in cats])
    ok('у людей видно, сколько рук в поле', 'в поле 4 из 4' in cats[0]['note'], cats[0]['note'])
    ok('до первого сезона ведомости нет', all('после первого сезона' in c['ledger'] for c in cats))
    sides = await pg.evaluate(SIDES_JS)
    ok('шесть сторон, деревень две, все «ладят»', [s['side'] for s in sides] == ['brod', 'opushka', 'les', 'kuptsy', 'zamok', 'dvor'] and all(s['zone'] == 'ладят' for s in sides), sides)
    ok('у каждой деревни свой староста', await pg.evaluate("()=>[...document.querySelectorAll('#eco-sides .elder')].map(e=>e.dataset.elder).join()") == 'brod,opushka')
    ok('в совете — «Тиун», а не староста', (await pg.evaluate(COUNCIL))[0]['name'] == 'Тиун')
    ok('урок испытания объявлен: 5 мер, Герцог ждёт', 'испытание' in await pg.evaluate(TAX) and 'осталось 5' in await pg.evaluate(TAX) and 'ждёт' in await pg.evaluate(TAX), await pg.evaluate(TAX))
    cells = await pg.evaluate("()=>[...document.querySelectorAll('#eco-track .cell')].map(c=>({n:+c.dataset.season, now:c.classList.contains('now'), text:c.textContent}))")
    ok('дорожка: 12 сезонов, сейчас первый, весной урок, осенью сборщица',
       len(cells) == 12 and cells[0]['now'] and 'урок 5' in cells[0]['text'] and 'сборщица' in cells[2]['text'] and sum(c['now'] for c in cells) == 1, cells[:4])

    # плата подати: серебром из казны
    ok('способов платить — одиннадцать', await pg.evaluate("()=>document.querySelectorAll('#pay-how option').length") == 11)
    await pg.fill('#pay-n', '1'); await pg.click('#pay-go')
    cats = await pg.evaluate(CATS)
    ok('внесли меру серебром: казна меньше на кошель, осталось 4', cats[3]['v'] == 1 and 'осталось 4' in await pg.evaluate(TAX), await pg.evaluate(TAX))
    ok('плата записана в летопись', 'Серебром из казны: 1 мер' in await pg.evaluate(LOG))
    # рекруты с деревни: рук меньше, деревня обижена
    await pg.select_option('#pay-how', 'rekruty_brod')
    ok('у способа написано, кому больно', 'деревне у брода' in await pg.evaluate("()=>document.getElementById('pay-hurts').textContent"))
    await pg.fill('#pay-n', '1'); await pg.click('#pay-go')
    cats = await pg.evaluate(CATS)
    ok('рекруты: рук стало 7, осталось 3 меры', cats[0]['v'] == 7 and 'осталось 3' in await pg.evaluate(TAX), (cats[0]['v'], await pg.evaluate(TAX)))
    await pg.select_option('#pay-how', 'sverh_brod'); await pg.fill('#pay-n', '1'); await pg.click('#pay-go')
    sides = await pg.evaluate(SIDES_JS)
    ok('рекруты и зерно сверх оброка: деревня у брода уже не «ладит», у опушки — по-прежнему', sides[0]['zone'] == 'терпят' and sides[1]['zone'] == 'ладят', sides[:2])

    # курс и нижняя черта
    await pg.select_option('#course', 'kopim')
    ok('курс выбран: описание и запись в летописи', 'оброк с деревень больше' in await pg.evaluate("()=>document.getElementById('course-desc').textContent") and 'Копим к подати' in await pg.evaluate(LOG))
    ok('видно, как исполняет каждый из пяти', (await pg.evaluate("()=>document.getElementById('doers').textContent")).count(':') == 6)
    await pg.fill('#floor-eda', '2.5'); await pg.dispatch_event('#floor-eda', 'change')
    ok('нижняя черта еды сдвинута', await pg.evaluate("()=>document.getElementById('floor-eda').value") == '2.5')
    await pg.select_option('#feed', 'derevni')

    # сезон: ведомость прошлого сезона построчно, по наведению
    await pg.click('#season')
    cats = await pg.evaluate(CATS)
    ok('после сезона у каждой категории есть ведомость со строками', all(c['lines'] >= 1 for c in cats), [c['lines'] for c in cats])
    ok('ведомость еды: было → стало, прокорм, нижняя черта', 'было 3' in cats[1]['ledger'] and 'прокорм замка' in cats[1]['ledger'] and 'нижняя черта: 2,5' in cats[1]['ledger'], cats[1]['ledger'])
    ok('ведомость серебра: пошлины с ответственным и тем, из чего сложилась сила (годность, опыт, настрой)', re.search(r'пошлины.*Купцы · писарь-казначей \S+ · (негоден|годен|прирождённый), (новичок|освоился|мастер|засиделся), (с огоньком|как велено|без огонька)', cats[3]['ledger']), cats[3]['ledger'])
    ok('ведомость людей: куда ушли руки и рекруты', 'рекруты на год' in cats[0]['ledger'] and 'в поле' in cats[0]['ledger'], cats[0]['ledger'])
    ok('пока мышь не наведена, ведомость скрыта', not any(c['shown'] for c in cats))
    await pg.hover('.cat[data-cat="eda"]')
    ok('по наведению ведомость видна', (await pg.evaluate(CATS))[1]['shown'])
    await shot(pg, 'economy-ledger')
    await pg.mouse.move(5, 5)
    ok('курс держится — выбор сохранился', await pg.evaluate("()=>document.getElementById('course').value") == 'kopim' and await pg.evaluate("()=>document.getElementById('feed').value") == 'derevni')

    # осень: сборщица, зимой новый урок
    await pg.click('#season'); await pg.click('#season')
    log = await pg.evaluate(LOG)
    ok('осенью жатва и сборщица', 'Жатва: в амбар легло' in log and 'Сборщица податей' in log, log[:400])
    cells = await pg.evaluate("()=>[...document.querySelectorAll('#eco-track .cell')].map(c=>({now:c.classList.contains('now'), text:c.textContent, cls:c.className}))")
    ok('на дорожке у прошедшей осени итог: закрыт или недоимка', ('✓' in cells[2]['text'] or '✗' in cells[2]['text']) and cells[3]['now'], cells[2])
    await pg.click('#season')
    ok('зимой Герцог объявляет новый урок', 'Герцог объявил урок на год' in await pg.evaluate(LOG) and (await status(pg))['season'] == 'весна, год 2')
    ok('урок второго года на дорожке и в строке подати', 'внесено 0' in await pg.evaluate(TAX), await pg.evaluate(TAX))

    # взгляд дизайнера: числа доверия и терпения, план сезона
    await pg.check('#designer')
    sides = await pg.evaluate(SIDES_JS)
    ok('дизайнер видит числа доверия сторон', all(re.search(r'[+−]?\d', s['zone']) for s in sides), sides)
    ok('дизайнер видит план сезона у запасов', all('по плану' in c['note'] for c in (await pg.evaluate(CATS))[1:]))
    await pg.uncheck('#designer')
    ok('без дизайнера чисел доверия нет', all(not re.search(r'\d', s['zone']) for s in await pg.evaluate(SIDES_JS)))

    # долгая партия: запасы не уходят ниже нуля, дорожка листается на следующие три года
    for _ in range(3): await pg.click('#season5')
    cats = await pg.evaluate(CATS)
    ok('через пять лет запасы не ниже нуля', all(c['v'] >= 0 for c in cats), [c['v'] for c in cats])
    ok('дорожка показывает годы 4–6', 'год 4' in await pg.evaluate("()=>document.querySelector('#eco-track .yrs').textContent"))
    ok('после испытания урок обычный', 'испытание' not in await pg.evaluate(TAX), await pg.evaluate(TAX))
    # почерк на карточках: у держателей должностей; дизайнер видит все склонности почерка
    hands = await pg.evaluate("()=>[...document.querySelectorAll('#people .card.on-post')].map(c=>[...c.querySelectorAll('.hand')].map(h=>h.dataset.hand))")
    ok('у каждого в совете на карточке строка почерка', len(hands) == 5 and all(len(h) >= 1 for h in hands), hands)
    ok('у тех, кто без должности, почерка нет', await pg.evaluate("()=>document.querySelectorAll('#people .card:not(.on-post) .hand').length") == 0)
    await pg.check('#designer')
    shown = await pg.evaluate("()=>[...document.querySelectorAll('#people .card.on-post .hand')].map(h=>({k:h.dataset.hand, t:h.textContent}))")
    ok('дизайнер видит почерк целиком: склонность, плюс и цена', not any(h['k'] == 'unknown' for h in shown) and any(';' in h['t'] for h in shown), shown[:3])
    ok('во «Взгляде дизайнера» у исполнителей видна сила потока', '×' in await pg.evaluate("()=>document.getElementById('doers').textContent"))
    await pg.uncheck('#designer')
    await shot(pg, 'economy')

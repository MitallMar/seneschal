"""Раздел «base» проверки в браузере. Запуск: npm run e2e -- base"""
from common import *

@section('base', 'запуск, сезоны по одному и по пять, летопись, новая партия: то же семя даёт ту же летопись, другое — другую')
async def s_base(br, errs):
    pg = await open_game(br, errs)
    st = await status(pg); council = await pg.evaluate(COUNCIL); cards = await pg.evaluate(CARDS)
    ok('страница открылась: заголовок, весна первого года, авторитет 10, три личных дела', 'Сенешаль' in await pg.title()
       and st == {'season': 'весна, год 1', 'authority': 10.0, 'deeds': 3}, st)
    ok('в совете пять должностей, все заняты, главный один', len(council) == 5 and all(c['holder'] != '' for c in council)
       and sum(c['head'] for c in council) == 1, [(c['name'], c['who'], c['head']) for c in council])
    # наследство прежних баронов: у одного-двух из совета седьмая строка — как он получил должность
    seated = [c for c in cards if c['bio'] == 7]
    ok('десять человек, у каждого биография из шести событий и сетка звезды; у посаженных прежним бароном — седьмая строка',
       len(cards) == 10 and all(c['bio'] in (6, 7) and c['grid'] == 4 for c in cards) and 1 <= len(seated) <= 2 and all(c['onPost'] for c in seated),
       [(c['name'], c['bio'], c['grid']) for c in cards])
    start_log = await pg.evaluate("document.body.innerText")
    ok('летопись старта называет, кто посажен не по годности', 'Наследство прежних баронов:' in start_log and 'а не по годности' in start_log)
    ok('пятеро в совете отмечены на карточках', sum(c['onPost'] for c in cards) == 5)
    ok('до разговора склонности закрыты («?»), звезды нет, стремление неизвестно', all(closed(c) and c['rays'] == 0 and c['real'] == 0
       and 'неизвестно' in c['asp'] for c in cards), [(c['name'], c['axes']) for c in cards][:2])
    ok('о каждом известна одна вещь: молва или черта', all((c['rumor'] != '') != c['traitKnown'] for c in cards),
       [(c['name'], c['rumor'], c['trait']) for c in cards])
    ok('черта с начала известна только у членов совета', all(c['onPost'] for c in cards if c['traitKnown']))
    ok('вверху строка-подсказка, как узнавать людей', 'поговорить' in await pg.text_content('#tip') and 'в деле' in await pg.text_content('#tip'))
    ok('отношения в совете: таблица пять на пять со словами', await pg.evaluate("()=>document.querySelectorAll('#relations .rel').length") == 20)
    ok('летопись начинается с записи о новой партии и вестей о погоде года', await pg.evaluate(TITLES) == ['Вести', 'Новая партия, семя «замок»'])
    await shot(pg, 'start')

    await pg.click('#season')
    st = await status(pg); titles = [t for t in await pg.evaluate(TITLES) if t != 'Вести']   # вести мира идут своей записью
    ok('сезон прошёл: лето, в летописи три события и итог сезона сверху', st['season'] == 'лето, год 1' and len(titles) == 5
       and titles[0] == 'Итог сезона 1', (st, titles))
    ok('у события в летописи есть текст решения и последствия', await pg.evaluate(
        "()=>[...document.querySelectorAll('#log .entry')].filter(e=>e.querySelector('.eff')).every(e=>e.querySelectorAll('p').length>=2)")
       and await pg.evaluate("()=>document.querySelectorAll('#log .eff span').length") > 0)
    await pg.click('#season5')
    st = await status(pg); titles = await pg.evaluate(TITLES); cards = await pg.evaluate(CARDS)
    ok('+5 сезонов: осень второго года, в летописи шесть итогов', st['season'] == 'осень, год 2'
       and len([t for t in titles if t.startswith('Итог сезона')]) == 6, (st, len(titles)))
    ok('у членов совета накопились решения', any('Решений: 0' not in c['stats'] for c in cards if c['onPost']), [c['stats'] for c in cards])
    ok('мусора в летописи нет', not re.search(r'undefined|NaN|\{|\}', await pg.evaluate(LOG)))
    log_a = await pg.evaluate(LOG)
    await shot(pg, 'seasons')

    await pg.click('#new'); await pg.click('#season'); await pg.click('#season5')
    ok('новая партия с тем же семенем повторяет летопись слово в слово', await pg.evaluate(LOG) == log_a)
    await pg.fill('#seed', 'другое семя'); await pg.click('#new')
    st = await status(pg)
    ok('новая партия сбрасывает сезон и летопись', st['season'] == 'весна, год 1' and await pg.evaluate(TITLES) == ['Вести', 'Новая партия, семя «другое семя»'], st)
    await pg.click('#season'); await pg.click('#season5')
    ok('другое семя даёт другую летопись', await pg.evaluate(LOG) != log_a)
    await pg.fill('#seed', ''); await pg.click('#new')
    ok('пустое семя — партия по семени «замок»', await pg.evaluate(TITLES) == ['Вести', 'Новая партия, семя «замок»'])

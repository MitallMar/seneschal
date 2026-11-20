"""Раздел «world» проверки в браузере. Запуск: npm run e2e -- world"""
from common import *

@section('world', 'мир вокруг: строка «что в мире», вкладка «Мир» с лентой по слоям, указ на столе и его способы, спокойный мир ручкой')
async def s_world(br, errs):
    pg = await br.new_page()
    pg.on('pageerror', lambda e: errs.append('ошибка страницы: ' + str(e)))
    pg.on('console', lambda m: errs.append('консоль: ' + m.text) if m.type == 'error' else None)
    await pg.goto(PAGE + '?seed=замок&tab=world')
    await pg.wait_for_selector('#world-tape .tape')
    line = await pg.text_content('#world-line')
    ok('строка «что в мире» называет погоду года', line.startswith('Что в мире:') and any(x in line for x in ('год', 'недород')), line)
    ok('вкладка «Мир» открывается по адресу', await pg.is_visible('#tab-world') and not await pg.is_visible('#tab-council'))
    head = await pg.evaluate("()=>[...document.querySelectorAll('#world-tape thead th')].map(x=>x.textContent)")
    ok('лента по трём слоям: мир и герцогство, баронство, место', head == ['Сезон', 'Мир и герцогство', 'Баронство', 'Место', 'Что действует'], head)
    rows = await pg.evaluate("()=>document.querySelectorAll('#world-tape tbody tr').length")
    ok('лента на 50 сезонов, текущий сезон отмечен', rows == 50 and await pg.evaluate("()=>document.querySelector('#world-tape tr.now').dataset.season") == '1', rows)
    news = await pg.evaluate("()=>[...document.querySelectorAll('#world-tape .wn')].map(x=>x.dataset.kind)")
    ok('в ленте есть состояния, погода, указы и местные отголоски', all(k in news for k in ('start', 'end', 'weather', 'decree', 'echo')), sorted(set(news)))
    ok('указов на столе в начале нет', 'Указов нет' in await pg.text_content('#decrees'))
    tape = await pg.inner_html('#world-tape tbody')

    # до указа: семя «замок» — мор в герцогстве, сбор на заставы приходит к шестому сезону
    await pg.click('#season5')
    ok('текущий сезон в ленте сдвинулся', await pg.evaluate("()=>document.querySelector('#world-tape tr.now').dataset.season") == '6')
    ok('лента от игры не меняется: мир от совета не зависит', (await pg.inner_html('#world-tape tbody')).replace(' class="now"', ' class=""').replace(' class="past"', ' class=""')
       == tape.replace(' class="now"', ' class=""').replace(' class="past"', ' class=""'))
    states = await pg.evaluate("()=>[...document.querySelectorAll('#world-now .ws')].map(x=>x.dataset.state)")
    ok('у беды назван ответственный и как он справляется', 'Отвечает' in await pg.text_content('#world-now .ws.bad .stand'))
    ok('действующие состояния названы', 'mor' in states and len(states) >= 2, states)
    ok('сдвиги хозяйства названы словами', 'Мир сейчас сдвигает хозяйство' in await pg.text_content('#world-shifts'))
    await pg.click('button[data-tab="council"]')
    dec = await pg.text_content('#decrees')
    ok('указ лёг на стол: счёт в мерах, срок и чем закрыть', 'Сбор на заставы' in dec and 'осталось' in dec and 'серебро или товары' in dec and 'срок' in dec and 'Встречал' in dec, dec[:200])
    ways = await pg.evaluate("()=>[...document.querySelectorAll('#decrees button[data-decree]')].map(b=>({way:b.dataset.way,off:b.disabled,text:b.textContent}))")
    ok('у указа только свои способы и у каждого цена', len(ways) >= 3 and all(w['way'] in ('serebro', 'sbor_kuptsy', 'zaem', 'tovary') for w in ways)
       and all('мер за' in w['text'] or w['off'] for w in ways), ways)
    ok('в летописи вести об указе', any('Сбор на заставы' in t for t in [await pg.evaluate(LOG)]))
    await shot(pg, 'world-decree')
    silver = (await pg.evaluate("()=>window.__emu.snapshot()"))['stock']['serebro']
    left = await pg.text_content('#decrees .decree-left')
    await pg.click('#decrees button[data-way="serebro"]')
    dec = await pg.text_content('#decrees'); log = await pg.evaluate(LOG)
    ok('плата по указу серебром: казна меньше, остаток меньше или указ ушёл со стола, запись в летописи',
       (await pg.evaluate("()=>window.__emu.snapshot()"))['stock']['serebro'] < silver and 'Серебром из казны' in log
       and ('Указов нет' in dec or await pg.text_content('#decrees .decree-left') != left), dec[:120])

    # «Взгляд дизайнера» и ручки
    await pg.click('button[data-tab="world"]')
    ok('без «Взгляда дизайнера» бюджета давления не видно', not await pg.query_selector('#world-budget'))
    await pg.check('#designer')
    ok('«Взгляд дизайнера»: бюджет давления и сила состояний', 'бюджет давления' in await pg.text_content('#world-budget') and 'сила' in await pg.text_content('#world-now'))
    await shot(pg, 'world')
    await pg.evaluate("()=>window.__emu.setKnob('world.on', 0)")
    ok('спокойный мир ручкой: лента пуста, в мире тихо', await pg.evaluate("()=>document.querySelectorAll('#world-tape .wn').length") == 0
       and 'тихо' in await pg.text_content('#world-line'))
    await pg.evaluate("()=>window.__emu.setKnob('world.on', 1)")
    t1 = await pg.inner_html('#world-tape tbody')
    await pg.evaluate("()=>window.__emu.setKnob('world.act', 3)")
    ok('ручка акта меняет ленту сразу', await pg.inner_html('#world-tape tbody') != t1)
    await pg.click('#knobs-toggle')
    ok('ручки мира — своим разделом в панели', await pg.evaluate("()=>!!document.querySelector('#knobs details[data-sec=world]')"))

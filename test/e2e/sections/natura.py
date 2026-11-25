"""Раздел «natura» проверки в браузере. Запуск: npm run e2e -- natura"""
from common import *

@section('natura', 'эмулятор натуры: прогон, метрики и цели, графики, человек с древом, таблицы наполнения, ручки действуют сразу')
async def s_natura(br, errs):
    pg = await br.new_page()
    pg.on('pageerror', lambda e: errs.append('ошибка страницы: ' + str(e)))
    pg.on('console', lambda m: errs.append('консоль: ' + m.text) if m.type == 'error' else None)
    await pg.goto(EMU)
    await pg.wait_for_selector('#metric-cards .card')
    n = lambda sel: pg.evaluate("s=>document.querySelectorAll(s).length", sel)
    m = await pg.evaluate("()=>window.__emu.metrics()")
    ok('эмулятор открылся: 600 рероллов, девять карточек метрик, предупреждений нет', 'эмулятор натуры' in await pg.title()
       and await pg.evaluate("()=>window.__emu.people()") == 600 and await n('#metric-cards .card') == 9 and await n('#metric-cards .card.bad') == 0
       and 'Предупреждений нет' in await pg.inner_text('#warnings'), await pg.inner_text('#warnings'))
    ok('метрики в целях: рероллы не похожи, натура читается по признакам, нажитого больше половины', m['jaccard'] <= 0.5 and m['signNn'] >= 0.7
       and 0.2 <= m['nn'] <= 0.6 and m['lifeShare'] >= 0.6 and m['kinds']['life'] > m['kinds']['born'], (m['jaccard'], m['nn'], m['signNn'], m['kinds']))
    ok('графики: строка на каждую черту мешка и на каждую натуру, тепловые карты 30 натур', await n('#chart-traits .track') == BAG - BAG_SENESCHAL
       and await n('#chart-natures .track') == 90 and await n('#heat-signs tr') == 31 and await n('#heat-axes tr') == 31 and await n('#heat-signs td.core') == 90)
    ok('таблицы наполнения: 30 натур, весь мешок, 12 признаков, черты и должности совета', await n('#table-natures tr') == 31 and await n('#table-bag tr') == BAG + 1
       and await n('#table-signs tr') == 13 and await n('#table-key tr') == 11 and await n('#table-life tr') >= 12 and await n('#table-posts tr') == 6)
    ok('человек: кусты у врождённых якорей и у дальнего, у каждой черты подписано происхождение; двенадцать рероллов', await n('#person-view .bush') >= 2
       and await n('#person-view .trait') >= 3 and 'до игры:' in await pg.inner_text('#person-view') and 'врождённая' in await pg.inner_text('#person-view')
       and await n('#person-view .bipolar .bi') == 12 and await n('#person-rerolls .reroll') == 12 and await n('#party-view tr') == 11)
    before = await pg.inner_html('#person-view')
    await pg.click('#reroll')
    ok('«Реролл» даёт другого человека той же натуры', await pg.inner_html('#person-view') != before and 'Служилый' in await pg.inner_text('#person-view'))
    await pg.select_option('#nature', 'torgash')
    ok('выбор натуры: человек другой натуры', 'Торгаш' in await pg.inner_text('#person-view'))
    pt = await pg.evaluate("()=>window.__emu.portrait()")
    rows = await pg.evaluate("()=>[...document.querySelectorAll('#portrait .prow .ptitle')].map(x=>x.textContent)")
    ptext = await pg.inner_text('#portrait')
    ok('портрет: первые десять строк — хочет, удерживает, подход, память, голос, доклад, связи, следы; дальше — условия, нити, дело, лихо, когда они есть',
       rows[:10] == ['Хочет', 'Удерживает', 'Подход: работает', 'Подход: не действует', 'Память', 'Говорит', 'Доклад', 'Ладит', 'Не ладит', 'Следы']
       and all(r in ('При условии', 'Нити', 'Дело', 'Лихо', 'Сплав', 'Откуда и чей') for r in rows[10:]), rows)
    marks = await n('#portrait .by-trait')
    from_traits = sum(1 for l in pt['traces']['lines'] if l['trait']) + len(pt['threads']) + len(pt['ifs']) + len(pt['deed'])
    ok('портрет: у строки видно, откуда она — от черты (метка с именем) или от признака; ниже — особенное каждой черты с видимостью и действием',
       marks >= from_traits > 0 and await n('#portrait-traits .tnote') == await n('#person-view .trait') and await n('#portrait-traits .tnote .tag.role') == await n('#portrait-traits .tnote')
       and all(('от черты' in t.lower() or 'от признака' in t or 'Из чего' in t) for t in await pg.evaluate("()=>[...document.querySelectorAll('#portrait .prow .tag[title]')].map(x=>x.title)")),
       (marks, from_traits))
    ok('портрет торгаша: выгода работает, желание денег названо словом, доклад с пристрастием, у следа подписана видимость',
       'vygoda' in pt['approach']['da'] and pt['wants']['dengi'] > 0.5 and 'деньги — ' in ptext and 'сильнее' in ptext and 'выгода' in ptext
       and (pt['voice']['bias'] == 'bez' or 'без пристрастия' not in ptext) and len(pt['voice']['manners']) >= 1
       and await n('#portrait .tline') == len(pt['traces']['lines']) and ('со временем' in ptext or 'явная' in ptext or not pt['traces']['lines']), (pt['wants'], pt['approach'], pt['voice']))
    await pg.evaluate("()=>window.__emu.setKnob('natura.portrait.notable', 5)")
    pt2 = await pg.evaluate("()=>window.__emu.portrait()")
    ok('ручка порога действует: при пороге 5 от признаков списков нет — остаётся только то, что дали черты; числа остаются',
       not any(not x['trait'] for x in pt2['by']['approach'].values()) and not any(not l['trait'] for l in pt2['traces']['lines'])
       and pt2['wants']['dengi'] == pt['wants']['dengi'] and 'как у всех' not in (await pg.inner_text('#portrait')).split('Удерживает')[0], pt2['approach'])
    await pg.evaluate("()=>window.__emu.setKnob('natura.portrait.notable', 2)")
    ok('портрет: последняя строка — «Откуда и чей»: происхождение с мерой', rows[-1] == 'Откуда и чей' and await n('#origin-name') == 1
       and 'мера —' in await pg.inner_text('#portrait') and 'откуда:' in await pg.inner_text('#person-view'), rows[-1])
    await pg.click('#seneschal')
    sen = await pg.inner_text('#person-view')
    sp = await pg.evaluate("()=>window.__emu.portrait()")
    ok('кнопка «Сенешаль»: 48 лет, ядро из трёх черт, свой куст в древе, в портрете совесть и «новое» от ядра', await n('#is-seneschal') == 1 and '48 лет' in sen
       and all(x in sen for x in ('Золотое правило', 'Крепкая основа', 'Мечта о дороге', 'Мешок Сенешаля')) and await n('#person-view .bush.sen .trait') in (6, 7, 8)
       and any(x['from'] == 'Золотое правило' for x in sp['by']['holds']['sovest']) and any(x['from'] == 'Мечта о дороге' for x in sp['by']['wants']['novoe'])
       and await pg.evaluate("()=>document.getElementById('age').disabled") and await pg.inner_text('#seneschal') == 'Обычный человек', await n('#person-view .bush.sen .trait'))
    await pg.click('#seneschal')
    ok('вторая кнопка возвращает обычного человека', await n('#is-seneschal') == 0 and await pg.inner_text('#seneschal') == 'Сенешаль' and 'Торгаш' in await pg.inner_text('#person-view'))
    await pg.select_option('#age', '18'); young = await n('#person-view .trait')
    await pg.select_option('#age', '70'); old = await n('#person-view .trait')
    ok('возраст: у старого черт больше, чем у только что повзрослевшего', '70 лет' in await pg.inner_text('#person-view') and old > young, (young, old))
    await pg.select_option('#bag-kind', 'perk')
    ok('мешок фильтруется по виду: перки — 35 умений людей и 4 умения Сенешаля', await n('#table-bag tr') == 40)
    await pg.select_option('#bag-kind', 'look')
    ok('мешок фильтруется по виду: облик — шесть черт', await n('#table-bag tr') == 7)
    await pg.select_option('#bag-kind', 'perk')
    knobs = await n('#knobs input[type=range]')
    ok('ручки: все ручки раздела natura, изменённых нет', knobs >= 40 and await n('#knobs .knob.changed') == 0, knobs)
    await pg.evaluate("()=>{const el=document.querySelector(\"input[data-knob='natura.lifeSteps']\"); el.value='5'; el.dispatchEvent(new Event('input',{bubbles:true}));}")
    await pg.wait_for_function("()=>window.__emu.metrics().traitsMean > %s" % (m['traitsMean'] + 2))
    m2 = await pg.evaluate("()=>window.__emu.metrics()")
    ok('ручка действует сразу: пять поводов в игре вместо двух — черт заметно больше, перки чаще, ручка подсвечена', await n('#knobs .knob.changed') == 1
       and m2['traitsMean'] > m['traitsMean'] + 2 and m2['kinds']['perk'] > m['kinds']['perk'], m2['kinds'])
    await pg.click('#export')
    ok('«Выгрузить изменённые» даёт строку с путём ручки и значениями', 'natura.lifeSteps: 2 → 5' in await pg.input_value('#export-out'))
    await pg.evaluate("()=>window.__emu.setKnob('natura.temperature', 4)")
    ok('плохие ручки — красные карточки и предупреждения', await n('#metric-cards .card.bad') >= 1 and await n('#warnings .warn') >= 1)
    await shot(pg, 'natura-bad')
    await pg.click('#reset')
    m3 = await pg.evaluate("()=>window.__emu.metrics()")
    ok('«Сброс» возвращает ручки и те же числа', await n('#knobs .knob.changed') == 0 and m3['jaccard'] == m['jaccard'] and m3['nn'] == m['nn'])
    h = await pg.evaluate("()=>window.__emu.health()")
    bad0 = await n('#health-cards .card.bad')
    ok('здоровье: девять карточек без красных, предупреждений нет, за партию выбывает 50–65%; половина доживает до 60–67 лет, до 80 — не больше 5%', await n('#health-cards .card') == 9 and bad0 == 0
       and 'Предупреждений нет' in await pg.inner_text('#health-warnings') and 0.5 <= h['removed'] <= 0.65
       and 60 <= h['life']['median'] <= 67 and 0 < h['life']['reachLate'] <= 0.05, (h['removed'], h['life']['median'], h['life']['reachLate'], bad0))
    ok('здоровье: графики, лента двадцати лет человека, семьи в партии, таблица из 21 черты', await n('#chart-curve polyline') == 1 and await n('#chart-life rect') >= 8
       and await n('#chart-causes .track') == 4 and await n('#health-person .strip i') == 80 and await n('#health-party tr') == 11 and await n('#table-health tr') == 22)
    await pg.evaluate("()=>window.__emu.setKnob('health.illBase', 0.1)")
    h2 = await pg.evaluate("()=>window.__emu.health()")
    ok('ручка здоровья действует: болеют впятеро чаще — в постели больше, карточка краснеет', h2['offShare'] > h['offShare'] * 2 and await n('#health-cards .card.bad') >= 1
       and await n('#health-warnings .warn') >= 1, (h['offShare'], h2['offShare']))
    await pg.click('#reset')
    await pg.select_option('#rolls', '300')
    ok('число рероллов меняется', await pg.evaluate("()=>window.__emu.people()") == 300)
    await shot(pg, 'natura')
    game = await open_game(br, errs)
    ok('с прототипа совета есть ссылка на эмулятор', await game.get_attribute('#to-emu', 'href') == 'natura.html')

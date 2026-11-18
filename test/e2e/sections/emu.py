"""Раздел «emu» проверки в браузере. Запуск: npm run e2e -- emu"""
from common import *

@section('emu', 'эмулятор: вкладки, сводка, заготовки, ручки с «было / стало», сброс и выгрузка, горячие клавиши, параметры адреса, веса вариантов')
async def s_emu(br, errs):
    pg = await open_game(br, errs, 'замок')
    SNAP = "()=>window.__emu.snapshot()"
    VIS = lambda sel: f"()=>{{const e=document.querySelector('{sel}');return !!e&&e.getClientRects().length>0}}"
    YEAR = "()=>[...document.querySelectorAll('#year tr[data-cat]')].map(r=>({cat:r.dataset.cat, cells:[...r.children].map(c=>c.textContent.trim())}))"
    KNOB = lambda path: "()=>{const r=document.getElementById('k-" + path.replace('.', '-') + "');return {val:r.querySelector('.knob-val').textContent, changed:r.classList.contains('changed'), range:r.querySelector('input').value}}"

    # вкладки и сводка
    ok('сначала открыта вкладка совета, хозяйство скрыто', await pg.evaluate(VIS('#council')) and not await pg.evaluate(VIS('#eco-cats')))
    await pg.click("button[data-tab='eco']")
    ok('вкладка хозяйства открывается, совет скрыт', await pg.evaluate(VIS('#eco-cats')) and not await pg.evaluate(VIS('#council')))
    ok('летопись и сводка видны на обеих вкладках', await pg.evaluate(VIS('#log')) and await pg.evaluate(VIS('#year')))
    year = await pg.evaluate(YEAR)
    ok('сводка: четыре категории, сейчас и прогноз вилкой', [r['cat'] for r in year] == ['lyudi', 'eda', 'tovary', 'serebro'] and year[1]['cells'][1] == '3'
       and re.search(r'(с запасом|впритык|не хватит|пусто) [\d,]+–[\d,]+', year[1]['cells'][3]), year)
    await pg.click("button[data-tab='council']")

    # горячие клавиши
    await pg.keyboard.press('Space')
    ok('пробел — сезон', (await status(pg))['season'] == 'лето, год 1')
    year = await pg.evaluate(YEAR)
    ok('после сезона в сводке есть прошлый сезон: было → стало', '3 →' in year[1]['cells'][2], year[1])
    await pg.keyboard.press('KeyF')
    ok('F — пять сезонов', (await status(pg))['season'] == 'осень, год 2')
    await pg.click('#season'); await pg.keyboard.press('Space')
    ok('после щелчка по кнопке пробел даёт один сезон, а не два', (await status(pg))['season'] == 'весна, год 3', await status(pg))
    await pg.keyboard.press('KeyD')
    ok('D — взгляд дизайнера', await pg.is_checked('#designer') and await pg.evaluate("()=>document.querySelectorAll('#log .weights').length") > 0)
    w = await pg.evaluate("()=>document.querySelector('#log .weights').textContent")
    ok('у решения в летописи — веса вариантов: кто, что выбрал, сколько без случая', '→ «' in w and 'без случая' in w, w[:200])
    await pg.keyboard.press('KeyD')
    ok('D ещё раз — веса скрыты', not await pg.is_checked('#designer') and await pg.evaluate("()=>document.querySelectorAll('#log .weights').length") == 0)
    log_before = await pg.evaluate(LOG)
    await pg.focus('#seed'); await pg.keyboard.press('KeyF'); await pg.keyboard.press('Space')
    ok('в поле ввода клавиши не срабатывают', (await status(pg))['season'] == 'весна, год 3')
    await pg.evaluate("()=>document.activeElement.blur()")
    await pg.fill('#seed', 'замок')
    await pg.evaluate("()=>document.activeElement.blur()")
    await pg.keyboard.press('KeyR')
    ok('R — заново с тем же семенем', (await status(pg))['season'] == 'весна, год 1' and await pg.evaluate(LOG) != log_before)

    # ручки
    ok('панель ручек скрыта', not await pg.evaluate(VIS('#knobs-panel')))
    await pg.keyboard.press('Tab')
    groups = await pg.evaluate("()=>[...document.querySelectorAll('#knobs .knob-group')].map(g=>({sec:g.dataset.sec, n:g.querySelectorAll('.knob').length, title:g.querySelector('summary').textContent}))")
    ok('Tab открывает ручки, сгруппированные по разделам', await pg.evaluate(VIS('#knobs-panel')) and len(groups) >= 12 and all(g['n'] > 0 for g in groups), groups)
    eco = next(g for g in groups if g['sec'] == 'economy')
    ok('ручки хозяйства — своим разделом, натуры и здоровья здесь нет', 'Хозяйство и подать' in eco['title'] and eco['n'] > 80 and not any(g['sec'] in ('natura', 'health') for g in groups), eco)
    before = (await pg.evaluate(YEAR))[3]['cells'][3]
    ok('ручка через __emu меняет число и подсвечивается', await pg.evaluate("()=>window.__emu.setKnob('economy.flow.duties', 2)") == 2
       and await pg.evaluate(KNOB('economy.flow.duties')) == {'val': '2', 'changed': True, 'range': '2'})
    after = (await pg.evaluate(YEAR))[3]['cells'][3]
    ok('ручка сразу меняет прогноз серебра в сводке', before != after, (before, after))
    ok('раздел с изменённой ручкой раскрыт и помечен', await pg.evaluate("()=>{const g=document.querySelector('.knob-group[data-sec=economy]');return g.open&&g.querySelector('summary').textContent.includes('изменено 1')}"))
    await pg.evaluate("()=>{const i=document.querySelector('input[data-knob=\"season.events\"]');i.value=5;i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}))}")
    snap = await pg.evaluate(SNAP)
    ok('ползунок меняет ручку', snap['knobs'] == {'economy.flow.duties': 2, 'season.events': 5} and snap['set'] == 'стало', snap)
    await pg.keyboard.press('Space')
    ok('ручка действует на партию: событий за сезон стало пять', (await pg.evaluate(TITLES)).count('Итог сезона 1') == 1
       and await pg.evaluate("()=>document.querySelectorAll('#log .entry.good, #log .entry.bad, #log .entry.mixed, #log .entry.neutral').length") == 5)

    # «было / стало»
    await pg.keyboard.press('Digit1')
    snap = await pg.evaluate(SNAP)
    ok('1 — набор «было»: значения по умолчанию', snap['knobs'] == {} and snap['set'] == 'было' and (await pg.evaluate(KNOB('economy.flow.duties')))['val'] == '0.5', snap)
    await pg.keyboard.press('Digit2')
    snap = await pg.evaluate(SNAP)
    ok('2 — набор «стало»: правки вернулись', snap['knobs'] == {'economy.flow.duties': 2, 'season.events': 5} and snap['set'] == 'стало', snap)
    await pg.keyboard.press('KeyP')
    dump = await pg.evaluate("()=>document.getElementById('dump-out').value")
    ok('P — выгрузка изменённых ручек текстом', 'economy.flow.duties: 0.5 → 2' in dump and 'season.events: 3 → 5' in dump and len(dump.splitlines()) == 2, dump)
    await pg.click('#knobs-reset')
    snap = await pg.evaluate(SNAP)
    ok('«Сброс» возвращает значения по умолчанию', snap['knobs'] == {} and not (await pg.evaluate(KNOB('season.events')))['changed'], snap)
    await pg.click('#knobs-dump')
    ok('выгрузка без правок так и говорит', 'по умолчанию' in await pg.evaluate("()=>document.getElementById('dump-out').value"))
    await shot(pg, 'emu-knobs')
    await pg.keyboard.press('Tab')
    ok('Tab ещё раз — ручки скрыты', not await pg.evaluate(VIS('#knobs-panel')))

    # заготовки
    presets = await pg.evaluate("()=>[...document.querySelectorAll('#preset option')].map(o=>o.value)")
    ok('заготовок десять и «без заготовки»', len(presets) == 11 and presets[0] == '', presets)
    await pg.select_option('#preset', 'pusto')
    council = await pg.evaluate(COUNCIL)
    ok('заготовка «Пустая должность»: ключника нет, партия начата заново', council[2]['holder'] == '' and (await status(pg))['season'] == 'весна, год 1' and 'Заготовка: Пустая должность' in await pg.evaluate(LOG), council[2])
    await pg.select_option('#preset', 'ambar')
    ok('заготовка «Испытание с пустым амбаром»: еды на сезон, серебра нет', (await pg.evaluate(SNAP))['stock'] == {'eda': 1, 'tovary': 0, 'serebro': 0})
    await pg.select_option('#preset', 'vragi')
    rel = await pg.evaluate("()=>[...document.querySelectorAll('#relations .rel')].map(r=>r.textContent)")
    ok('заготовка «Враги в совете»: все пары — враги', len(rel) == 20 and all(r == 'враги' for r in rel), rel[:5])
    await pg.evaluate("()=>window.__emu.restart('лес', 'nedoimka')")
    ok('__emu.restart ставит семя и заготовку', await pg.input_value('#seed') == 'лес' and 'на исходе' in await pg.evaluate("()=>document.getElementById('year-tax').textContent"))
    await pg.evaluate("()=>window.__emu.season(3)")
    ok('__emu.season гонит сезоны', (await pg.evaluate(SNAP))['season'] == 4)

    # адрес страницы
    url = await pg.evaluate("()=>decodeURIComponent(location.search)")
    ok('адрес помнит семя и заготовку', 'seed=лес' in url and 'preset=nedoimka' in url, url)
    pg2 = await br.new_page()
    pg2.on('pageerror', lambda e: errs.append('ошибка страницы: ' + str(e)))
    await pg2.goto(PAGE + '?seed=герцог&preset=vor&lab=1&designer=1&tab=eco&knobs=1')
    await pg2.wait_for_selector('#eco-cats .cat')
    ok('параметры адреса: семя, заготовка, лабиринт, дизайнер, вкладка, ручки',
       await pg2.input_value('#seed') == 'герцог' and await pg2.input_value('#preset') == 'vor' and await pg2.is_checked('#lab') and await pg2.is_checked('#designer')
       and await pg2.evaluate(VIS('#eco-cats')) and await pg2.evaluate(VIS('#knobs-panel')) and 'Заготовка: Вороватый писарь' in await pg2.evaluate(LOG))
    await pg2.goto(PAGE + '?preset=нет-такой')
    await pg2.wait_for_selector('#people .card')
    ok('неизвестная заготовка в адресе — обычная партия', await pg2.input_value('#preset') == '' and await pg2.input_value('#seed') == 'замок')
    await shot(pg2, 'emu')

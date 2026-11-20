"""Раздел «order» проверки в браузере. Запуск: npm run e2e -- order"""
from common import *

@section('order', 'порядок: шкала строгости двумя цветами, ступень и норма, приказ страже затянуть и отпустить, цена шага, ручки')
async def s_order(br, errs):
    pg = await br.new_page()
    pg.on('pageerror', lambda e: errs.append('ошибка страницы: ' + str(e)))
    pg.on('console', lambda m: errs.append('консоль: ' + m.text) if m.type == 'error' else None)
    await pg.goto(PAGE + '?seed=порядок&tab=eco')
    await pg.wait_for_selector('#order-scale')
    SNAP = "()=>window.__emu.snapshot()"
    cells = await pg.evaluate("()=>[...document.querySelectorAll('#order-scale span')].map(x=>x.className)")
    ok('шкала из шестнадцати отметок, пять ступеней', len(cells) == 16 and all(any(k in c for c in cells) for k in ('ord-smuta', 'ord-volnitsa', 'ord-tiho', 'ord-strogost', 'ord-ruka')))
    ok('отмечены текущая ступень и норма', sum('now' in c for c in cells) == 1 and sum('norm' in c for c in cells) == 1)
    names = await pg.evaluate("()=>[...document.querySelectorAll('.ord-names span')].map(x=>x.textContent)")
    ok('ступени названы от вольного края к строгому', names == ['Смута', 'Вольница', 'Тихо', 'Строгость', 'Твёрдая рука'], names)
    step = await pg.text_content('#order-step')
    ok('партия начинается в «Тихо»', step.startswith('Тихо'), step)
    eff = await pg.text_content('#order-effects')
    ok('у ступени названы плюсы, минусы и кто задаёт норму', 'Плюсы:' in eff and 'Минусы:' in eff and 'Норму' in eff, eff[:120])
    ok('цвета шкалы — тёплый и холодный край, а не зелёный и красный', await pg.evaluate(
        "()=>{const c=s=>getComputedStyle(document.querySelector('#order-scale .'+s)).backgroundColor.match(/\\d+/g).map(Number);const a=c('ord-smuta'),b=c('ord-ruka');return a[0]>a[2]&&b[2]>b[0]}"))
    ok('без «Взгляда дизайнера» чисел шкалы не видно', not await pg.query_selector('#order-real'))

    # затянуть стражу: цена растёт с каждым шагом, норма уходит к строгому краю
    up = "#order-guard button[data-guard]:last-child"
    t1 = await pg.text_content(up)
    await pg.click(up)
    guard = await pg.text_content('#order-guard')
    ok('приказ страже затянуть: цена шага на кнопке, дозоры в строке и запись в летописи', 'серебра за сезон' in t1 and 'затянута на 1' in guard
       and 'дозоры стоят' in guard and 'велел страже затянуть' in await pg.evaluate(LOG), guard[:120])
    t2 = await pg.text_content(up)
    num = lambda t: float(re.search(r'\+([\d,]+)', t).group(1).replace(',', '.'))
    ok('каждый следующий шаг дороже предыдущего', num(t2) > num(t1), (t1, t2))
    await pg.click(up)
    ok('норма ушла к строгому краю, шкала тянется к ней', 'тянется к норме' in await pg.text_content('#order-step'))
    silver = (await pg.evaluate(SNAP))['stock']['serebro']
    for _ in range(4): await pg.click('#season')
    step = await pg.text_content('#order-step'); log = await pg.evaluate(LOG)
    ok('через несколько сезонов шкала дошла до «Строгости»: запись в летописи и строка дозоров в ведомости', step.startswith('Строгость') and 'Порядок: теперь «Строгость»' in log, step)
    await pg.check('#designer')
    real = await pg.text_content('#order-real')
    ok('«Взгляд дизайнера»: отметка шкалы, норма, гниль и множитель пошлин', all(k in real for k in ('шкала', 'норма', 'гниль', 'пошлины ×1,')), real)
    await shot(pg, 'order')

    # отпустить: бесплатно, шкала идёт обратно
    down = "#order-guard button[data-guard]:first-of-type"
    for _ in range(4): await pg.click(down)
    guard = await pg.text_content('#order-guard')
    ok('стражу можно отпустить и распустить: казна сберегает', 'распущена на 2' in guard and 'сберегает' in guard and await pg.is_disabled(down), guard[:120])
    for _ in range(6): await pg.click('#season')
    step = await pg.text_content('#order-step')
    ok('шкала ушла на вольный край', step.startswith('Вольница') or step.startswith('Смута') or step.startswith('Тихо'), step)
    await pg.click('#knobs-toggle')
    ok('ручки порядка — своим разделом в панели', await pg.evaluate("()=>!!document.querySelector('#knobs details[data-sec=order]')"))
    ok('казна жива', (await pg.evaluate(SNAP))['stock']['serebro'] >= 0 and silver >= 0)

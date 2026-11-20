"""Раздел «fall» проверки в браузере. Запуск: npm run e2e -- fall"""
from common import *

@section('fall', 'кризисы и падение: кризис на столе и шрам, под чужой рукой — барон, запреты курса и перестановок, согласие, склонить, раскачать, опала, возвращение')
async def s_fall(br, errs):
    pg = await br.new_page()
    pg.on('pageerror', lambda e: errs.append('ошибка страницы: ' + str(e)))
    pg.on('console', lambda m: errs.append('консоль: ' + m.text) if m.type == 'error' else None)

    # обычная партия: кризисов нет, правила падения названы
    await pg.goto(PAGE + '?seed=падение')
    await pg.wait_for_selector('#fall')
    ok('в обычной партии кризисов нет, а что ведёт к падению — сказано', await pg.query_selector('#crisis-none') and 'отдадут другому' in await pg.text_content('#fall-rules'))
    ok('блока «Под чужой рукой» в обычной партии нет', not await pg.query_selector('#under'))

    # заготовка «Кризис в деревне у брода»: дело на столе, совет решает, остаётся шрам
    await pg.goto(PAGE + '?seed=падение&preset=krizis')
    await pg.wait_for_selector('#fall .crisis.now')
    ok('кризис отмечен на столе Сенешаля', 'Деревня у брода' in await pg.text_content('#fall .crisis.now'))
    desk = await pg.text_content('#desk')
    ok('кризис — дело сезона: три выхода, можно приказать', 'Кризис: Деревня у брода' in desk and len(await pg.query_selector_all('#desk button[data-command]')) == 3, desk[:120])
    await pg.click('button[data-tab=eco]')
    ok('кризис виден и в панели сторон', 'кризис' in await pg.text_content('.side-crisis[data-side-crisis=brod]'))
    await pg.click('button[data-tab=council]')
    await pg.click('#season')
    log = await pg.evaluate(LOG)
    ok('совет решил кризис: в летописи выход и шрам', 'Кризис: Деревня у брода' in log and 'Шрам:' in log, log[:200])
    scar = await pg.text_content('#fall .crisis[data-crisis=brod]')
    ok('шрам держится и назван на столе', 'шрам, ещё' in scar and 'опустевшие дворы' in scar, scar)
    await shot(pg, 'fall-crisis')

    # заготовка «Под чужой рукой»
    await pg.goto(PAGE + '?seed=падение&preset=pod_rukoy')
    await pg.wait_for_selector('#under')
    baron = await pg.text_content('#baron')
    ok('барон назван: кто он и какова натура', 'Ратша' in baron and 'проситель' in baron and 'по натуре' in baron, baron)
    ok('строка состояния говорит «под чужой рукой»', 'Под чужой рукой' in await pg.evaluate(STATUS))
    ok('срок барона и пути его падения названы', 'лес выживет его через 8' in await pg.text_content('#under-armor'))
    rules = await pg.text_content('#under-rules')
    ok('названо, что изменилось: курс, двор, подать, потолок авторитета', all(k in rules for k in ('Курс задаёт барон', 'двор ест', 'Подать и указы', 'Потолок авторитета')), rules[:160])
    ok('без «Взгляда дизайнера» звезды барона и брони числом не видно', not await pg.query_selector('#baron-star') and not await pg.query_selector('#baron-armor'))
    posts = await pg.evaluate(COUNCIL)
    theirs = await pg.query_selector_all('#council .badge[data-retinue]')
    ok('в совете двое-трое людей барона', 2 <= len(theirs) <= 3, len(theirs))
    FREE = "()=>[...document.querySelectorAll('#council select[data-post] option')].filter(o=>!o.selected&&!o.disabled).length"
    ok('перестановки закрыты: без согласия барона выбрать некого', await pg.evaluate(FREE) == 0 and 'только с согласия барона' in await pg.text_content('#council-under'))
    await pg.click('button[data-tab=eco]')
    ok('курс задаёт барон: выбор курса закрыт', await pg.is_disabled('#course') and 'Курс задаёт барон' in await pg.text_content('#course-under'))
    ok('в сводке — сколько барону осталось', 'Под чужой рукой' in await pg.text_content('#year-under'))
    await pg.click('button[data-tab=council]')

    # согласие барона открывает перестановки, но не его людей
    await pg.click('#consent')
    ok('согласие получено: личное дело потрачено, запись в летописи', await pg.query_selector('#consent-on') and 'дал согласие на перестановки' in await pg.evaluate(LOG)
       and 'Личных дел: 2' in await pg.evaluate(STATUS))
    ok('с согласием перестановки открыты', await pg.evaluate(FREE) > 0)
    LOCKED = "()=>[...document.querySelectorAll('#council .post')].filter(p=>p.querySelector('.badge[data-retinue]')).every(p=>[...p.querySelectorAll('option')].every(o=>o.selected||o.disabled))"
    ok('должности людей барона закрыты и с согласием', await pg.evaluate(LOCKED))

    # склонить барона к курсу
    opts = await pg.evaluate("()=>[...document.querySelectorAll('#sway-course option')].map(o=>o.textContent)")
    ok('у каждого курса сказано, по душе ли он барону', len(opts) == 5 and all(any(k in o for k in ('по душе', 'всё равно')) for o in opts), opts)
    await pg.click('#sway')
    ok('разговор с бароном о курсе — личное дело с записью в летописи', 'Разговор с бароном' in await pg.evaluate(LOG) and 'Личных дел: 1' in await pg.evaluate(STATUS))

    # «Взгляд дизайнера» и ручки
    await pg.check('#designer')
    ok('«Взгляд дизайнера»: звезда барона, броня числом, шанс склонить', 'Долг' in await pg.text_content('#baron-star') and 'броня 8 из 8' in await pg.text_content('#baron-armor')
       and 'шанс' in await pg.text_content('#sway-course'))
    await pg.click('#knobs-toggle')
    ok('ручки кризисов и падения — своим разделом в панели', await pg.evaluate("()=>!!document.querySelector('#knobs details[data-sec=fall]')"))
    await pg.click('#knobs-toggle')
    await shot(pg, 'fall-under')

    # раскачать сторону; барон заметил — опала
    await pg.evaluate("()=>window.__emu.setKnob('fall.stirNotice', 1)")
    await pg.click('#stir button[data-stir=kuptsy]')
    log = await pg.evaluate(LOG)
    ok('раскачал сторону — барон заметил: опала в летописи и на столе', 'Против барона' in log and 'Опала' in log and await pg.query_selector('#disgrace'), log[:200])
    ok('в опале личных дел нет: кнопки закрыты', 'Личных дел: 0' in await pg.evaluate(STATUS) and await pg.is_disabled('#sway') and await pg.is_disabled('#stir button[data-stir=brod]')
       and 'опала' in await pg.evaluate(STATUS))
    await pg.click('#season')
    ok('опала длится и в следующем сезоне', 'Личных дел: 0' in await pg.evaluate(STATUS) and await pg.query_selector('#disgrace'))

    # возвращение: броня кончается — барон пал
    await pg.evaluate("()=>window.__emu.season(8)")
    log = await pg.evaluate(LOG)
    ok('барон пал: возвращение в летописи, блока «Под чужой рукой» больше нет', 'Возвращение' in log and not await pg.query_selector('#under'), log[:200])
    ok('на столе — когда и как вернулся', 'вернулся' in await pg.text_content('#fall-past'))
    await pg.click('button[data-tab=eco]')
    ok('курс снова за Сенешалем', not await pg.is_disabled('#course') and not await pg.query_selector('#course-under'))
    ok('запасы живы', all(v >= 0 for v in (await pg.evaluate("()=>window.__emu.snapshot()"))['stock'].values()) and len(posts) == 5)

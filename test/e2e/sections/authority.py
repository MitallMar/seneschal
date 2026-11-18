"""Раздел «authority» проверки в браузере. Запуск: npm run e2e -- authority"""
from common import *

@section('authority', 'авторитет: опора и потолок, ведомость, дело сезона и приказ, обычаи и пиры, уговор вместо снятия, жалобы')
async def s_authority(br, errs):
    pg = await open_game(br, errs, 'замок')
    AUTH = "()=>document.getElementById('auth-line').textContent"
    TXT = lambda i: f"()=>document.getElementById('{i}').textContent"
    line = await pg.evaluate(AUTH)
    ok('авторитет 10 из 15 и опора за сезон со знаком', 'Авторитет 10 из 15' in line and re.search(r'опора за сезон \+0,\d', line), line)
    ok('видно, из чего опора: стороны в «ладят»', 'ладят' in await pg.evaluate(TXT('auth-support')))
    ok('потолок в строке состояния', 'Потолок авторитета: 15' in await pg.evaluate(STATUS))
    ok('до первого сезона ведомости авторитета нет', 'после первого сезона' in await pg.evaluate(TXT('auth-ledger')))

    # дело сезона и приказ
    opts = await pg.evaluate("()=>[...document.querySelectorAll('#desk button[data-command]')].map(b=>({id:b.dataset.command, text:b.textContent, off:b.disabled}))")
    advice = await pg.evaluate(TXT('desk-advice'))
    ok('на столе дело сезона с тремя вариантами и советом', len(opts) == 3 and 'советует' in advice and sum('← совет' in o['text'] for o in opts) == 1, (opts, advice))
    other = next(o for o in opts if '← совет' not in o['text'])
    await pg.click(f"#desk button[data-command='{other['id']}']")
    st = await status(pg)
    ok('приказ тратит личное дело и записан', st['deeds'] == 2 and 'Приказано' in await pg.evaluate(TXT('desk-order')) and 'советует иначе' in await pg.evaluate(LOG), st)
    ok('второй приказ по тому же делу отдать нельзя', await pg.evaluate("()=>[...document.querySelectorAll('#desk button[data-command]')].every(b=>b.disabled)"))

    # обычай: еда превращается в авторитет, второй раз — вдвое меньше
    await pg.click("button[data-feast='prazdnik']")
    line = await pg.evaluate(AUTH); st = await status(pg)
    ok('праздник: авторитет 11, еда 2, личное дело потрачено', 'Авторитет 11 из 15' in line and st['deeds'] == 1 and st['authority'] == 11, (line, st))
    ok('следующий пир за год даст вдвое меньше', '+0,5' in await pg.evaluate(TXT('feast-gain')))
    ok('в ведомости сезона уже есть строка обычая', 'обычай соблюдён' in await pg.evaluate(TXT('auth-now')))

    # уговор: держатель должности, который уйдёт сам
    await pg.check('#designer')
    cards = await pg.evaluate(CARDS)
    best = await pg.evaluate("()=>[...document.querySelectorAll('#people .card.on-post')].map(c=>({id:c.dataset.id, loy:parseFloat((c.querySelector('.card-head').textContent.match(/\\((-?[\\d.]+)\\)/)||[])[1])})).sort((a,b)=>b.loy-a.loy)[0]")
    await pg.uncheck('#designer')
    ok('у держателей должностей есть кнопка «Уговорить уйти», у остальных нет',
       await pg.evaluate("()=>document.querySelectorAll('#people .card.on-post button[data-persuade]').length") == 5
       and await pg.evaluate("()=>document.querySelectorAll('#people .card:not(.on-post) button[data-persuade]').length") == 0)
    await pg.click(f"button[data-persuade='{best['id']}']")
    ok('уговор тратит личное дело и записан в летопись', (await status(pg))['deeds'] == 0 and 'оставить должность' in await pg.evaluate(LOG))
    ok('личные дела кончились: приказы, пиры, уговоры и суд недоступны',
       await pg.evaluate("()=>[...document.querySelectorAll('button[data-persuade],button[data-feast],button[data-command]')].every(b=>b.disabled)"))

    # сезон: дело по приказу, опора в ведомости, новое дело
    await pg.click('#season')
    log = await pg.evaluate(LOG)
    ok('дело сезона исполнено по приказу', '— по приказу' in log and 'Сенешаль приказал' in log, log[:300])
    ledger = await pg.evaluate(TXT('auth-ledger'))
    ok('ведомость авторитета за прошлый сезон: обычай и опора построчно', 'весна, год 1' in ledger and 'обычай соблюдён' in ledger and 'опора' in ledger, ledger)
    ok('на столе новое дело, приказа ещё нет', await pg.evaluate("()=>!document.getElementById('desk-order') && document.querySelectorAll('#desk button[data-command]:not([disabled])').length") == 3)
    ok('опора пришла плюсом в ведомость авторитета', re.search(r'\+0,\d+\s*опора', ledger), ledger)
    if best['loy'] < 10:
        await pg.click(f"button[data-persuade='{best['id']}']")
    agreed = await pg.evaluate("()=>[...document.querySelectorAll('#people .card .badge.agreed')].length")
    if agreed:
        before = await status(pg)
        post = next(c['post'] for c in await pg.evaluate(COUNCIL) if c['holder'] == best['id'])
        await pg.select_option(f"select[data-post='{post}']", '')
        ok('согласившегося сняли без потери авторитета, в летописи — «по уговору»', (await status(pg))['authority'] == before['authority'] and 'по уговору' in await pg.evaluate(LOG))
    ok('самый лояльный в совете согласился уйти за один-два разговора', agreed == 1, best)

    # долгая партия: авторитет не выше потолка, жалобы приходят на стол и разбираются
    judged = False
    for _ in range(30):
        await pg.click('#season')
        if not judged and await pg.evaluate("()=>document.querySelectorAll('#complaints button[data-judge]').length"):
            before = await status(pg)
            await pg.click('#complaints button[data-judge]')
            after = await status(pg)
            judged = True
            ok('суд лично: жалоба разобрана, авторитет не меньше, личное дело потрачено', after['authority'] >= before['authority'] and after['deeds'] == before['deeds'] - 1 and 'Суд лично' in await pg.evaluate(LOG), (before, after))
        if (await status(pg))['authority'] > 15: break
    ok('за тридцать сезонов авторитет ни разу не выше потолка', (await status(pg))['authority'] <= 15, await status(pg))
    if not judged:   # в этой партии совет не ссорился: жалобу берём из заготовки «Враги в совете», там она приходит в первые сезоны
        pg3 = await br.new_page()
        pg3.on('pageerror', lambda e: errs.append('ошибка страницы: ' + str(e)))
        await pg3.goto(PAGE + '?seed=замок&preset=vragi')
        await pg3.wait_for_selector('#people .card')
        for _ in range(12):
            await pg3.click('#season')
            if await pg3.evaluate("()=>document.querySelectorAll('#complaints button[data-judge]').length"):
                before = await status(pg3)
                await pg3.click('#complaints button[data-judge]')
                after = await status(pg3)
                judged = True
                ok('суд лично: жалоба разобрана, авторитет не меньше, личное дело потрачено', after['authority'] >= before['authority']
                   and after['deeds'] == before['deeds'] - 1 and 'Суд лично' in await pg3.evaluate(LOG), (before, after))
                break
        await pg3.close()
    ok('жалоба пришла на стол и была разобрана', judged)
    await shot(pg, 'authority')

    # слово весит меньше: траты до порога, потом надбавка; без авторитета перестановка недоступна
    pg = await open_game(br, errs, 'лес')
    ORDERS = "()=>[...document.querySelectorAll('#people select[data-order]')].filter(s=>!s.value&&!s.options[1].disabled).map(s=>s.closest('.card').dataset.id)"
    for _ in range(6):
        ids = await pg.evaluate(ORDERS)
        await pg.select_option(f"#people .card[data-id='{ids[0]}'] select[data-order]", 'dolg')
    st = await status(pg)
    ok('шесть наказов по единице: авторитет 4, слово весит меньше', st['authority'] == 4 and 'каждая трата дороже на 1' in await pg.evaluate("()=>document.getElementById('auth-weak')?.textContent||''"), st)
    ids = await pg.evaluate(ORDERS)
    await pg.select_option(f"#people .card[data-id='{ids[0]}'] select[data-order]", 'dolg')
    ok('ниже порога наказ стоит уже 2', (await status(pg))['authority'] == 2, await status(pg))
    ids = await pg.evaluate(ORDERS)
    await pg.select_option(f"#people .card[data-id='{ids[0]}'] select[data-order]", 'dolg')
    ok('авторитет дошёл до нуля и ниже не идёт', (await status(pg))['authority'] == 0)
    ok('без авторитета новый наказ недоступен', await pg.evaluate(ORDERS) == [])
    council = await pg.evaluate(COUNCIL)
    ok('без авторитета снять с должности нельзя: пункт «пусто» закрыт и подписан',
       all('не хватает' in c['options'][0]['text'] for c in council)
       and await pg.evaluate("()=>[...document.querySelectorAll('#council select')].every(s=>s.options[0].disabled)"), council[0]['options'][0])
    ok('уговорить уйти по-прежнему можно', await pg.evaluate("()=>document.querySelectorAll('button[data-persuade]:not([disabled])').length") == 5)

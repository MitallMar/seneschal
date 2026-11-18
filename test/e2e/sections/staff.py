"""Раздел «staff» проверки в браузере. Запуск: npm run e2e -- staff"""
from common import *

@section('staff', 'перестановки: человек без должности на чужое место за авторитет, пустая должность, желанная бесплатно, главный')
async def s_staff(br, errs):
    pg = await open_game(br, errs, 'замок')
    council = await pg.evaluate(COUNCIL); cards = await pg.evaluate(CARDS)
    free = [c for c in cards if not c['onPost']]
    post = council[3]                                   # писарь-казначей
    opt = next(o for o in post['options'] if o['value'] == free[0]['id'])
    price = re.search(r'−(\d+) авт\.', opt['text'])
    ok('в списке должности у чужого человека названа цена в авторитете', price is not None, opt['text'])
    cost = int(price.group(1)) if price else 0
    old = post['who'].split(' · ')[0]
    await pg.select_option(f"select[data-post='{post['post']}']", free[0]['id'])
    st = await status(pg); council = await pg.evaluate(COUNCIL); cards = await pg.evaluate(CARDS); log = await pg.evaluate(LOG)
    ok('перестановка списала авторитет по цене из списка', st['authority'] == 10 - cost and cost >= 1, (st, cost))
    ok('на должности новый человек, новичок без стажа', council[3]['holder'] == free[0]['id'] and 'новичок · 0 сез.' in council[3]['badges'], council[3]['badges'])
    ok('прежний держатель остался без должности', not next(c for c in cards if c['name'] == old)['onPost'])
    ok('в летописи запись о перестановке: кто снят, кто назначен, сколько авторитета', 'Перестановка' in log and old in log
       and free[0]['name'] in log and f'Авторитет −{cost}.' in log, log[:400])
    await shot(pg, 'staff')

    await pg.select_option("select[data-post='lesnichiy']", '')
    st2 = await status(pg); council = await pg.evaluate(COUNCIL)
    ok('должность можно оставить пустой; снять человека против воли стоит авторитета', council[4]['holder'] == ''
       and council[4]['badges'] == [] and st2['authority'] < st['authority'], (st2, council[4]))
    empty = [o for o in council[4]['options'] if o['value'] in [c['id'] for c in cards if not c['onPost']] and o['value'] != '']
    ok('на пустую должность человек без должности встаёт бесплатно: цены в списке нет', empty and all('авт.' not in o['text'] for o in empty), empty)
    await pg.select_option("select[data-post='lesnichiy']", empty[0]['value'])
    ok('назначение на пустую должность авторитета не списало', (await status(pg))['authority'] == st2['authority'])

    council = await pg.evaluate(COUNCIL)
    other = next(i for i, c in enumerate(council) if not c['head'] and c['holder'] != '')
    await pg.click(f"#council .post:nth-child({other + 1}) button[data-head]")
    council = await pg.evaluate(COUNCIL)
    ok('«сделать главным»: главный сменился и он один, запись в летописи', council[other]['head'] and sum(c['head'] for c in council) == 1
       and 'Главный на время отлучки' in await pg.evaluate(LOG), [c['head'] for c in council])
    await pg.click('#season5')
    ok('после перестановок сезоны идут', (await status(pg))['season'] == 'лето, год 2')

    # желанная должность: во «Взгляде дизайнера» стремления видны; ищем того, кто хочет должность и не сидит на ней
    await pg.check('#designer')
    council = await pg.evaluate(COUNCIL)
    wish = [(c, o) for c in council for o in c['options'] if 'хочет сюда' in o['text'] and o['value'] != c['holder']]
    ok('в списках должностей помечено, кто хочет сюда', len(wish) > 0)
    if wish:
        c, o = wish[0]; before = await status(pg)
        holder_cost = 0 if c['holder'] == '' else None
        await pg.select_option(f"select[data-post='{c['post']}']", o['value'])
        after = await status(pg); log = await pg.evaluate(LOG)
        ok('получивший желанную должность благодарен', 'желанную должность' in log, log[:300])
        ok('перевод на желанную пустую должность бесплатен', holder_cost is None or after['authority'] == before['authority'], (before, after))

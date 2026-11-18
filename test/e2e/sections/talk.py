"""Раздел «talk» проверки в браузере. Запуск: npm run e2e -- talk"""
from common import *

@section('talk', 'личные дела: разговоры открывают стремление, склонности и черту по порядку и тратят дело, наказ стоит авторитета')
async def s_talk(br, errs):
    pg = await open_game(br, errs, 'замок')
    who = next(c for c in await pg.evaluate(CARDS) if not c['onPost'] and c['name'] not in HIDDEN)   # о нём известна только молва
    me = lambda cards: next(c for c in cards if c['id'] == who['id'])
    btn = f"button[data-talk='{who['id']}']"
    ok('до разговора: черта неизвестна, кнопка зовёт говорить о стремлении', not who['traitKnown'] and who['talkText'] == 'Поговорить: стремление', who)
    await pg.click(btn)
    st = await status(pg); card = me(await pg.evaluate(CARDS)); log = await pg.evaluate(LOG)
    ok('разговор потратил личное дело', st['deeds'] == 2, st)
    ok('первый разговор открыл стремление — и только его', not card['traitKnown'] and 'неизвестно' not in card['asp'] and closed(card)
       and 'разговоров: 1' in card['meta'] and card['talkText'] == 'Поговорить: склонности', card)
    ok('в летописи запись о разговоре со стремлением', 'Разговор' in log and 'Стремление:' in log, log[:200])
    await pg.click(btn)
    card = me(await pg.evaluate(CARDS))
    ok('второй разговор открыл склонности словами, без чисел; черта ещё закрыта', all(a['known'] and a['lvl'] in WORDS for a in card['axes'])
       and card['rays'] == 5 and not re.search(r'\d\.\d', card['stats']) and not card['traitKnown'] and card['talkText'] == 'Поговорить: черты', card['axes'])
    ok('в летописи склонности названы словами', re.search(r'Склонности: Долг — (сильно|заметно|слабо)', await pg.evaluate(LOG)) is not None)
    await pg.click(btn)
    st = await status(pg); cards = await pg.evaluate(CARDS); card = me(cards); log = await pg.evaluate(LOG)
    ok('третий разговор открыл ключевую черту', card['traitKnown'] and 'Ключевая черта: «' + card['trait'] + '»' in log, log[:200])
    ok('рассказывать больше нечего: кнопка говорит об этом', card['talkText'] == 'Всё рассказал' and not card['talk'])
    ok('личные дела кончились: кнопки «Поговорить» выключены у всех', st['deeds'] == 0 and not any(c['talk'] for c in cards), st)
    council = await pg.evaluate(COUNCIL)
    mine = [o['text'] for c in council for o in c['options'] if o['value'] == who['id']]
    ok('о том, чьи склонности известны, в списках должностей сказано «подходит» или «сомнительно»', len(mine) == 5
       and all('не знаю' not in t and ('подходит' in t or 'сомнительно' in t) for t in mine), mine)
    await shot(pg, 'talk')

    holder = next(c for c in council if c['holder'] != '')
    await pg.select_option(f"select[data-order='{holder['holder']}']", 'zabota')
    st = await status(pg); log = await pg.evaluate(LOG)
    ok('наказ стоит единицу авторитета и записан в летопись', st['authority'] == 9 and 'действуй по Заботе' in log, st)
    card = next(c for c in await pg.evaluate(CARDS) if c['id'] == holder['holder'])
    ok('наказ виден на карточке', card['order'] == 'zabota')
    await pg.select_option(f"select[data-order='{holder['holder']}']", 'dolg')
    await pg.select_option(f"select[data-order='{holder['holder']}']", '')
    ok('сменить и снять наказ — бесплатно', (await status(pg))['authority'] == 9)

    await pg.click('#season')
    st = await status(pg); cards = await pg.evaluate(CARDS)
    ok('новый сезон вернул три личных дела; с кем не договорили — кнопка снова включена', st['deeds'] == 3
       and not me(cards)['talk'] and all(c['talk'] for c in cards if c['id'] != who['id']), st)

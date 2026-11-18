"""Раздел «know» проверки в браузере. Запуск: npm run e2e -- know"""
from common import *

@section('know', 'знание о людях: молва, скрытая черта, наблюдение в деле, годность словом, мнение главного, черты по ходу жизни')
async def s_know(br, errs):
    pg = await open_game(br, errs, 'замок')
    council = await pg.evaluate(COUNCIL); cards = await pg.evaluate(CARDS)
    people = [o for c in council for o in c['options'] if o['value'] != '']
    ok('в списках должностей годность словом у каждого, чисел годности нет', len(people) == 50
       and all(any(w in o['text'] for w in FIT) and 'годн.' not in o['text'] for o in people), people[:3])
    ok('пока людей не знаем, почти про всех — «не знаю»; чужие стремления в списках не видны', sum('не знаю' in o['text'] for o in people) >= 40
       and not any('хочет сюда' in o['text'] for o in people))
    head = next(c for c in council if c['head'])
    ok('мнение главного — подсказка на карточке у всех, кроме самого главного', all((c['opinion'] == '') == (c['id'] == head['holder']) for c in cards)
       and all(re.search(r'Главный, .+: «(годится в |ни на одну должность не годится)', c['opinion']) for c in cards if c['opinion']),
       [c['opinion'] for c in cards][:3])
    ok('молва — строка «Говорят, …»', all(c['rumor'].startswith('Говорят, ') for c in cards if c['rumor']), [c['rumor'] for c in cards])

    sly = next(c for c in cards if c['name'] == HIDDEN[0])
    await pg.click(f"button[data-talk='{sly['id']}']")
    card = next(c for c in await pg.evaluate(CARDS) if c['id'] == sly['id']); log = await pg.evaluate(LOG)
    ok('первый разговор со скрытным — о стремлении; следующий — о склонностях', 'неизвестно' not in card['asp'] and (await status(pg))['deeds'] == 2
       and 'Стремление:' in log and card['talkText'] == 'Поговорить: склонности', (card['asp'], card['talkText']))
    await pg.click(f"button[data-talk='{sly['id']}']")
    card = next(c for c in await pg.evaluate(CARDS) if c['id'] == sly['id']); log = await pg.evaluate(LOG)
    ok('скрытую черту разговор не открыл: о ней сказано в разговоре о склонностях, на карточке «выдаст поступок»', not card['traitKnown']
       and 'выдаст поступок' in card['trait'] and (await status(pg))['deeds'] == 1 and 'выдаст только поступок' in log and 'Склонности:' in log, card['trait'])

    await pg.click('#season')
    cards = await pg.evaluate(CARDS)
    seen = [c for c in cards if any(a['seen'] for a in c['axes'])]
    ok('после сезона у тех, кто решал, отметки «видели» у задетых осей', len(seen) >= 1 and all(c['onPost'] for c in seen)
       and all(re.fullmatch(r'видели: \d+', a['seen']) for c in seen for a in c['axes'] if a['seen']), [(c['name'], c['axes']) for c in seen][:2])
    await pg.click('#season5'); await pg.click('#season5')
    cards = await pg.evaluate(CARDS); log = await pg.evaluate(LOG)
    watched = [c for c in cards if 'разговоров: 0' in c['meta'] and any(a['known'] for a in c['axes'])]
    ok('насмотрелись в деле: ось видна словом без единого разговора, остальные — «?»', len(watched) >= 1
       and all(a['lvl'] in WORDS if a['known'] else a['lvl'] == '?' for c in watched for a in c['axes'])
       and any(not a['known'] for c in watched for a in c['axes']) and 'Насмотрелись в деле' in log, [(c['name'], c['axes']) for c in watched][:2])
    ok('звезда рисуется только из известного: лучей столько, сколько известных осей', all(c['rays'] == sum(a['known'] for a in c['axes']) for c in cards))
    ok('кто не был в деле и с кем не говорили — по-прежнему закрыт', all(closed(c) for c in cards if not c['onPost'] and 'разговоров: 0' in c['meta']))
    council = await pg.evaluate(COUNCIL)
    w0 = watched[0] if watched else cards[0]
    ok('по тому, что насмотрели, годность уже не везде «не знаю»', any('не знаю' not in o['text'] for c in council for o in c['options'] if o['value'] == w0['id']))
    ok('о том, у кого видна сильная склонность, есть прогноз', 'скорее всего, будет действовать по' in await pg.inner_text('#council')
       or not any(a['lvl'] == 'сильно' for c in cards if c['onPost'] for a in c['axes']))
    await shot(pg, 'know')

    for _ in range(3): await pg.click('#season5')
    cards = await pg.evaluate(CARDS); log = await pg.evaluate(LOG)
    grown = [c for c in cards if c['gained']]
    ok('за четыре с лишним года люди нажили черты: метки на карточках, записи в летописи и биографии', len(grown) >= 2 and '✦ Новая черта:' in log
       and all(c['bio'] >= 6 + len(c['gained']) for c in grown), [(c['name'], c['gained'], c['bio']) for c in cards])
    ok('приобретённых черт у человека не больше трёх, должностные не в счёт', all(len([g for g in c['gained'] if g not in POST_TRAITS]) <= 3 for c in cards))
    ok('должностные черты — только у тех, кто на должности', all(c['onPost'] for c in cards if any(g in POST_TRAITS for g in c['gained'])),
       [(c['name'], c['gained']) for c in cards if not c['onPost']])
    ok('мусора в летописи нет', not re.search(r'undefined|NaN|\{|\}', log))
    await pg.check('#designer')
    cards = await pg.evaluate(CARDS)
    ok('взгляд дизайнера показывает и то, чего Сенешаль не знает', all(c['traitKnown'] and 'неизвестно' not in c['asp'] for c in cards))
    await shot(pg, 'know-designer')

    pg2 = await open_game(br, errs, 'лес')              # в этой партии о двоих в совете с начала известна черта
    cards = await pg2.evaluate(CARDS)
    known = [c for c in cards if c['traitKnown']]
    ok('первая посадка: у кого известна черта, у того нет молвы, и первый разговор с ним — не о ключевой черте', len(known) >= 1
       and all(c['onPost'] and c['rumor'] == '' for c in known) and any(c['talkText'] == 'Поговорить: стремление' for c in known),
       [(c['name'], c['trait'], c['talkText']) for c in known])

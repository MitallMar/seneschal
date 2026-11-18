"""Раздел «designer» проверки в браузере. Запуск: npm run e2e -- designer"""
from common import *

@section('designer', '«Взгляд дизайнера»: настоящие числа, стремления, годность, стартовая звезда; выключается обратно')
async def s_designer(br, errs):
    pg = await open_game(br, errs, 'замок')
    await pg.click('#season5')
    plain = {'cards': await pg.evaluate(CARDS), 'council': await pg.evaluate(COUNCIL), 'rel': await pg.inner_text('#relations'), 'log': await pg.evaluate(LOG)}
    ok('без взгляда дизайнера чисел отношений, лояльности, годности и склонностей нет', not re.search(r'-?\d+\.\d', plain['rel'])
       and not any(re.search(r'\(-?\d+\.\d\)', c['meta']) or re.search(r'\d\.\d', c['stats']) for c in plain['cards'])
       and not any('годн.' in o['text'] for c in plain['council'] for o in c['options']))
    ok('без взгляда дизайнера настоящей звезды нет, доля решений по ведущей оси скрыта', all(c['real'] == 0 and c['start'] == 0
       and 'по ведущей оси' not in c['stats'] for c in plain['cards']))
    await pg.check('#designer')
    cards = await pg.evaluate(CARDS); council = await pg.evaluate(COUNCIL); rel = await pg.inner_text('#relations')
    ok('у каждого видна лояльность числом и стремление', all(re.search(r'\(-?\d+\.\d\)', c['meta']) and 'неизвестно' not in c['asp'] for c in cards),
       [(c['meta'], c['asp']) for c in cards][:3])
    ok('настоящие звёзды, пунктиром — звезда на старте, у каждой оси число', all(c['real'] == 1 and c['start'] == 1
       and len(re.findall(r'\d+\.\d', ' '.join(a['lvl'] for a in c['axes']))) == 5 for c in cards), cards[0]['axes'])
    ok('ключевые черты видны у всех, скрытые помечены; про молву сказано, верная ли', all(c['traitKnown'] for c in cards)
       and all('(скрытая)' in c['trait'] for c in cards if c['name'] in HIDDEN)
       and all('молва верная' in c['rumor'] or 'молва неверная' in c['rumor'] for c in cards if c['rumor']), [(c['name'], c['trait'], c['rumor']) for c in cards])
    ok('в отношениях совета видны числа', len(re.findall(r'-?\d+\.\d', rel)) == 20, rel[:200])
    ok('в списках должностей видна годность каждого', all('годн.' in o['text'] for c in council for o in c['options'] if o['value'] != ''))
    ok('у члена совета названа ведущая ось', await pg.evaluate("()=>[...document.querySelectorAll('#council .forecast')].every(f=>f.textContent.includes('ведущая ось'))"))
    ok('взгляд дизайнера партию не меняет: летопись та же', await pg.evaluate(LOG) == plain['log'])
    await shot(pg, 'designer')
    await pg.click('#season')
    ok('сезон под взглядом дизайнера идёт, числа на месте', (await status(pg))['season'] == 'осень, год 2'
       and len(re.findall(r'-?\d+\.\d', await pg.inner_text('#relations'))) == 20)
    await pg.uncheck('#designer')
    cards = await pg.evaluate(CARDS)
    ok('выключили — числа и чужие стремления снова скрыты', not re.search(r'-?\d+\.\d', await pg.inner_text('#relations'))
       and all(c['real'] == 0 and 'неизвестно' in c['asp'] for c in cards) and any(not c['traitKnown'] for c in cards))

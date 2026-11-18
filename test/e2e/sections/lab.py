"""Раздел «lab» проверки в браузере. Запуск: npm run e2e -- lab"""
from common import *

@section('lab', 'лабиринт: приключенцы приходят только при галочке «Лабиринт открыт»; долгая партия в 80 сезонов')
async def s_lab(br, errs):
    pg = await open_game(br, errs, 'замок')
    for _ in range(4): await pg.click('#season5')
    ok('лабиринт закрыт: приключенцев в летописи нет', not any('⚔' in t for t in await pg.evaluate(TITLES)))
    await pg.check('#lab')
    for _ in range(4): await pg.click('#season5')
    titles = await pg.evaluate(TITLES)
    ok('лабиринт открыт на ходу: приключенцы появились', any('⚔' in t for t in titles), len(titles))
    for _ in range(8): await pg.click('#season5')
    st = await status(pg); council = await pg.evaluate(COUNCIL)
    ok('80 сезонов, двадцать лет: страница жива', st['season'] == 'весна, год 21', st)
    ok('летопись показывает последние 250 записей', await pg.evaluate("()=>document.querySelectorAll('#log .entry').length") == 250)
    ok('за 20 лет кто-то в совете засиделся', any('засиделся' in c['badges'] for c in council), [c['badges'] for c in council])
    ok('мусора в летописи нет', not re.search(r'undefined|NaN|\{|\}', await pg.evaluate(LOG)))
    await shot(pg, 'long')
    await pg.click('#new')
    ok('новая партия с галочкой лабиринта стартует', (await status(pg))['season'] == 'весна, год 1' and await pg.is_checked('#lab'))

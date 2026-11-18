#!/usr/bin/env python3
"""Проверка собранного прототипа в настоящем браузере: python3 test/e2e/smoke.py  (перед этим npm run build)

Открывает dist/index.html в Chrome и играет: гоняет сезоны, переставляет людей, говорит с ними, даёт наказ,
включает «Взгляд дизайнера» и лабиринт. После каждого раздела — ошибок на странице и в консоли быть не должно.
Снимки экранов кладутся в test/e2e/shots/ (в git не идут; на GitHub прикладываются к прогону).

Проверка разбита на независимые разделы: у каждого своя вкладка браузера и своя партия, порядок не важен.
  npm run e2e                     все разделы
  npm run e2e -- staff talk       только названные (имя или его начало)
  npm run e2e -- --list           список разделов
  npm run e2e -- --jobs 1         сколько разделов идёт одновременно (или переменная E2E_JOBS). По умолчанию 3, на GitHub 1
Раздел, упавший с ошибкой в самой проверке, считается непройденным, остальные разделы идут дальше.
Новый раздел: функция с @section(имя, что проверяет) в этом файле; свою вкладку она открывает сама через br.new_page.
Браузер: переменная CHROME или /usr/bin/google-chrome; если такого файла нет — Chromium, поставленный командой playwright install chromium.
"""
import asyncio, contextvars, os, re, sys, time, traceback
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / 'dist' / 'index.html'
PAGE = DIST.as_uri()
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
SHOTS = ROOT / 'test' / 'e2e' / 'shots'
VIEW = {'width': 1440, 'height': 900}
fails, count = 0, 0
NOW = contextvars.ContextVar('section', default='-')   # раздел, который сейчас идёт: им помечается непройденная проверка
SECTIONS = []                                          # разделы по порядку: { key, title, fn }

def section(key, title):
    """Раздел проверки: fn(br, errs). br открывает вкладки (new_page), errs собирает ошибки страницы и консоли."""
    def reg(fn): SECTIONS.append({'key': key, 'title': title, 'fn': fn}); return fn
    return reg

def ok(name, cond, info=''):
    global fails, count
    count += 1
    if not cond: fails += 1
    if not cond or os.environ.get('VERBOSE'): print('ok  ' if cond else 'FAIL', '[' + NOW.get() + ']', name, info)
    if not cond and os.environ.get('GITHUB_ACTIONS'): print(f'::error title=Проверка в браузере [{NOW.get()}]::{name} {str(info)[:300]}')

# ---------- что видно на странице ----------

STATUS = "()=>document.getElementById('status').textContent"
LOG = "()=>[...document.querySelectorAll('#log .entry')].map(e=>e.textContent).join('\\n')"
TITLES = "()=>[...document.querySelectorAll('#log .entry-title')].map(e=>e.lastChild.textContent)"
COUNCIL = """()=>[...document.querySelectorAll('#council .post')].map(p=>{const s=p.querySelector('select');return {
  post:s.dataset.post, name:p.querySelector('.post-name').textContent, holder:s.value, who:s.selectedOptions[0].textContent,
  badges:[...p.querySelectorAll('.badge')].map(b=>b.textContent), head:!!p.querySelector('.badge.head'),
  options:[...s.options].map(o=>({value:o.value,text:o.textContent}))}})"""
CARDS = """()=>[...document.querySelectorAll('#people .card')].map(c=>({name:c.querySelector('.card-name').textContent, id:c.dataset.id,
  meta:[...c.querySelectorAll('.card-meta')].map(m=>m.textContent).join(' | '), onPost:c.classList.contains('on-post'),
  asp:c.querySelector('.tag.asp').textContent, trait:c.querySelector('.tag.trait.key').textContent,
  traitKnown:!c.querySelector('.tag.trait.key.unknown'), gained:[...c.querySelectorAll('.tag.gained')].map(t=>t.textContent),
  rumor:c.querySelector('.rumor')?.textContent||'', opinion:c.querySelector('.opinion')?.textContent||'',
  axes:[...c.querySelectorAll('.axis-row')].map(r=>({axis:r.dataset.axis, known:r.dataset.known==='1',
    lvl:r.querySelector('.lvl').textContent.trim(), seen:r.querySelector('.seen').textContent})),
  grid:c.querySelectorAll('.star polygon.grid').length, rays:c.querySelectorAll('.star line.ray').length,
  real:c.querySelectorAll('.star polygon.true').length, start:c.querySelectorAll('.star polygon.start').length,
  bio:c.querySelectorAll('.bio li').length, talk:!c.querySelector('button[data-talk]').disabled,
  talkText:c.querySelector('button[data-talk]').textContent,
  order:c.querySelector('select[data-order]').value, stats:c.querySelector('.stats').textContent}))"""
WORDS = ('сильно', 'заметно', 'слабо')
FIT = ('подходит', 'сомнительно', 'не знаю')
POST_TRAITS = ('Мастер своего дела', 'Оброс связями', 'Устал от службы')  # в предел не входят, уходят вслед за должностью
HIDDEN = ('Неждан', 'Ярема')                           # у них ключевая черта скрытая: разговор её не открывает

def closed(c):
    """Склонности человека закрыты: у всех осей «?»."""
    return all(not a['known'] and a['lvl'] == '?' for a in c['axes'])

async def status(pg):
    """Строка состояния числами: сезон словами, авторитет, личные дела."""
    text = await pg.evaluate(STATUS)
    m = re.search(r'Сейчас: (.+?) · Авторитет: (-?[\d.]+) · Личных дел: (\d+)', text)
    return {'season': m.group(1), 'authority': float(m.group(2)), 'deeds': int(m.group(3))} if m else {'season': text, 'authority': None, 'deeds': None}

async def open_game(br, errs, seed=None):
    """Новая вкладка с прототипом; с семенем — сразу новая партия по нему."""
    pg = await br.new_page()
    pg.on('pageerror', lambda e: errs.append('ошибка страницы: ' + str(e)))
    pg.on('console', lambda m: errs.append('консоль: ' + m.text) if m.type == 'error' else None)
    await pg.goto(PAGE)
    await pg.wait_for_selector('#people .card')
    if seed is not None:
        await pg.fill('#seed', seed); await pg.click('#new')
    return pg

async def shot(pg, name):
    await pg.screenshot(path=str(SHOTS / (name + '.png')), full_page=True)

# ---------- разделы ----------

@section('base', 'запуск, сезоны по одному и по пять, летопись, новая партия: то же семя даёт ту же летопись, другое — другую')
async def s_base(br, errs):
    pg = await open_game(br, errs)
    st = await status(pg); council = await pg.evaluate(COUNCIL); cards = await pg.evaluate(CARDS)
    ok('страница открылась: заголовок, весна первого года, авторитет 10, три личных дела', 'Сенешаль' in await pg.title()
       and st == {'season': 'весна, год 1', 'authority': 10.0, 'deeds': 3}, st)
    ok('в совете пять должностей, все заняты, главный один', len(council) == 5 and all(c['holder'] != '' for c in council)
       and sum(c['head'] for c in council) == 1, [(c['name'], c['who'], c['head']) for c in council])
    ok('десять человек, у каждого биография из шести событий и сетка звезды', len(cards) == 10
       and all(c['bio'] == 6 and c['grid'] == 4 for c in cards), [(c['name'], c['bio'], c['grid']) for c in cards])
    ok('пятеро в совете отмечены на карточках', sum(c['onPost'] for c in cards) == 5)
    ok('до разговора склонности закрыты («?»), звезды нет, стремление неизвестно', all(closed(c) and c['rays'] == 0 and c['real'] == 0
       and 'неизвестно' in c['asp'] for c in cards), [(c['name'], c['axes']) for c in cards][:2])
    ok('о каждом известна одна вещь: молва или черта', all((c['rumor'] != '') != c['traitKnown'] for c in cards),
       [(c['name'], c['rumor'], c['trait']) for c in cards])
    ok('черта с начала известна только у членов совета', all(c['onPost'] for c in cards if c['traitKnown']))
    ok('вверху строка-подсказка, как узнавать людей', 'поговорить' in await pg.inner_text('#tip') and 'в деле' in await pg.inner_text('#tip'))
    ok('отношения в совете: таблица пять на пять со словами', await pg.evaluate("()=>document.querySelectorAll('#relations .rel').length") == 20)
    ok('летопись начинается с записи о новой партии', await pg.evaluate(TITLES) == ['Новая партия, семя «замок»'])
    await shot(pg, 'start')

    await pg.click('#season')
    st = await status(pg); titles = await pg.evaluate(TITLES)
    ok('сезон прошёл: лето, в летописи три события и итог сезона сверху', st['season'] == 'лето, год 1' and len(titles) == 5
       and titles[0] == 'Итог сезона 1', (st, titles))
    ok('у события в летописи есть текст решения и последствия', await pg.evaluate(
        "()=>[...document.querySelectorAll('#log .entry')].filter(e=>e.querySelector('.eff')).every(e=>e.querySelectorAll('p').length>=2)")
       and await pg.evaluate("()=>document.querySelectorAll('#log .eff span').length") > 0)
    await pg.click('#season5')
    st = await status(pg); titles = await pg.evaluate(TITLES); cards = await pg.evaluate(CARDS)
    ok('+5 сезонов: осень второго года, в летописи шесть итогов', st['season'] == 'осень, год 2'
       and len([t for t in titles if t.startswith('Итог сезона')]) == 6, (st, len(titles)))
    ok('у членов совета накопились решения', any('Решений: 0' not in c['stats'] for c in cards if c['onPost']), [c['stats'] for c in cards])
    ok('мусора в летописи нет', not re.search(r'undefined|NaN|\{|\}', await pg.evaluate(LOG)))
    log_a = await pg.evaluate(LOG)
    await shot(pg, 'seasons')

    await pg.click('#new'); await pg.click('#season'); await pg.click('#season5')
    ok('новая партия с тем же семенем повторяет летопись слово в слово', await pg.evaluate(LOG) == log_a)
    await pg.fill('#seed', 'другое семя'); await pg.click('#new')
    st = await status(pg)
    ok('новая партия сбрасывает сезон и летопись', st['season'] == 'весна, год 1' and await pg.evaluate(TITLES) == ['Новая партия, семя «другое семя»'], st)
    await pg.click('#season'); await pg.click('#season5')
    ok('другое семя даёт другую летопись', await pg.evaluate(LOG) != log_a)
    await pg.fill('#seed', ''); await pg.click('#new')
    ok('пустое семя — партия по семени «замок»', await pg.evaluate(TITLES) == ['Новая партия, семя «замок»'])

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

@section('talk', 'личные дела: разговоры открывают черту, стремление и склонности по порядку и тратят дело, наказ стоит авторитета')
async def s_talk(br, errs):
    pg = await open_game(br, errs, 'замок')
    who = next(c for c in await pg.evaluate(CARDS) if not c['onPost'] and c['name'] not in HIDDEN)   # о нём известна только молва
    me = lambda cards: next(c for c in cards if c['id'] == who['id'])
    btn = f"button[data-talk='{who['id']}']"
    ok('до разговора: черта неизвестна, кнопка зовёт говорить о чертах', not who['traitKnown'] and who['talkText'] == 'Поговорить: черты', who)
    await pg.click(btn)
    st = await status(pg); card = me(await pg.evaluate(CARDS)); log = await pg.evaluate(LOG)
    ok('разговор потратил личное дело', st['deeds'] == 2, st)
    ok('первый разговор открыл ключевую черту — и только её', card['traitKnown'] and 'неизвестно' in card['asp'] and closed(card)
       and 'разговоров: 1' in card['meta'], card)
    ok('в летописи запись о разговоре с названием черты', 'Разговор' in log and 'Ключевая черта: «' + card['trait'] + '»' in log, log[:200])
    await pg.click(btn)
    card = me(await pg.evaluate(CARDS))
    ok('второй разговор открыл стремление, склонности ещё закрыты', 'неизвестно' not in card['asp'] and closed(card)
       and card['talkText'] == 'Поговорить: склонности', card)
    await pg.click(btn)
    st = await status(pg); cards = await pg.evaluate(CARDS); card = me(cards)
    ok('третий разговор открыл склонности словами, без чисел', all(a['known'] and a['lvl'] in WORDS for a in card['axes'])
       and card['rays'] == 5 and not re.search(r'\d\.\d', card['stats']), card['axes'])
    ok('в летописи склонности названы словами', re.search(r'Склонности: Долг — (сильно|заметно|слабо)', await pg.evaluate(LOG)) is not None)
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
    ok('скрытую черту разговор не открыл: дело потрачено, на карточке «выдаст поступок»', not card['traitKnown'] and 'выдаст поступок' in card['trait']
       and (await status(pg))['deeds'] == 2 and 'выдаст только поступок' in log, card['trait'])
    ok('тем же разговором скрытный рассказал о стремлении; следующий разговор — о склонностях', 'неизвестно' not in card['asp']
       and 'Стремление:' in log and card['talkText'] == 'Поговорить: склонности', (card['asp'], card['talkText']))

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

# ---------- запуск ----------

class Tabs:
    """Вкладки одного раздела: открывает их как браузер и закрывает все, что раздел оставил открытым (например, упав посередине)."""
    def __init__(self, browser): self.browser, self.made = browser, []
    async def new_context(self, **kw): cx = await self.browser.new_context(**{'viewport': VIEW, **kw}); self.made.append(cx); return cx
    async def new_page(self, **kw): return await (await self.new_context(**kw)).new_page()
    async def close(self):
        for cx in self.made:
            try: await cx.close()
            except Exception: pass

async def run(sec, browser, gate):
    async with gate:
        NOW.set(sec['key']); tabs, errs, t0 = Tabs(browser), [], time.monotonic()
        try: await sec['fn'](tabs, errs)
        except Exception as e:   # ошибка в самой проверке (или страница повела себя не так, как ждал сценарий): раздел не пройден, остальные идут дальше
            at = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == __file__]
            ok('раздел дошёл до конца', False, f'строка {at[-1].lineno if at else "?"}: {str(e)[:500]}')
        finally: await tabs.close()
        ok('ошибок на странице и в консоли нет', not errs, errs)
        sec['time'] = time.monotonic() - t0

def pick(args):
    """Разделы по именам из командной строки: имя целиком или его начало. Без имён — все."""
    if not args: return list(SECTIONS)
    chosen = []
    for a in args:
        hit = [s for s in SECTIONS if s['key'] == a] or [s for s in SECTIONS if s['key'].startswith(a)]
        if not hit: sys.exit(f'нет раздела «{a}». Разделы: ' + ', '.join(s['key'] for s in SECTIONS))
        chosen += [s for s in hit if s not in chosen]
    return chosen

async def main():
    args = sys.argv[1:]; jobs = int(os.environ.get('E2E_JOBS') or (1 if os.environ.get('GITHUB_ACTIONS') else 3))
    if '--list' in args:
        for s in SECTIONS: print(f"{s['key']:10} {s['title']}")
        return
    if '--jobs' in args: i = args.index('--jobs'); jobs = int(args[i + 1]); del args[i:i + 2]
    todo = pick(args)
    if not DIST.exists(): sys.exit('нет dist/index.html: сначала npm run build')
    SHOTS.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        # свой Chrome, если он есть по этому пути; иначе Chromium из playwright install
        where = {'executable_path': CHROME} if Path(CHROME).exists() else {}
        browser = await pw.chromium.launch(args=['--no-sandbox'], **where)
        gate = asyncio.Semaphore(max(1, jobs))
        await asyncio.gather(*(run(s, browser, gate) for s in todo))
        await browser.close()
    part = '' if len(todo) == len(SECTIONS) else ' (разделы: ' + ', '.join(s['key'] for s in todo) + ')'
    print('время, с: ' + ' · '.join(f"{s['key']} {s['time']:.0f}" for s in sorted(todo, key=lambda s: -s['time'])))
    print(f'{fails} из {count} НЕ ПРОШЛО{part}' if fails else f'все {count} проверок в браузере прошли{part}')
    sys.exit(1 if fails else 0)

asyncio.run(main())

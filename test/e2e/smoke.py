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
BAG = 131                                              # черт и перков в мешке натуры (src/data/natura.ts)
EMU = (ROOT / 'dist' / 'natura.html').as_uri()           # эмулятор натуры — вторая собранная страница
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
LOG = "()=>[...document.querySelectorAll('#log .entry')].map(e=>{const c=e.cloneNode(true);c.querySelectorAll('.weights').forEach(x=>x.remove());return c.textContent}).join('\\n')"  # без весов вариантов: их видит только дизайнер
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
    ok('вверху строка-подсказка, как узнавать людей', 'поговорить' in await pg.text_content('#tip') and 'в деле' in await pg.text_content('#tip'))
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

@section('economy', 'хозяйство и подать: полосы категорий с ведомостью, дорожка сезонов с уроком, курс, нижние черты, плата подати, зоны сторон')
async def s_economy(br, errs):
    pg = await open_game(br, errs, 'замок')
    await pg.click("button[data-tab='eco']")
    CATS = """()=>[...document.querySelectorAll('#eco-cats .cat')].map(c=>({cat:c.dataset.cat, name:c.querySelector('.cat-name').textContent,
      v:parseFloat(c.querySelector('.cat-v').textContent.replace(',','.')), note:c.querySelector('.cat-note').textContent,
      floor:!!c.querySelector('.bar .floor'), ledger:c.querySelector('.ledger').textContent, lines:c.querySelectorAll('.ledger .ll').length,
      shown:getComputedStyle(c.querySelector('.ledger')).display!=='none'}))"""
    SIDES_JS = "()=>[...document.querySelectorAll('#eco-sides .side[data-side]')].map(s=>({side:s.dataset.side, text:s.textContent, zone:s.querySelector('.zone').textContent}))"
    TAX = "()=>document.getElementById('tax-line').textContent"
    cats = await pg.evaluate(CATS)
    ok('четыре категории: люди, еда, товары, серебро', [c['name'] for c in cats] == ['Люди', 'Еда', 'Товары', 'Серебро'], cats)
    ok('стартовые запасы на полосах', [c['v'] for c in cats] == [8, 3, 1, 2], [c['v'] for c in cats])
    ok('у еды и серебра есть нижняя черта, у людей и товаров нет', [c['floor'] for c in cats] == [False, True, False, True])
    ok('прогноз вилкой у запасов: слово и «от … до …»', all(re.search(r'(с запасом|впритык|не хватит|пусто) \(от [\d,]+ до [\d,]+\)', c['note']) for c in cats[1:]), [c['note'] for c in cats])
    ok('у людей видно, сколько рук в поле', 'в поле 4 из 4' in cats[0]['note'], cats[0]['note'])
    ok('до первого сезона ведомости нет', all('после первого сезона' in c['ledger'] for c in cats))
    sides = await pg.evaluate(SIDES_JS)
    ok('шесть сторон, деревень две, все «ладят»', [s['side'] for s in sides] == ['brod', 'opushka', 'les', 'kuptsy', 'zamok', 'dvor'] and all(s['zone'] == 'ладят' for s in sides), sides)
    ok('у каждой деревни свой староста', await pg.evaluate("()=>[...document.querySelectorAll('#eco-sides .elder')].map(e=>e.dataset.elder).join()") == 'brod,opushka')
    ok('в совете — «Тиун», а не староста', (await pg.evaluate(COUNCIL))[0]['name'] == 'Тиун')
    ok('урок испытания объявлен: 5 мер, Герцог ждёт', 'испытание' in await pg.evaluate(TAX) and 'осталось 5' in await pg.evaluate(TAX) and 'ждёт' in await pg.evaluate(TAX), await pg.evaluate(TAX))
    cells = await pg.evaluate("()=>[...document.querySelectorAll('#eco-track .cell')].map(c=>({n:+c.dataset.season, now:c.classList.contains('now'), text:c.textContent}))")
    ok('дорожка: 12 сезонов, сейчас первый, весной урок, осенью сборщица',
       len(cells) == 12 and cells[0]['now'] and 'урок 5' in cells[0]['text'] and 'сборщица' in cells[2]['text'] and sum(c['now'] for c in cells) == 1, cells[:4])

    # плата подати: серебром из казны
    ok('способов платить — одиннадцать', await pg.evaluate("()=>document.querySelectorAll('#pay-how option').length") == 11)
    await pg.fill('#pay-n', '1'); await pg.click('#pay-go')
    cats = await pg.evaluate(CATS)
    ok('внесли меру серебром: казна меньше на кошель, осталось 4', cats[3]['v'] == 1 and 'осталось 4' in await pg.evaluate(TAX), await pg.evaluate(TAX))
    ok('плата записана в летопись', 'Серебром из казны: 1 мер' in await pg.evaluate(LOG))
    # рекруты с деревни: рук меньше, деревня обижена
    await pg.select_option('#pay-how', 'rekruty_brod')
    ok('у способа написано, кому больно', 'деревне у брода' in await pg.evaluate("()=>document.getElementById('pay-hurts').textContent"))
    await pg.fill('#pay-n', '1'); await pg.click('#pay-go')
    cats = await pg.evaluate(CATS)
    ok('рекруты: рук стало 7, осталось 3 меры', cats[0]['v'] == 7 and 'осталось 3' in await pg.evaluate(TAX), (cats[0]['v'], await pg.evaluate(TAX)))
    await pg.select_option('#pay-how', 'sverh_brod'); await pg.fill('#pay-n', '1'); await pg.click('#pay-go')
    sides = await pg.evaluate(SIDES_JS)
    ok('рекруты и зерно сверх оброка: деревня у брода уже не «ладит», у опушки — по-прежнему', sides[0]['zone'] == 'терпят' and sides[1]['zone'] == 'ладят', sides[:2])

    # курс и нижняя черта
    await pg.select_option('#course', 'kopim')
    ok('курс выбран: описание и запись в летописи', 'оброк с деревень больше' in await pg.evaluate("()=>document.getElementById('course-desc').textContent") and 'Копим к подати' in await pg.evaluate(LOG))
    ok('видно, как исполняет каждый из пяти', (await pg.evaluate("()=>document.getElementById('doers').textContent")).count(':') == 6)
    await pg.fill('#floor-eda', '2.5'); await pg.dispatch_event('#floor-eda', 'change')
    ok('нижняя черта еды сдвинута', await pg.evaluate("()=>document.getElementById('floor-eda').value") == '2.5')
    await pg.select_option('#feed', 'derevni')

    # сезон: ведомость прошлого сезона построчно, по наведению
    await pg.click('#season')
    cats = await pg.evaluate(CATS)
    ok('после сезона у каждой категории есть ведомость со строками', all(c['lines'] >= 1 for c in cats), [c['lines'] for c in cats])
    ok('ведомость еды: было → стало, прокорм, нижняя черта', 'было 3' in cats[1]['ledger'] and 'прокорм замка' in cats[1]['ledger'] and 'нижняя черта: 2,5' in cats[1]['ledger'], cats[1]['ledger'])
    ok('ведомость серебра: пошлины с ответственным и тем, как исполнял', re.search(r'пошлины.*Купцы · писарь-казначей \S+ · (с огоньком|как велено|без огонька|по-своему)', cats[3]['ledger']), cats[3]['ledger'])
    ok('ведомость людей: куда ушли руки и рекруты', 'рекруты на год' in cats[0]['ledger'] and 'в поле' in cats[0]['ledger'], cats[0]['ledger'])
    ok('пока мышь не наведена, ведомость скрыта', not any(c['shown'] for c in cats))
    await pg.hover('.cat[data-cat="eda"]')
    ok('по наведению ведомость видна', (await pg.evaluate(CATS))[1]['shown'])
    await shot(pg, 'economy-ledger')
    await pg.mouse.move(5, 5)
    ok('курс держится — выбор сохранился', await pg.evaluate("()=>document.getElementById('course').value") == 'kopim' and await pg.evaluate("()=>document.getElementById('feed').value") == 'derevni')

    # осень: сборщица, зимой новый урок
    await pg.click('#season'); await pg.click('#season')
    log = await pg.evaluate(LOG)
    ok('осенью жатва и сборщица', 'Жатва: в амбар легло' in log and 'Сборщица податей' in log, log[:400])
    cells = await pg.evaluate("()=>[...document.querySelectorAll('#eco-track .cell')].map(c=>({now:c.classList.contains('now'), text:c.textContent, cls:c.className}))")
    ok('на дорожке у прошедшей осени итог: закрыт или недоимка', ('✓' in cells[2]['text'] or '✗' in cells[2]['text']) and cells[3]['now'], cells[2])
    await pg.click('#season')
    ok('зимой Герцог объявляет новый урок', 'Герцог объявил урок на год' in await pg.evaluate(LOG) and (await status(pg))['season'] == 'весна, год 2')
    ok('урок второго года на дорожке и в строке подати', 'внесено 0' in await pg.evaluate(TAX), await pg.evaluate(TAX))

    # взгляд дизайнера: числа доверия и терпения, план сезона
    await pg.check('#designer')
    sides = await pg.evaluate(SIDES_JS)
    ok('дизайнер видит числа доверия сторон', all(re.search(r'[+−]?\d', s['zone']) for s in sides), sides)
    ok('дизайнер видит план сезона у запасов', all('по плану' in c['note'] for c in (await pg.evaluate(CATS))[1:]))
    await pg.uncheck('#designer')
    ok('без дизайнера чисел доверия нет', all(not re.search(r'\d', s['zone']) for s in await pg.evaluate(SIDES_JS)))

    # долгая партия: запасы не уходят ниже нуля, дорожка листается на следующие три года
    for _ in range(3): await pg.click('#season5')
    cats = await pg.evaluate(CATS)
    ok('через пять лет запасы не ниже нуля', all(c['v'] >= 0 for c in cats), [c['v'] for c in cats])
    ok('дорожка показывает годы 4–6', 'год 4' in await pg.evaluate("()=>document.querySelector('#eco-track .yrs').textContent"))
    ok('после испытания урок обычный', 'испытание' not in await pg.evaluate(TAX), await pg.evaluate(TAX))
    await shot(pg, 'economy')

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
    ok('авторитет вырос на опору', (await status(pg))['authority'] > 11, await status(pg))
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
    ok('заготовок девять и «без заготовки»', len(presets) == 10 and presets[0] == '', presets)
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

@section('natura', 'эмулятор натуры: прогон, метрики и цели, графики, человек с древом, таблицы наполнения, ручки действуют сразу')
async def s_natura(br, errs):
    pg = await br.new_page()
    pg.on('pageerror', lambda e: errs.append('ошибка страницы: ' + str(e)))
    pg.on('console', lambda m: errs.append('консоль: ' + m.text) if m.type == 'error' else None)
    await pg.goto(EMU)
    await pg.wait_for_selector('#metric-cards .card')
    n = lambda sel: pg.evaluate("s=>document.querySelectorAll(s).length", sel)
    m = await pg.evaluate("()=>window.__emu.metrics()")
    ok('эмулятор открылся: 600 рероллов, девять карточек метрик, предупреждений нет', 'эмулятор натуры' in await pg.title()
       and await pg.evaluate("()=>window.__emu.people()") == 600 and await n('#metric-cards .card') == 9 and await n('#metric-cards .card.bad') == 0
       and 'Предупреждений нет' in await pg.inner_text('#warnings'), await pg.inner_text('#warnings'))
    ok('метрики в целях: рероллы не похожи, натура читается по признакам, нажитого больше половины', m['jaccard'] <= 0.5 and m['signNn'] >= 0.7
       and 0.2 <= m['nn'] <= 0.6 and m['lifeShare'] >= 0.6 and m['kinds']['life'] > m['kinds']['born'], (m['jaccard'], m['nn'], m['signNn'], m['kinds']))
    ok('графики: строка на каждую черту мешка и на каждую натуру, тепловые карты 30 натур', await n('#chart-traits .track') == BAG
       and await n('#chart-natures .track') == 90 and await n('#heat-signs tr') == 31 and await n('#heat-axes tr') == 31 and await n('#heat-signs td.core') == 90)
    ok('таблицы наполнения: 30 натур, весь мешок, 12 признаков, черты и должности совета', await n('#table-natures tr') == 31 and await n('#table-bag tr') == BAG + 1
       and await n('#table-signs tr') == 13 and await n('#table-key tr') == 11 and await n('#table-life tr') >= 12 and await n('#table-posts tr') == 6)
    ok('человек: кусты у врождённых якорей и у дальнего, у каждой черты подписано происхождение; двенадцать рероллов', await n('#person-view .bush') >= 2
       and await n('#person-view .trait') >= 3 and 'до игры:' in await pg.inner_text('#person-view') and 'врождённая' in await pg.inner_text('#person-view')
       and await n('#person-view .bipolar .bi') == 12 and await n('#person-rerolls .reroll') == 12 and await n('#party-view tr') == 11)
    before = await pg.inner_html('#person-view')
    await pg.click('#reroll')
    ok('«Реролл» даёт другого человека той же натуры', await pg.inner_html('#person-view') != before and 'Служилый' in await pg.inner_text('#person-view'))
    await pg.select_option('#nature', 'torgash')
    ok('выбор натуры: человек другой натуры', 'Торгаш' in await pg.inner_text('#person-view'))
    await pg.select_option('#age', '30'); young = await n('#person-view .trait')
    await pg.select_option('#age', '150'); old = await n('#person-view .trait')
    ok('возраст: у старого черт больше, чем у только что повзрослевшего', '150 лет' in await pg.inner_text('#person-view') and old > young, (young, old))
    await pg.select_option('#bag-kind', 'perk')
    ok('мешок фильтруется по виду: перки', await n('#table-bag tr') == 23)
    knobs = await n('#knobs input[type=range]')
    ok('ручки: все ручки раздела natura, изменённых нет', knobs >= 40 and await n('#knobs .knob.changed') == 0, knobs)
    await pg.evaluate("()=>{const el=document.querySelector(\"input[data-knob='natura.lifeSteps']\"); el.value='5'; el.dispatchEvent(new Event('input',{bubbles:true}));}")
    await pg.wait_for_function("()=>window.__emu.metrics().traitsMean > %s" % (m['traitsMean'] + 2))
    m2 = await pg.evaluate("()=>window.__emu.metrics()")
    ok('ручка действует сразу: пять поводов в игре вместо двух — черт заметно больше, перки чаще, ручка подсвечена', await n('#knobs .knob.changed') == 1
       and m2['traitsMean'] > m['traitsMean'] + 2 and m2['kinds']['perk'] > m['kinds']['perk'], m2['kinds'])
    await pg.click('#export')
    ok('«Выгрузить изменённые» даёт строку с путём ручки и значениями', 'natura.lifeSteps: 2 → 5' in await pg.input_value('#export-out'))
    await pg.evaluate("()=>window.__emu.setKnob('natura.temperature', 4)")
    ok('плохие ручки — красные карточки и предупреждения', await n('#metric-cards .card.bad') >= 1 and await n('#warnings .warn') >= 1)
    await shot(pg, 'natura-bad')
    await pg.click('#reset')
    m3 = await pg.evaluate("()=>window.__emu.metrics()")
    ok('«Сброс» возвращает ручки и те же числа', await n('#knobs .knob.changed') == 0 and m3['jaccard'] == m['jaccard'] and m3['nn'] == m['nn'])
    h = await pg.evaluate("()=>window.__emu.health()")
    ok('здоровье: восемь карточек без красных, предупреждений нет, за партию выбывает 15–30%', await n('#health-cards .card') == 8 and await n('#health-cards .card.bad') == 0
       and 'Предупреждений нет' in await pg.inner_text('#health-warnings') and 0.15 <= h['removed'] <= 0.3 and h['life']['median'] >= 175, (h['removed'], h['life']['median']))
    ok('здоровье: графики, лента двадцати лет человека, семьи в партии, таблица из 21 черты', await n('#chart-curve polyline') == 1 and await n('#chart-life rect') >= 15
       and await n('#chart-causes .track') == 4 and await n('#health-person .strip i') == 80 and await n('#health-party tr') == 11 and await n('#table-health tr') == 22)
    await pg.evaluate("()=>window.__emu.setKnob('health.illBase', 0.1)")
    h2 = await pg.evaluate("()=>window.__emu.health()")
    ok('ручка здоровья действует: болеют впятеро чаще — в постели больше, карточка краснеет', h2['offShare'] > h['offShare'] * 2 and await n('#health-cards .card.bad') >= 1
       and await n('#health-warnings .warn') >= 1, (h['offShare'], h2['offShare']))
    await pg.click('#reset')
    await pg.select_option('#rolls', '300')
    ok('число рероллов меняется', await pg.evaluate("()=>window.__emu.people()") == 300)
    await shot(pg, 'natura')
    game = await open_game(br, errs)
    ok('с прототипа совета есть ссылка на эмулятор', await game.get_attribute('#to-emu', 'href') == 'natura.html')

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

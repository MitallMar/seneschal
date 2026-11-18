"""Общее для разделов проверки в браузере: адреса страниц, счётчик проверок ok(), реестр разделов @section,
что читать со страницы (STATUS, LOG, COUNCIL, CARDS) и помощники open_game, status, shot.
Раздел начинается строкой  from common import *  и регистрируется декоратором @section; запуск — smoke.py."""
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
fails, count = 0, 0                                    # счётчики ok(): smoke.py читает их как common.fails и common.count
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

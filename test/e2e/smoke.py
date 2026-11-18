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
Разделы лежат по файлу на раздел в test/e2e/sections/, общее для них (ok, открыть партию, что читать со страницы) — в test/e2e/common.py.
Новый раздел: файл sections/имя.py с функцией под @section(имя, что проверяет) и его имя в списке ORDER ниже; свою вкладку раздел открывает сам через br.new_page.
Браузер: переменная CHROME или /usr/bin/google-chrome; если такого файла нет — Chromium, поставленный командой playwright install chromium.
"""
import asyncio, importlib, os, sys, time, traceback
from pathlib import Path
from playwright.async_api import async_playwright
import common
from common import SECTIONS, NOW, DIST, SHOTS, CHROME, VIEW, ok

# Разделы в порядке показа (--list): каждый — файл sections/имя.py.
ORDER = ['base', 'staff', 'talk', 'designer', 'know', 'economy', 'authority', 'emu', 'natura', 'lab']
for key in ORDER: importlib.import_module('sections.' + key)
E2E = Path(__file__).resolve().parent

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
            at = [f for f in traceback.extract_tb(e.__traceback__) if E2E in Path(f.filename).resolve().parents]
            ok('раздел дошёл до конца', False, f'{Path(at[-1].filename).name + ", строка " + str(at[-1].lineno) if at else "строка ?"}: {str(e)[:500]}')
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
    print(f'{common.fails} из {common.count} НЕ ПРОШЛО{part}' if common.fails else f'все {common.count} проверок в браузере прошли{part}')
    sys.exit(1 if common.fails else 0)

asyncio.run(main())

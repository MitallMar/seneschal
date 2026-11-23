#!/usr/bin/env python3
"""Вливает готовые строки из паспортов текстов в таблицы и справочники (ноль токенов).

Пример: python3 tools/vlit.py teksty/90.md teksty/91.md --partiya "шестая, 24.11.2026"

В тексте раздел «## Строки для таблиц» (после «## Опорные строки», до «## Текст»), строки:
  имя: Имя | кто | где | годы | № | статус        → tablicy/imena.md, «Люди и прочие разумные»
  бог: … (те же 6 колонок)                       → «Боги, святые, легендарные лица»
  род: …                                          → «Роды, дома, артели»
  корабль: … / животное: …                        → «Корабли и животные»
  событие: год | где | что | № | статус           → tablicy/sobytiya.md, раздел своего цикла, по году
  зацепка: зацепка | где | когда | №              → tablicy/zacepki.md, под «## № A–B»
  справочник: kraya/x.md | Запись | - строка      → в запись справочника (или новая запись)
Заголовок текста «# Тексты мира — NN. Название (черновик, …)» меняется на «# NN. Название»,
строка добавляется в teksty/README.md. Повторный запуск на тех же файлах задвоит строки.
"""
import re, os, sys, argparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)
RAZDEL = {'имя': '## Люди и прочие разумные', 'бог': '## Боги, святые, легендарные лица',
          'род': '## Роды, дома, артели', 'корабль': '## Корабли и животные',
          'животное': '## Корабли и животные'}

def norm(s):
    return s.lower().replace('ё', 'е').lstrip('«"( ')

def insert_sorted(lines, head, row, key):
    """Вставить row в раздел head по порядку key (сравнение строк или чисел)."""
    i = next(k for k, l in enumerate(lines) if l.startswith(head))
    end = next((k for k in range(i + 1, len(lines)) if lines[k].startswith('## ')), len(lines))
    pos = None
    last = i
    for k in range(i + 1, end):
        if lines[k].startswith('- '):
            last = k
            if pos is None and key(lines[k]) > key(row):
                pos = k
    lines.insert(pos if pos is not None else last + 1, row)

def god(s):
    m = re.search(r'\d{1,4}', s)
    return int(m.group()) if m else None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('fajly', nargs='+')
    ap.add_argument('--partiya', default='')
    a = ap.parse_args()
    imena = open(P('tablicy', 'imena.md'), encoding='utf-8').read().split('\n')
    sob = open(P('tablicy', 'sobytiya.md'), encoding='utf-8').read().split('\n')
    zac = open(P('tablicy', 'zacepki.md'), encoding='utf-8').read().rstrip('\n').split('\n')
    readme = open(P('teksty', 'README.md'), encoding='utf-8').read().rstrip('\n')
    nums, zac_rows, sprav = [], [], []
    cnt = {'имена': 0, 'события': 0, 'зацепки': 0, 'справочники': 0}
    for f in a.fajly:
        t = open(f, encoding='utf-8').read()
        first, rest = t.split('\n', 1)
        m = re.match(r'# (?:Тексты мира — )?(\d+)\. (.*?)(?: \(черновик, [^)]*\))?$', first)
        n, title = int(m.group(1)), m.group(2)
        nums.append(n)
        open(f, 'w', encoding='utf-8').write(f'# {n}. {title}\n' + rest)
        readme += f'\n| {n} | [{title}]({n}.md) | {a.partiya} |'
        blok = t.split('## Строки для таблиц', 1)[1].split('\n## ', 1)[0] if '## Строки для таблиц' in t else ''
        for line in blok.split('\n'):
            line = line.strip().lstrip('-* ').strip()
            mm = re.match(r'(имя|бог|род|корабль|животное|событие|зацепка|справочник):\s*(.+)', line)
            if not mm: continue
            kind, body = mm.group(1), mm.group(2).strip()
            if kind in RAZDEL:
                insert_sorted(imena, RAZDEL[kind], '- ' + body, lambda l: norm(l[2:]))
                cnt['имена'] += 1
            elif kind == 'событие':
                y = god(body.split(' | ')[0])
                if y:
                    k = (y - 1) // 800 + 1
                    faza = 'прилив' if (y - 1) % 800 < 400 else 'отлив'
                    head = f'## Цикл {k}, {faza}'
                else:
                    head = '## Без года'
                insert_sorted(sob, head, '- ' + body, lambda l: god(l[2:].split(' | ')[0]) or 0)
                cnt['события'] += 1
            elif kind == 'зацепка':
                zac_rows.append('- ' + body); cnt['зацепки'] += 1
            else:
                sprav.append((n, body))
    if zac_rows:
        zac += ['', f'## № {min(nums)}–{max(nums)}'] + zac_rows
    for n, body in sprav:
        put, zap, stroka = [x.strip() for x in body.split(' | ', 2)]
        L = open(P(put), encoding='utf-8').read().rstrip('\n').split('\n')
        head = '### ' + zap.lstrip('# ').strip()
        if head in L:
            i = L.index(head); j = i + 1
            while j < len(L) and not L[j].startswith(('спорят:', 'тексты:', '### ')) and L[j].strip():
                j += 1
            L.insert(j, stroka if stroka.startswith('- ') else '- ' + stroka)
        else:
            L += ['', head, f'ключи: {zap}', stroka if stroka.startswith('- ') else '- ' + stroka, f'тексты: № {n}']
        open(P(put), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
        cnt['справочники'] += 1
    open(P('tablicy', 'imena.md'), 'w', encoding='utf-8').write('\n'.join(imena))
    open(P('tablicy', 'sobytiya.md'), 'w', encoding='utf-8').write('\n'.join(sob))
    open(P('tablicy', 'zacepki.md'), 'w', encoding='utf-8').write('\n'.join(zac) + '\n')
    open(P('teksty', 'README.md'), 'w', encoding='utf-8').write(readme + '\n')
    print('Влито:', ', '.join(f'{k} — {v}' for k, v in cnt.items()))

main()

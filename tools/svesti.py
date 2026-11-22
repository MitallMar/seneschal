#!/usr/bin/env python3
"""Сводит выписки агентов (tools/vypiska.md) в сырые таблицы картотеки.

Запуск: python3 tools/svesti.py ПАПКА_ВЫПИСОК ПАПКА_СЫРЬЯ [ПАПКА_ВЕТКИ]

Выписка — файл с разделами «# № N. Название», внутри «## Карточка», «## Имена»,
«## Хронология», «## Опорные факты», «## Зацепки»; строки — колонки через « | ».
Файл kanon.md (канон и решения автора) устроен иначе: «## Хронология», «## Имена»,
«## Решения автора» без номеров текстов.

В ПАПКУ_СЫРЬЯ пишет: imena.txt, hronologiya.txt (отсортирована по сквозному году),
fakty-<раздел>.txt, zacepki.txt, rashozhdeniya.txt, resheniya.txt, otchet.txt.
Если дана ПАПКА_ВЕТКИ — пишет туда kartochki/*.md, zacepki.md и rashozhdeniya.md.
"""
import os
import re
import sys
from collections import defaultdict

SECTIONS = {
    'карточка': 'card', 'имена': 'names', 'хронология': 'chron',
    'опорные факты': 'facts', 'зацепки': 'hooks', 'решения автора': 'decisions',
    'отвергнуто': 'rejected',
}
FACT_KINDS = ['место', 'учреждение', 'обычай', 'цена', 'мир']
HEADER_WORDS = {'имя', 'год', 'раздел', 'зацепка', 'зацепка для события', 'дата', 'факт'}
BATCHES = [(1, 24, '01-24'), (25, 34, '25-34'), (35, 48, '35-48')]


def clean(line):
    s = line.strip()
    s = re.sub(r'^[-*•]\s+', '', s)
    if s.startswith('|') and s.endswith('|'):
        s = s[1:-1].strip()
    return s


def is_row(s):
    if ' | ' not in s:
        return False
    if re.fullmatch(r'[\s|:\-]+', s):
        return False
    first = s.split(' | ')[0].strip().lower()
    return first not in HEADER_WORDS


def year_key(y):
    """Ключ сортировки по сквозному году; эпохи — по началу эпохи."""
    y = y.strip().lower().replace('−', '-')
    m = re.search(r'(\d{3,4})', y)
    if m and not re.search(r'цикл', y[:m.start()]):
        return int(m.group(1))
    m = re.search(r'(\d)\s*-?\s*й?\s*цикл', y)
    if m:
        k = int(m.group(1))
        base = 800 * (k - 1)
        return base + (400 if 'отлив' in y else 0) + 1
    if 'перв' in y and 'импер' in y:
        return 1
    return 99999


def text_no(header):
    m = re.search(r'№\s*(\d+)', header)
    return int(m.group(1)) if m else None


def parse_file(path):
    rows = defaultdict(list)
    cards = {}
    titles = {}
    canon = os.path.basename(path).startswith('kanon')
    no = None
    sec = None
    card_buf = []
    for raw in open(path, encoding='utf-8'):
        line = raw.rstrip('\n')
        if line.startswith('# ') and not line.startswith('## '):
            if no is not None and card_buf:
                cards[no] = '\n'.join(card_buf).strip()
            card_buf = []
            no = text_no(line)
            if no is not None:
                titles[no] = re.sub(r'^#\s*№\s*\d+\.?\s*', '', line).strip()
            sec = None
            continue
        if line.startswith('## ') or line.startswith('### '):
            name = line.lstrip('#').strip().lower()
            sec = None
            for key, val in SECTIONS.items():
                if name.startswith(key):
                    sec = val
            continue
        if line.strip().startswith('```'):
            continue
        if sec == 'card':
            card_buf.append(line)
            continue
        if sec is None:
            continue
        s = clean(line)
        if not is_row(s):
            continue
        cols = [c.strip() for c in s.split(' | ')]
        src = 'канон' if canon else (f'№ {no}' if no is not None else '№ ?')
        rows[sec].append((cols, src, no if no is not None else 0))
    if no is not None and card_buf:
        cards[no] = '\n'.join(card_buf).strip()
    return rows, cards, titles


def main():
    src_dir, out_dir = sys.argv[1], sys.argv[2]
    branch = sys.argv[3] if len(sys.argv) > 3 else None
    os.makedirs(out_dir, exist_ok=True)
    allrows = defaultdict(list)
    cards, titles = {}, {}
    for fn in sorted(os.listdir(src_dir)):
        if not fn.endswith('.md'):
            continue
        r, c, t = parse_file(os.path.join(src_dir, fn))
        for k, v in r.items():
            allrows[k].extend(v)
        cards.update(c)
        titles.update(t)

    status_re = re.compile(r'^(текст|слух|канон|решено автором)\b\s*(.*)$')

    def row_text(cols, src):
        body, status = list(cols), ('канон' if src == 'канон' else 'текст')
        m = status_re.match(body[-1]) if len(body) >= 2 else None
        if m:
            body.pop()
            status = m.group(1)
            if m.group(2):
                body.append(m.group(2))
        # статус, застрявший в середине строки вместе с пометой ⚠
        for i, c in enumerate(body):
            mm = status_re.match(c)
            if mm and i >= 3 and mm.group(2).startswith('⚠'):
                body[i] = mm.group(2)
                status = mm.group(1)
        return ' | '.join(body + [src, status])

    report = []
    with open(os.path.join(out_dir, 'imena.txt'), 'w', encoding='utf-8') as f:
        for cols, src, _ in sorted(allrows['names'], key=lambda r: r[0][0].lower()):
            f.write(row_text(cols, src) + '\n')
    report.append(f"имена: {len(allrows['names'])}")

    chron = sorted(allrows['chron'], key=lambda r: (year_key(r[0][0]), r[2]))
    with open(os.path.join(out_dir, 'hronologiya.txt'), 'w', encoding='utf-8') as f:
        for cols, src, _ in chron:
            f.write(row_text(cols, src) + '\n')
    report.append(f'хронология: {len(chron)}')

    kinds = defaultdict(list)
    for cols, src, no in allrows['facts']:
        kind = cols[0].lower() if cols else ''
        kind = next((k for k in FACT_KINDS if kind.startswith(k)), 'прочее')
        kinds[kind].append((cols[1:], src, no))
    for kind, rows in kinds.items():
        with open(os.path.join(out_dir, f'fakty-{kind}.txt'), 'w', encoding='utf-8') as f:
            for cols, src, _ in sorted(rows, key=lambda r: r[2]):
                f.write(row_text(cols, src) + '\n')
        report.append(f'факты, {kind}: {len(rows)}')

    hooks = sorted(allrows['hooks'], key=lambda r: r[2])
    with open(os.path.join(out_dir, 'zacepki.txt'), 'w', encoding='utf-8') as f:
        for cols, src, _ in hooks:
            body = cols[:-1] if cols and cols[-1] in ('текст', 'слух') else cols
            f.write(' | '.join(body + [src]) + '\n')
    report.append(f'зацепки: {len(hooks)}')

    with open(os.path.join(out_dir, 'resheniya.txt'), 'w', encoding='utf-8') as f:
        for sec in ('decisions', 'rejected'):
            for cols, src, _ in allrows[sec]:
                f.write(('ОТВЕРГНУТО | ' if sec == 'rejected' else '') + ' | '.join(cols) + '\n')
    report.append(f"решения: {len(allrows['decisions'])}, отвергнуто: {len(allrows['rejected'])}")

    warn = []
    for sec in ('names', 'chron', 'facts', 'hooks'):
        for cols, src, no in allrows[sec]:
            line = ' | '.join(cols)
            if '⚠' in line:
                warn.append((no, src, line))
    warn.sort(key=lambda w: w[0])
    with open(os.path.join(out_dir, 'rashozhdeniya.txt'), 'w', encoding='utf-8') as f:
        for _, src, line in warn:
            f.write(f'{src} | {line}\n')
    report.append(f'расхождения: {len(warn)}')
    report.append(f'карточки: {len(cards)} ({", ".join(str(n) for n in sorted(cards))})')

    if branch:
        kdir = os.path.join(branch, 'kartochki')
        os.makedirs(kdir, exist_ok=True)
        for lo, hi, name in BATCHES:
            nums = [n for n in sorted(cards) if lo <= n <= hi]
            if not nums:
                continue
            with open(os.path.join(kdir, f'{name}.md'), 'w', encoding='utf-8') as f:
                f.write(f'# Карточки текстов № {lo}–{hi}\n\n')
                f.write('Что за источник и что в нём есть, 150–220 слов на текст. Сам текст — `istochniki/teksty/NN.md`.\n')
                for n in nums:
                    f.write(f'\n## № {n}. {titles.get(n, "")}\n\n{cards[n]}\n')
        with open(os.path.join(branch, 'zacepki.md'), 'w', encoding='utf-8') as f:
            f.write('# Зацепки для событий\n\n')
            f.write('Завязки, которые прямо растут из текстов мира: сырьё для генератора событий игры. Строка: `зацепка | где | когда | №`. По порядку текстов.\n')
            cur = None
            for cols, src, no in hooks:
                if no != cur:
                    cur = no
                    f.write(f'\n## № {no}. {titles.get(no, "")}\n\n')
                body = cols[:-1] if cols and cols[-1] in ('текст', 'слух') else cols
                f.write('- ' + ' | '.join(body + [src]) + '\n')
        with open(os.path.join(branch, 'rashozhdeniya.md'), 'w', encoding='utf-8') as f:
            f.write('# Расхождения\n\n')
            f.write('Строки картотеки, где выписчик заметил расхождение с каноном, глоссарием или другим текстом (`⚠`). Тексты не исправляют: расхождение — часть истории мира. Решение автора по расхождению записывают в `resheniya.md`.\n\n')
            cur = None
            for no, src, line in warn:
                if no != cur:
                    cur = no
                    f.write(f'\n## № {no}. {titles.get(no, "")}\n\n' if no else '\n## Канон\n\n')
                f.write(f'- {line}\n')

    with open(os.path.join(out_dir, 'otchet.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(report) + '\n')
    print('\n'.join(report))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Собирает karta.md — карту всего лора: по строке на каждую запись справочников (ноль токенов).

Пример: python3 tools/karta.py
Строка карты: «- Запись — ключи — эпохи — тексты». Эпохи сокращены: В — всегда, И — Первая Империя,
1п/1о … 4п/4о — прилив/отлив цикла, Н — нынешний прилив. Запускается сам из tools/vlit.py после вливания.
"""
import re, os, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NKLYUCHEY = 4  # сколько ключей показывать, кроме заголовка


def epohi(stroka):
    s = stroka.lower()
    out = []
    if s.startswith('всегда'):
        out.append('В')
    if s.startswith('империя'):
        out.append('И')
    for m in re.finditer(r'цикл (\d)(?:, (прилив|отлив))?', s):
        out.append(m.group(1) + ({'прилив': 'п', 'отлив': 'о'}.get(m.group(2), '')))
    if 'нынешний прилив' in s:
        out.append('Н')
    return out


PORYADOK = ['В', 'И'] + [f'{c}{t}' for c in '1234' for t in ('', 'п', 'о')] + ['Н']


def zapisi(path):
    lines = open(path, encoding='utf-8').read().split('\n')
    title = next((l[2:].strip() for l in lines if l.startswith('# ')), os.path.basename(path))
    out, cur = [], None
    for l in lines:
        if l.startswith('### '):
            cur = {'name': l[4:].strip(), 'kl': [], 'ep': set(), 'tx': ''}
            out.append(cur)
        elif cur is None:
            continue
        elif l.startswith('ключи:'):
            cur['kl'] = [k.strip() for k in l[6:].split(',') if k.strip()]
        elif l.startswith('- '):
            cur['ep'].update(epohi(l[2:].split(':', 1)[0]))
        elif l.startswith('тексты:'):
            cur['tx'] = l[7:].strip()
    return title, out


def main():
    res = ['# Карта лора', '',
           'Собрана скриптом `tools/karta.py` — руками не править. По строке на запись справочника: '
           'запись — ключи — эпохи — тексты. Эпохи: В — всегда, И — Первая Империя, 2п / 2о — прилив / '
           'отлив цикла 2, Н — нынешний прилив. Запись целиком: `python3 tools/chitat.py --zapis слово`.', '']
    n = 0
    for papka in ('temy', 'kraya'):
        for f in sorted(glob.glob(os.path.join(ROOT, papka, '*.md'))):
            title, zz = zapisi(f)
            res.append(f'## {papka}/{os.path.basename(f)} — {title}')
            for z in zz:
                kl = [k for k in z['kl'] if k.lower() != z['name'].lower()][:NKLYUCHEY]
                ep = ' '.join(e for e in PORYADOK if e in z['ep'])
                parts = [z['name']]
                if kl:
                    parts.append(', '.join(kl))
                if ep:
                    parts.append(ep)
                if z['tx']:
                    parts.append(z['tx'])
                res.append('- ' + ' — '.join(parts))
                n += 1
            res.append('')
    open(os.path.join(ROOT, 'karta.md'), 'w', encoding='utf-8').write('\n'.join(res).rstrip('\n') + '\n')
    print(f'karta.md: {n} записей')


if __name__ == '__main__':
    main()

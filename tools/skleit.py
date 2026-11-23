#!/usr/bin/env python3
"""Склеивает текст, написанный по главам, в один текст мира (ноль токенов).

Пример: python3 tools/skleit.py 112
Берёт rabota/112/pasport.md (заголовок «# 112. Название», «## Паспорт», «## Опорные строки», «## Строки для таблиц»)
и главы rabota/112/01.md, 02.md, … по порядку номеров; пишет teksty/112.md: паспорт, затем «## Текст»
и главы под заголовками «### Глава N» (или своим «# …»/«## …» заголовком главы, если он есть в файле).
plan.md и svod.md в текст не идут. Рабочую папку не удаляет.
"""
import os, re, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    n = sys.argv[1]
    d = os.path.join(ROOT, 'rabota', n)
    pas = open(os.path.join(d, 'pasport.md'), encoding='utf-8').read().rstrip('\n')
    if '\n## Текст' in pas:
        pas = pas.split('\n## Текст')[0].rstrip('\n')
    glavy = sorted((f for f in glob.glob(os.path.join(d, '*.md')) if re.fullmatch(r'\d+\.md', os.path.basename(f))),
                   key=lambda f: int(os.path.basename(f)[:-3]))
    out = [pas, '', '## Текст', '']
    for f in glavy:
        t = open(f, encoding='utf-8').read().strip('\n')
        lines = t.split('\n')
        m = re.match(r'#{1,3} (.*)', lines[0]) if lines else None
        if m:
            head, body = m.group(1).strip(), '\n'.join(lines[1:]).strip('\n')
        else:
            head, body = f'Глава {int(os.path.basename(f)[:-3])}', t
        out += [f'### {head}', '', body, '']
    path = os.path.join(ROOT, 'teksty', f'{n}.md')
    open(path, 'w', encoding='utf-8').write('\n'.join(out).rstrip('\n') + '\n')
    words = sum(len(open(f, encoding='utf-8').read().split()) for f in glavy)
    print(f'teksty/{n}.md: глав {len(glavy)}, около {words} слов')


if __name__ == '__main__':
    main()

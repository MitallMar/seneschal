#!/usr/bin/env python3
"""Чтение лора по частям (ноль токенов на поиск, читается только нужное).

  python3 tools/chitat.py ФАЙЛ                   оглавление: заголовки и число слов в каждом разделе
  python3 tools/chitat.py ФАЙЛ "часть заголовка"  раздел(ы), чей заголовок содержит эти слова, целиком
  python3 tools/chitat.py --zapis слово          записи справочников (kraya/, temy/), где слово есть
                                                 в заголовке или в строке «ключи:»
  python3 tools/chitat.py --pasport 24 106       паспорт и опорные строки текстов (без самого текста)
"""
import re, os, sys, glob, signal

signal.signal(signal.SIGPIPE, signal.SIG_DFL)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def norm(s):
    return s.lower().replace('ё', 'е')


def razdely(lines):
    """Список (уровень, заголовок, начало, конец) для заголовков #..####."""
    heads = [(len(m.group(1)), m.group(2).strip(), i)
             for i, l in enumerate(lines) for m in [re.match(r'(#{1,4}) (.*)', l)] if m]
    out = []
    for k, (lv, h, i) in enumerate(heads):
        end = next((j for (lv2, _, j) in heads[k + 1:] if lv2 <= lv), len(lines))
        out.append((lv, h, i, end))
    return out


def oglavlenie(path):
    lines = open(path, encoding='utf-8').read().split('\n')
    print(f'{path}: {len(" ".join(lines).split())} слов')
    for lv, h, i, end in razdely(lines):
        n = len(' '.join(lines[i + 1:end]).split())
        print(f'{"  " * (lv - 1)}{h}  [{n} сл., стр. {i + 1}]')


def razdel(path, chto):
    lines = open(path, encoding='utf-8').read().split('\n')
    hits = [(i, end) for lv, h, i, end in razdely(lines) if norm(chto) in norm(h)]
    if not hits:
        print('Нет такого раздела. Оглавление:')
        oglavlenie(path)
        return
    shown = -1
    for i, end in hits:
        if i < shown:
            continue  # уже напечатан внутри старшего раздела
        print('\n'.join(lines[i:end]).rstrip())
        print()
        shown = end


def zapis(slovo):
    w = norm(slovo)
    found = 0
    for f in sorted(glob.glob(os.path.join(ROOT, 'temy', '*.md')) + glob.glob(os.path.join(ROOT, 'kraya', '*.md'))):
        lines = open(f, encoding='utf-8').read().split('\n')
        for lv, h, i, end in razdely(lines):
            if lv != 3:
                continue
            kl = next((l for l in lines[i + 1:end] if l.startswith('ключи:')), '')
            if w in norm(h) or w in norm(kl):
                print(f'=== {os.path.relpath(f, ROOT)}')
                print('\n'.join(lines[i:end]).rstrip())
                print()
                found += 1
    if not found:
        print(f'Записей с «{slovo}» в заголовке или ключах нет. Поиск по всем формам: python3 tools/iskat.py {slovo}')


def pasport(nomera):
    for n in nomera:
        f = os.path.join(ROOT, 'teksty', f'{int(n):02d}.md')
        if not os.path.exists(f):
            print(f'=== № {n}: файла нет\n')
            continue
        t = open(f, encoding='utf-8').read()
        head = re.split(r'\n## (?:Строки для таблиц|Текст)\b', t, maxsplit=1)[0]
        print(f'=== № {n}')
        print(head.rstrip())
        print()


def main():
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'):
        print(__doc__)
    elif a[0] == '--zapis':
        zapis(' '.join(a[1:]))
    elif a[0] == '--pasport':
        pasport(a[1:])
    elif len(a) == 1:
        oglavlenie(a[0])
    else:
        razdel(a[0], ' '.join(a[1:]))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Поиск слова во всех формах по лору.
Пример: python3 tools/iskat.py сено             (тексты, справочники, таблицы)
        python3 tools/iskat.py мост Вирта --gde teksty --max 40
        python3 tools/iskat.py Ржавец --arhiv      (ещё и архив)
Совпадение: та же начальная форма (pymorphy3) или общий корень (начало слова)."""
import sys, re, os, argparse
try:
    import pymorphy3
    M = pymorphy3.MorphAnalyzer()
except Exception:
    M = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORD = re.compile(r"[А-Яа-яЁёA-Za-z-]+")
_cache = {}
def lemma(w):
    w = w.lower().replace('ё', 'е')
    if w not in _cache:
        _cache[w] = M.parse(w)[0].normal_form.replace('ё', 'е') if M else w
    return _cache[w]
def stem(w):
    w = w.lower().replace('ё', 'е')
    return w[:-2] if len(w) > 5 else (w[:-1] if len(w) > 3 else w)
def main():
    p = argparse.ArgumentParser()
    p.add_argument('slova', nargs='+')
    p.add_argument('--gde', default='teksty,kraya,temy,tablicy', help='папки через запятую')
    p.add_argument('--arhiv', action='store_true')
    p.add_argument('--max', type=int, default=60)
    a = p.parse_args()
    dirs = a.gde.split(',') + (['arhiv'] if a.arhiv else [])
    q = [(lemma(s), stem(s)) for s in a.slova]
    n = 0
    files = []
    for d in dirs:
        for r, _, fs in os.walk(os.path.join(ROOT, d)):
            files += [os.path.join(r, f) for f in fs if f.endswith('.md')]
    for path in sorted(files):
        for i, line in enumerate(open(path, encoding='utf-8'), 1):
            toks = WORD.findall(line)
            ok = all(any(lemma(t) == lq or t.lower().replace('ё','е').startswith(sq) for t in toks) for lq, sq in q)
            if ok:
                print(f"{os.path.relpath(path, ROOT)}:{i}: {line.strip()[:200]}")
                n += 1
                if n >= a.max:
                    print(f"… больше {a.max}, сузьте поиск (--gde, --max)"); return
    if n == 0: print("ничего не найдено")
main()

#!/usr/bin/env python3
"""Автоматическая проверка нового текста мира (ноль токенов).
Пример: python3 tools/proverka.py teksty/80.md [--limit 3000]
Ищет: объём сверх лимита; годы позже 3265; слова из tools/zapret.txt;
имена из текста, которые уже есть в tablicy/imena.md (показывает, кто это, где и когда, — решать писателю)."""
import sys, re, os, argparse
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = argparse.ArgumentParser(); p.add_argument('fajl'); p.add_argument('--limit', type=int, default=3000)
a = p.parse_args()
txt = open(a.fajl, encoding='utf-8').read()
body = txt.split('## Текст', 1)[1] if '## Текст' in txt else txt
words = re.findall(r"[А-Яа-яЁёA-Za-z]+(?:-[А-Яа-яЁё]+)?", body)
print(f"Объём текста: {len(words)} слов" + ("  ← СВЕРХ ЛИМИТА" if len(words) > a.limit else ""))
bad = sorted({int(y) for y in re.findall(r"\b(3[3-9]\d\d|32[7-9]\d|326[6-9])\b", txt)})
if bad: print("Годы позже 3265:", ', '.join(map(str, bad)))
low = txt.lower().replace('ё', 'е')
for line in open(os.path.join(ROOT, 'tools', 'zapret.txt'), encoding='utf-8'):
    w = line.strip()
    if w and not w.startswith('#') and w.lower() in low:
        print(f"Запретное слово/оборот: «{w}»")
names = {}
for line in open(os.path.join(ROOT, 'tablicy', 'imena.md'), encoding='utf-8'):
    if not line.startswith('- '): continue
    c = line[2:].split(' | ')
    if len(c) < 4: continue
    first = re.split(r"[ ,/(«]", c[0].strip())[0]
    if len(first) > 2: names.setdefault(first, []).append(f"{c[0].strip()} — {c[2].strip()}, {c[3].strip()}")
caps = {}
for m in re.finditer(r"(?<![.!?…]\s)(?<!^)\b([А-ЯЁ][а-яё]{2,})", body):
    caps.setdefault(m.group(1), 0); caps[m.group(1)] += 1
hits = [(w, names[w]) for w in sorted(caps) if w in names]
if hits:
    print("\nИмена, которые уже есть в tablicy/imena.md (проверь место и поколение):")
    for w, rows in hits:
        print(f"  {w}: " + " ‖ ".join(rows[:3]) + (" ‖ …" if len(rows) > 3 else ""))
print("\nГотово.")

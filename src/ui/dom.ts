// Общее для страниц: элемент по id и экранирование текста для разметки.
export const $ = (id: string) => document.getElementById(id)!;
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

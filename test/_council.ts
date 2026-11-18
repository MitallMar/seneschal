// Общее для тестов совета и сезона: семена, поиск события и строки, свободные люди, стремление к должности.
import { ASPIRATIONS, POSTS } from "../src/data/core";
import { EVENTS } from "../src/data/events";
import type { World } from "../src/sim/state";

export const SEEDS = ["замок", "лес", "герцог", "test", "7", "осень-3", "Ведана", "x"];
export const postIds = POSTS.map((p) => p.id);
export const event = (id: string) => EVENTS.find((e) => e.id === id)!;
export const said = (lines: string[], part: string) => lines.some((l) => l.includes(part));
export const free = (w: World) => w.people.filter((p) => !p.post);
export const wants = (post: string) => ASPIRATIONS.find((a) => a.post === post)!;

# Picture slots

Drop pictures here and they appear in the game with no code change.
Each slot is tried as `.webp`, then `.jpg`, then `.png`; a missing picture
simply leaves the slot out.

| Slot | File | Shown |
| --- | --- | --- |
| Title screen | `title.webp` | Above the game's name on the main menu (wide, about 3:1) |
| Event cards | `events/<event id>.webp` | At the top of a decision event (wide, about 3:1) |

Event ids are the `id` fields in `src/game/events.ts` (for example
`events/pilgrims.webp`, `events/comet.webp`, `events/flood.webp`).

// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('stylesheets', () => {
  // An unclosed block swallows every rule after it (a lost brace once hid the whole painted-wood look).
  for (const f of readdirSync('src/ui').filter((n) => n.endsWith('.css'))) {
    it(`${f} closes every block it opens`, () => {
      const css = readFileSync(join('src/ui', f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/'[^'\n]*'|"[^"\n]*"/g, '');
      let depth = 0;
      for (const ch of css) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        expect(depth).toBeGreaterThanOrEqual(0);
      }
      expect(depth).toBe(0);
    });
  }
});

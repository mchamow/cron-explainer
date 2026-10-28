# ⏰ Cron Explainer

[![Test and deploy](https://github.com/mchamow/cron-explainer/actions/workflows/deploy.yml/badge.svg)](https://github.com/mchamow/cron-explainer/actions/workflows/deploy.yml)

**Day 34 of [100 Days of React](https://github.com/mchamow?tab=repositories)**: Turn cron expressions into plain English and see when they run next.

**Live demo:** https://mchamow.github.io/cron-explainer/

## Features

- **Plain English** as you type: `*/15 9-17 * * 1-5` reads “Every 15 minutes, between 09:00 and 17:59, Monday through Friday”
- **Standard 5-field cron**: `*`, lists, ranges, steps (`*/15`, `10-50/10`, `5/15`), `JAN`–`DEC` and `SUN`–`SAT` names in any case, `7` as Sunday, `?` in the day fields, and the `@hourly` / `@daily` / `@weekly` / `@monthly` / `@yearly` macros
- **Colour-coded fields** under the input and a **field-by-field table** with each field's allowed values and everything it matches
- **Clear errors** that name the broken field: out-of-range values, backwards ranges, unknown names, too many or too few fields, a step bigger than the field (`*/90` in minutes only ever matches 0), and Quartz-only syntax (`L`, `W`, `#`, a seconds field)
- **Notes on surprising schedules**: day of month *and* day of week set means either one matches; `*/7` minutes starts over every hour, so the last gap is 4 minutes; day 31 skips short months
- **Next 10 runs** with dates, times and how far away each one is, in your local time zone or UTC. A schedule that can never happen (`0 0 30 2 *`) says so
- 24-hour or 12-hour clock
- **Examples** to start from, and a syntax cheat sheet whose examples you can click
- **Shareable links**: the expression lives in the URL (`#30_9_*_*_1-5`); copy the expression or the link with one click
- **Recent**: expressions you pause on are kept in `localStorage`, along with the expression and display settings
- Keyboard: <kbd>/</kbd> edit, <kbd>C</kbd> copy, <kbd>L</kbd> copy link, <kbd>T</kbd> 12/24-hour, <kbd>U</kbd> local/UTC, <kbd>Esc</kbd> leave the field
- Light and dark themes that follow the system, and a phone layout

## How it works

- [`src/cron.ts`](src/cron.ts): parses each field into segments and the set of values it matches, writes the English description, flags the surprising cases, and finds the next runs by stepping forward from now: skip to the next matching month, then day, then hour, then minute. Day of month and day of week combine the way Vixie cron does: if both are written without `*`, either may match
- [`src/store.ts`](src/store.ts): saved state with a guarded load that falls back field by field, the recent list, and the URL fragment encoding
- [`src/format.ts`](src/format.ts): run dates and times through `Intl.DateTimeFormat`, and “in 3 days” through `Intl.RelativeTimeFormat`

## Tech

React 19 · TypeScript · Vite · Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com) (Base UI) · lucide icons · Vitest + Testing Library · deployed to GitHub Pages with GitHub Actions.

## Run locally

```bash
pnpm install
pnpm dev
pnpm test   # 76 unit and component tests (Vitest)
```

# Tech Tambola — Midnight Circuit

The user selected this direction for every existing screen: navy canvas, ice panels, cyan actions, lime success and marked cells. Preserve the current React routes, API contracts, and server authority.

| Role | Token | Value |
| --- | --- | --- |
| Canvas | `--navy` | `#081220` |
| Primary action | `--cyan` | `#00e5ff` |
| Mark / success accent | `--lime` | `#a3ff4b` |
| Panel | `--ice` | `#e6f3f3` |
| Text accent on light panels | `--accent-ink` | `#076f7d` |

Use solid panels, restrained borders, system sans typography, and monospace labels. Keep bright cyan text on navy; use dark cyan on light panels. Preserve semantic warning and error colors.

Mobile: 320px minimum viewport, 44px controls, 16px form text, wrapped headers, horizontally scrollable admin navigation and tables. Tickets retain nine columns in a contained scroll viewport so cells remain readable and tappable.

The shared ActionButton adapts the loading indicator from [Aceternity Stateful Button](https://ui.aceternity.com/components/stateful-button) to CSS Modules, with request state controlled by the caller. No animation library or Tailwind migration is needed. Reduced-motion preferences disable rotation and transitions.

21st.dev was searched for loading buttons; component source retrieval failed with a transport error. Aceternity's public registry supplied the source reference. Existing product components remain the primary building blocks.

## Participant entry and lobby

After authentication, `/lobby` and `/participant/lobby` show code entry only. Successful manual, quick, and QR joins go to `/participant/waiting`. That page shows the preserved sample-ticket simulator and waits for the joined round's ACTIVE status before entering `/participant/game`. Its Back to participation link returns to code entry without automatically rejoining. The session's joined code and round ID restore the waiting screen on refresh.

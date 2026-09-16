# Project Tracker App (mock data, 4 roles, light + dark)

A full project management app closely matching the uploaded screenshots: the clean light "enaz" dashboard and the dark purple split-screen sign-up page. Everything runs on realistic sample data, with smooth animations and full responsiveness.

## Auth screens
- Split layout: left panel with a photo, tagline and slide dots; right panel with the form.
- Sign in, Create account, Forgot password. Google / Apple buttons are visual only.
- A role picker on sign-in (Admin, Manager, Member, Client) so any role can be previewed instantly.
- Dark by default, matching the screenshot, with a light variant too.

## App shell
- Slim icon rail on the left with tooltips, collapsible, plus a mobile drawer.
- Top bar: greeting, page title, Today / This Week / This Month / Reports pills, search, notifications, theme toggle, avatar menu.
- Light/dark toggle everywhere, remembered between visits.

## Modules
- Dashboard: My Tasks list with Today/Tomorrow tabs and coloured task cards, Projects Overview donut, Income vs Expense area chart, Invoice Overview progress bars, activity feed.
- Projects: grid and table views, progress, members, status filters, project detail with overview, tasks, files, activity.
- Tasks: kanban board with drag-free status columns, list view, priorities, due dates, task detail panel.
- Team: member cards, workload bars, roles, member profile with assigned work.
- Invoices & Finance: invoice table with status, revenue vs expense charts, outstanding/paid summary, invoice detail.
- Calendar: month and week grid with deadlines and events.
- Time tracking: timesheet entries per project, weekly hours chart.
- Reports: multiple charts (completion trend, budget burn, team performance, project status breakdown).
- Notifications: grouped list, read/unread.
- Settings: profile, appearance, notification preferences, team management (admin only).

## Role-based access
- Admin: everything, including team management and all finance.
- Manager: own projects, tasks, team, calendar, reports, invoices read/write; no global settings.
- Member: assigned tasks, own time tracking, calendar, limited project view; no finance.
- Client: read-only project progress, invoices addressed to them, no team or settings.
- Sidebar and pages adapt per role; blocked pages show a friendly "no access" screen.

## Motion
- Framer Motion: page transitions, staggered card entrances, animated counters, chart draw-in, sidebar expand/collapse, modal and drawer springs. Respects reduced-motion preference.

## Responsiveness
- Mobile-first: rail becomes a drawer, tables become cards, charts resize, kanban scrolls horizontally, dashboard stacks into one column.

## Technical notes
- TanStack Router file routes: `/` (landing → redirect to auth), `/auth`, `/signup`, `/forgot-password`, and app routes under a layout: dashboard, projects, projects/$id, tasks, team, team/$id, invoices, invoices/$id, calendar, time, reports, notifications, settings.
- Mock session in React context + localStorage; role guard in a layout route.
- Data lives in typed mock modules under `src/data/` (projects, tasks, users, invoices, events, timesheets, notifications).
- Charts with Recharts, animations with `motion`, UI from shadcn components.
- Design tokens (colors, radii, shadows, fonts) defined in `src/styles.css` for both themes — no hardcoded colors.
- No backend; swapping in real accounts and data later is a contained change.

# Devpost write-up (draft, edit in place)

Requirement from the user (15 Nov 2026): answer the Devpost headings, short, casual and human, market the product well, talk about real-world impact, and cover Synthesia, Databricks and Figma (design system). Every number comes from `build/morning-report.md` or the live Databricks check on 15 Nov. Re-check before posting if the code changes.

Before pasting: add the demo video, GitHub and Figma links, and set the Figma file to "Anyone with the link can view".

---

## Inspiration

Every AI agent is a chat box. You type, text comes back, you hope. Nobody hires someone by handing them a text box and walking away. A new hire gets a desk, a computer and a manager who can see what they're doing.

The people who'd gain most from agents are founders and small teams who can't hire for everything, and they're the worst placed to babysit a terminal full of bots. We wanted managing AI to feel like managing a team.

## What it does

Deskmates is a Mac app where you hire AI employees. Each one has a name, a face, a voice, a role and their own computer.

- Hire from eight roles: developer, marketer, researcher, designer, analyst, ops, sales, writer. Their desktop starts in seconds and they say hello.
- Give them tasks in plain English. They plan it and work on their own desktop while you watch live. Steer them mid-task, or grab the mouse yourself.
- Big steps like publishing, sending or deleting come to you as an approval card with the exact command. Nothing goes out until you say yes.
- Video call one person, or pull several into a meeting. They have faces and voices, with their screen right next to them.
- They work with each other. Maya (web dev) asks Priya (marketer) for a tagline and puts it on the page.
- The Team view shows hours, tasks and cost per person, plus a box where you ask questions in plain English.

It sits in your menu bar and pings you when someone needs you.

It's built for people who need more hands but can't hire: a team that works while you watch, checks in before anything risky, and tells you what it cost.

## How we built it

Each employee is a long-running Claude Agent SDK session (Sonnet 5.5) with tools tied to their own Cua desktop, a sandboxed Linux machine streamed live into the app. A local Node service keeps everything in SQLite, so the whole office survives a restart.

**Synthesia.** Each of the eight has their own Interactive Avatar, running over LiveKit. Calls are lip-synced video with a different voice per person. If a face isn't available, the call falls back to audio.

**Databricks.** SQLite stays the source of truth, and every employee, task, action, message and usage row gets mirrored into Delta tables. The Team view pulls its numbers from a SQL warehouse query. A Genie space on the same tables answers plain-English questions and shows the SQL it ran. Every run is traced in MLflow. A queue and a circuit breaker mean a slow Databricks never blocks an employee. It all runs free on Free Edition.

**Figma.** Every screen is built with Astryx's neutral theme. The Figma file has the brand and all 18 screens in light and dark, exported from the app's own markup so the file matches the product.

We built it over the weekend with an orchestrator agent, parallel build agents, design agents and a critic.

## Challenges we ran into

- Avatars have rules: interactive ids only, a limited number per session, one live face at a time. We tested every id on a real session and built meetings around that.
- Databricks Free Edition can't store traces as SQL tables, Genie allows about five questions a minute, and the warehouse can be slow. So analytics live in our own Delta tables and everything falls back to local data.
- Real runs found 17 bugs the tests missed, like a script deleting the running app's desktops and calls failing when another program held a port.
- Our web dev originally worked without asking. Now every role checks in before big steps.
- Figma's free plan limits automated calls, so we exported the screens as one board.

## Accomplishments that we're proud of

- A full real run: hire Maya, build a site, steer her mid-task, approve a git push, watch her ask a teammate for a tagline, take a video call and a two-person meeting, then see it all in the Team view.
- 10/10 on our real-world tests, 11/11 on the UI test, 429 unit tests passing.
- Kill the office mid-task and everyone's back in about 1.5 seconds with the task still going.
- Three employees on real desktops for 12 minutes cost 18 cents on Haiku.
- Eight different people, each with their own face, voice and personality.

## What we learned

- Capability wasn't the bottleneck. Visibility, approvals and cost tracking are what make you hand over real work.
- One computer per agent is safer, and easier to watch and debug.
- SQLite as the source of truth with Databricks mirrored on top gave us a proper record without depending on it.
- Voice turn-taking matters more than we expected. Ours answers about a second after you stop talking.
- Picking a design system early meant we spent the weekend on the product, not on pixels.

## What's next for Deskmates

- Let employees use your real screen. The permission flow is built, the host driver isn't.
- Daily summaries per person in Databricks, plus spend limits.
- Custom roles and shared team memory.
- A packaged Mac app, then Windows.
- Shared offices for small companies.

# Demo video: shot list (orchestrator, 15 Nov; edit in place)

Target length: two and a half minutes. One take per shot is enough: every shot below is something the app does by itself, and each has a fallback. "Checked" says how it was verified; a shot without a person's check must be tried once before recording.

## Before recording

1. Quit other heavy apps (each desktop takes about 2 GB). Plug in power.
2. `npm run build && npm start`. Wait for the window. If a team from testing is there, remove everyone (profile, Remove) so the video starts from the empty first-run screen.
3. Settings (gear, bottom left): check the four connections read as connected (model, desktops, calls, Databricks).
4. Model: Sonnet 5.5 (the default in `.env.local`). A full run of this list costs about $1.
5. Microphone: allow it when macOS asks on the first call. Use headphones so the employee's voice is not picked up again.
6. Record at 1440 x 900 or larger, light mode. Hide the Dock. Screen recording with system audio (so the employee's voice is captured).
7. Do one silent rehearsal of shots 2 to 6 first: the first hire of a session is slower than later ones.

## Shots

| # | Seconds | What you do | What the viewer sees | Say (voice-over) | Fallback |
| --- | --- | --- | --- | --- | --- |
| 1 | 0 to 10 | Nothing: open on the first-run screen | Four empty desks, the Deskmates mark, one button | "This is Deskmates. You hire a team of AI employees, and each one gets a desk of its own: a real computer." | |
| 2 | 10 to 30 | Hire: choose Web developer, look at the candidate, press Hire | Role list, then a person with a name and a face; her row arrives in the sidebar; her desktop starts; she says hello by herself | "Pick a role, meet the candidate, hire. Maya's desktop starts in a few seconds, and she introduces herself." | If the greeting is slow, cut to it |
| 3 | 30 to 65 | Type: "Make a one-page site about our team in ~/work/site and show it to me in the browser." Open her desktop (monitor icon) | Her plan appears and ticks over; activity lines; on the right her live desktop: editor, terminal, then the page in Firefox | "I give her a task in plain words. She plans it and does it on her own desktop. That is a live view, not a recording." | Speed this part up 4x in the edit |
| 4 | 65 to 80 | While she works, type: "Make the heading blue." | Delivered, then Seen; the page updates with a blue heading; a done message with time and cost | "I can steer while she works. She picks it up at the next step." | |
| 5 | 80 to 100 | Type: "Publish it with git push." Wait. Press Approve | An approval card in the conversation: what she wants to do and why; the dot turns amber, "Needs you"; after Approve she carries on | "Big steps come to me first. Nothing is published until I approve. Every employee has their own permission level." | Show Deny instead: she stops and says so |
| 6 | 100 to 125 | Hire a Marketer (Priya). To Maya: "Ask Priya for a tagline and put it under the heading." | Maya messages Priya; Priya answers from her own desktop; the tagline appears on the page | "They work with each other too. Maya asks the marketer, and uses what she gets." | Cut if the exchange takes over a minute; keep the result |
| 7 | 125 to 150 | Press the camera icon on Maya. Ask aloud: "How is the site going?" Then press Summon meeting, add Priya, ask: "Priya, what tagline did you write?" | Maya's face, moving and speaking, beside her live desktop; then both in one room, answering by name | "And I can call them. That is Maya's face and voice, with her screen beside her. Summon meeting brings the team into one room." | One-to-one only if the meeting misbehaves |
| 8 | 150 to 165 | Open Team (chart icon). Type a question: "Who cost the most this week?" | Hours, tasks and cost per person, each in their colour; the answer to the question; "Open traces" | "Everything they do is recorded in Databricks: a timesheet, an audit trail, and I can ask questions in plain English." | Skip the question if Genie is not set up; show the table |
| 9 | 165 to 170 | Close the window; a notification arrives; click it | The menu-bar mark; "Maya needs you"; the app opens on her conversation | "It lives in the menu bar and tells me when someone needs me." | |

## Lines for the pitch (if a spoken pitch is wanted)

- Agents today are a chat box. A team is people with their own desks. Deskmates gives each agent a name, a face, a voice and a real computer, and gives you the manager's seat.
- Autonomy with a hand on the wheel: plans you can read, a desktop you can watch or take over, approvals for the big steps, permission levels per person.
- Built on Cua (one sandboxed desktop per employee), the Claude Agent SDK (the loop), Astryx (every pixel of the front end), Synthesia and LiveKit (faces and voices), Databricks (the record).

## What has not been checked by a person (try once before recording)

- Speaking into the real microphone on a call, and whether each person's voice matches their face in a meeting.
- The look of the native notification and the menu-bar icon in light and dark menu bars.
- The first-time macOS prompts (microphone, notifications).

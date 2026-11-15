# Priya stall, 15 Nov 2026, 13:10:09 to 13:14:39

Read-only diagnosis. Evidence: Priya's session transcript (`priya-run2/.claude/projects/*/4330201e-....jsonl`), the frozen run DB (`scratchpad/run2-db/office.db`), `live-run-2.log`, and `src/office/employees/supervisor.ts`.

## Cause (confirmed)

A stray tool call after `finish_task`, in the same SDK turn, opened a brand-new "ghost" task. `finish_task` only schedules the close (3 s timer, `closeAfterTurn`). The timer closed the real task. Then her next tool call, `TodoWrite`, re-opened a task through `setPlan` / `toolUsed`. The turn ended with `flags.finished` still true from the earlier `finish_task`, so `turnEndedInner` took its "she finished, nothing to nudge" shortcut. No turn was left in flight. The ghost task stayed open until the 4-minute stall watchdog fired. The state detail was the manager's text because `openTask` titles a task from `lastAssignment`, which still held the LAUNCH15 change request.

Candidates: (a) ruled out, (b) partly true (the stall watchdog was what finally acted; the nudge path never ran), (c) ruled out, (d) not the cause, (e) is the cause.

## Timeline

| Time | Evidence |
|---|---|
| 13:09:09 | Manager "Team, a change from me ... LAUNCH15" is queued. Transcript: `queue-operation remove ... reason: absorbed_mid_turn` at 13:09:14.6, delivered to her right after her first `finish_task`. |
| 13:09:14.6 | `finish_task` (task 1). Timer closes it at 13:09:17 (DB `finished_ms` 13:09:17). |
| 13:09:20 | First tool use after the close (python shell): `toolUsed` opens task 2, titled from `lastAssignment` (the change request). This reopen was correct, because the manager message really was a new assignment. |
| 13:10:00 | `message_colleague` to Maya returns `Too many messages between teammates right now. Ask your manager instead.` |
| 13:10:01.3 | `finish_task` (task 2) returns "Task closed." `flags.finished = true`, 3 s `pendingClose` timer armed. |
| 13:10:04.3 | Timer fires, `flushClose` closes task 2 (DB: task 2 `finished_ms` 13:10:04). |
| 13:10:04.4 | `TodoWrite {"todos":[{"content":"All launch copy, posts and proofreading","status":"completed"...}]}`. Same turn, no new turn started. `onToolUse` calls `host.setPlan` (`this.task ?? this.openTask()`) and then `host.toolUsed` (`if (!this.task) this.openTask()`). Task 3 opens 85 ms after task 2 closed (DB task 3 `assigned_ms` 13:10:04, plan = that one TodoWrite item, so "1/1"). Title is the change request. |
| 13:10:04.9 | `message_user` ("Maya: my sign-off message didn't go through ...") is attributed to task 3 (DB `messages.task_id` = task 3). |
| 13:10:08 | Turn result arrives. Usage row is charged to task 3. `turnEndedInner`: `flags.finished` is true, so it calls `refresh()` and returns. No nudge, no close. `this.task` is task 3, `state=working`, `activity=null`, so `compute()` gives detail = task title. |
| 13:10:08 to 13:14:31 | Silence. No SDK activity, `waiting` is null, no timers pending. Transcript has no entries between 13:10:08 and 13:14:31. |
| 13:14:31 | `watchdogTick`: task open, not waiting, `working`, `now - lastSdkMs > 4 min`. `stalls=1`, `interrupt()`, delivers "You stalled. Look at the screen first ...". |
| 13:14:34 to 13:14:39 | She calls `get_window_state`, then `finish_task` again. Task 3 closes "done" (DB: 13:14:39, 274 905 ms active, 8 turns), producing the third "done" message. |

Not the wait path: her last `wait_for_colleague` was 13:09:54. Maya's reply at 13:09:55 cleared it (`deliver` calls `clearWaiting`). The log shows no "Waiting for" in her state after that.

## Smallest correct fix

File `src/office/employees/supervisor.ts`.

1. New field `private freshAssignment = false`.
   - Set it to `true` in `deliver()` when `item.kind === 'manager'`. That covers `sendMessage` and any other manager delivery.
   - Set it to `false` in `openTask()`, and at a new-turn start in `turnStarted()` (inside the `if (!this.inTurn)` block, since queued items are consumed by then).
2. In `toolUsed()` and `setPlan()`, replace the unconditional open with a guard:
   ```ts
   private mayOpenTask(): boolean {
     // after finish_task / report_stuck in this very turn, further tool calls are tail work on a closed task,
     // unless the manager sent something new that this turn absorbed (the legitimate 13:09:20 reopen)
     return !(this.inTurn && (this.flags.finished || this.flags.stuck) && !this.freshAssignment);
   }
   ```
   `toolUsed`: `if (!this.task && this.mayOpenTask()) this.openTask();`
   `setPlan`: `if (!this.task && !this.mayOpenTask()) return;` before `const task = this.task ?? this.openTask();`
3. Optional but cheap: make `finishTask` return text that tells her to stop. For example `'Task closed. Stop now; call no more tools.'` when `!this.freshAssignment`. The transcript shows she reflexively called `TodoWrite` and `message_user` after "Task closed."

Why the `freshAssignment` flag is needed: a plain "no new task after finish in this turn" rule would break the 13:09:20 reopen, because that message was also absorbed mid-turn after a `finish_task` with `flags.finished` already true.

Residual edge: if a manager message is handled inside a task without the turn restarting, then `finish_task` and a stray tool call follow, the flag is still true and a ghost task could still open. Hardening: also clear the flag in `finishTask()` whenever the model has already acted on the message (or accept the edge).

Safety net (optional, belt and braces): in `watchdogTick`, the "stalled" condition could also be tested as "no turn in flight and no pending items" and treated at 30 s instead of 4 minutes. Not recommended as the primary fix.

## Second problems noticed

1. `stalls` is never reset (only incremented at line ~1256). Any second stall in the employee's lifetime goes straight to `failTask('Stalled')` without the nudge. Reset `this.stalls = 0` in `turnStarted()` or in `toolUsed()`.
2. A refused teammate message had no recovery path. After the refusal she called `finish_task` ("signed off"), then told Sam instead of Maya. Maya never got the approval until Priya re-sent it at 13:15:26, after Maya's own chase message. The cap is now 90 a minute with a "not sent, send again shortly" text, so this is already addressed. One more cheap change is for `finish_task` to be sent back (like `planFinishHook`) when a `message_colleague` returned a refusal in the same task and was not retried. Optional.
3. The ghost task also produced a third "done" bubble and double-counted cost. Task 3 holds the cost of the 13:10:08 turn, which was really task 2's tail. This goes away with the fix.
4. The turn's trailing plain text at 13:10:08 ("The launch copy ... are done") is not in `messages`, so `heldFinal` swallowed it (`sameSaying` match against the earlier "done" summary). That is probably intended, so no action.

## Confidence

High (about 90%) on the mechanism. The transcript, the DB timestamps (task 2 close 13:10:04.319, task 3 open 13:10:04.404, TodoWrite 13:10:04.4) and the code paths line up exactly, and the 4:22 gap matches `lastSdkMs` (13:10:08) plus the 4-minute threshold on the 30-second tick (13:14:31). I did not run the code to reproduce.

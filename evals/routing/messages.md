# Routing messages

These are the 36 user messages of the routing probe, in English translation. The originals, most of them in Turkish, are in appendix A of [the audit source](../../docs/raw/2026-10-05-prompt-quality-audit.md); the translation keeps their meaning, register and ambiguity and makes nothing clearer. Each message is the first message of a new session in a project with a vault and the task module on. Messages 1 and 34, and 2 and 3, were the same request in two languages and are now the same text; they keep their numbers and expectations.

`expect` is the skill the message should reach first, copied from the audit and written as the plugin names the skills, `sw:<name>`; a skill renamed since the audit is expected under its new name. `none` means the agent should handle the message without any skill; `-` means no expectation is set yet. A message may not contain `|`.

| # | Message | expect |
| --- | --- | --- |
| 1 | do T-05 | sw:plan-implement |
| 2 | implement T-05 | sw:implement |
| 3 | implement T-05 | sw:implement |
| 4 | write a plan for T-07 | sw:plan |
| 5 | what's next, what should we continue with? | sw:plan |
| 6 | why does T-03 exist, what does it block? | sw:explain |
| 7 | finish all the tasks in the backend area one after another, don't ask me | sw:autopilot |
| 8 | is T-04 done, how was it verified? | sw:verify |
| 9 | close T-04 | sw:verify |
| 10 | the login page returns 500 | sw:triage |
| 11 | the tests were passing yesterday and broke today, have we had this before? | sw:triage |
| 12 | add this article to the wiki: https://example.com/post | sw:ingest |
| 13 | I put the meeting notes under docs/raw | sw:ingest |
| 14 | check the wiki, are there any broken links | sw:lint |
| 15 | the index is out of date, refresh the task list | sw:index |
| 16 | open the task board in the browser | sw:view |
| 17 | how many tokens did this session use? | sw:usage |
| 18 | why does the session start with 60k tokens? | sw:doctor |
| 19 | have opus do the planning and sonnet the implementation | sw:config |
| 20 | set up superwiki in this project | sw:init |
| 21 | convert the existing TASKS.md table to superwiki | sw:migrate |
| 22 | do T-06 and T-08 back to back | sw:autopilot |
| 23 | let's add a user profile page | sw:plan |
| 24 | fix the typo in the README | none |
| 25 | continue with T-05 | sw:implement |
| 26 | debug this error: TypeError: x is undefined | sw:triage |
| 27 | what did T-02 do? | sw:verify |
| 28 | how many tasks are left? | none |
| 29 | plan and implement T-09 | sw:plan-implement |
| 30 | what does the wiki say about offline sync? | none |
| 31 | start T-05 | sw:implement |
| 32 | write a unit test for the React component | none |
| 33 | review T-05's implementation | sw:review |
| 34 | do T-05 | sw:plan-implement |
| 35 | what should I work on next? | sw:plan |
| 36 | the build is failing on CI since this morning | sw:triage |

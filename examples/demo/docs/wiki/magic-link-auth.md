---
type: decision
summary: Sign-in uses emailed magic links instead of passwords.
date: 2026-08-29
status: accepted
---

# Decision: magic-link sign-in

## Context
The [[home-cook-persona]] signs in rarely and on more than one device. In the interviews
([[user-interviews-2026-08]]) forgotten passwords were the most common reason for abandoning an app.

## Decision
Sign-in is by a one-time link sent to the user's email. There are no passwords. A session lasts 90 days
on a device and is renewed on use.

## Consequences
- No password reset flow to build or secure.
- Sign-in depends on email delivery; the link expires after 15 minutes.
- The mobile app must handle the link as a deep link, which is part of [[M-01]].

Implemented in [[B-02]].

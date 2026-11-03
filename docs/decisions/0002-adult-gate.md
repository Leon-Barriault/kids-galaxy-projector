# Adult gate on the kid tablet

Status: accepted.
Date: 2026-11-03.

## Context

Children aged 3 to 6 use the kid tablet in Québec daycares.
The drawing screen had two controls a child could open with one tap:
the galaxy name, which sets the server address, and the language switch.
Lock mode keeps the child inside the app, so those controls are the way out
of the drawing task. The check has to work offline, in lock task, and when
the tablet is showing the wrong language. That last case matters because
the language control is one of the things behind the gate.

## Decision

A short tap does nothing. Opening the check takes a continuous hold of
1.2 seconds, which is longer than the system long-press and longer than a
child's poke. The hold fills a still bar. It does not flash.

The check itself is a two-digit sum. Both numbers are from 5 to 9, so the
answer is always from 10 to 18. One tap cannot be the whole answer.
Three wrong answers lock the keypad for 30 seconds.
The same check guards the galaxy name and the language switch.
After it passes, a grown-up menu offers those two actions.

TalkBack does not have to perform the 1.2 second hold.
The accessibility action opens the same sum. The sum is still required.
The keys are at least 48 dp and the delete key has a name.

## Why this pattern

A reading question was rejected because the language switch is behind the
gate. An adult who needs to change the language may not be able to read the
sentence on the screen. Digits and a plus sign are the same in English and
in French, and the question is drawn large.

A two-corner hold was rejected because it needs two pointers, it has no
TalkBack equivalent, and it is hard with one hand.

Arithmetic with a handful of choices was rejected because a random tap would
succeed too often. A two-digit answer is about one chance in a hundred,
and the lockout stops mashing.

## Consequences

The manager tablet is unchanged. It is the grown-up app, and its language
switch stays one tap.
The kid-tablet guide is the page that shows the hold and the sum.
Planet names stay free text. They are a separate rule: the pack-up command
`scripts/clear_planet_names.sh` deletes the stored list (the PC keeps at
most 30), and `scripts/backup_room.sh` keeps the drawings but leaves the
names out of the USB copy. The tablet is shared by daycares, so a name
must not ride along to the next site.

# The kid tablet

This page is for the grown-up who hands a tablet to young children.
It is not the programmer guide.
The production page sets up the computer.
Do this page before the first child draws.

<!-- section: who -->

## Who this page is for

You can do this if you can plug in a cable and copy one line.
Children can draw after lock mode is on.
Children should not do these steps.

<!-- section: words -->

## Words we use

**Lock mode.** The drawing app stays on the screen.
Home does not open other apps.

**Device owner.** The drawing app is in charge of the tablet.
There is no paid management service.

**Screen protector.** A clear sheet on the glass.

**Case.** A thick rubber cover with a raised lip.

**ID card.** The file that lets this tablet talk to the room.

**Paper card.** The sheet with the Wi-Fi name and the computer address.

<!-- section: specs -->

## Minimum tablet specs

These facts come from the app build.

<!-- step: specs-android -->

1. Android 8 or newer can run the app.
   That is API 26 in the build.
   The app aims at API 36.
   Prefer Android 9 or newer.
   Android 9 has a stronger lock on notifications.

   **What you should see.** About tablet shows Android 9 or newer.

   **If not.** Android 8 still runs the app. Test Home after lock mode.

<!-- step: specs-screen -->

2. The app does not lock a screen size.
   Upright and sideways both work.
   A 10 inch screen is easier for small hands.
   An 8 inch screen can work.

   **What you should see.** The child can reach the drawing with one hand on the case.

   **If not.** Use a larger tablet for the youngest children.

<!-- step: specs-memory -->

3. The build does not set a memory size.
   Plan on 3 GB or more.
   A 2 GB tablet can feel tight while drawing.

   **What you should see.** The box says 3 GB or more.

   **If not.** Watch a test drawing. If the tablet stalls, pick another one.

<!-- step: specs-play -->

4. Google Play Services are not required.
   Do not add a Google account.
   Lock mode hides the Play Store.

   **What you should see.** Setup lets you skip every account.

   **If not.** Erase the tablet and skip the account.

<!-- step: specs-wifi -->

5. 2.4 GHz and 5 GHz both work.
   The app does not require one band.
   The tablet and the computer must use the same Wi-Fi.
   Guest isolation must be off.

   **What you should see.** The Wi-Fi name matches the paper card.

   **If not.** Join the room Wi-Fi before lock mode.

<!-- step: specs-fire -->

6. Prefer a Lenovo Tab or a Samsung Galaxy Tab.
   A Fire tablet can install the drawing app.
   Play Services are not required, so that part can work.
   Lock mode on Fire OS is not promised.
   Amazon account must be gone before the lock command.
   If the command says lock mode did not turn on, do not give that Fire tablet to children.

   **What you should see.** A normal Android tablet, with lock mode confirmed later on this page.

   **If not.** Use a Lenovo or Samsung tablet for the children.

<!-- section: case -->

## Put on a rugged case

Do this before the first day.

<!-- step: case-buy -->

1. Buy a thick rubber case.
   The corners should stick out past the tablet.
   The lip around the screen must be higher than the glass.

   **What you should see.** You can set the tablet face down and the glass does not touch the table.

   **If not.** Return it and buy a case with a raised lip.

<!-- step: case-buttons -->

2. Check the power button, the volume buttons, and the charge hole.
   A grown-up must still reach the USB port with a cable.
   That cable is how a helper fixes the tablet later.

   **What you should see.** Each button clicks. The cable seats fully.

   **If not.** Pick a case that leaves those openings clear.

<!-- step: case-name -->

3. Put tape on the case and write the tablet name.
   Example: `kid-1`.
   Use the same name when you make the ID card.

   **What you should see.** The name is readable across the room.

   **If not.** Use thicker tape. Do not write only on the glass.

<!-- section: protector -->

## Put on a screen protector

<!-- step: protector-clean -->

1. Wash and dry your hands.
   Wipe the glass with the cloth from the protector pack.
   Do this before the case traps dust on the glass.

   **What you should see.** The glass has no crumbs or fingerprints.

   **If not.** Wipe again. Dust under the sheet will stay there.

<!-- step: protector-stick -->

2. Peel the protector and lay it on the glass.
   Press from the middle outward.
   A small bubble at the edge can be pressed out.

   **What you should see.** The sheet covers the glass and the picture looks clear.

   **If not.** Lift it slowly and try once more. Then fit the case.

<!-- fix: protector -->

> **If this does not work**
>
> 1. Stop if the sheet is crooked over a button.
> 2. Use a new sheet.
> 3. Fit the case only after the sheet is smooth.

<!-- section: kiosk -->

## Turn on lock mode

There is no paid manager.
The computer uses the tablet cable and Android device-owner mode.
The tablet must be erased first.
No account may be on it.

<!-- step: kiosk-erase -->

1. Erase the kid tablet.
   Skip every account prompt.
   Join the room Wi-Fi when the tablet asks.
   Turn on USB debugging, as in the install guide.

   **What you should see.** A home screen with no email account.

   **If not.** Erase again. An account blocks lock mode.

<!-- step: kiosk-command -->

2. Plug in only the kid tablet.
   On the galaxy computer, paste this line.

```bash
bash scripts/prepare_kid_tablet.sh
```

   **What you should see.** The drawing app fills the screen.
   The command says lock mode is on, and it prints the seconds.

   **If not.** Tap Allow on the tablet. Use a data cable. Then run the line again.

<!-- step: kiosk-home -->

3. Press the Home button.

   **What you should see.** You stay in the drawing app.

   **If not.** Run the same command again. If it still fails, erase the tablet and skip the account.

<!-- step: kiosk-limits -->

4. Know the limits.
   A grown-up with the USB cable can still service the tablet.
   That cable is the recovery door.
   The script cannot turn on start-when-plugged-in.
   Android 8 can pin the app.
   Android 9 and newer also lock the notification shade more tightly.

   **What you should see.** Home stays in the drawing app.

   **If not.** Do not give the tablet to children until Home stays inside the app.

<!-- fix: kiosk -->

> **If this does not work**
>
> 1. Unplug other tablets.
> 2. Erase the kid tablet and do not sign in.
> 3. Join the room Wi-Fi, then run the command again.
> 4. On a Fire tablet, stop if lock mode will not turn on.

<!-- section: block -->

## Stores, browsers, and notifications

Lock mode does this when the drawing app is the device owner.
You do not buy a separate service.

<!-- step: block-store -->

1. The Play Store is hidden.
   The Amazon store is hidden when that app is present.
   New apps cannot be installed from the tablet.

   **What you should see.** You cannot open a store from the drawing app.

   **If not.** Press Home. If a store opens, run the lock command again.

<!-- step: block-browser -->

2. Chrome and other common browsers are hidden.
   The tablet should not open a web page for a child.

   **What you should see.** The child stays on the drawing page.

   **If not.** Run the lock command again on an erased tablet.

<!-- step: block-buy -->

3. Do not add a Google account.
   Purchases inside apps need that account and the Play Store.
   Both stay off.

   **What you should see.** No account prompt and no buy button in this app.

   **If not.** Erase the tablet. This drawing app does not sell anything.

<!-- step: block-notes -->

4. The notification shade is turned off by lock mode.
   A child should not pull down messages or settings.

   **What you should see.** A swipe from the top does not open settings.

   **If not.** On Android 8, test again. Prefer Android 9 or newer if the shade still opens.

<!-- section: boot -->

## After a reboot or a dead battery

The drawing app is the home app.
It also starts itself after boot when lock mode is on.
The saved room address is already on the tablet.

<!-- step: boot-restart -->

1. Restart the tablet from the power menu.
   Wait for it to finish.

   **What you should see.** The drawing app is open. You do not pick a galaxy.

   **If not.** Press Home once. If another app appears, run the lock command again.

<!-- step: boot-dead -->

2. If the battery was empty, plug in the tablet charger.
   Wait 10 minutes.
   Press the power button once.

   **What you should see.** The drawing app opens after the tablet starts.

   **If not.** Wait a little longer, then press power again. A fully empty battery can be slow.

<!-- step: boot-charge -->

3. Look in the tablet menus for a switch about starting when power is plugged in.
   Names differ by brand.
   Turn that switch on once if you find it.
   Write on the paper card that you found it.
   The setup script cannot flip this switch.

   **What you should see.** Either the switch is on, or you wrote that this tablet does not have it.

   **If not.** The tablet still works. A grown-up presses power after a dead battery.

<!-- step: boot-wifi -->

4. The tablet joins the saved Wi-Fi by itself.
   The first launch after boot may need a moment.
   If Launch fails at once, wait and tap Launch again.

   **What you should see.** A new planet reaches the wall.

   **If not.** Check that the Wi-Fi name still matches the paper card.

<!-- fix: boot -->

> **If this does not work**
>
> 1. Confirm lock mode with the Home button.
> 2. Charge for 10 minutes if the battery was empty.
> 3. Press power. The script cannot power on a tablet that is fully off.

<!-- section: charge -->

## Charging routine

<!-- step: charge-night -->

1. Each night, plug the kid tablet into its own charger.
   Set it on a shelf, not on the floor.
   The screen may sleep. That is fine.

   **What you should see.** A charging picture or a small battery light.

   **If not.** Reseat the cable. Try the tablet's own charger.

<!-- step: charge-morning -->

2. In the morning, press the power button once.

   **What you should see.** The drawing app is on the screen.

   **If not.** Wait until the battery picture moves, then press power again.

<!-- step: charge-spare -->

3. Keep the charger in the same basket every day.
   Do not let children carry the charger away.

   **What you should see.** The charger is in the basket at the end of the day.

   **If not.** Look under the tables before you leave.

<!-- section: dropped -->

## If the tablet is dropped or broken

<!-- step: dropped-stop -->

1. If the glass is cracked, stop.
   Do not hand it back to a child.
   A crack can cut small hands.

   **What you should see.** The tablet is on a shelf, out of reach.

   **If not.** Take it from the child and start the replace steps.

<!-- step: dropped-planets -->

2. Planets on the wall stay on the galaxy computer.
   A broken tablet does not delete them.

   **What you should see.** The sky still shows the old planets.

   **If not.** That is a computer problem. Use the troubleshooting guide, not a new tablet only.

<!-- step: dropped-wipe -->

3. Ask a helper to erase the broken tablet before it is sold or thrown away.
   The ID card is inside the app.
   Then cancel that card if the tablet left the room.
   The production page has the cancel command.

   **What you should see.** The cancel list shows that name as cancelled.

   **If not.** Run the cancel command with the name from the tape.

<!-- section: replace -->

## Replace a tablet

The new tablet must be erased, with no account.
Plug in only that tablet.
The first app build on a computer can take about 30 minutes.
After that, this is often about 15 minutes.
The command prints the real seconds.

<!-- step: replace-case -->

1. Fit the case and the screen protector on the new tablet.
   Write the new name on tape.
   Example: `kid-2`.

   **What you should see.** The name is on the case and the lip is above the glass.

   **If not.** Do that before you install the app.

<!-- step: replace-erase -->

2. Erase the new tablet.
   Skip every account.
   Join the room Wi-Fi.
   Turn on USB debugging.
   Plug it into the galaxy computer.
   Tap Allow.

   **What you should see.** The computer can see one tablet.

   **If not.** Unplug every other tablet and tap Allow.

<!-- step: replace-command -->

3. Paste this line with the real names.

```bash
bash scripts/replace_kid_tablet.sh --name kid-2 --old-name kid-1
```

   Use `--old-name` only for the lost or broken tablet.
   Skip `--old-name` if there is no old card to cancel.

   **What you should see.** The drawing app fills the screen.
   A line tells you how many seconds it took.

   **If not.** Read the last lines. An account on the tablet is the usual cause.

<!-- step: replace-home -->

4. Press Home.
   Then restart the tablet once.

   **What you should see.** The drawing app stays open, and it comes back after the restart.

   **If not.** Run `bash scripts/prepare_kid_tablet.sh` again. Do not add an account.

<!-- fix: replace -->

> **If this does not work**
>
> 1. Erase the new tablet and skip the account.
> 2. Use a data cable and tap Allow.
> 3. Run the replace line again. A second run is safe.
> 4. If the first build is still running, wait. Do not unplug the tablet.

<!-- section: limits -->

## What this setup cannot do

<!-- step: limits-mdm -->

1. There is no paid fleet manager.
   Lock mode is the Android device-owner path.
   It is started from the galaxy computer with the USB cable.

   **What you should see.** The lock command finishes without a store purchase.

   **If not.** Do not buy a management service for this step. Fix the erase and the cable first.

<!-- step: limits-usb -->

2. USB debugging stays available.
   A grown-up with the cable can service the tablet.
   Keep the cable with the grown-up, not in the play area.

   **What you should see.** The cable is in the locked drawer or with the paper card.

   **If not.** Move the cable before children arrive.

<!-- step: limits-power -->

3. The script cannot turn a fully off tablet on when the charger is plugged in.
   Some brands have that switch. Many do not.
   A grown-up presses power after a dead battery.

   **What you should see.** You know whether this tablet has the switch.

   **If not.** Write "press power in the morning" on the paper card.

<!-- step: limits-fire -->

4. Fire OS may refuse device-owner lock mode.
   The drawing app can still be installed there.
   Do not count a Fire tablet as locked unless Home stays in the app.

   **What you should see.** Home stays in the drawing app on the tablet you will use.

   **If not.** Switch to a Lenovo or Samsung tablet.

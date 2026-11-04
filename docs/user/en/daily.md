# Use Kids Galaxy each day

This page is for the grown-up who opens the room.
Children can do the drawing steps.
Setup steps stay in the install guide.
Open Ubuntu, then go to the project folder, before you paste a command.

<!-- section: on -->

## Turn the room on

About 10 minutes.

<!-- step: on-router -->

1. Plug in the travel router.

   **What you should see.** A steady Wi-Fi light.

   **If not.** Check the power plug or the power bank.

<!-- step: on-wifi -->

2. On the PC, join `KidsGalaxy`.
   Do not join the daycare Wi-Fi.

   **What you should see.** The Wi-Fi name is `KidsGalaxy`.

   **If not.** Forget other networks and join `KidsGalaxy` again.

<!-- step: on-docker -->

3. Quit Docker Desktop if the whale icon is showing.

   **What you should see.** The whale icon is gone.

   **If not.** The host setup line will stop until you quit it.

<!-- step: on-ubuntu -->

4. Turn on the PC if it is off.
   Sign in to Windows.
   Open the Ubuntu app.

   **What you should see.** The name `omega`.

   **If not.** Click Start, type Ubuntu, and open that app.

<!-- step: on-folder -->

5. Paste this line.

```bash
cd /home/omega/kids-galaxy-projector
```

   **What you should see.** No error. `pwd` shows that same folder.

   **If not.** Paste the line again before any other command.

<!-- step: on-projector -->

6. Turn on the projector.
   Choose HDMI.

   **What you should see.** The Windows desktop on the wall.

   **If not.** Push the HDMI plug in and press the source button.

<!-- step: on-page -->

7. If the sky is not showing, paste this line.

```bash
bash scripts/open_projector.sh
```

   **What you should see.** The dark sky and the waiting words.
   Chrome opens on Windows.

   **If not.** On Windows, open `http://127.0.0.1:8000/` and press F11.

<!-- step: on-tablets -->

8. Wake both tablets.

   **What you should see.** The drawing app on the kid tablet.
   Kids Galaxy Manager opens on the grown-up tablet.

   **If not.** Check that each tablet is on `KidsGalaxy`.

<!-- fix: on -->

> **If this does not work**
>
> Go to the project folder.
> Paste `bash scripts/setup_room.sh`.
> Then open the picture again.
> Check HDMI if the wall is still dark.

<!-- section: kid -->

## Kid mode

The kid tablet is for drawing only.
Children should not need a password.

Tip. Each child may have 30 minutes of screen time in a day. Count other screens. You track it.

<!-- step: kid-open -->

1. Wake the kid tablet.

   **What you should see.** Create Your Planet.

   **If not.** Lock mode is off. Use the install guide to turn it on.

<!-- step: kid-draw -->

2. The child taps a shape, draws, and can add space friends.
   Then the child taps Launch.

   **What you should see.** The planet on the wall.

   **If not.** Read the message on the tablet.

<!-- fix: kid -->

> **If this does not work**
>
> If the tablet cannot find the galaxy, check the Wi-Fi name.
> It must be `KidsGalaxy`.
> Use the troubleshooting page for the other fixes.

<!-- section: manager -->

## Manager mode

The manager tablet is for grown-ups.
It is a different app.
It is not locked.

<!-- step: manager-open -->

1. Open Kids Galaxy Manager.

   **What you should see.** The list of planets.
   An empty list means no planet has been launched yet.

   **If not.** Wake the tablet and look for that app name.

<!-- step: manager-delete -->

2. To remove one planet, tap the delete icon on its row.
   Read the question.
   Then confirm.

   **What you should see.** The planet leaves the wall.

   **If not.** You confirmed the question on the manager tablet.

<!-- step: manager-clear -->

3. To remove every planet, tap Clear all.
   Confirm only if you mean it.

   **What you should see.** An empty list.

   **If not.** Stay on the manager tablet. The kid app cannot delete planets.

<!-- fix: manager -->

> **If this does not work**
>
> Use the manager tablet.
> Both tablets must be on `KidsGalaxy` with the PC.

<!-- section: language -->

## Change the language

There are two languages.
English and Canadian French.
They are separate choices.

<!-- step: language-tablet -->

1. On the manager tablet, tap EN / FR.

   **What you should see.** The app opens again in the other language.
   The choice stays until you tap the button again.
   On the kid tablet, hold EN / FR and answer the number question.
   Read the kid tablet page for that hold.

   **If not.** Tap EN / FR once more.

<!-- step: language-wall -->

2. Open the manager app.
   Find Projector language.
   Tap English or Français.
   On the PC, reload the galaxy page.

   **What you should see.** The new words on the wall.
   The wall follows the manager choice.

   **If not.** Reload Chrome. The page is `http://127.0.0.1:8000/` on this PC.

<!-- fix: language -->

> **If this does not work**
>
> Tap EN / FR once more.
> If the wall did not change, reload Chrome.

<!-- section: project -->

## Project a planet

About 2 minutes.

<!-- step: project-ready -->

1. Check the wall first.

   **What you should see.** The waiting words or older planets.

   **If not.** Open the wall page before the child taps Launch.

<!-- step: project-launch -->

2. On the kid tablet, finish the drawing and tap Launch.

   **What you should see.** The new planet arrives.
   A child can launch again after a short wait.

   **If not.** Join `KidsGalaxy`, then tap Launch once more.

<!-- fix: project -->

> **If this does not work**
>
> The wall can stay on the old sky if the tablet is on the wrong Wi-Fi.
> Join `KidsGalaxy`.
> Then tap Launch again.

<!-- section: print -->

## Print a planet

About 5 minutes.
Use the manager tablet.
The kid tablet cannot print.

<!-- step: print-open -->

1. Open Kids Galaxy Manager.
   Find the planet you want.
   Tap Print.

   **What you should see.** The Android print box.

   **If not.** Stay on the manager tablet and tap Print again.

<!-- step: print-send -->

2. Choose the printer.
   Tap the print button in that box.

   **What you should see.** A page with the planet and the child drawing.
   If printing is missing, the tablet offers a save box.
   Save the PDF and open it in a PDF app.

   **If not.** Save the PDF and print it from another device.

<!-- fix: print -->

> **If this does not work**
>
> Check that the tablet is on `KidsGalaxy`.
> Try Print again.

<!-- section: stl -->

## Save a 3D file

About 10 minutes.
The file is called STL.
A 3D printer can use it.
The file is one round planet.
Rings and little friends are not in the file.

<!-- step: stl-tap -->

1. On the manager tablet, find the planet.
   Tap STL.

   **What you should see.** A wait message.
   This can take a little while.

   **If not.** Wait one minute and tap STL again.

<!-- step: stl-save -->

2. When the save box opens, pick a folder.
   Tap Save.

   **What you should see.** A file that ends in `.stl`.
   Copy it to the 3D printer on a USB stick or by the printer app.

   **If not.** Restart the manager app and try once more.

<!-- fix: stl -->

> **If this does not work**
>
> Stay on `KidsGalaxy`.
> Wait one minute and tap STL again.

<!-- section: off -->

## Pack up

About 5 minutes.
Planets stay saved.
Names do not stay with you.

<!-- step: off-names -->

1. On the manager tablet, tap Before you leave.
   This clears the planet names.
   Those names are left out of the USB safety copy.

   **What you should see.** The planet names are gone.

   **If not.** Stay on the manager tablet and tap Before you leave again.

<!-- step: off-screen -->

2. Close the wall page on the PC.

   **What you should see.** Chrome is closed, or the sky is gone.

   **If not.** Press F11, then close Chrome.

<!-- step: off-computer -->

3. Shut down Windows from the power menu.

   **What you should see.** The screen goes black.

   **If not.** Do not hold the power button unless the menu will not open.

<!-- step: off-projector -->

4. Turn off the projector with its power button.

   **What you should see.** The wall goes dark.

   **If not.** Press the projector power button once more.

<!-- step: off-router -->

5. Unplug the travel router and the power bank.

   **What you should see.** The router light is off.

   **If not.** Follow the cord to the wall or the battery.

<!-- step: off-tablets -->

6. Put both tablets, the chargers, the router, and the paper card in the case.

   **What you should see.** The case has those items.
   Lock mode comes back the next time the kid tablet starts.

   **If not.** Leave a note on the case for the missing piece.

<!-- fix: off -->

> **If this does not work**
>
> To stop the program and leave the PC on, open Ubuntu.
> Go to the project folder.
> Paste the next line.

```bash
bash scripts/stop_room.sh
```

> You should see `The galaxy program is stopped.`

<!-- section: shutdown -->

## Shut down safely

Planets stay saved.
Names do not stay with you.

<!-- step: shutdown-names -->

1. On the manager tablet, tap Before you leave.
   This clears the planet names.
   Those names are left out of the USB safety copy.
   You should see the planet names gone.
   If not, stay on the manager tablet and tap Before you leave again.

<!-- step: shutdown-stop -->

2. You can shut down Windows from the power menu.
   The planets stay on the disk.
   The program can start again the next time you sign in.

   **What you should see.** The PC turns off.

   **If not.** Wait for the menu. Do not pull the power cord.

<!-- step: shutdown-script -->

3. If you must stop the program first, paste this line in the project folder.

```bash
bash scripts/stop_room.sh
```

   **What you should see.** `The galaxy program is stopped.`
   Then use the power menu.

   **If not.** Read the last lines. They say what is still running.

<!-- fix: shutdown -->

> **If this does not work**
>
> Do not pull the power cord while the PC is still on.
> Wait for the menu, or ask a helper.
> Pulling the cord can make the next start slower.

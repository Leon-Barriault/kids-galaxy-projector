# Use Kids Galaxy each day

This page is for the grown-up who opens the room.
Children can do the drawing steps.
Setup steps stay in the install guide.

<!-- section: on -->

## Turn the room on

About 5 minutes.

<!-- step: on-computer -->

1. Turn on the galaxy computer.
   Wait until you see the desktop.
   The galaxy program starts by itself.

<!-- step: on-projector -->

2. Turn on the projector.
   Choose the HDMI source.
   You should see the computer screen on the wall.

<!-- step: on-page -->

3. If the sky is not showing, open Terminal and paste this line.

```bash
bash scripts/open_projector.sh
```

   Press F11 if you want the picture to fill the screen.
   You should see the dark sky and the waiting words.

<!-- step: on-tablets -->

4. Wake both tablets.
   You should see the drawing app on the kid tablet.
   Open Kids Galaxy Manager on the grown-up tablet.

<!-- fix: on -->

> **If this does not work**
>
> Run `bash scripts/setup_room.sh` on the computer.
> Then open the picture again.
> Check the HDMI cable if the wall is still dark.

<!-- section: off -->

## Turn the room off

About 3 minutes.
Planets stay saved.

<!-- step: off-screen -->

1. Press F11 if you want to leave full screen.
   You do not need to close Chrome.

<!-- step: off-computer -->

2. Shut down the computer from the power menu.
   Wait until the screen is black.
   Do not hold the power button unless the menu will not open.

<!-- step: off-projector -->

3. Turn off the projector with its power button.
   You should see the wall go dark.

<!-- step: off-tablets -->

4. Let the tablets sleep, or hold the power button and tap Power off.
   Lock mode comes back the next time the kid tablet starts.

<!-- fix: off -->

> **If this does not work**
>
> To stop the program and leave the computer on, paste this line.

```bash
bash scripts/stop_room.sh
```

> You should see `The galaxy program is stopped.`

<!-- section: kid -->

## Kid mode

The kid tablet is for drawing only.
Children should not need a password.

<!-- step: kid-open -->

1. Wake the kid tablet.
   You should see Create Your Planet.
   If you see another app, lock mode is not on.
   Use the install guide to turn it on.

<!-- step: kid-draw -->

2. The child taps a shape, draws, and can add space friends.
   Then the child taps Launch.
   You should see the planet on the wall.

<!-- fix: kid -->

> **If this does not work**
>
> Read the message on the tablet.
> If it cannot find the galaxy, check the Wi-Fi.
> Use the troubleshooting page for the exact fixes.

<!-- section: manager -->

## Manager mode

The manager tablet is for grown-ups.
It is a different app.
It is not locked.

<!-- step: manager-open -->

1. Open Kids Galaxy Manager.
   You should see the list of planets.
   If the list is empty, no planet has been launched yet.

<!-- step: manager-delete -->

2. To remove one planet, tap the delete icon on its row.
   Read the question. Then confirm.
   The planet should leave the wall.

<!-- step: manager-clear -->

3. To remove every planet, tap Clear all.
   Confirm only if you mean it.
   You should see an empty list.

<!-- fix: manager -->

> **If this does not work**
>
> The kid app cannot delete planets. That is correct.
> Use the manager tablet.
> Both tablets must be on the same Wi-Fi as the computer.

<!-- section: language -->

## Change the language

There are two languages.
English and Canadian French.
They are separate choices.

<!-- step: language-tablet -->

1. On either tablet, tap EN / FR.
   The app closes and opens in the other language.
   You should see French words, or English words, right away.
   The choice stays until you tap the button again.

<!-- step: language-wall -->

2. The wall has its own choice.
   Open the manager app.
   Find Projector language.
   Tap English or Français.
   On the computer, reload the galaxy page.
   You should see the new words on the wall.
   Two kid tablets can use different languages.
   The wall follows the manager choice.

<!-- fix: language -->

> **If this does not work**
>
> Tap EN / FR once more.
> If the wall did not change, reload Chrome.
> The page address is `http://127.0.0.1:8000/` on the galaxy computer.

<!-- section: project -->

## Project a planet

About 2 minutes.

<!-- step: project-ready -->

1. Check the wall first.
   You should see the waiting words or older planets.

<!-- step: project-launch -->

2. On the kid tablet, finish the drawing and tap Launch.
   Watch the wall.
   You should see the new planet arrive.
   A child can launch again after a short wait.

<!-- fix: project -->

> **If this does not work**
>
> The wall can stay on the old sky if the tablet is on the wrong Wi-Fi.
> Join the same Wi-Fi as the computer.
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
   You should see the Android print box.

<!-- step: print-send -->

2. Choose the printer.
   Tap the print button in that box.
   You should get a page with the planet and the child drawing.
   If printing is missing, the tablet offers a save box.
   Save the PDF and open it in a PDF app.

<!-- fix: print -->

> **If this does not work**
>
> Check the Wi-Fi.
> Try Print again.
> If the tablet has no printer, save the PDF and print it from another device.

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
   You should see a wait message.
   This can take a little while.

<!-- step: stl-save -->

2. When the save box opens, pick a folder.
   Tap Save.
   You should see a file that ends in `.stl`.
   Copy it to the 3D printer on a USB stick or by the printer app.

<!-- fix: stl -->

> **If this does not work**
>
> Wait one minute and tap STL again.
> Stay on the same Wi-Fi.
> If it still fails, restart the manager app and try once more.

<!-- section: shutdown -->

## Shut down safely

<!-- step: shutdown-stop -->

1. You can shut down the computer from the power menu.
   The planets stay on the disk.
   The program starts again the next time the computer turns on.

<!-- step: shutdown-script -->

2. If you must stop the program first, paste this line.

```bash
bash scripts/stop_room.sh
```

   You should see `The galaxy program is stopped.`
   Then use the power menu.

<!-- fix: shutdown -->

> **If this does not work**
>
> Do not pull the power cord while the computer is still on.
> Wait for the menu, or ask a helper.
> Pulling the cord can make the next start slower.

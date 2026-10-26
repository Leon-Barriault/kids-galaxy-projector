# When something goes wrong

Find the heading that matches what you see.
Do the steps in order.
Stop when the room works.

<!-- section: how -->

## How to use this page

<!-- step: how-match -->

1. Read the line that starts with You see.
   Pick the section that matches.
   Do not try every fix on the page.

<!-- fix: how -->

> **If this does not work**
>
> Ask a helper and show them the words on the screen.
> Do not erase a tablet until a step tells you to.

<!-- problem: no-picture -->

## The wall has no picture

**You see:** a dark wall, the wrong input, or a no-signal message.

<!-- step: no-picture-power -->

1. Check the projector power light.
   Check the computer power light.
   Turn on anything that is off.

<!-- step: no-picture-hdmi -->

2. Push the HDMI plug in at both ends.
   Press the source button on the projector until it says HDMI.
   You should see the computer desktop.

<!-- step: no-picture-page -->

3. On the computer, open Chrome.
   Go to `http://127.0.0.1:8000/`.
   You should see the dark sky and the waiting words.

<!-- step: no-picture-setup -->

4. If the page does not open, paste this line in Terminal.

```bash
bash scripts/setup_room.sh
```

   Then paste this line.

```bash
bash scripts/open_projector.sh
```

<!-- fix: no-picture -->

> **If this does not work**
>
> Try a second HDMI cable.
> If the computer screen works but the wall does not, the projector or the cable is the problem.

<!-- problem: no-connect -->

## The tablet cannot connect

**You see:** a message that the galaxy cannot be reached, or the planet never appears.

<!-- step: no-connect-wifi -->

1. Open the tablet Wi-Fi settings if you can.
   On a locked kid tablet, use the manager tablet for this check.
   Join the same Wi-Fi name as the galaxy computer.

<!-- step: no-connect-address -->

2. In the drawing app, tap the galaxy name.
   If you type an address, use the `https://` address from setup.
   It looks like `https://192.168.1.20:8443`.
   You should see a check mark when the tablet can reach it.

<!-- step: no-connect-restart -->

3. On the computer, paste this line.

```bash
bash scripts/setup_room.sh
```

   Do not add `NEW_CERTIFICATES=1` unless a helper says the address changed.

<!-- fix: no-connect -->

> **If this does not work**
>
> A guest Wi-Fi often blocks tablets from seeing the computer.
> Use the private room Wi-Fi, or the `KidsGalaxy` hotspot from the install guide.

<!-- problem: stuck-lock -->

## The kid tablet is stuck in lock mode

**You see:** only the drawing app, and you need Settings or another app.

<!-- step: stuck-home -->

1. Press Home.
   The drawing app should stay open.
   That means lock mode is doing its job.
   Use the manager tablet for grown-up tasks.

<!-- step: stuck-usb -->

2. If you must leave the app, plug the kid tablet into the computer.
   Tap Allow if you see it.
   Paste this line only when a helper is with you.

```bash
adb shell am task lock stop
```

   You might see the normal tablet screen for a moment.
   The drawing app may lock again when it opens.

<!-- step: stuck-erase -->

3. The sure way out is to erase the tablet.
   Ask a helper before you do this.
   You will run the kid tablet setup again afterward.

<!-- fix: stuck-lock -->

> **If this does not work**
>
> Do not keep guessing button presses in front of the children.
> Unplug the tablet and use the manager tablet until a helper can erase it.

<!-- problem: wrong-language -->

## The language is wrong

**You see:** French when you wanted English, or the other way around.

<!-- step: wrong-language-tablet -->

1. On the tablet, tap EN / FR.
   The app should reopen in the other language.
   Your choice stays on that tablet.

<!-- step: wrong-language-wall -->

2. If only the wall is wrong, open the manager app.
   Tap Projector language.
   Choose English or Français.
   Reload the page on the computer.
   You should see the new words on the wall.

<!-- fix: wrong-language -->

> **If this does not work**
>
> A new tablet follows the tablet language the first time.
> Tap EN / FR once to set the choice you want.

<!-- problem: certificate -->

## A certificate error

**You see:** the app closes at once, or it says the connection is not trusted.

<!-- step: certificate-same-wifi -->

1. Put the tablet on the same Wi-Fi as the computer.
   Try again.
   A wrong network can look like a bad ID card.

<!-- step: certificate-rebuild -->

2. If the computer address changed, the old ID card will not match.
   On the computer, paste this line.

```bash
NEW_CERTIFICATES=1 bash scripts/setup_room.sh
```

   Then paste this line.

```bash
bash scripts/build_tablets.sh
```

   Install the apps again with the prepare commands in the install guide.

<!-- step: certificate-right-app -->

3. Use the drawing app on the kid tablet.
   Use Kids Galaxy Manager on the grown-up tablet.
   The ID cards are not the same.
   Swapping them causes this error.

<!-- fix: certificate -->

> **If this does not work**
>
> Do not copy ID card files into email or a chat.
> Ask a helper to repeat the setup on the galaxy computer.

<!-- problem: print -->

## Print or STL failed

**You see:** a toast that the export failed, or the wait message never ends.

<!-- step: print-wifi -->

1. Check the Wi-Fi on the manager tablet.
   Tap Print or STL again.
   Wait one minute for STL.

<!-- step: print-save -->

2. If there is no printer, save the PDF when the tablet offers it.
   Open that PDF in a PDF app and print from there.

<!-- fix: print -->

> **If this does not work**
>
> Restart the manager app.
> If the wall page is also down, run `bash scripts/setup_room.sh` first.

<!-- problem: slow -->

## A planet is slow to appear

**You see:** the tablet says it sent the planet, but the wall waits.

<!-- step: slow-wait -->

1. Wait ten seconds.
   The first planet after a start can be slow.
   You should see it arrive without tapping again.

<!-- step: slow-reload -->

2. Reload the galaxy page on the computer.
   Press F5 in Chrome.
   You should see the planets that were already saved.

<!-- fix: slow -->

> **If this does not work**
>
> Do not tap Launch many times.
> The room asks the child to wait a moment between planets.
> Check the Wi-Fi, then try one more launch.

# When something goes wrong

Find the heading that matches what you see.
Do the steps in order.
Stop when the room works.
Open Ubuntu and go to the project folder before you paste a command.

```bash
cd /home/omega/kids-galaxy-projector
```

<!-- section: how -->

## How to use this page

<!-- step: how-match -->

1. Read the line that starts with You see.
   Pick the section that matches.
   Do not try every fix on the page.

   **What you should see.** One heading that matches the screen.

   **If not.** Ask a helper and show them the words on the screen.

<!-- fix: how -->

> **If this does not work**
>
> Do not erase a tablet until a step tells you to.

<!-- problem: no-picture -->

## The wall has no picture

**You see:** a dark wall, the wrong input, or a no-signal message.

<!-- step: no-picture-power -->

1. Check the projector power light.
   Check the PC power light.
   Turn on anything that is off.

   **What you should see.** Both power lights are on.

   **If not.** Plug each one into wall power.

<!-- step: no-picture-hdmi -->

2. Push the HDMI plug in at both ends.
   Press the source button until it says HDMI.

   **What you should see.** The Windows desktop on the wall.

   **If not.** Try a second HDMI cable.

<!-- step: no-picture-page -->

3. On Windows, open Chrome.
   Go to `http://127.0.0.1:8000/`.

   **What you should see.** The dark sky and the waiting words.

   **If not.** Do the next step.

<!-- step: no-picture-setup -->

4. In Ubuntu, in the project folder, paste this line.

```bash
bash scripts/setup_room.sh
```

   Then paste this line.

```bash
bash scripts/open_projector.sh
```

   **What you should see.** Chrome opens the sky on Windows.

   **If not.** Read the last lines. They name the missing piece.

<!-- fix: no-picture -->

> **If this does not work.**
>
> Check the projector or the cable.
> The PC screen can still look fine.

<!-- problem: no-connect -->

## The tablet cannot connect

**You see:** a message that the galaxy cannot be reached, or the planet never appears.

<!-- step: no-connect-wifi -->

1. Look at the tablet Wi-Fi name.
   On a locked kid tablet, use the manager tablet for this check.
   Join `KidsGalaxy`.
   Do not join the daycare Wi-Fi.

   **What you should see.** The same Wi-Fi name as the PC.

   **If not.** Forget other networks on the tablet, then join `KidsGalaxy`.

<!-- step: no-connect-address -->

2. In the drawing app, press and hold the galaxy name.
   Answer the number question.
   The tablet address is `https://192.168.0.52:8443`.

   **What you should see.** A check mark, and no certificate warning.

   **If not.** Use that address. Do not type a daycare address.

<!-- step: no-connect-restart -->

3. In the project folder, paste this line.

```bash
bash scripts/setup_room.sh
```

   **What you should see.** `The galaxy computer is running.`

   **If not.** If the PC is not at `192.168.0.52`, setup stops and keeps that address.
   Join `KidsGalaxy` and run the line again.
   Do not add `CHANGE_ADDRESS=1` unless a helper means to move the room.

<!-- fix: no-connect -->

> **If this does not work**
>
> Use the travel router named `KidsGalaxy`.
> Do not use the daycare Wi-Fi.
> The Windows hotspot is only a spare, and its address is `192.168.137.1`.

<!-- problem: stuck-lock -->

## The kid tablet is stuck in lock mode

**You see:** only the drawing app, and you need Settings or another app.

<!-- step: stuck-home -->

1. Press Home.

   **What you should see.** The drawing app stays open.
   That means lock mode is doing its job.

   **If not.** Use the manager tablet for grown-up tasks.

<!-- step: stuck-usb -->

2. Plug the kid tablet into the PC.
   Share it with Ubuntu, as in the install guide.
   Tap Allow if you see it.
   Paste this line only when a helper is with you.

```bash
adb shell am task lock stop
```

   **What you should see.** The normal tablet screen for a moment.
   The drawing app may lock again when it opens.

   **If not.** `adb devices` must end with `device` before this line can work.

<!-- step: stuck-erase -->

3. The sure way out is to erase the tablet.
   Ask a helper before you do this.
   You will run the kid tablet setup again afterward.

   **What you should see.** A helper agrees before you erase it.

   **If not.** Unplug the tablet and use the manager tablet.

<!-- fix: stuck-lock -->

> **If this does not work**
>
> Do not keep guessing button presses in front of the children.
> Unplug the tablet and use the manager tablet until a helper can erase it.

<!-- problem: wrong-language -->

## The language is wrong

**You see:** French when you wanted English, or the other way around.

<!-- step: wrong-language-tablet -->

1. On the manager tablet, tap EN / FR.

   **What you should see.** The app reopens in the other language.
   Your choice stays on that tablet.
   On the kid tablet, hold EN / FR and answer the number question.

   **If not.** Tap EN / FR once more.

<!-- step: wrong-language-wall -->

2. If only the wall is wrong, open the manager app.
   Tap Projector language.
   Choose English or Français.
   Reload the page on the PC.

   **What you should see.** The new words on the wall.

   **If not.** Reload Chrome at `http://127.0.0.1:8000/`.

<!-- fix: wrong-language -->

> **If this does not work**
>
> A new tablet follows the tablet language the first time.
> Tap EN / FR once to set the choice you want.

<!-- problem: certificate -->

## A certificate error

**You see:** the app closes at once, or it says the connection is not trusted.

<!-- step: certificate-same-wifi -->

1. Put the tablet on `KidsGalaxy`.
   Try again.

   **What you should see.** The warning is gone.

   **If not.** A wrong network can look like a bad ID card. Do the next step.

<!-- step: certificate-rebuild -->

2. The tablets keep `192.168.0.52` unless you change it on purpose.
   Join `KidsGalaxy` so the PC is at that address.
   Then paste this line.

```bash
bash scripts/setup_room.sh
```

   Use the next line only when a helper means to move the room.
   Then build the tablet apps again.

```bash
CHANGE_ADDRESS=1 SERVER_IP=192.168.0.52 bash scripts/setup_room.sh
```

   Use this line when the address card is near its date and the address stays the same.

```bash
NEW_CERTIFICATES=1 bash scripts/setup_room.sh
```

   **What you should see.** `The galaxy computer is running.`
   The tablet address is still `https://192.168.0.52:8443`.

   **If not.** Do not build new apps until the helper confirms a real address change.

<!-- step: certificate-right-app -->

3. Use the drawing app on the kid tablet.
   Use Kids Galaxy Manager on the grown-up tablet.

   **What you should see.** Each tablet opens its own app.

   **If not.** The ID cards are not the same. Swapping them causes this error.

<!-- fix: certificate -->

> **If this does not work**
>
> Do not copy ID card files into email or a chat.
> Ask a helper to repeat the setup on the galaxy computer.

<!-- problem: print -->

## Print or STL failed

**You see:** a message that the export failed, or the wait message never ends.

<!-- step: print-wifi -->

1. Check that the manager tablet is on `KidsGalaxy`.
   Tap Print or STL again.
   Wait one minute for STL.

   **What you should see.** The print box, or a file that ends in `.stl`.

   **If not.** Do the next step.

<!-- step: print-save -->

2. If there is no printer, save the PDF when the tablet offers it.
   Open that PDF in a PDF app and print from there.

   **What you should see.** A saved PDF.

   **If not.** Restart the manager app.

<!-- fix: print -->

> **If this does not work**
>
> Restart the manager app.
> If the wall page is also down, run `bash scripts/setup_room.sh` first.

<!-- problem: slow -->

## A planet is slow to appear

**You see:** the tablet says it sent the planet, but the wall waits.

<!-- step: slow-wait -->

1. Wait about 15 seconds.
   The first planet after a start can be slow.

   **What you should see.** The planet arrives without another tap.

   **If not.** Do the next step.

<!-- step: slow-reload -->

2. Reload the galaxy page on the PC.
   Press F5 in Chrome.

   **What you should see.** The planets that were already saved.
   An automatic reconnect is not here yet.
   That fix is coming separately.

   **If not.** Check `KidsGalaxy`, then try one more launch.

<!-- fix: slow -->

> **If this does not work**
>
> Do not tap Launch many times.
> The room asks the child to wait a moment between planets.

<!-- section: onsite -->

## At the daycare

Use this section when you are in the room with the children.
The travel router is the only network.

<!-- problem: onsite-router -->

## The travel router is not up

**You see:** no Wi-Fi light, or `KidsGalaxy` is missing from the list.

<!-- step: onsite-router-power -->

1. Plug the router into wall power or the power bank.

   **What you should see.** A steady Wi-Fi light.

   **If not.** Try the other power source.

<!-- step: onsite-router-wifi -->

2. On the PC, join `KidsGalaxy`.
   Do not join the daycare Wi-Fi.

   **What you should see.** The Wi-Fi name is `KidsGalaxy`.

   **If not.** Move the router closer and open the Wi-Fi list again.

<!-- fix: onsite-router -->

> **If this does not work**
>
> Do not spend the visit on the Windows hotspot.
> Its address is `192.168.137.1`, and it often will not start with no internet to share.

<!-- problem: onsite-docker -->

## Docker Desktop is running

**You see:** the whale icon, or the host setup line stops.

<!-- step: onsite-docker-quit -->

1. Right-click the whale icon.
   Choose Quit Docker Desktop.
   Turn off Start Docker Desktop when you sign in.

   **What you should see.** The whale icon is gone.

   **If not.** Open Startup apps and turn Docker Desktop off.

<!-- step: onsite-docker-again -->

2. In the project folder, paste the host line again.

```bash
bash scripts/setup_host.sh
```

   **What you should see.** `The galaxy computer programs are installed.`

   **If not.** The line stops while Docker Desktop is still running.
   You should see `Docker Desktop is running on Windows.`
   Quit it, then paste the line again.

<!-- fix: onsite-docker -->

> **If this does not work**
>
> Leave Docker Desktop closed for the whole visit.
> Ubuntu Docker is the one this room uses.

<!-- problem: onsite-address -->

## The PC address changed

**You see:** setup stops, and the address is not `192.168.0.52`.

<!-- step: onsite-address-join -->

1. Join `KidsGalaxy` on the PC.
   Forget the daycare Wi-Fi.

   **What you should see.** The Wi-Fi name is `KidsGalaxy`.

   **If not.** The travel router light must be on first.

<!-- step: onsite-address-check -->

2. In Ubuntu, paste `hostname -I`.

   **What you should see.** `192.168.0.52`

   **If not.** Run `wsl --shutdown` in PowerShell, open Ubuntu, and check again.

<!-- step: onsite-address-keep -->

3. Paste `bash scripts/setup_room.sh` only after the address matches.
   Setup keeps `192.168.0.52`.
   It stops when the PC is on a different network.
   The address changes only on purpose, with `CHANGE_ADDRESS=1` and a new `SERVER_IP`.
   A helper does that, then builds the tablet apps again.

   **What you should see.** `The galaxy computer is running.`

   **If not.** Read the line that says the tablets use `192.168.0.52`.
   Join `KidsGalaxy` instead of typing a new address.

<!-- fix: onsite-address -->

> **If this does not work**
>
> Do not use `CHANGE_ADDRESS=1` to chase the daycare network.
> The tablets stay on `192.168.0.52`.

<!-- problem: onsite-tablet -->

## The tablet cannot find the projector

**You see:** the drawing sends, but the wall never shows the planet.

<!-- step: onsite-tablet-same -->

1. Put the tablet and the PC on `KidsGalaxy`.

   **What you should see.** Both show that same name.

   **If not.** Leave the daycare Wi-Fi.

<!-- step: onsite-tablet-sky -->

2. On Windows, open `http://127.0.0.1:8000/`.

   **What you should see.** The dark sky.

   **If not.** In the project folder, run `bash scripts/setup_room.sh`, then open the wall again.

<!-- step: onsite-tablet-wait -->

3. Tap Launch once.
   Wait about 15 seconds.

   **What you should see.** The new planet on the wall.

   **If not.** Reload the wall page.
   An automatic reconnect is not here yet.

<!-- fix: onsite-tablet -->

> **If this does not work**
>
> Check the router light, then the address `192.168.0.52`, then Docker Desktop.

<!-- problem: onsite-usb -->

## Ubuntu cannot see the tablet

**You see:** `No tablet is ready` after you plug the cable into the PC.

<!-- step: onsite-usb-share -->

1. Follow the USB share steps in the install guide.
   Plug in one tablet, tap Allow, then attach it to Ubuntu.

   **What you should see.** `adb devices` ends with `device`.

   **If not.** Use the same USB port as the code on the paper card.

<!-- fix: onsite-usb -->

> **If this does not work**
>
> A charge-only cable will not show a tablet.
> Swap in a data cable and attach again.

<!-- problem: onsite-folder -->

## A command says it cannot find the script

**You see:** `No such file` after you paste a line.

<!-- step: onsite-folder-open -->

1. Open Ubuntu.
   Paste this line.

```bash
cd /home/omega/kids-galaxy-projector
```

   **What you should see.** `pwd` prints `/home/omega/kids-galaxy-projector`.

   **If not.** You pasted the command in PowerShell or in the wrong folder.
   Open Ubuntu first.

<!-- fix: onsite-folder -->

> **If this does not work**
>
> The name on the Ubuntu line must be `omega`.
> Close a window that says `root` and open Ubuntu again.

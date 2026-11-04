# Kids Galaxy day card

Keep this page at the daycare. The daily guide has the full steps.

<!-- section: arrive -->

## Arrive

<!-- step: arrive-router -->

1. Plug in the travel router. You should see a steady Wi-Fi light.

<!-- step: arrive-wifi -->

2. On the PC, join `KidsGalaxy`. Do not join the daycare Wi-Fi. You should see that name.

<!-- step: arrive-pc -->

3. Turn on the PC and sign in to Windows. You should see the desktop.

<!-- section: setup -->

## Set up

<!-- step: setup-docker -->

1. Quit Docker Desktop if you see the whale icon. You should see the icon gone.

<!-- step: setup-ubuntu -->

2. Open the Ubuntu app. You should see the name `omega`.

<!-- step: setup-folder -->

3. Paste `cd /home/omega/kids-galaxy-projector`. You should see no error.

<!-- step: setup-projector -->

4. Turn on the projector and choose HDMI. You should see the PC on the wall.

<!-- step: setup-wall -->

5. Paste `bash scripts/open_projector.sh`. You should see the dark sky.

<!-- section: test -->

## Test

<!-- step: test-tablet -->

1. Wake the kid tablet. You should see the drawing app on `KidsGalaxy`.

<!-- step: test-launch -->

2. Draw a small mark and tap Launch. You should see the mark on the tablet.

<!-- step: test-wall -->

3. Look at the wall. You should see the new planet.

<!-- section: pack -->

## Pack up

<!-- step: pack-names -->

1. On the manager tablet, tap Before you leave. You should see the planet names cleared.

<!-- step: pack-pc -->

2. Shut down Windows from the power menu. You should see the PC turn off.

<!-- step: pack-gear -->

3. Turn off the projector and unplug the router. Pack the router, the paper card, both tablets, and the chargers. You should see those items in the case.

<!-- section: stuck -->

## If you are stuck

<!-- step: stuck-router -->

1. If the router light is off, check the power plug. You should see the Wi-Fi light.

<!-- step: stuck-docker -->

2. If setup stops because Docker Desktop is running, quit it and run the line again. You should see the installed message.

<!-- step: stuck-address -->

3. If setup stops because the PC is not at `192.168.0.52`, join `KidsGalaxy`. Do not change the tablet address. You should see `192.168.0.52`.

<!-- step: stuck-find -->

4. If the tablet cannot find the room, join `KidsGalaxy` on the tablet too. You should see the same Wi-Fi name as the PC.

<!-- fix: stuck -->

> **If this does not work**
>
> In Ubuntu, go to the project folder.
> Paste `bash scripts/setup_room.sh`.
> Then open the wall again.

<!-- section: first-checks -->

## First time on a new tablet or after an update

These checks are not done yet. Nobody has run them on the real PC or tablet. Leave each box empty until you see the result yourself.

<!-- step: check-lock -->

- [ ] The child lock holds. A child cannot leave the drawing app. You should see Home stay in the app.

<!-- step: check-boot -->

- [ ] Restart the tablet. You should see the drawing app open by itself.

<!-- step: check-secure -->

- [ ] The tablet connects to the secure address on port `8443`. You should see no certificate warning. The address is `https://192.168.0.52:8443`.

<!-- step: check-scripts -->

- [ ] In Windows PowerShell, run the setup script, the update script, and the stop script. You should see no red errors. Those scripts are `setup_room.sh`, `update_room.sh`, and `stop_room.sh`.

<!-- step: check-planet -->

- [ ] After an update, or a stop and a start, send one planet. You should see it on the wall within about 15 seconds. If not, reload the wall page. An automatic reconnect is not here yet. That fix is coming separately.

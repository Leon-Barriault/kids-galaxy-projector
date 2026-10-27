# Set up the room so it keeps working

This page is for the grown-up who prepares the room.
It is not the programmer guide.
Programmer notes stay in `DEVELOPMENT.md`.
The install guide has the photos for cables and the first planet.
Do one step at a time.

<!-- section: who -->

## Who this page is for

You can do this if you can copy one line into Terminal.
A helper is useful for the router and the tablets.
Children should not do this setup.

<!-- section: words -->

## Words we use

**Galaxy computer.** The computer that makes the wall picture.

**Tablet door.** The address the tablets use.
It uses port `8443`.

**ID card.** A small file that proves which tablet is talking.
A child never types it.

**Cancel list.** The list of lost tablets the room no longer trusts.

**App key.** The stamp on the tablet apps from this room.

**Safety copy.** A private file with the planets and the ID cards.

**Lock mode.** The kid tablet stays in the drawing app.

**Paper card.** A sheet you fill in and keep in the room.

<!-- section: hardware -->

## What to have ready

Buy these before setup day.
The install guide lists the projector and the cables.

<!-- step: hardware-computer -->

1. One Linux computer with 8 GB of memory or more.
   It needs HDMI, or USB-C plus an HDMI adapter.
   It must open Chrome.

   **What you should see.** A computer that shows a desktop on the projector.

   **If not.** Use the install guide section on placing the computer.

<!-- step: hardware-tablets -->

2. Two Android tablets.
   One is for children. One is for a grown-up.
   Read the specs section before you buy.

   **What you should see.** Both tablets turn on and charge.

   **If not.** Try the other charger and a data cable.

<!-- step: hardware-case -->

3. A thick rubber case and a screen protector for the kid tablet.
   The case lip must stand above the glass.
   The power button and the charge hole must still work.

   **What you should see.** The lip is higher than the screen.

   **If not.** Return the case. Buy one with a raised lip.

<!-- step: hardware-usb -->

4. One USB stick, and a drawer you can lock.
   The stick holds the safety copy and the app key.
   A data USB cable is also required for each tablet setup.

   **What you should see.** The stick shows up when you plug it into the computer.

   **If not.** Try another USB port.

<!-- step: hardware-power -->

5. A charger that came with each tablet.
   Do not share a tiny phone charger with the kid tablet.

   **What you should see.** A battery picture on each tablet.

   **If not.** Seat the cable until it stays in.

<!-- section: network -->

## Write the network plan

About 20 minutes.
Use the building Wi-Fi.
The hotspot in the install guide is only a backup.

<!-- step: network-paper -->

1. Get a paper card.
   Write the Wi-Fi name.
   Write the Wi-Fi password on the same card.
   Keep the card with the grown-up, not with the children.

   **What you should see.** The Wi-Fi name and password are on paper.

   **If not.** Ask the person who runs the router.

<!-- step: network-address -->

2. Pick a fixed address for the galaxy computer.
   Example: `192.168.1.50`.
   Reserve that address in the router.
   Write it on the paper card.
   The computer name to write is `kids-galaxy`.

   **What you should see.** The router shows the same address after a reboot.

   **If not.** Ask a helper to reserve the address. Do not continue with a changing address.

<!-- step: network-ports -->

3. Write these ports on the paper card.
   Tablets use `8443`.
   The wall page uses `8000` on the galaxy computer only.
   Finding the room uses `5353`.
   The tablet address looks like `https://192.168.1.50:8443`.
   Use your real address, not the example.

   **What you should see.** The paper card has the address and the three port numbers.

   **If not.** Copy the numbers from this step before you go on.

<!-- step: network-isolation -->

4. Turn off guest isolation on the router.
   The tablets must be able to see the computer.
   A guest network that hides devices will not work.

   **What you should see.** A tablet can open the computer address later in this page.

   **If not.** Put the computer and the tablets on the same private Wi-Fi.

<!-- fix: network -->

> **If this does not work**
>
> 1. Check the Wi-Fi icon on the computer. It should be steady.
> 2. Ask a helper to reserve the address.
> 3. Do not use the public cafe Wi-Fi.

<!-- section: specs -->

## Minimum tablet specs

These facts come from the app build.
The kid tablet page repeats them for the person who handles tablets.

<!-- step: specs-android -->

1. The kid app allows Android 8 or newer.
   The build number for that is API 26.
   The app aims at API 36.
   Buy Android 9 or newer when you can.
   Android 9 gives a stronger lock on the shade.

   **What you should see.** Settings, then About tablet, shows Android 9 or newer.

   **If not.** Android 8 can still run the app. Ask a helper if lock mode is too weak.

<!-- step: specs-screen -->

2. The app does not lock the screen size.
   It works upright and sideways.
   A 10 inch screen is easier for small hands.
   An 8 inch screen can work.

   **What you should see.** The drawing page fills the tablet.

   **If not.** Use the larger tablet for the children.

<!-- step: specs-memory -->

3. The build does not set a memory size.
   The room assumption is 3 GB of memory or more.
   A 2 GB tablet can feel tight while a child draws.

   **What you should see.** The tablet box says 3 GB or more.

   **If not.** Prefer another tablet if the box says 2 GB.

<!-- step: specs-play -->

4. The app does not need Google Play Services.
   Do not add a Google account on the kid tablet.
   The Play Store is hidden later by lock mode.

   **What you should see.** The tablet setup lets you skip the account.

   **If not.** Erase the tablet and skip the account. Lock mode will not turn on if an account is present.

<!-- step: specs-wifi -->

5. The app does not require a Wi-Fi band.
   2.4 GHz and 5 GHz both work.
   The tablet must stay on the same network as the computer.

   **What you should see.** The tablet Wi-Fi name matches the paper card.

   **If not.** Join the room Wi-Fi before you turn on lock mode.

<!-- step: specs-fire -->

6. An Amazon Fire tablet is not the supported kid tablet.
   The drawing app can install, because Play Services are not required.
   Lock mode on Fire OS is not promised.
   Prefer a Lenovo Tab or a Samsung Galaxy Tab.
   If the lock command fails, do not use that Fire tablet for children.

   **What you should see.** The tablet is a normal Android tablet, not a Fire tablet.

   **If not.** Read the limits section on the kid tablet page before you rely on a Fire tablet.

<!-- section: computer -->

## Prepare the galaxy computer

About 40 minutes the first time.

<!-- step: computer-linux -->

1. Turn on the computer and join the room Wi-Fi.
   Open Terminal.

   **What you should see.** A blinking cursor.

   **If not.** Open Terminal from the app list.

<!-- step: computer-packages -->

2. Paste this line and press Enter.

```bash
bash scripts/setup_host.sh
```

   Type the computer password if it asks.
   You will not see the letters.

   **What you should see.** The words `The galaxy computer programs are installed.`

   **If not.** Read the last lines. They name the missing piece.

<!-- step: computer-login -->

3. Log out and log back in.
   This lets your user run Docker.

   **What you should see.** The desktop is back.

   **If not.** Restart the computer and log in again.

<!-- step: computer-setup -->

4. Paste this line.

```bash
cd "$HOME/kids-galaxy-projector" && bash scripts/setup_room.sh
```

   Wait. The first run can take several minutes.

   **What you should see.** The words `The galaxy computer is running.`
   You should also see an address that matches the paper card.

   **If not.** Join the Wi-Fi and run the same line again.

<!-- fix: computer -->

> **If this does not work**
>
> 1. If Docker is missing, run the host line again, then log in again.
> 2. If the address is wrong, fix the router reservation.
> 3. Then paste `NEW_CERTIFICATES=1 bash scripts/setup_room.sh`.
> 4. Build the tablet apps again after an address change.

<!-- section: docker -->

## The galaxy program image

The computer builds the program. It does not download a public copy.

<!-- step: docker-build -->

1. The setup line in the previous section builds the image.
   The image name is `kids-galaxy-pi-server:room`.
   The tablet door uses the nginx image named `nginx:stable-alpine`.

   **What you should see.** The setup line ends with the running message.

   **If not.** Run `bash scripts/check_room.sh` and read the last lines.

<!-- step: docker-tag -->

2. Leave the image name as `room`.
   An update keeps the previous image under the name `previous`.

   **What you should see.** You do not need to type an image name during setup.

   **If not.** Ask a helper before you rename images.

<!-- step: docker-health -->

3. Paste this line.

```bash
bash scripts/check_room.sh
```

   **What you should see.** The words `The room check passed.`
   A line that says `Look soon` is a warning, not a failure.

   **If not.** Run `bash scripts/setup_room.sh` again.

<!-- section: certificates -->

## Make the ID cards

Setup already makes the first cards.
This section is how you look at them.

<!-- step: cert-init -->

1. Paste this line if you need to make the cards again.

```bash
bash scripts/production_certs.sh init
```

   A second run keeps the room card.
   The first kid card is named `kid-1`.
   The first grown-up card is named `manager-1`.
   Cards last 825 days unless a helper changes that.

   **What you should see.** The words `ID cards are ready` and an address.

   **If not.** Join the Wi-Fi so the computer has an address, then run the line again.

<!-- step: cert-password -->

2. The password file stays on the computer.
   The path is `pi-server/certs/p12-password`.
   Do not email it.
   Do not read it aloud near children.

   **What you should see.** The file is present after init. You do not need to open it.

   **If not.** Run the init line again.

<!-- step: cert-list -->

3. Paste this line.

```bash
bash scripts/production_certs.sh list
```

   **What you should see.** `kid-1` and `manager-1`, each with a date.

   **If not.** Run the init line, then the list line.

<!-- section: renew -->

## Renew a card

<!-- step: renew-when -->

1. Run the room check once a month.
   If it says the address card expires within 30 days, renew it.
   Tablet cards stay valid when only the address card is renewed.

   **What you should see.** The room check says the address card is in date.

   **If not.** Do the next step.

<!-- step: renew-server -->

2. Paste this line when the computer address changed, or the address card is near its date.

```bash
NEW_CERTIFICATES=1 bash scripts/setup_room.sh
```

   Then build the tablet apps again so they learn the address.
   The room card itself stays the same.

   **What you should see.** The running message, and the new address.

   **If not.** Check the paper card and the router reservation.

<!-- step: renew-crl -->

3. Paste this line if the room check asks you to refresh the cancel list.

```bash
bash scripts/production_certs.sh renew-crl
```

   **What you should see.** The words `The cancel list is up to date.`

   **If not.** Run the init line, then this line again.

<!-- section: lost -->

## Cancel a lost tablet

Do this the same day a kid tablet is missing.

<!-- step: lost-name -->

1. Read the name on the tape on the case.
   Example: `kid-1`.

   **What you should see.** A short name with letters, numbers, or dashes.

   **If not.** Run the list command in the ID card section.

<!-- step: lost-command -->

2. Paste this line with the real name.

```bash
bash scripts/production_certs.sh revoke-tablet --name kid-1
```

   **What you should see.** The words `The card for kid-1 is cancelled.`

   **If not.** Check the name with the list command and run the line again.

<!-- step: lost-rebuild -->

3. Do not give that tablet to children again.
   When you have a replacement, use the kid tablet page.
   The replace command builds a new card.

   **What you should see.** The list command shows the old name as cancelled.

   **If not.** Run the cancel line again. A second run is safe.

<!-- fix: lost -->

> **If this does not work**
>
> 1. Run `bash scripts/production_certs.sh list`.
> 2. Use the name from that list.
> 3. Ask a helper if the tablet door did not restart.

<!-- section: tablets -->

## Sign and install the apps

About 40 minutes the first time.
A later kid tablet uses the replace command.

<!-- step: tablets-key -->

1. Paste this line.

```bash
bash scripts/create_tablet_keystore.sh
```

   **What you should see.** The words `The app key is ready.`
   A second run says the key was left in place.

   **If not.** Install Java or Android Studio, then run the line again.

<!-- step: tablets-build -->

2. Paste this line.

```bash
bash scripts/build_tablets.sh
```

   **What you should see.** The words `BUILD SUCCESSFUL`.

   **If not.** If Android tools are missing, a helper must install Android Studio.

<!-- step: tablets-kid -->

3. Erase the kid tablet.
   Skip every account.
   Turn on USB debugging, as in the install guide.
   Plug it in alone.
   Paste this line.

```bash
bash scripts/prepare_kid_tablet.sh
```

   **What you should see.** The drawing app fills the screen.
   The line also prints how many seconds it took.

   **If not.** Erase the tablet again. Do not add an account. Run the same line.

<!-- step: tablets-manager -->

4. Unplug the kid tablet.
   Plug in the manager tablet.
   Do not erase it unless you want to.
   Paste this line.

```bash
bash scripts/prepare_manager_tablet.sh
```

   **What you should see.** Kids Galaxy Manager is in the app list.
   This tablet is not locked.

   **If not.** Tap Allow on the tablet and use a data cable.

<!-- section: first-run -->

## First-run checks

<!-- step: first-check -->

1. Paste this line on the galaxy computer.

```bash
bash scripts/check_room.sh
```

   **What you should see.** `The room check passed.`

   **If not.** Run `bash scripts/setup_room.sh`, then the check again.

<!-- step: first-sky -->

2. Paste this line.

```bash
bash scripts/open_projector.sh
```

   Press F11.

   **What you should see.** A dark sky and the waiting words on the wall.

   **If not.** Check HDMI and the projector source button.

<!-- step: first-planet -->

3. On the kid tablet, draw a mark and tap Launch.

   **What you should see.** The planet appears on the wall.

   **If not.** Use the troubleshooting guide. Check the Wi-Fi name first.

<!-- step: first-reboot -->

4. Restart the kid tablet with the power menu.
   Wait until it is back.

   **What you should see.** The drawing app is open again. You do not pick the room.

   **If not.** Read the boot section on the kid tablet page.

<!-- section: backup -->

## Make a safety copy

Do this after the first planet works.
Do it again once a week.

<!-- step: backup-run -->

1. Paste this line.

```bash
bash scripts/backup_room.sh
```

   **What you should see.** A path that ends in `.tar.gz`.

   **If not.** Run setup once, then this line again.

<!-- step: backup-usb -->

2. Plug in the USB stick.
   Copy the `.tar.gz` file and the `.sha256` file beside it onto the stick.
   Unplug the stick.

   **What you should see.** Both files are on the stick.

   **If not.** Copy both files. The check file must stay beside the copy.

<!-- step: backup-drawer -->

3. Put the stick in the locked drawer.
   The copy contains ID cards and the app key.
   Do not email it.

   **What you should see.** The stick is in the drawer, not in a bag by the door.

   **If not.** Move it before children arrive.

<!-- section: restore -->

## Put a safety copy back

<!-- step: restore-from -->

1. Plug in the USB stick.
   Paste this line with the real file name.

```bash
bash scripts/restore_room.sh --from /media/usb/kids-galaxy-DATE.tar.gz
```

   **What you should see.** The words `The files are back.`

   **If not.** Check the file name. If it says the check failed, do not use that copy.

<!-- step: restore-start -->

2. Paste this line.

```bash
bash scripts/setup_room.sh
```

   **What you should see.** The running message.

   **If not.** Run the room check and read the last lines.

<!-- step: restore-check -->

3. Open the wall page and look for the old planets.

   **What you should see.** Planets from before the copy are on the wall.

   **If not.** Confirm you restored the latest copy, not an older one.

<!-- section: update -->

## Update the room

<!-- step: update-version -->

1. Ask a helper for the version name.
   Example: `v1.2.0`.
   Paste this line with the real name.

```bash
bash scripts/update_room.sh --version v1.2.0
```

   **What you should see.** The room check passed at the end.

   **If not.** The command tries to put the previous program back. Then run the rollback section.

<!-- step: update-rebuild -->

2. Use this line only when a helper says the files on the computer are already the right ones.

```bash
bash scripts/update_room.sh --rebuild
```

   **What you should see.** The same passed check.

   **If not.** Run the rollback command in the next section.

<!-- step: update-see -->

3. Look at the wall after the update.
   Send one planet from the kid tablet.

   **What you should see.** The planet still appears.

   **If not.** Roll back, then ask a helper.

<!-- section: rollback -->

## Go back to the previous program

<!-- step: rollback-run -->

1. Paste this line.

```bash
bash scripts/rollback_room.sh
```

   **What you should see.** The words `The previous program is running.`
   Then the room check passed.

   **If not.** If it says there is no older copy, ask a helper. Do not keep updating.

<!-- step: rollback-see -->

2. Look at the wall.

   **What you should see.** The sky is back. Old planets are still there.

   **If not.** Run the room check. Planets live in the safety copy if the disk was replaced.

<!-- section: watch -->

## What to look at

<!-- step: watch-check -->

1. Each week, paste this line.

```bash
bash scripts/check_room.sh
```

   **What you should see.** `The room check passed.`

   **If not.** Follow the line that failed. Setup, renew, or disk space are the usual fixes.

<!-- step: watch-logs -->

2. If the check fails, paste this line.

```bash
docker compose -f docker-compose.secure.yml logs --tail 40
```

   **What you should see.** Recent lines. Ask a helper if the same error repeats.

   **If not.** A helper can read the lines. You do not need to fix code.

<!-- step: watch-disk -->

3. Read the free-space line in the room check.
   Make a safety copy before the disk is almost full.
   The room keeps up to 30 planets.

   **What you should see.** Free space is not described as almost full.

   **If not.** Ask a helper to free space after a safety copy.

<!-- section: golive -->

## Go-live checklist

Do these in order on the day children will use the room.

<!-- step: golive-paper -->

1. The paper card has the Wi-Fi name, the computer address, and port `8443`.

   **What you should see.** You can read the address without opening Terminal.

   **If not.** Fill the card before children arrive.

<!-- step: golive-check -->

2. Run `bash scripts/check_room.sh`.

   **What you should see.** `The room check passed.`

   **If not.** Do not go live. Fix the failed line first.

<!-- step: golive-lock -->

3. On the kid tablet, press Home.

   **What you should see.** The drawing app stays open.

   **If not.** Run `bash scripts/prepare_kid_tablet.sh` again on an erased tablet.

<!-- step: golive-manager -->

4. Open the manager app.

   **What you should see.** You can leave the app. It is not locked.

   **If not.** You plugged in the kid tablet by mistake. Set up the manager tablet again.

<!-- step: golive-planet -->

5. Launch one planet.

   **What you should see.** It appears on the wall.

   **If not.** Use the troubleshooting guide.

<!-- step: golive-backup -->

6. Run `bash scripts/backup_room.sh` and copy the files to the USB stick.

   **What you should see.** The stick is in the locked drawer.

   **If not.** Do that before you call the room ready.

<!-- step: golive-case -->

7. The kid tablet has the case and the screen protector on.
   The name is on tape on the case.

   **What you should see.** The lip stands above the glass.

   **If not.** Stop and fit the case. Read the kid tablet page.

<!-- step: golive-reboot -->

8. Restart the kid tablet once.

   **What you should see.** The drawing app comes back by itself.

   **If not.** Read the boot section on the kid tablet page before go-live.

<!-- section: kid -->

## The kid tablet

Young children will hold this tablet.
The next page is the one to print for them.

<!-- step: kid-page -->

1. Read `docs/user/en/kid-tablet.md` before the first child uses the tablet.
   It covers the case, lock mode, charging, drops, and a replacement.

   **What you should see.** You can follow that page without this one open.

   **If not.** Do the case and lock steps there before go-live.

<!-- step: kid-replace -->

2. To replace a lost or broken kid tablet, erase the new one and paste this line with the real names.

```bash
bash scripts/replace_kid_tablet.sh --name kid-2 --old-name kid-1
```

   **What you should see.** The drawing app fills the new tablet.
   The command prints how many seconds it took.

   **If not.** The first build can take about 30 minutes. A later one is shorter. Read the kid tablet page.

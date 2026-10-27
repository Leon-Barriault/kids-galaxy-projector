# Préparer la salle pour qu’elle dure

Cette page est pour l’adulte qui prépare la salle.
Ce n’est pas le guide des programmeurs.
Les notes des programmeurs restent dans `DEVELOPMENT.md`.
Le guide d’installation a les photos des câbles et de la première planète.
Faites une étape à la fois.

<!-- section: who -->

## À qui s’adresse cette page

Vous pouvez le faire si vous savez coller une ligne dans Terminal.
Une personne-ressource aide pour le routeur et les tablettes.
Les enfants ne font pas cette préparation.

<!-- section: words -->

## Les mots que nous utilisons

**Ordinateur de la galaxie.** L’ordinateur qui crée l’image du mur.

**Porte des tablettes.** L’adresse que les tablettes utilisent.
Elle passe par le port `8443`.

**Carte d’identité.** Un petit fichier qui prouve quelle tablette parle.
Un enfant ne le tape jamais.

**Liste d’annulation.** La liste des tablettes perdues que la salle ne reconnaît plus.

**Clé de l’application.** Le sceau des applications de cette salle.

**Copie de secours.** Un fichier privé avec les planètes et les cartes d’identité.

**Mode verrouillé.** La tablette enfant reste dans l’application de dessin.

**Carte papier.** Une feuille que vous remplissez et gardez dans la salle.

<!-- section: hardware -->

## Quoi avoir sous la main

Achetez ceci avant le jour de l’installation.
Le guide d’installation liste le projecteur et les câbles.

<!-- step: hardware-computer -->

1. Un ordinateur Linux avec 8 Go de mémoire ou plus.
   Il lui faut un port HDMI, ou un USB-C plus un adaptateur HDMI.
   Il doit ouvrir Chrome.

   **Ce que vous devez voir.** Un ordinateur qui montre un bureau sur le projecteur.

   **Sinon.** Suivez le guide d’installation pour placer l’ordinateur.

<!-- step: hardware-tablets -->

2. Deux tablettes Android.
   Une pour les enfants. Une pour un adulte.
   Lisez la section des specs avant d’acheter.

   **Ce que vous devez voir.** Les deux tablettes s’allument et chargent.

   **Sinon.** Essayez l’autre chargeur et un câble de données.

<!-- step: hardware-case -->

3. Un étui de caoutchouc épais et un protecteur d’écran pour la tablette enfant.
   Le rebord de l’étui doit dépasser le verre.
   Le bouton d’alimentation et le trou de charge doivent encore fonctionner.

   **Ce que vous devez voir.** Le rebord est plus haut que l’écran.

   **Sinon.** Rapportez l’étui. Achetez-en un avec un rebord relevé.

<!-- step: hardware-usb -->

4. Une clé USB, et un tiroir que vous pouvez barrer.
   La clé garde la copie de secours et la clé de l’application.
   Un câble USB de données sert aussi pour chaque tablette.

   **Ce que vous devez voir.** La clé apparaît quand vous la branchez à l’ordinateur.

   **Sinon.** Essayez un autre port USB.

<!-- step: hardware-power -->

5. Le chargeur fourni avec chaque tablette.
   Ne partagez pas un petit chargeur de téléphone avec la tablette enfant.

   **Ce que vous devez voir.** Une image de pile sur chaque tablette.

   **Sinon.** Enfoncez le câble jusqu’à ce qu’il tienne.

<!-- section: network -->

## Écrire le plan réseau

Environ 20 minutes.
Utilisez le Wi-Fi du bâtiment.
Le point d’accès du guide d’installation est seulement un secours.

<!-- step: network-paper -->

1. Prenez une carte papier.
   Écrivez le nom du Wi-Fi.
   Écrivez le mot de passe du Wi-Fi sur la même carte.
   Gardez la carte avec l’adulte, pas avec les enfants.

   **Ce que vous devez voir.** Le nom du Wi-Fi et le mot de passe sont sur papier.

   **Sinon.** Demandez à la personne qui gère le routeur.

<!-- step: network-address -->

2. Choisissez une adresse fixe pour l’ordinateur de la galaxie.
   Exemple. `192.168.1.50`.
   Réservez cette adresse dans le routeur.
   Écrivez-la sur la carte papier.
   Le nom d’ordinateur à écrire est `kids-galaxy`.

   **Ce que vous devez voir.** Le routeur montre la même adresse après un redémarrage.

   **Sinon.** Demandez de réserver l’adresse. Ne continuez pas avec une adresse qui change.

<!-- step: network-ports -->

3. Écrivez ces ports sur la carte papier.
   Les tablettes utilisent `8443`.
   La page du mur utilise `8000` seulement sur l’ordinateur de la galaxie.
   La découverte de la salle utilise `5353`.
   L’adresse des tablettes ressemble à `https://192.168.1.50:8443`.
   Utilisez votre vraie adresse, pas l’exemple.

   **Ce que vous devez voir.** La carte papier a l’adresse et les trois numéros de port.

   **Sinon.** Copiez les numéros de cette étape avant de continuer.

<!-- step: network-isolation -->

4. Désactivez l’isolation des invités sur le routeur.
   Les tablettes doivent pouvoir voir l’ordinateur.
   Un réseau invité qui cache les appareils ne fonctionne pas.

   **Ce que vous devez voir.** Une tablette peut ouvrir l’adresse de l’ordinateur plus tard.

   **Sinon.** Mettez l’ordinateur et les tablettes sur le même Wi-Fi privé.

<!-- fix: network -->

> **Si cela ne fonctionne pas**
>
> 1. Vérifiez l’icône Wi-Fi de l’ordinateur. Elle doit être stable.
> 2. Demandez de réserver l’adresse.
> 3. N’utilisez pas le Wi-Fi public d’un café.

<!-- section: wsl -->

## Windows avec Ubuntu

Cette salle utilise le PC Windows nommé `DESKTOP-VJV7DLM`.
Ubuntu tourne à l’intérieur, avec l’utilisateur `omega`.
Faites cette section avant de préparer l’ordinateur de la galaxie.
Le Wi-Fi est le routeur de la maison. Le PC et les tablettes joignent ce même réseau.

<!-- step: wsl-version -->

1. Ouvrez PowerShell sur Windows.
   Collez cette ligne.

```powershell
systeminfo | findstr /B /C:"OS Name" /C:"OS Version"
```

   Puis collez cette ligne.

```powershell
wsl -l -v
```

   **Ce que vous devez voir.** Le nom du PC et une ligne `Ubuntu-22.04`.
   Windows 11 version 22H2 ou plus récent peut utiliser le mode miroir.
   Windows 10 utilise le mode NAT.

   **Sinon.** Demandez de l’aide avant de continuer. Le nom du PC doit être `DESKTOP-VJV7DLM`.

<!-- step: wsl-mirrored -->

2. Sur Windows 11, ouvrez le Bloc-notes.
   Enregistrez ce fichier sous `C:\Users\votre-nom\.wslconfig`.
   Le point devant le nom est obligatoire.

```ini
[wsl2]
networkingMode=mirrored
```

   Dans PowerShell, collez `wsl --shutdown`.
   Ouvrez Ubuntu de nouveau.
   Dans Ubuntu, collez `hostname -I`.

   **Ce que vous devez voir.** Une adresse qui commence par `192.168`.
   Elle doit correspondre à la carte papier.

   **Sinon.** Le fichier est dans le mauvais dossier, ou `wsl --shutdown` n’a pas été lancé.
   Utilisez alors l’étape NAT.

<!-- step: wsl-nat -->

3. Sur Windows 10, ou si le mode miroir ne tient pas, gardez le mode NAT.
   Ouvrez Ubuntu une fois pour qu’il ait une adresse.
   Ouvrez PowerShell en tant qu’administrateur.
   Collez cette ligne.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File \\wsl$\Ubuntu-22.04\home\omega\kids-galaxy-projector\scripts\windows\kids-galaxy-portproxy.ps1
```

   **Ce que vous devez voir.** Une ligne qui dit que le port `8443` pointe vers une adresse qui commence par `172`.
   Les tablettes utilisent quand même l’adresse Windows de la carte papier.

   **Sinon.** Ouvrez Ubuntu d’abord. Le transfert a besoin qu’Ubuntu soit allumé.
   Relancez la même ligne après chaque `wsl --shutdown`.
   La tâche d’ouverture de session fait ce rafraîchissement pour vous.

<!-- step: wsl-firewall -->

4. Dans la même fenêtre PowerShell administrateur, collez cette ligne.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File \\wsl$\Ubuntu-22.04\home\omega\kids-galaxy-projector\scripts\windows\kids-galaxy-firewall.ps1
```

   **Ce que vous devez voir.** Des règles pour `8443`, `8000` et `5353`.
   Sur Windows 11 en mode miroir, une ligne parle aussi du pare-feu Hyper-V.
   Les règles visent seulement un réseau privé.

   **Sinon.** La fenêtre n’est pas une fenêtre administrateur.
   Fermez-la et ouvrez PowerShell avec Exécuter en tant qu’administrateur.
   Pour retirer les règles plus tard, ajoutez `-Remove` à la fin de la ligne.

<!-- step: wsl-mdns -->

5. Le nom `kids-galaxy.local` est un confort.
   En mode miroir, il peut marcher si le pare-feu laisse passer le port `5353`.
   Un routeur de maison peut quand même cacher ce nom.
   En mode NAT, ce nom ne rejoint pas les tablettes.
   Ubuntu annoncerait une adresse `172` que les tablettes ne peuvent pas utiliser.
   Le script de transfert ne transporte que le port `8443`.
   Il ne transporte pas le nom.
   Dans les deux modes, écrivez l’adresse Windows sur la carte papier.
   Les tablettes doivent utiliser cette adresse.

   **Ce que vous devez voir.** La carte papier montre une adresse `192.168`, pas une adresse `172`.

   **Sinon.** Reprenez l’étape miroir ou l’étape NAT avant de construire les applications.

<!-- step: wsl-docker -->

6. Installez Docker dans Ubuntu.
   N’installez pas Docker Desktop.
   Docker Desktop cache le réseau d’Ubuntu, alors les tablettes ne rejoignent pas la porte.
   Dans Ubuntu, collez la ligne des programmes de la section suivante.
   Ce script voit Windows et démarre Docker avec systemd.
   Il ne crée pas de point d’accès Wi-Fi.

   **Ce que vous devez voir.** Les mots `The galaxy computer programs are installed.`
   Puis une ligne qui dit que Docker est permis pour votre utilisateur.

   **Sinon.** Si systemd manque, ajoutez ces lignes dans `/etc/wsl.conf`.

```ini
[boot]
systemd=true
```

   Lancez `wsl --shutdown` dans PowerShell, ouvrez Ubuntu, et relancez la ligne de l’hôte.
   Fermez Ubuntu et rouvrez-le avant `setup_room.sh`.
   Sinon Docker refuse encore votre utilisateur.

<!-- step: wsl-hotspot -->

7. Ne lancez pas le script de point d’accès.
   Ubuntu dans Windows ne possède pas la carte Wi-Fi de la salle.
   Le PC et les tablettes joignent le routeur de la maison.
   Le nom de réseau sur la carte papier est ce Wi-Fi.

   **Ce que vous devez voir.** Le PC et une tablette montrent le même nom de Wi-Fi.

   **Sinon.** Éteignez l’isolation des invités sur le routeur, comme dans la section réseau.

<!-- step: wsl-start -->

8. Windows n’ouvre pas Ubuntu tout seul après un redémarrage.
   Dans une fenêtre PowerShell administrateur, collez cette ligne.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File \\wsl$\Ubuntu-22.04\home\omega\kids-galaxy-projector\scripts\windows\kids-galaxy-autostart.ps1
```

   **Ce que vous devez voir.** Les mots `The start task is in place.`
   La prochaine fois que vous ouvrez une session Windows, le programme de la galaxie démarre.

   **Sinon.** Ouvrez Ubuntu une fois avant cette ligne, pour que Windows voie le fichier.
   La tâche peut être lancée de nouveau sans risque.
   Si Windows demande une permission à l’ouverture de session, choisissez Oui.

<!-- step: wsl-wall -->

9. Branchez le projecteur sur le port HDMI.
   Appuyez ensemble sur la touche Windows et la touche P.
   Choisissez `Second screen only` pour le spectacle.
   Dans Ubuntu, collez cette ligne.

```bash
bash scripts/open_projector.sh
```

   Chrome s’ouvre en plein écran sur Windows à `http://127.0.0.1:8000/`.
   Un raccourci du Bureau nommé `Kids Galaxy wall` ouvre cette page en mode kiosque.
   Gardez le PC éveillé. Dans PowerShell, collez ces deux lignes.

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0
```

   **Ce que vous devez voir.** Le mur montre la galaxie, et le PC branché ne s’endort pas.

   **Sinon.** Ouvrez Chrome vous-même à `http://127.0.0.1:8000/` et appuyez sur F11.
   Si l’image est sur l’écran du portable, appuyez sur la touche Windows, Maj, et la flèche droite.

<!-- section: specs -->

## Specs minimales des tablettes

Ces faits viennent de la construction de l’application.
La page de la tablette enfant les répète pour la personne qui s’occupe des tablettes.

<!-- step: specs-android -->

1. L’application enfant permet Android 8 ou plus récent.
   Le numéro de construction pour cela est l’API 26.
   L’application vise l’API 36.
   Achetez Android 9 ou plus récent quand vous le pouvez.
   Android 9 donne un verrou plus fort sur le volet.

   **Ce que vous devez voir.** Paramètres, puis À propos de la tablette, montre Android 9 ou plus récent.

   **Sinon.** Android 8 peut encore lancer l’application. Demandez si le mode verrouillé est trop faible.

<!-- step: specs-screen -->

2. L’application ne fixe pas la taille de l’écran.
   Elle fonctionne à la verticale et à l’horizontale.
   Un écran de 10 pouces est plus facile pour les petites mains.
   Un écran de 8 pouces peut convenir.

   **Ce que vous devez voir.** La page de dessin remplit la tablette.

   **Sinon.** Utilisez la plus grande tablette pour les enfants.

<!-- step: specs-memory -->

3. La construction ne fixe pas une taille de mémoire.
   Pour la salle, prévoyez 3 Go de mémoire ou plus.
   Une tablette de 2 Go peut sembler juste pendant qu’un enfant dessine.

   **Ce que vous devez voir.** La boîte de la tablette indique 3 Go ou plus.

   **Sinon.** Préférez une autre tablette si la boîte indique 2 Go.

<!-- step: specs-play -->

4. L’application n’a pas besoin des services Google Play.
   N’ajoutez pas de compte Google sur la tablette enfant.
   La boutique Play est cachée plus tard par le mode verrouillé.

   **Ce que vous devez voir.** La préparation de la tablette permet de sauter le compte.

   **Sinon.** Effacez la tablette et sautez le compte. Le mode verrouillé ne s’active pas si un compte est présent.

<!-- step: specs-wifi -->

5. L’application n’exige pas une bande Wi-Fi.
   Le 2,4 GHz et le 5 GHz fonctionnent tous les deux.
   La tablette doit rester sur le même réseau que l’ordinateur.

   **Ce que vous devez voir.** Le nom Wi-Fi de la tablette correspond à la carte papier.

   **Sinon.** Joignez le Wi-Fi de la salle avant d’activer le mode verrouillé.

<!-- step: specs-fire -->

6. Une tablette Amazon Fire n’est pas la tablette enfant prise en charge.
   L’application de dessin peut s’installer, car les services Play ne sont pas requis.
   Le mode verrouillé sur Fire OS n’est pas promis.
   Préférez une Lenovo Tab ou une Samsung Galaxy Tab.
   Si la commande de verrou échoue, ne donnez pas cette tablette Fire aux enfants.

   **Ce que vous devez voir.** La tablette est une tablette Android normale, pas une tablette Fire.

   **Sinon.** Lisez la section des limites sur la page de la tablette enfant avant de compter sur une tablette Fire.

<!-- section: computer -->

## Préparer l’ordinateur de la galaxie

Environ 40 minutes la première fois.

<!-- step: computer-linux -->

1. Allumez l’ordinateur et joignez le Wi-Fi de la salle.
   Sur ce PC Windows, finissez d’abord la section Windows.
   Ouvrez la fenêtre Ubuntu. Cette fenêtre est Terminal.

   **Ce que vous devez voir.** Un curseur qui clignote.

   **Sinon.** Ouvrez Terminal dans la liste des applications.

<!-- step: computer-packages -->

2. Collez cette ligne et appuyez sur Entrée.

```bash
bash scripts/setup_host.sh
```

   Tapez le mot de passe de l’ordinateur s’il le demande.
   Vous ne verrez pas les lettres.

   **Ce que vous devez voir.** Les mots `The galaxy computer programs are installed.`

   **Sinon.** Lisez les dernières lignes. Elles nomment ce qui manque.

<!-- step: computer-login -->

3. Déconnectez-vous, puis reconnectez-vous.
   Cela permet à votre utilisateur de lancer Docker.

   **Ce que vous devez voir.** Le bureau est revenu.

   **Sinon.** Redémarrez l’ordinateur et reconnectez-vous.

<!-- step: computer-setup -->

4. Collez cette ligne.

```bash
cd "$HOME/kids-galaxy-projector" && bash scripts/setup_room.sh
```

   Attendez. Le premier passage peut prendre plusieurs minutes.

   **Ce que vous devez voir.** Les mots `The galaxy computer is running.`
   Vous devriez aussi voir une adresse qui correspond à la carte papier.

   **Sinon.** Joignez le Wi-Fi et relancez la même ligne.

<!-- fix: computer -->

> **Si cela ne fonctionne pas**
>
> 1. Si Docker manque, relancez la ligne de l’ordinateur, puis reconnectez-vous.
> 2. Si l’adresse est mauvaise, corrigez la réservation du routeur.
> 3. Puis collez `NEW_CERTIFICATES=1 bash scripts/setup_room.sh`.
> 4. Reconstruisez les applications après un changement d’adresse.

<!-- section: docker -->

## L’image du programme de la galaxie

L’ordinateur construit le programme. Il ne télécharge pas une copie publique.

<!-- step: docker-build -->

1. La ligne d’installation de la section précédente construit l’image.
   Le nom de l’image est `kids-galaxy-pi-server:room`.
   La porte des tablettes utilise l’image nginx nommée `nginx:stable-alpine`.

   **Ce que vous devez voir.** La ligne d’installation finit par le message de démarrage.

   **Sinon.** Lancez `bash scripts/check_room.sh` et lisez les dernières lignes.

<!-- step: docker-tag -->

2. Laissez le nom d’image `room`.
   Une mise à jour garde l’image précédente sous le nom `previous`.

   **Ce que vous devez voir.** Vous n’avez pas à taper un nom d’image pendant l’installation.

   **Sinon.** Demandez de l’aide avant de renommer des images.

<!-- step: docker-health -->

3. Collez cette ligne.

```bash
bash scripts/check_room.sh
```

   **Ce que vous devez voir.** Les mots `The room check passed.`
   Une ligne qui dit `Look soon` est un avertissement, pas un échec.

   **Sinon.** Relancez `bash scripts/setup_room.sh`.

<!-- section: certificates -->

## Faire les cartes d’identité

L’installation fait déjà les premières cartes.
Cette section montre comment les regarder.

<!-- step: cert-init -->

1. Collez cette ligne si vous devez refaire les cartes.

```bash
bash scripts/production_certs.sh init
```

   Un second passage garde la carte de la salle.
   La première carte enfant s’appelle `kid-1`.
   La première carte adulte s’appelle `manager-1`.
   Les cartes durent 825 jours, sauf si une personne-ressource change cela.

   **Ce que vous devez voir.** Les mots `ID cards are ready` et une adresse.

   **Sinon.** Joignez le Wi-Fi pour que l’ordinateur ait une adresse, puis relancez la ligne.

<!-- step: cert-password -->

2. Le fichier du mot de passe reste sur l’ordinateur.
   Le chemin est `pi-server/certs/p12-password`.
   Ne l’envoyez pas par courriel.
   Ne le lisez pas à voix haute près des enfants.

   **Ce que vous devez voir.** Le fichier est là après l’init. Vous n’avez pas à l’ouvrir.

   **Sinon.** Relancez la ligne d’init.

<!-- step: cert-list -->

3. Collez cette ligne.

```bash
bash scripts/production_certs.sh list
```

   **Ce que vous devez voir.** `kid-1` et `manager-1`, chacun avec une date.

   **Sinon.** Lancez la ligne d’init, puis la ligne de liste.

<!-- section: renew -->

## Renouveler une carte

<!-- step: renew-when -->

1. Lancez la vérification de la salle une fois par mois.
   Si elle dit que la carte d’adresse expire dans les 30 jours, renouvelez-la.
   Les cartes des tablettes restent valides si seule la carte d’adresse est renouvelée.

   **Ce que vous devez voir.** La vérification dit que la carte d’adresse est à jour.

   **Sinon.** Faites l’étape suivante.

<!-- step: renew-server -->

2. Collez cette ligne si l’adresse de l’ordinateur a changé, ou si la carte d’adresse approche de sa date.

```bash
NEW_CERTIFICATES=1 bash scripts/setup_room.sh
```

   Puis reconstruisez les applications pour qu’elles apprennent l’adresse.
   La carte de la salle elle-même reste la même.

   **Ce que vous devez voir.** Le message de démarrage, et la nouvelle adresse.

   **Sinon.** Vérifiez la carte papier et la réservation du routeur.

<!-- step: renew-crl -->

3. Collez cette ligne si la vérification demande de rafraîchir la liste d’annulation.

```bash
bash scripts/production_certs.sh renew-crl
```

   **Ce que vous devez voir.** Les mots `The cancel list is up to date.`

   **Sinon.** Lancez la ligne d’init, puis cette ligne de nouveau.

<!-- section: lost -->

## Annuler une tablette perdue

Faites ceci le jour même où une tablette enfant manque.

<!-- step: lost-name -->

1. Lisez le nom sur le ruban de l’étui.
   Exemple. `kid-1`.

   **Ce que vous devez voir.** Un nom court avec des lettres, des chiffres ou des tirets.

   **Sinon.** Lancez la commande de liste dans la section des cartes.

<!-- step: lost-command -->

2. Collez cette ligne avec le vrai nom.

```bash
bash scripts/production_certs.sh revoke-tablet --name kid-1
```

   **Ce que vous devez voir.** Les mots `The card for kid-1 is cancelled.`
   La ligne suivante dit que la porte des tablettes a redémarré.

   **Sinon.** Vérifiez le nom avec la commande de liste et relancez la ligne.

<!-- step: lost-rebuild -->

3. Ne donnez plus cette tablette aux enfants.
   Quand vous avez un remplacement, utilisez la page de la tablette enfant.
   La commande de remplacement fait une nouvelle carte.

   **Ce que vous devez voir.** La commande de liste montre l’ancien nom comme annulé.

   **Sinon.** Relancez la ligne d’annulation. Un second passage est sûr.

<!-- fix: lost -->

> **Si cela ne fonctionne pas**
>
> 1. Lancez `bash scripts/production_certs.sh list`.
> 2. Utilisez le nom de cette liste.
> 3. Demandez de l’aide si la porte des tablettes n’a pas redémarré.

<!-- section: tablets -->

## Signer et installer les applications

Environ 40 minutes la première fois.
Une tablette enfant plus tard utilise la commande de remplacement.

<!-- step: tablets-key -->

1. Collez cette ligne.

```bash
bash scripts/create_tablet_keystore.sh
```

   **Ce que vous devez voir.** Les mots `The app key is ready.`
   Un second passage dit que la clé a été laissée en place.

   **Sinon.** Installez Java ou Android Studio, puis relancez la ligne.

<!-- step: tablets-build -->

2. Collez cette ligne.

```bash
bash scripts/build_tablets.sh
```

   **Ce que vous devez voir.** Les mots `BUILD SUCCESSFUL`.

   **Sinon.** Si les outils Android manquent, une personne-ressource doit installer Android Studio.

<!-- step: tablets-kid -->

3. Effacez la tablette enfant.
   Sautez chaque compte.
   Activez le débogage USB, comme dans le guide d’installation.
   Branchez-la seule.
   Collez cette ligne.

```bash
bash scripts/prepare_kid_tablet.sh
```

   **Ce que vous devez voir.** L’application de dessin remplit l’écran.
   La ligne indique aussi le nombre de secondes.

   **Sinon.** Effacez la tablette de nouveau. N’ajoutez pas de compte. Relancez la même ligne.

<!-- step: tablets-manager -->

4. Débranchez la tablette enfant.
   Branchez la tablette de gestion.
   Ne l’effacez pas, sauf si vous le voulez.
   Collez cette ligne.

```bash
bash scripts/prepare_manager_tablet.sh
```

   **Ce que vous devez voir.** Gestionnaire Kids Galaxy est dans la liste des applications.
   Cette tablette n’est pas verrouillée.

   **Sinon.** Touchez Autoriser sur la tablette et utilisez un câble de données.

<!-- section: first-run -->

## Vérifications du premier démarrage

<!-- step: first-check -->

1. Collez cette ligne sur l’ordinateur de la galaxie.

```bash
bash scripts/check_room.sh
```

   **Ce que vous devez voir.** `The room check passed.`

   **Sinon.** Lancez `bash scripts/setup_room.sh`, puis la vérification de nouveau.

<!-- step: first-sky -->

2. Collez cette ligne.

```bash
bash scripts/open_projector.sh
```

   Appuyez sur F11.

   **Ce que vous devez voir.** Un ciel sombre et les mots d’attente sur le mur.

   **Sinon.** Vérifiez le HDMI et le bouton source du projecteur.

<!-- step: first-planet -->

3. Sur la tablette enfant, dessinez un trait et touchez Lancer.

   **Ce que vous devez voir.** La planète apparaît sur le mur.

   **Sinon.** Utilisez le guide de dépannage. Vérifiez d’abord le nom du Wi-Fi.

<!-- step: first-reboot -->

4. Redémarrez la tablette enfant avec le menu d’alimentation.
   Attendez qu’elle revienne.

   **Ce que vous devez voir.** L’application de dessin est ouverte de nouveau. Vous ne choisissez pas la salle.

   **Sinon.** Lisez la section du démarrage sur la page de la tablette enfant.

<!-- section: backup -->

## Faire une copie de secours

Faites ceci après que la première planète fonctionne.
Refaites-le une fois par semaine.

<!-- step: backup-run -->

1. Collez cette ligne.

```bash
bash scripts/backup_room.sh
```

   **Ce que vous devez voir.** Un chemin qui finit par `.tar.gz`.

   **Sinon.** Lancez l’installation une fois, puis cette ligne de nouveau.

<!-- step: backup-usb -->

2. Branchez la clé USB.
   Copiez le fichier `.tar.gz` et le fichier `.sha256` à côté sur la clé.
   Débranchez la clé.

   **Ce que vous devez voir.** Les deux fichiers sont sur la clé.

   **Sinon.** Copiez les deux fichiers. Le fichier de contrôle doit rester à côté de la copie.

<!-- step: backup-drawer -->

3. Mettez la clé dans le tiroir barré.
   La copie contient les cartes d’identité et la clé de l’application.
   Ne l’envoyez pas par courriel.

   **Ce que vous devez voir.** La clé est dans le tiroir, pas dans un sac près de la porte.

   **Sinon.** Déplacez-la avant l’arrivée des enfants.

<!-- section: restore -->

## Remettre une copie de secours

<!-- step: restore-from -->

1. Branchez la clé USB.
   Collez cette ligne avec le vrai nom de fichier.

```bash
bash scripts/restore_room.sh --from /media/usb/kids-galaxy-DATE.tar.gz
```

   **Ce que vous devez voir.** Les mots `The files are back.`

   **Sinon.** Vérifiez le nom du fichier. Si le contrôle a échoué, n’utilisez pas cette copie.

<!-- step: restore-start -->

2. Collez cette ligne.

```bash
bash scripts/setup_room.sh
```

   **Ce que vous devez voir.** Le message de démarrage.

   **Sinon.** Lancez la vérification de la salle et lisez les dernières lignes.

<!-- step: restore-check -->

3. Ouvrez la page du mur et cherchez les anciennes planètes.

   **Ce que vous devez voir.** Les planètes d’avant la copie sont sur le mur.

   **Sinon.** Confirmez que vous avez remis la copie la plus récente, pas une plus vieille.

<!-- section: update -->

## Mettre la salle à jour

<!-- step: update-version -->

1. Demandez le nom de version à une personne-ressource.
   Exemple. `v1.2.0`.
   Collez cette ligne avec le vrai nom.

```bash
bash scripts/update_room.sh --version v1.2.0
```

   **Ce que vous devez voir.** La vérification de la salle réussit à la fin.

   **Sinon.** La commande essaie de remettre le programme précédent. Puis suivez la section de retour.

<!-- step: update-rebuild -->

2. Utilisez cette ligne seulement si on vous dit que les fichiers déjà sur l’ordinateur sont les bons.

```bash
bash scripts/update_room.sh --rebuild
```

   **Ce que vous devez voir.** La même vérification réussie.

   **Sinon.** Lancez la commande de retour de la section suivante.

<!-- step: update-see -->

3. Regardez le mur après la mise à jour.
   Envoyez une planète depuis la tablette enfant.

   **Ce que vous devez voir.** La planète apparaît encore.

   **Sinon.** Revenez en arrière, puis demandez de l’aide.

<!-- section: rollback -->

## Revenir au programme précédent

<!-- step: rollback-run -->

1. Collez cette ligne.

```bash
bash scripts/rollback_room.sh
```

   **Ce que vous devez voir.** Les mots `The previous program is running.`
   Puis la vérification de la salle réussit.

   **Sinon.** Si on vous dit qu’il n’y a pas d’ancienne copie, demandez de l’aide. Ne continuez pas les mises à jour.

<!-- step: rollback-see -->

2. Regardez le mur.

   **Ce que vous devez voir.** Le ciel est revenu. Les anciennes planètes sont encore là.

   **Sinon.** Lancez la vérification. Les planètes vivent dans la copie de secours si le disque a été remplacé.

<!-- section: watch -->

## Quoi surveiller

<!-- step: watch-check -->

1. Chaque semaine, collez cette ligne.

```bash
bash scripts/check_room.sh
```

   **Ce que vous devez voir.** `The room check passed.`

   **Sinon.** Suivez la ligne qui a échoué. L’installation, le renouvellement ou l’espace disque sont les correctifs habituels.

<!-- step: watch-logs -->

2. Si la vérification échoue, collez cette ligne.

```bash
docker compose -f docker-compose.secure.yml logs --tail 40
```

   **Ce que vous devez voir.** Des lignes récentes. Demandez de l’aide si la même erreur se répète.

   **Sinon.** Une personne-ressource peut lire les lignes. Vous n’avez pas à corriger le code.

<!-- step: watch-disk -->

3. Lisez la ligne d’espace libre dans la vérification.
   Faites une copie de secours avant que le disque soit presque plein.
   La salle garde jusqu’à 30 planètes.

   **Ce que vous devez voir.** L’espace libre n’est pas décrit comme presque plein.

   **Sinon.** Demandez de libérer de l’espace après une copie de secours.

<!-- section: golive -->

## Liste de mise en service

Faites ceci dans l’ordre le jour où les enfants utiliseront la salle.

<!-- step: golive-paper -->

1. La carte papier a le nom du Wi-Fi, l’adresse de l’ordinateur et le port `8443`.

   **Ce que vous devez voir.** Vous pouvez lire l’adresse sans ouvrir Terminal.

   **Sinon.** Remplissez la carte avant l’arrivée des enfants.

<!-- step: golive-check -->

2. Lancez `bash scripts/check_room.sh`.

   **Ce que vous devez voir.** `The room check passed.`

   **Sinon.** Ne mettez pas la salle en service. Corrigez d’abord la ligne échouée.

<!-- step: golive-lock -->

3. Sur la tablette enfant, appuyez sur Accueil.

   **Ce que vous devez voir.** L’application de dessin reste ouverte.

   **Sinon.** Relancez `bash scripts/prepare_kid_tablet.sh` sur une tablette effacée.

<!-- step: golive-manager -->

4. Ouvrez l’application de gestion.

   **Ce que vous devez voir.** Vous pouvez quitter l’application. Elle n’est pas verrouillée.

   **Sinon.** Vous avez branché la tablette enfant par erreur. Préparez de nouveau la tablette de gestion.

<!-- step: golive-planet -->

5. Lancez une planète.

   **Ce que vous devez voir.** Elle apparaît sur le mur.

   **Sinon.** Utilisez le guide de dépannage.

<!-- step: golive-backup -->

6. Lancez `bash scripts/backup_room.sh` et copiez les fichiers sur la clé USB.

   **Ce que vous devez voir.** La clé est dans le tiroir barré.

   **Sinon.** Faites-le avant de dire que la salle est prête.

<!-- step: golive-case -->

7. La tablette enfant a l’étui et le protecteur d’écran.
   Le nom est sur un ruban sur l’étui.

   **Ce que vous devez voir.** Le rebord dépasse le verre.

   **Sinon.** Arrêtez-vous et posez l’étui. Lisez la page de la tablette enfant.

<!-- step: golive-reboot -->

8. Redémarrez la tablette enfant une fois.

   **Ce que vous devez voir.** L’application de dessin revient toute seule.

   **Sinon.** Lisez la section du démarrage sur la page de la tablette enfant avant la mise en service.

<!-- section: kid -->

## La tablette enfant

De jeunes enfants vont tenir cette tablette.
La page suivante est celle à imprimer pour eux.

<!-- step: kid-page -->

1. Lisez `docs/user/fr/kid-tablet.md` avant qu’un premier enfant utilise la tablette.
   Elle couvre l’étui, le mode verrouillé, la charge, les chutes et un remplacement.

   **Ce que vous devez voir.** Vous pouvez suivre cette page sans celle-ci ouverte.

   **Sinon.** Faites les étapes d’étui et de verrou là-bas avant la mise en service.

<!-- step: kid-replace -->

2. Pour remplacer une tablette enfant perdue ou brisée, effacez la nouvelle et collez cette ligne avec les vrais noms.

```bash
bash scripts/replace_kid_tablet.sh --name kid-2 --old-name kid-1
```

   **Ce que vous devez voir.** L’application de dessin remplit la nouvelle tablette.
   La commande indique le nombre de secondes.

   **Sinon.** La première construction peut prendre environ 30 minutes. Une suivante est plus courte. Lisez la page de la tablette enfant.

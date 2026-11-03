# Quand quelque chose ne va pas

Trouvez le titre qui correspond à ce que vous voyez.
Faites les étapes dans l’ordre.
Arrêtez-vous quand la salle fonctionne.
Ouvrez Ubuntu et allez dans le dossier du projet avant de coller une commande.

```bash
cd /home/omega/kids-galaxy-projector
```

<!-- section: how -->

## Comment utiliser cette page

<!-- step: how-match -->

1. Lisez la ligne qui commence par Vous voyez.
   Choisissez la section qui correspond.
   N’essayez pas chaque correctif de la page.

   **Ce que vous devez voir.** Un titre qui correspond à l’écran.

   **Sinon.** Demandez de l’aide et montrez les mots à l’écran.

<!-- fix: how -->

> **Si cela ne fonctionne pas**
>
> N’effacez pas une tablette tant qu’une étape ne le dit pas.

<!-- problem: no-picture -->

## Le mur n’a pas d’image

**Vous voyez.** Un mur sombre, la mauvaise entrée, ou un message sans signal.

<!-- step: no-picture-power -->

1. Vérifiez le voyant du projecteur.
   Vérifiez le voyant du PC.
   Allumez ce qui est éteint.

   **Ce que vous devez voir.** Les deux voyants sont allumés.

   **Sinon.** Branchez chacun au mur.

<!-- step: no-picture-hdmi -->

2. Poussez la prise HDMI des deux côtés.
   Appuyez sur le bouton source jusqu’à HDMI.

   **Ce que vous devez voir.** Le bureau Windows sur le mur.

   **Sinon.** Essayez un deuxième câble HDMI.

<!-- step: no-picture-page -->

3. Dans Windows, ouvrez Chrome.
   Allez à `http://127.0.0.1:8000/`.

   **Ce que vous devez voir.** Le ciel sombre et les mots d’attente.

   **Sinon.** Faites l’étape suivante.

<!-- step: no-picture-setup -->

4. Dans Ubuntu, dans le dossier du projet, collez cette ligne.

```bash
bash scripts/setup_room.sh
```

   Puis collez cette ligne.

```bash
bash scripts/open_projector.sh
```

   **Ce que vous devez voir.** Chrome ouvre le ciel dans Windows.

   **Sinon.** Lisez les dernières lignes. Elles nomment ce qui manque.

<!-- fix: no-picture -->

> **Si cela ne fonctionne pas.**
>
> Vérifiez le projecteur ou le câble.
> L’écran du PC peut quand même sembler correct.

<!-- problem: no-connect -->

## La tablette ne peut pas se connecter

**Vous voyez.** Un message que la galaxie est injoignable, ou la planète n’apparaît jamais.

<!-- step: no-connect-wifi -->

1. Regardez le nom Wi-Fi de la tablette.
   Sur une tablette enfant verrouillée, faites cette vérification sur la tablette de gestion.
   Joignez `KidsGalaxy`.
   Ne joignez pas le Wi-Fi de la garderie.

   **Ce que vous devez voir.** Le même nom Wi-Fi que le PC.

   **Sinon.** Oubliez les autres réseaux sur la tablette, puis joignez `KidsGalaxy`.

<!-- step: no-connect-address -->

2. Dans l’application de dessin, touchez le nom de la galaxie.
   L’adresse de la tablette est `https://192.168.0.52:8443`.

   **Ce que vous devez voir.** Un crochet, et aucun avertissement de certificat.

   **Sinon.** Utilisez cette adresse. Ne tapez pas une adresse de garderie.

<!-- step: no-connect-restart -->

3. Dans le dossier du projet, collez cette ligne.

```bash
bash scripts/setup_room.sh
```

   **Ce que vous devez voir.** `The galaxy computer is running.`

   **Sinon.** Si le PC n’est pas à `192.168.0.52`, l’installation s’arrête et garde cette adresse.
   Joignez `KidsGalaxy` et relancez la ligne.
   N’ajoutez pas `CHANGE_ADDRESS=1`, sauf si une personne-ressource veut vraiment déplacer la salle.

<!-- fix: no-connect -->

> **Si cela ne fonctionne pas**
>
> Utilisez le routeur de voyage nommé `KidsGalaxy`.
> N’utilisez pas le Wi-Fi de la garderie.
> Le point d’accès Windows est seulement un secours, et son adresse est `192.168.137.1`.

<!-- problem: stuck-lock -->

## La tablette enfant est bloquée en mode verrouillé

**Vous voyez.** Seulement l’application de dessin, et vous avez besoin des réglages.

<!-- step: stuck-home -->

1. Appuyez sur Accueil.

   **Ce que vous devez voir.** L’application de dessin reste ouverte.
   Cela veut dire que le mode verrouillé fait son travail.

   **Sinon.** Utilisez la tablette de gestion pour les tâches d’adulte.

<!-- step: stuck-usb -->

2. Branchez la tablette enfant au PC.
   Partagez-la avec Ubuntu, comme dans le guide d’installation.
   Touchez Autoriser si vous le voyez.
   Collez cette ligne seulement quand une personne-ressource est avec vous.

```bash
adb shell am task lock stop
```

   **Ce que vous devez voir.** L’écran normal de la tablette pendant un moment.
   L’application de dessin peut se verrouiller de nouveau à l’ouverture.

   **Sinon.** `adb devices` doit finir par `device` avant que cette ligne fonctionne.

<!-- step: stuck-erase -->

3. La voie sûre est d’effacer la tablette.
   Demandez de l’aide avant de le faire.
   Vous referez ensuite la préparation de la tablette enfant.

   **Ce que vous devez voir.** Une personne-ressource est d’accord avant l’effacement.

   **Sinon.** Débranchez la tablette et utilisez la tablette de gestion.

<!-- fix: stuck-lock -->

> **Si cela ne fonctionne pas**
>
> Ne continuez pas à deviner les boutons devant les enfants.
> Débranchez la tablette et utilisez la tablette de gestion jusqu’à l’effacement.

<!-- problem: wrong-language -->

## La langue est mauvaise

**Vous voyez.** Le français alors que vous vouliez l’anglais, ou l’inverse.

<!-- step: wrong-language-tablet -->

1. Sur la tablette, touchez EN / FR.

   **Ce que vous devez voir.** L’application se rouvre dans l’autre langue.
   Votre choix reste sur cette tablette.

   **Sinon.** Touchez EN / FR encore une fois.

<!-- step: wrong-language-wall -->

2. Si seul le mur est mauvais, ouvrez l’application de gestion.
   Touchez Langue du projecteur.
   Choisissez English ou Français.
   Rechargez la page sur le PC.

   **Ce que vous devez voir.** Les nouveaux mots sur le mur.

   **Sinon.** Rechargez Chrome à `http://127.0.0.1:8000/`.

<!-- fix: wrong-language -->

> **Si cela ne fonctionne pas**
>
> Une nouvelle tablette suit la langue de la tablette la première fois.
> Touchez EN / FR une fois pour fixer le choix voulu.

<!-- problem: certificate -->

## Une erreur de certificat

**Vous voyez.** L’application se ferme tout de suite, ou elle dit que la connexion n’est pas fiable.

<!-- step: certificate-same-wifi -->

1. Mettez la tablette sur `KidsGalaxy`.
   Essayez de nouveau.

   **Ce que vous devez voir.** L’avertissement a disparu.

   **Sinon.** Un mauvais réseau peut ressembler à une mauvaise carte d’identité. Faites l’étape suivante.

<!-- step: certificate-rebuild -->

2. Les tablettes gardent `192.168.0.52`, sauf si vous la changez exprès.
   Joignez `KidsGalaxy` pour que le PC soit à cette adresse.
   Puis collez cette ligne.

```bash
bash scripts/setup_room.sh
```

   Utilisez la ligne suivante seulement si une personne-ressource veut déplacer la salle.
   Puis reconstruisez les applications des tablettes.

```bash
CHANGE_ADDRESS=1 SERVER_IP=192.168.0.52 bash scripts/setup_room.sh
```

   Utilisez cette ligne quand la carte d’adresse approche de sa date et que l’adresse reste la même.

```bash
NEW_CERTIFICATES=1 bash scripts/setup_room.sh
```

   **Ce que vous devez voir.** `The galaxy computer is running.`
   L’adresse des tablettes est encore `https://192.168.0.52:8443`.

   **Sinon.** Ne construisez pas de nouvelles applications tant que le changement d’adresse n’est pas confirmé.

<!-- step: certificate-right-app -->

3. Utilisez l’application de dessin sur la tablette enfant.
   Utilisez Gestionnaire Kids Galaxy sur la tablette adulte.

   **Ce que vous devez voir.** Chaque tablette ouvre sa propre application.

   **Sinon.** Les cartes d’identité ne sont pas les mêmes. Les échanger cause cette erreur.

<!-- fix: certificate -->

> **Si cela ne fonctionne pas**
>
> Ne copiez pas les fichiers de carte d’identité dans un courriel ou une conversation.
> Demandez de refaire l’installation sur l’ordinateur de la galaxie.

<!-- problem: print -->

## L’impression ou le STL a échoué

**Vous voyez.** Un message que l’export a échoué, ou le message d’attente ne finit pas.

<!-- step: print-wifi -->

1. Vérifiez que la tablette de gestion est sur `KidsGalaxy`.
   Touchez Imprimer ou STL de nouveau.
   Attendez une minute pour le STL.

   **Ce que vous devez voir.** La boîte d’impression, ou un fichier qui finit par `.stl`.

   **Sinon.** Faites l’étape suivante.

<!-- step: print-save -->

2. S’il n’y a pas d’imprimante, enregistrez le PDF quand la tablette l’offre.
   Ouvrez ce PDF dans une application PDF et imprimez de là.

   **Ce que vous devez voir.** Un PDF enregistré.

   **Sinon.** Redémarrez l’application de gestion.

<!-- fix: print -->

> **Si cela ne fonctionne pas**
>
> Redémarrez l’application de gestion.
> Si la page du mur est aussi fermée, lancez d’abord `bash scripts/setup_room.sh`.

<!-- problem: slow -->

## Une planète est lente à apparaître

**Vous voyez.** La tablette dit qu’elle a envoyé la planète, mais le mur attend.

<!-- step: slow-wait -->

1. Attendez environ 15 secondes.
   La première planète après un démarrage peut être lente.

   **Ce que vous devez voir.** La planète arrive sans un autre toucher.

   **Sinon.** Faites l’étape suivante.

<!-- step: slow-reload -->

2. Rechargez la page de la galaxie sur le PC.
   Appuyez sur F5 dans Chrome.

   **Ce que vous devez voir.** Les planètes déjà enregistrées.
   Une reconnexion automatique n’est pas encore là.
   Ce correctif arrive à part.

   **Sinon.** Vérifiez `KidsGalaxy`, puis essayez un seul autre lancement.

<!-- fix: slow -->

> **Si cela ne fonctionne pas**
>
> Ne touchez pas Lancer plusieurs fois.
> La salle demande à l’enfant d’attendre un moment entre les planètes.

<!-- section: onsite -->

## À la garderie

Utilisez cette section quand vous êtes dans la salle avec les enfants.
Le routeur de voyage est le seul réseau.

<!-- problem: onsite-router -->

## Le routeur de voyage n’est pas prêt

**Vous voyez.** Pas de voyant Wi-Fi, ou `KidsGalaxy` manque dans la liste.

<!-- step: onsite-router-power -->

1. Branchez le routeur au mur ou à la batterie externe.

   **Ce que vous devez voir.** Un voyant Wi-Fi stable.

   **Sinon.** Essayez l’autre source de courant.

<!-- step: onsite-router-wifi -->

2. Sur le PC, joignez `KidsGalaxy`.
   Ne joignez pas le Wi-Fi de la garderie.

   **Ce que vous devez voir.** Le nom du Wi-Fi est `KidsGalaxy`.

   **Sinon.** Rapprochez le routeur et rouvrez la liste Wi-Fi.

<!-- fix: onsite-router -->

> **Si cela ne fonctionne pas**
>
> Ne passez pas la visite sur le point d’accès Windows.
> Son adresse est `192.168.137.1`, et il refuse souvent de démarrer sans internet à partager.

<!-- problem: onsite-docker -->

## Docker Desktop tourne

**Vous voyez.** L’icône de baleine, ou la ligne d’installation de l’hôte s’arrête.

<!-- step: onsite-docker-quit -->

1. Faites un clic droit sur l’icône de baleine.
   Choisissez Quitter Docker Desktop.
   Éteignez le démarrage de Docker Desktop à l’ouverture de session.

   **Ce que vous devez voir.** L’icône de baleine a disparu.

   **Sinon.** Ouvrez les applications de démarrage et éteignez Docker Desktop.

<!-- step: onsite-docker-again -->

2. Dans le dossier du projet, collez la ligne de l’hôte de nouveau.

```bash
bash scripts/setup_host.sh
```

   **Ce que vous devez voir.** `The galaxy computer programs are installed.`

   **Sinon.** La ligne s’arrête tant que Docker Desktop tourne.
   Vous devriez voir `Docker Desktop is running on Windows.`
   Quittez-le, puis collez la ligne de nouveau.

<!-- fix: onsite-docker -->

> **Si cela ne fonctionne pas**
>
> Laissez Docker Desktop fermé pour toute la visite.
> Le Docker d’Ubuntu est celui que cette salle utilise.

<!-- problem: onsite-address -->

## L’adresse du PC a changé

**Vous voyez.** L’installation s’arrête, et l’adresse n’est pas `192.168.0.52`.

<!-- step: onsite-address-join -->

1. Joignez `KidsGalaxy` sur le PC.
   Oubliez le Wi-Fi de la garderie.

   **Ce que vous devez voir.** Le nom du Wi-Fi est `KidsGalaxy`.

   **Sinon.** Le voyant du routeur de voyage doit d’abord être allumé.

<!-- step: onsite-address-check -->

2. Dans Ubuntu, collez `hostname -I`.

   **Ce que vous devez voir.** `192.168.0.52`

   **Sinon.** Lancez `wsl --shutdown` dans PowerShell, ouvrez Ubuntu, et vérifiez de nouveau.

<!-- step: onsite-address-keep -->

3. Collez `bash scripts/setup_room.sh` seulement après que l’adresse correspond.
   L’installation garde `192.168.0.52`.
   Elle s’arrête quand le PC est sur un autre réseau.
   L’adresse change seulement exprès, avec `CHANGE_ADDRESS=1` et un nouveau `SERVER_IP`.
   Une personne-ressource fait cela, puis reconstruit les applications des tablettes.

   **Ce que vous devez voir.** `The galaxy computer is running.`

   **Sinon.** Lisez la ligne qui dit que les tablettes utilisent `192.168.0.52`.
   Joignez `KidsGalaxy` au lieu de taper une nouvelle adresse.

<!-- fix: onsite-address -->

> **Si cela ne fonctionne pas**
>
> N’utilisez pas `CHANGE_ADDRESS=1` pour suivre le réseau de la garderie.
> Les tablettes restent sur `192.168.0.52`.

<!-- problem: onsite-tablet -->

## La tablette ne trouve pas le projecteur

**Vous voyez.** Le dessin part, mais le mur ne montre jamais la planète.

<!-- step: onsite-tablet-same -->

1. Mettez la tablette et le PC sur `KidsGalaxy`.

   **Ce que vous devez voir.** Les deux montrent ce même nom.

   **Sinon.** Quittez le Wi-Fi de la garderie.

<!-- step: onsite-tablet-sky -->

2. Dans Windows, ouvrez `http://127.0.0.1:8000/`.

   **Ce que vous devez voir.** Le ciel sombre.

   **Sinon.** Dans le dossier du projet, lancez `bash scripts/setup_room.sh`, puis ouvrez le mur de nouveau.

<!-- step: onsite-tablet-wait -->

3. Touchez Lancer une fois.
   Attendez environ 15 secondes.

   **Ce que vous devez voir.** La nouvelle planète sur le mur.

   **Sinon.** Rechargez la page du mur.
   Une reconnexion automatique n’est pas encore là.

<!-- fix: onsite-tablet -->

> **Si cela ne fonctionne pas**
>
> Vérifiez le voyant du routeur, puis l’adresse `192.168.0.52`, puis Docker Desktop.

<!-- problem: onsite-usb -->

## Ubuntu ne voit pas la tablette

**Vous voyez.** `No tablet is ready` après avoir branché le câble au PC.

<!-- step: onsite-usb-share -->

1. Suivez les étapes de partage USB du guide d’installation.
   Branchez une seule tablette, touchez Autoriser, puis attachez-la à Ubuntu.

   **Ce que vous devez voir.** `adb devices` finit par `device`.

   **Sinon.** Utilisez le même port USB que le code sur la carte papier.

<!-- fix: onsite-usb -->

> **Si cela ne fonctionne pas**
>
> Un câble de charge seule ne montre pas de tablette.
> Prenez un câble de données et attachez de nouveau.

<!-- problem: onsite-folder -->

## Une commande dit qu’elle ne trouve pas le script

**Vous voyez.** `No such file` après avoir collé une ligne.

<!-- step: onsite-folder-open -->

1. Ouvrez Ubuntu.
   Collez cette ligne.

```bash
cd /home/omega/kids-galaxy-projector
```

   **Ce que vous devez voir.** `pwd` affiche `/home/omega/kids-galaxy-projector`.

   **Sinon.** Vous avez collé la commande dans PowerShell ou dans le mauvais dossier.
   Ouvrez d’abord Ubuntu.

<!-- fix: onsite-folder -->

> **Si cela ne fonctionne pas**
>
> Le nom sur la ligne Ubuntu doit être `omega`.
> Fermez une fenêtre qui dit `root` et rouvrez Ubuntu.

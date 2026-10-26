# Quand quelque chose ne va pas

Trouvez le titre qui correspond à ce que vous voyez.
Faites les étapes dans l’ordre.
Arrêtez-vous quand la salle fonctionne.

<!-- section: how -->

## Comment utiliser cette page

<!-- step: how-match -->

1. Lisez la ligne qui commence par Vous voyez.
   Choisissez la section qui correspond.
   N’essayez pas tous les correctifs de la page.

<!-- fix: how -->

> **Si cela ne fonctionne pas**
>
> Demandez de l’aide et montrez les mots à l’écran.
> N’effacez pas une tablette tant qu’une étape ne le dit pas.

<!-- problem: no-picture -->

## Le mur n’a pas d’image

**Vous voyez :** un mur sombre, la mauvaise entrée, ou un message sans signal.

<!-- step: no-picture-power -->

1. Vérifiez le voyant du projecteur.
   Vérifiez le voyant de l’ordinateur.
   Allumez ce qui est éteint.

<!-- step: no-picture-hdmi -->

2. Poussez la prise HDMI des deux côtés.
   Appuyez sur le bouton source jusqu’à HDMI.
   Vous devriez voir le bureau de l’ordinateur.

<!-- step: no-picture-page -->

3. Sur l’ordinateur, ouvrez Chrome.
   Allez à `http ://127.0.0.1:8000/`.
   Vous devriez voir le ciel sombre et les mots d’attente.

<!-- step: no-picture-setup -->

4. Si la page ne s’ouvre pas, collez cette ligne dans Terminal.

```bash
bash scripts/setup_room.sh
```

   Puis collez cette ligne.

```bash
bash scripts/open_projector.sh
```

<!-- fix: no-picture -->

> **Si cela ne fonctionne pas**
>
> Essayez un deuxième câble HDMI.
> Si l’écran de l’ordinateur fonctionne mais pas le mur, le projecteur ou le câble est en cause.

<!-- problem: no-connect -->

## La tablette ne peut pas se connecter

**Vous voyez :** un message que la galaxie est injoignable, ou la planète n’apparaît jamais.

<!-- step: no-connect-wifi -->

1. Ouvrez les réglages Wi-Fi de la tablette si vous le pouvez.
   Sur une tablette enfant verrouillée, faites cette vérification sur la tablette de gestion.
   Joignez le même nom Wi-Fi que l’ordinateur de la galaxie.

<!-- step: no-connect-address -->

2. Dans l’application de dessin, touchez le nom de la galaxie.
   Si vous tapez une adresse, utilisez l’adresse `https ://` de l’installation.
   Elle ressemble à `https ://192.168.1.20:8443`.
   Vous devriez voir un crochet quand la tablette peut la joindre.

<!-- step: no-connect-restart -->

3. Sur l’ordinateur, collez cette ligne.

```bash
bash scripts/setup_room.sh
```

   N’ajoutez pas `NEW_CERTIFICATES=1` sauf si on vous dit que l’adresse a changé.

<!-- fix: no-connect -->

> **Si cela ne fonctionne pas**
>
> Un Wi-Fi invité bloque souvent les tablettes.
> Utilisez le Wi-Fi privé de la salle, ou le point d’accès `KidsGalaxy` du guide d’installation.

<!-- problem: stuck-lock -->

## La tablette enfant est bloquée en mode verrouillé

**Vous voyez :** seulement l’application de dessin, et vous avez besoin des réglages.

<!-- step: stuck-home -->

1. Appuyez sur Accueil.
   L’application de dessin devrait rester ouverte.
   Cela veut dire que le mode verrouillé fait son travail.
   Utilisez la tablette de gestion pour les tâches d’adulte.

<!-- step: stuck-usb -->

2. Si vous devez quitter l’application, branchez la tablette à l’ordinateur.
   Touchez Autoriser si vous le voyez.
   Collez cette ligne seulement avec une personne-ressource.

```bash
adb shell am task lock stop
```

   Vous pourriez voir l’écran normal un moment.
   L’application de dessin peut se verrouiller de nouveau à l’ouverture.

<!-- step: stuck-erase -->

3. La voie sûre est d’effacer la tablette.
   Demandez de l’aide avant de le faire.
   Vous referez ensuite l’installation de la tablette enfant.

<!-- fix: stuck-lock -->

> **Si cela ne fonctionne pas**
>
> Ne continuez pas à deviner des boutons devant les enfants.
> Débranchez la tablette et utilisez la tablette de gestion jusqu’à l’aide.

<!-- problem: wrong-language -->

## La langue n’est pas la bonne

**Vous voyez :** du français alors que vous vouliez l’anglais, ou l’inverse.

<!-- step: wrong-language-tablet -->

1. Sur la tablette, touchez EN / FR.
   L’application devrait se rouvrir dans l’autre langue.
   Votre choix reste sur cette tablette.

<!-- step: wrong-language-wall -->

2. Si seul le mur est incorrect, ouvrez l’application de gestion.
   Touchez Langue du projecteur.
   Choisissez English ou Français.
   Rechargez la page sur l’ordinateur.
   Vous devriez voir les nouveaux mots sur le mur.

<!-- fix: wrong-language -->

> **Si cela ne fonctionne pas**
>
> Une nouvelle tablette suit la langue de l’appareil la première fois.
> Touchez EN / FR une fois pour fixer le choix voulu.

<!-- problem: certificate -->

## Une erreur de certificat

**Vous voyez :** l’application se ferme tout de suite, ou elle dit que la connexion n’est pas fiable.

<!-- step: certificate-same-wifi -->

1. Mettez la tablette sur le même Wi-Fi que l’ordinateur.
   Réessayez.
   Un mauvais réseau peut ressembler à une mauvaise carte d’identité.

<!-- step: certificate-rebuild -->

2. Si l’adresse de l’ordinateur a changé, l’ancienne carte ne correspond plus.
   Sur l’ordinateur, collez cette ligne.

```bash
NEW_CERTIFICATES=1 bash scripts/setup_room.sh
```

   Puis collez cette ligne.

```bash
bash scripts/build_tablets.sh
```

   Installez les applications de nouveau avec les commandes du guide d’installation.

<!-- step: certificate-right-app -->

3. Utilisez l’application de dessin sur la tablette enfant.
   Utilisez Gestionnaire Kids Galaxy sur la tablette adulte.
   Les cartes d’identité ne sont pas les mêmes.
   Les échanger cause cette erreur.

<!-- fix: certificate -->

> **Si cela ne fonctionne pas**
>
> Ne copiez pas les fichiers de carte d’identité dans un courriel ou une conversation.
> Demandez de refaire l’installation sur l’ordinateur de la galaxie.

<!-- problem: print -->

## L’impression ou le STL a échoué

**Vous voyez :** un message que l’export a échoué, ou l’attente ne finit pas.

<!-- step: print-wifi -->

1. Vérifiez le Wi-Fi sur la tablette de gestion.
   Touchez Imprimer ou STL de nouveau.
   Attendez une minute pour le STL.

<!-- step: print-save -->

2. S’il n’y a pas d’imprimante, enregistrez le PDF quand la tablette l’offre.
   Ouvrez ce PDF dans une application PDF et imprimez-le de là.

<!-- fix: print -->

> **Si cela ne fonctionne pas**
>
> Redémarrez l’application de gestion.
> Si la page du mur est aussi arrêtée, lancez d’abord `bash scripts/setup_room.sh`.

<!-- problem: slow -->

## Une planète est lente à apparaître

**Vous voyez :** la tablette dit que la planète est envoyée, mais le mur attend.

<!-- step: slow-wait -->

1. Attendez dix secondes.
   La première planète après un démarrage peut être lente.
   Vous devriez la voir arriver sans toucher de nouveau.

<!-- step: slow-reload -->

2. Rechargez la page de la galaxie sur l’ordinateur.
   Appuyez sur F5 dans Chrome.
   Vous devriez voir les planètes déjà enregistrées.

<!-- fix: slow -->

> **Si cela ne fonctionne pas**
>
> Ne touchez pas Lancer plusieurs fois.
> La salle demande à l’enfant d’attendre un moment entre les planètes.
> Vérifiez le Wi-Fi, puis essayez un seul autre lancement.

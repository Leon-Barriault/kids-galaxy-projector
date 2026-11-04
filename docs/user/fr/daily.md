# Utiliser Kids Galaxy chaque jour

Cette page est pour l’adulte qui ouvre la salle.
Les enfants peuvent faire les étapes de dessin.
Les étapes d’installation restent dans le guide d’installation.
Ouvrez Ubuntu, puis allez dans le dossier du projet, avant de coller une commande.

<!-- section: on -->

## Allumer la salle

Environ 10 minutes.

<!-- step: on-router -->

1. Branchez le routeur de voyage.

   **Ce que vous devez voir.** Un voyant Wi-Fi stable.

   **Sinon.** Vérifiez la prise ou la batterie externe.

<!-- step: on-wifi -->

2. Sur le PC, joignez `KidsGalaxy`.
   Ne joignez pas le Wi-Fi de la garderie.

   **Ce que vous devez voir.** Le nom du Wi-Fi est `KidsGalaxy`.

   **Sinon.** Oubliez les autres réseaux et joignez `KidsGalaxy` de nouveau.

<!-- step: on-docker -->

3. Quittez Docker Desktop si l’icône de baleine est visible.

   **Ce que vous devez voir.** L’icône de baleine a disparu.

   **Sinon.** La ligne d’installation de l’hôte s’arrête tant que vous ne le quittez pas.

<!-- step: on-ubuntu -->

4. Allumez le PC s’il est éteint.
   Ouvrez la session Windows.
   Ouvrez l’application Ubuntu.

   **Ce que vous devez voir.** Le nom `omega`.

   **Sinon.** Cliquez sur Démarrer, tapez Ubuntu, et ouvrez cette application.

<!-- step: on-folder -->

5. Collez cette ligne.

```bash
cd /home/omega/kids-galaxy-projector
```

   **Ce que vous devez voir.** Aucune erreur. `pwd` montre ce même dossier.

   **Sinon.** Collez la ligne de nouveau avant toute autre commande.

<!-- step: on-projector -->

6. Allumez le projecteur.
   Choisissez HDMI.

   **Ce que vous devez voir.** Le bureau Windows sur le mur.

   **Sinon.** Enfoncez la prise HDMI et appuyez sur le bouton source.

<!-- step: on-page -->

7. Si le ciel n’est pas affiché, collez cette ligne.

```bash
bash scripts/open_projector.sh
```

   **Ce que vous devez voir.** Le ciel sombre et les mots d’attente.
   Chrome s’ouvre dans Windows.

   **Sinon.** Dans Windows, ouvrez `http://127.0.0.1:8000/` et appuyez sur F11.

<!-- step: on-tablets -->

8. Réveillez les deux tablettes.

   **Ce que vous devez voir.** L’application de dessin sur la tablette enfant.
   Gestionnaire Kids Galaxy s’ouvre sur la tablette adulte.

   **Sinon.** Vérifiez que chaque tablette est sur `KidsGalaxy`.

<!-- fix: on -->

> **Si cela ne fonctionne pas**
>
> Allez dans le dossier du projet.
> Collez `bash scripts/setup_room.sh`.
> Puis ouvrez l’image de nouveau.
> Vérifiez le HDMI si le mur est encore sombre.

<!-- section: kid -->

## Mode enfant

La tablette enfant sert seulement à dessiner.
Les enfants ne devraient pas avoir besoin d’un mot de passe.

Conseil. Chaque enfant peut avoir 30 minutes de temps d’écran par jour. Comptez les autres écrans. C’est à vous de le suivre.

<!-- step: kid-open -->

1. Réveillez la tablette enfant.

   **Ce que vous devez voir.** Crée ta planète.

   **Sinon.** Le mode verrouillé est éteint. Utilisez le guide d’installation pour l’activer.

<!-- step: kid-draw -->

2. L’enfant touche une forme, dessine, et peut ajouter des amis de l’espace.
   Puis l’enfant touche Lancer.

   **Ce que vous devez voir.** La planète sur le mur.

   **Sinon.** Lisez le message sur la tablette.

<!-- fix: kid -->

> **Si cela ne fonctionne pas**
>
> Si la tablette ne trouve pas la galaxie, vérifiez le nom du Wi-Fi.
> Ce doit être `KidsGalaxy`.
> Utilisez la page de dépannage pour les autres correctifs.

<!-- section: manager -->

## Mode gestion

La tablette de gestion est pour les adultes.
C’est une application différente.
Elle n’est pas verrouillée.

<!-- step: manager-open -->

1. Ouvrez Gestionnaire Kids Galaxy.

   **Ce que vous devez voir.** La liste des planètes.
   Une liste vide veut dire qu’aucune planète n’a encore été lancée.

   **Sinon.** Réveillez la tablette et cherchez ce nom d’application.

<!-- step: manager-delete -->

2. Pour retirer une planète, touchez l’icône de suppression sur sa ligne.
   Lisez la question.
   Puis confirmez.

   **Ce que vous devez voir.** La planète quitte le mur.

   **Sinon.** Vous avez confirmé la question sur la tablette de gestion.

<!-- step: manager-clear -->

3. Pour retirer chaque planète, touchez Tout effacer.
   Confirmez seulement si vous le voulez vraiment.

   **Ce que vous devez voir.** Une liste vide.

   **Sinon.** Restez sur la tablette de gestion. L’application enfant ne peut pas effacer des planètes.

<!-- fix: manager -->

> **Si cela ne fonctionne pas**
>
> Utilisez la tablette de gestion.
> Les deux tablettes doivent être sur `KidsGalaxy` avec le PC.

<!-- section: language -->

## Changer la langue

Il y a deux langues.
L’anglais et le français du Canada.
Ce sont des choix séparés.

<!-- step: language-tablet -->

1. Sur la tablette de gestion, touchez EN / FR.

   **Ce que vous devez voir.** L’application se rouvre dans l’autre langue.
   Le choix reste jusqu’à ce que vous touchiez le bouton de nouveau.
   Sur la tablette enfant, maintenez EN / FR et répondez à la question de nombres.
   Lisez la page de la tablette enfant pour ce maintien.

   **Sinon.** Touchez EN / FR encore une fois.

<!-- step: language-wall -->

2. Ouvrez l’application de gestion.
   Trouvez Langue du projecteur.
   Touchez English ou Français.
   Sur le PC, rechargez la page de la galaxie.

   **Ce que vous devez voir.** Les nouveaux mots sur le mur.
   Le mur suit le choix de la gestion.

   **Sinon.** Rechargez Chrome. La page est `http://127.0.0.1:8000/` sur ce PC.

<!-- fix: language -->

> **Si cela ne fonctionne pas**
>
> Touchez EN / FR encore une fois.
> Si le mur n’a pas changé, rechargez Chrome.

<!-- section: project -->

## Projeter une planète

Environ 2 minutes.

<!-- step: project-ready -->

1. Vérifiez d’abord le mur.

   **Ce que vous devez voir.** Les mots d’attente ou d’anciennes planètes.

   **Sinon.** Ouvrez la page du mur avant que l’enfant touche Lancer.

<!-- step: project-launch -->

2. Sur la tablette enfant, finissez le dessin et touchez Lancer.

   **Ce que vous devez voir.** La nouvelle planète arrive.
   Un enfant peut lancer de nouveau après une courte attente.

   **Sinon.** Joignez `KidsGalaxy`, puis touchez Lancer encore une fois.

<!-- fix: project -->

> **Si cela ne fonctionne pas**
>
> Le mur peut rester sur l’ancien ciel si la tablette est sur le mauvais Wi-Fi.
> Joignez `KidsGalaxy`.
> Puis touchez Lancer de nouveau.

<!-- section: print -->

## Imprimer une planète

Environ 5 minutes.
Utilisez la tablette de gestion.
La tablette enfant ne peut pas imprimer.

<!-- step: print-open -->

1. Ouvrez Gestionnaire Kids Galaxy.
   Trouvez la planète voulue.
   Touchez Imprimer.

   **Ce que vous devez voir.** La boîte d’impression d’Android.

   **Sinon.** Restez sur la tablette de gestion et touchez Imprimer de nouveau.

<!-- step: print-send -->

2. Choisissez l’imprimante.
   Touchez le bouton d’impression dans cette boîte.

   **Ce que vous devez voir.** Une page avec la planète et le dessin de l’enfant.
   Si l’impression manque, la tablette offre une boîte d’enregistrement.
   Enregistrez le PDF et ouvrez-le dans une application PDF.

   **Sinon.** Enregistrez le PDF et imprimez-le depuis un autre appareil.

<!-- fix: print -->

> **Si cela ne fonctionne pas**
>
> Vérifiez que la tablette est sur `KidsGalaxy`.
> Essayez Imprimer de nouveau.

<!-- section: stl -->

## Enregistrer un fichier 3D

Environ 10 minutes.
Le fichier s’appelle STL.
Une imprimante 3D peut l’utiliser.
Le fichier est une planète ronde.
Les anneaux et les petits amis ne sont pas dans le fichier.

<!-- step: stl-tap -->

1. Sur la tablette de gestion, trouvez la planète.
   Touchez STL.

   **Ce que vous devez voir.** Un message d’attente.
   Cela peut prendre un petit moment.

   **Sinon.** Attendez une minute et touchez STL de nouveau.

<!-- step: stl-save -->

2. Quand la boîte d’enregistrement s’ouvre, choisissez un dossier.
   Touchez Enregistrer.

   **Ce que vous devez voir.** Un fichier qui finit par `.stl`.
   Copiez-le vers l’imprimante 3D sur une clé USB ou par l’application de l’imprimante.

   **Sinon.** Redémarrez l’application de gestion et essayez encore une fois.

<!-- fix: stl -->

> **Si cela ne fonctionne pas**
>
> Restez sur `KidsGalaxy`.
> Attendez une minute et touchez STL de nouveau.

<!-- section: off -->

## Rangement

Environ 5 minutes.
Les planètes restent enregistrées.
Les noms ne partent pas avec vous.

<!-- step: off-names -->

1. Sur la tablette de gestion, touchez Avant de partir.
   Cela efface les noms des planètes.
   Ces noms ne sont pas dans la copie de secours sur la clé USB.

   **Ce que vous devez voir.** Les noms des planètes ont disparu.

   **Sinon.** Restez sur la tablette de gestion et touchez Avant de partir de nouveau.

<!-- step: off-screen -->

2. Fermez la page du mur sur le PC.

   **Ce que vous devez voir.** Chrome est fermé, ou le ciel a disparu.

   **Sinon.** Appuyez sur F11, puis fermez Chrome.

<!-- step: off-computer -->

3. Éteignez Windows depuis le menu d’alimentation.

   **Ce que vous devez voir.** L’écran devient noir.

   **Sinon.** Ne tenez pas le bouton d’alimentation, sauf si le menu ne s’ouvre pas.

<!-- step: off-projector -->

4. Éteignez le projecteur avec son bouton d’alimentation.

   **Ce que vous devez voir.** Le mur devient sombre.

   **Sinon.** Appuyez encore une fois sur le bouton du projecteur.

<!-- step: off-router -->

5. Débranchez le routeur de voyage et la batterie externe.

   **Ce que vous devez voir.** Le voyant du routeur est éteint.

   **Sinon.** Suivez le cordon jusqu’au mur ou à la batterie.

<!-- step: off-tablets -->

6. Mettez les deux tablettes, les chargeurs, le routeur et la carte papier dans l’étui.

   **Ce que vous devez voir.** L’étui contient ces articles.
   Le mode verrouillé revient la prochaine fois que la tablette enfant démarre.

   **Sinon.** Laissez une note sur l’étui pour la pièce manquante.

<!-- fix: off -->

> **Si cela ne fonctionne pas**
>
> Pour arrêter le programme et laisser le PC allumé, ouvrez Ubuntu.
> Allez dans le dossier du projet.
> Collez la ligne suivante.

```bash
bash scripts/stop_room.sh
```

> Vous devriez voir `The galaxy program is stopped.`

<!-- section: shutdown -->

## Éteindre en sécurité

Les planètes restent enregistrées.
Les noms ne partent pas avec vous.

<!-- step: shutdown-names -->

1. Sur la tablette de gestion, touchez Avant de partir.
   Cela efface les noms des planètes.
   Ces noms ne sont pas dans la copie de secours sur la clé USB.
   Vous devriez voir les noms des planètes disparus.
   Sinon, restez sur la tablette de gestion et touchez Avant de partir de nouveau.

<!-- step: shutdown-stop -->

2. Vous pouvez éteindre Windows depuis le menu d’alimentation.
   Les planètes restent sur le disque.
   Le programme peut repartir la prochaine fois que vous ouvrez la session.

   **Ce que vous devez voir.** Le PC s’éteint.

   **Sinon.** Attendez le menu. Ne tirez pas sur le cordon.

<!-- step: shutdown-script -->

3. Si vous devez d’abord arrêter le programme, collez cette ligne dans le dossier du projet.

```bash
bash scripts/stop_room.sh
```

   **Ce que vous devez voir.** `The galaxy program is stopped.`
   Puis utilisez le menu d’alimentation.

   **Sinon.** Lisez les dernières lignes. Elles disent ce qui tourne encore.

<!-- fix: shutdown -->

> **Si cela ne fonctionne pas**
>
> Ne tirez pas sur le cordon pendant que le PC est encore allumé.
> Attendez le menu, ou demandez de l’aide.
> Tirer le cordon peut ralentir le prochain démarrage.

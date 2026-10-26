# Utiliser Kids Galaxy chaque jour

Cette page est pour l’adulte qui ouvre la salle.
Les enfants peuvent faire les étapes de dessin.
Les étapes d’installation restent dans le guide d’installation.

<!-- section: on -->

## Allumer la salle

Environ 5 minutes.

<!-- step: on-computer -->

1. Allumez l’ordinateur de la galaxie.
   Attendez de voir le bureau.
   Le programme de la galaxie démarre tout seul.

<!-- step: on-projector -->

2. Allumez le projecteur.
   Choisissez la source HDMI.
   Vous devriez voir l’écran de l’ordinateur sur le mur.

<!-- step: on-page -->

3. Si le ciel n’est pas affiché, ouvrez Terminal et collez cette ligne.

```bash
bash scripts/open_projector.sh
```

   Appuyez sur F11 si vous voulez que l’image remplisse l’écran.
   Vous devriez voir le ciel sombre et les mots d’attente.

<!-- step: on-tablets -->

4. Réveillez les deux tablettes.
   Vous devriez voir l’application de dessin sur la tablette enfant.
   Ouvrez Gestionnaire Kids Galaxy sur la tablette adulte.

<!-- fix: on -->

> **Si cela ne fonctionne pas**
>
> Lancez `bash scripts/setup_room.sh` sur l’ordinateur.
> Puis ouvrez l’image de nouveau.
> Vérifiez le câble HDMI si le mur est encore sombre.

<!-- section: off -->

## Éteindre la salle

Environ 3 minutes.
Les planètes restent enregistrées.

<!-- step: off-screen -->

1. Appuyez sur F11 si vous voulez quitter le plein écran.
   Vous n’avez pas besoin de fermer Chrome.

<!-- step: off-computer -->

2. Éteignez l’ordinateur depuis le menu d’alimentation.
   Attendez que l’écran soit noir.
   Ne gardez pas le bouton enfoncé, sauf si le menu ne s’ouvre pas.

<!-- step: off-projector -->

3. Éteignez le projecteur avec son bouton d’alimentation.
   Vous devriez voir le mur devenir sombre.

<!-- step: off-tablets -->

4. Laissez les tablettes dormir, ou gardez le bouton enfoncé et touchez Éteindre.
   Le mode verrouillé revient au prochain démarrage de la tablette enfant.

<!-- fix: off -->

> **Si cela ne fonctionne pas**
>
> Pour arrêter le programme et laisser l’ordinateur allumé, collez cette ligne.

```bash
bash scripts/stop_room.sh
```

> Vous devriez voir `The galaxy program is stopped.`

<!-- section: kid -->

## Mode enfant

La tablette enfant sert seulement à dessiner.
Les enfants ne devraient pas avoir besoin d’un mot de passe.

<!-- step: kid-open -->

1. Réveillez la tablette enfant.
   Vous devriez voir Crée ta planète.
   Si vous voyez une autre application, le mode verrouillé n’est pas actif.
   Utilisez le guide d’installation pour l’activer.

<!-- step: kid-draw -->

2. L’enfant touche une forme, dessine et peut ajouter des amis de l’espace.
   Puis l’enfant touche Lancer.
   Vous devriez voir la planète sur le mur.

<!-- fix: kid -->

> **Si cela ne fonctionne pas**
>
> Lisez le message sur la tablette.
> Si elle ne trouve pas la galaxie, vérifiez le Wi-Fi.
> Utilisez la page de dépannage pour les correctifs exacts.

<!-- section: manager -->

## Mode gestion

La tablette de gestion est pour les adultes.
C’est une application différente.
Elle n’est pas verrouillée.

<!-- step: manager-open -->

1. Ouvrez Gestionnaire Kids Galaxy.
   Vous devriez voir la liste des planètes.
   Si la liste est vide, aucune planète n’a encore été lancée.

<!-- step: manager-delete -->

2. Pour retirer une planète, touchez l’icône de suppression sur sa ligne.
   Lisez la question. Puis confirmez.
   La planète devrait quitter le mur.

<!-- step: manager-clear -->

3. Pour retirer toutes les planètes, touchez Tout effacer.
   Confirmez seulement si vous le voulez vraiment.
   Vous devriez voir une liste vide.

<!-- fix: manager -->

> **Si cela ne fonctionne pas**
>
> L’application enfant ne peut pas effacer les planètes. C’est normal.
> Utilisez la tablette de gestion.
> Les deux tablettes doivent être sur le même Wi-Fi que l’ordinateur.

<!-- section: language -->

## Changer la langue

Il y a deux langues.
L’anglais et le français canadien.
Ce sont deux choix séparés.

<!-- step: language-tablet -->

1. Sur une tablette, touchez EN / FR.
   L’application se ferme et s’ouvre dans l’autre langue.
   Vous devriez voir les mots français, ou les mots anglais, tout de suite.
   Le choix reste jusqu’à ce que vous touchiez le bouton de nouveau.

<!-- step: language-wall -->

2. Le mur a son propre choix.
   Ouvrez l’application de gestion.
   Trouvez Langue du projecteur.
   Touchez English ou Français.
   Sur l’ordinateur, rechargez la page de la galaxie.
   Vous devriez voir les nouveaux mots sur le mur.
   Deux tablettes enfant peuvent utiliser des langues différentes.
   Le mur suit le choix de la gestion.

<!-- fix: language -->

> **Si cela ne fonctionne pas**
>
> Touchez EN / FR encore une fois.
> Si le mur n’a pas changé, rechargez Chrome.
> L’adresse de la page est `http ://127.0.0.1:8000/` sur l’ordinateur de la galaxie.

<!-- section: project -->

## Projeter une planète

Environ 2 minutes.

<!-- step: project-ready -->

1. Vérifiez d’abord le mur.
   Vous devriez voir les mots d’attente ou d’anciennes planètes.

<!-- step: project-launch -->

2. Sur la tablette enfant, finissez le dessin et touchez Lancer.
   Regardez le mur.
   Vous devriez voir la nouvelle planète arriver.
   Un enfant peut lancer de nouveau après une courte attente.

<!-- fix: project -->

> **Si cela ne fonctionne pas**
>
> Le mur peut rester sur l’ancien ciel si la tablette est sur le mauvais Wi-Fi.
> Joignez le même Wi-Fi que l’ordinateur.
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
   Vous devriez voir la boîte d’impression d’Android.

<!-- step: print-send -->

2. Choisissez l’imprimante.
   Touchez le bouton d’impression dans cette boîte.
   Vous devriez obtenir une page avec la planète et le dessin de l’enfant.
   S’il n’y a pas d’impression, la tablette offre une boîte d’enregistrement.
   Enregistrez le PDF et ouvrez-le dans une application PDF.

<!-- fix: print -->

> **Si cela ne fonctionne pas**
>
> Vérifiez le Wi-Fi.
> Touchez Imprimer de nouveau.
> Si la tablette n’a pas d’imprimante, enregistrez le PDF et imprimez-le ailleurs.

<!-- section: stl -->

## Enregistrer un fichier 3D

Environ 10 minutes.
Le fichier s’appelle STL.
Une imprimante 3D peut l’utiliser.
Le fichier est une seule planète ronde.
Les anneaux et les petits amis n’y sont pas.

<!-- step: stl-tap -->

1. Sur la tablette de gestion, trouvez la planète.
   Touchez STL.
   Vous devriez voir un message d’attente.
   Cela peut prendre un petit moment.

<!-- step: stl-save -->

2. Quand la boîte d’enregistrement s’ouvre, choisissez un dossier.
   Touchez Enregistrer.
   Vous devriez voir un fichier qui finit par `.stl`.
   Copiez-le vers l’imprimante 3D sur une clé USB ou par son application.

<!-- fix: stl -->

> **Si cela ne fonctionne pas**
>
> Attendez une minute et touchez STL de nouveau.
> Restez sur le même Wi-Fi.
> Si cela échoue encore, redémarrez l’application de gestion et réessayez.

<!-- section: shutdown -->

## Éteindre en sécurité

<!-- step: shutdown-stop -->

1. Vous pouvez éteindre l’ordinateur depuis le menu d’alimentation.
   Les planètes restent sur le disque.
   Le programme repart la prochaine fois que l’ordinateur s’allume.

<!-- step: shutdown-script -->

2. Si vous devez d’abord arrêter le programme, collez cette ligne.

```bash
bash scripts/stop_room.sh
```

   Vous devriez voir `The galaxy program is stopped.`
   Puis utilisez le menu d’alimentation.

<!-- fix: shutdown -->

> **Si cela ne fonctionne pas**
>
> Ne tirez pas sur le cordon pendant que l’ordinateur est encore allumé.
> Attendez le menu, ou demandez de l’aide.
> Tirer le cordon peut rendre le prochain démarrage plus lent.

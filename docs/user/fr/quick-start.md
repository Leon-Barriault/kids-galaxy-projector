# Fiche du jour Kids Galaxy

Gardez cette page à la garderie. Le guide de tous les jours a les étapes complètes.

<!-- section: arrive -->

## Arrivée

<!-- step: arrive-router -->

1. Branchez le routeur de voyage. Vous devriez voir un voyant Wi-Fi stable.

<!-- step: arrive-wifi -->

2. Sur le PC, joignez `KidsGalaxy`. Ne joignez pas le Wi-Fi de la garderie. Vous devriez voir ce nom.

<!-- step: arrive-pc -->

3. Allumez le PC et ouvrez la session Windows. Vous devriez voir le bureau.

<!-- section: setup -->

## Installation

<!-- step: setup-docker -->

1. Quittez Docker Desktop si vous voyez l’icône de baleine. Vous devriez voir l’icône disparue.

<!-- step: setup-ubuntu -->

2. Ouvrez l’application Ubuntu. Vous devriez voir le nom `omega`.

<!-- step: setup-folder -->

3. Collez `cd /home/omega/kids-galaxy-projector`. Vous ne devriez voir aucune erreur.

<!-- step: setup-projector -->

4. Allumez le projecteur et choisissez HDMI. Vous devriez voir le PC sur le mur.

<!-- step: setup-wall -->

5. Collez `bash scripts/open_projector.sh`. Vous devriez voir le ciel sombre.

<!-- section: test -->

## Essai

<!-- step: test-tablet -->

1. Réveillez la tablette enfant. Vous devriez voir l’application de dessin sur `KidsGalaxy`.

<!-- step: test-launch -->

2. Tracez une petite marque et touchez Lancer. Vous devriez voir la marque sur la tablette.

<!-- step: test-wall -->

3. Regardez le mur. Vous devriez voir la nouvelle planète.

<!-- section: pack -->

## Rangement

<!-- step: pack-names -->

1. Sur la tablette de gestion, touchez Avant de partir. Vous devriez voir les noms des planètes effacés.

<!-- step: pack-pc -->

2. Éteignez Windows depuis le menu d’alimentation. Vous devriez voir le PC s’éteindre.

<!-- step: pack-gear -->

3. Éteignez le projecteur et débranchez le routeur. Rangez le routeur, la carte papier, les deux tablettes et les chargeurs. Vous devriez voir ces articles dans l’étui.

<!-- section: stuck -->

## Si vous êtes bloqué

<!-- step: stuck-router -->

1. Si le voyant du routeur est éteint, vérifiez la prise. Vous devriez voir le voyant Wi-Fi.

<!-- step: stuck-docker -->

2. Si l’installation s’arrête parce que Docker Desktop tourne, quittez-le et relancez la ligne. Vous devriez voir le message d’installation.

<!-- step: stuck-address -->

3. Si l’installation s’arrête parce que le PC n’est pas à `192.168.0.52`, joignez `KidsGalaxy`. Ne changez pas l’adresse des tablettes. Vous devriez voir `192.168.0.52`.

<!-- step: stuck-find -->

4. Si la tablette ne trouve pas la salle, joignez aussi `KidsGalaxy` sur la tablette. Vous devriez voir le même nom Wi-Fi que le PC.

<!-- fix: stuck -->

> **Si cela ne fonctionne pas**
>
> Dans Ubuntu, allez dans le dossier du projet.
> Collez `bash scripts/setup_room.sh`.
> Puis ouvrez le mur de nouveau.

<!-- section: first-checks -->

## Première fois sur une nouvelle tablette ou après une mise à jour

Ces vérifications ne sont pas faites. Personne ne les a encore faites sur le vrai PC ou la vraie tablette. Laissez chaque case vide jusqu’à ce que vous voyiez le résultat vous-même.

<!-- step: check-lock -->

- [ ] Le verrou enfant tient. Un enfant ne peut pas quitter l’application de dessin. Vous devriez voir Accueil rester dans l’application.

<!-- step: check-boot -->

- [ ] Redémarrez la tablette. Vous devriez voir l’application de dessin s’ouvrir toute seule.

<!-- step: check-secure -->

- [ ] La tablette rejoint l’adresse sécurisée sur le port `8443`. Vous ne devriez voir aucun avertissement de certificat. L’adresse est `https://192.168.0.52:8443`.

<!-- step: check-scripts -->

- [ ] Dans Windows PowerShell, lancez le script d’installation, le script de mise à jour et le script d’arrêt. Vous ne devriez voir aucune erreur en rouge. Ces scripts sont `setup_room.sh`, `update_room.sh` et `stop_room.sh`.

<!-- step: check-planet -->

- [ ] Après une mise à jour, ou un arrêt puis un démarrage, envoyez une planète. Vous devriez la voir sur le mur en environ 15 secondes. Sinon, rechargez la page du mur. Une reconnexion automatique n’est pas encore là. Ce correctif arrive à part.

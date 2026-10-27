# Projecteur Kids Galaxy 🌍🚀

Système pour les enfants : ils dessinent une planète sur une tablette Android et la voient apparaître en direct dans une galaxie 3D projetée, servie par l’application serveur et affichée dans un navigateur sur la machine du projecteur.

**Parents, personnel enseignant et personnel de la garderie, commencez ici.** Ces pages utilisent des étapes courtes et des mots simples. Les notes des programmeurs restent dans ce fichier et dans [DEVELOPMENT.md](DEVELOPMENT.md).

- [Installer la salle](docs/user/fr/install.md)
- [Mise en production](docs/user/fr/production-setup.md)
- [La tablette enfant](docs/user/fr/kid-tablet.md)
- [Chaque jour](docs/user/fr/daily.md)
- [Quand quelque chose ne va pas](docs/user/fr/troubleshooting.md)
- [Fiche d’une page](docs/user/fr/quick-start.md) ([PDF](docs/user/fr/quick-start.pdf))

**Version anglaise** : [README.md](README.md)

**Âge visé** : 4 à 10 ans  
**Matériel** : tablette Android (kiosque / application unique) + ordinateur portable ou de bureau avec GPU moderne + projecteur HDMI/DisplayPort  
**Réseau** : local seulement  
**Authentification** : certificats (mTLS) — aucun mot de passe, aucun compte, aucun jeton pendant l’utilisation

Le côté serveur est indépendant de la plateforme. Le dossier `pi-server/` est un chemin historique conservé pour les scripts et l’outillage. Il ne décrit pas la machine de déploiement.

**Dépôt** : https://github.com/Leon-Barriault/kids-galaxy-projector

---

## Langues

L’application tablette (dessin et gestion), la page du projecteur et les messages du serveur existent en **anglais** et en **français canadien**.

- Au premier lancement, la tablette suit la langue de l’appareil. Un appareil en `fr` ou `fr-CA` s’ouvre en français.
- Le bouton **EN / FR** enregistre le choix et le conserve.
- Les appels API envoient ce choix dans `Accept-Language`, donc les messages d’erreur du serveur suivent la tablette.
- La langue affichée sur le projecteur partagé se règle dans l’application de gestion, afin qu’une salle garde un seul ciel.

Les chaînes françaises utilisent une espace insécable avant `:` `?` `!`. `make i18n` (inclus dans `make verify`) échoue si une clé manque, est en trop, ou si cette typographie est incorrecte.

---

## Obtenir le code

```bash
git clone https://github.com/Leon-Barriault/kids-galaxy-projector.git
cd kids-galaxy-projector
```

On peut aussi télécharger l’archive ZIP depuis la page GitHub du dépôt.

---

## Structure

```
kids-galaxy-projector/
├── android/          # Applications tablette (Kotlin + Compose)
├── pi-server/        # Serveur FastAPI + page Three.js
├── scripts/          # Vérifications du projecteur et du réseau
├── docs/             # Revue de préparation à la publication
├── Makefile          # make verify reproduit les portes de la CI
└── DEVELOPMENT.md    # Développement local, certificats, kiosque
```

Voir [ARCHITECTURE.md](ARCHITECTURE.md), [DEVELOPMENT.md](DEVELOPMENT.md) et [BRANCHING.md](BRANCHING.md). Le journal en préparation est [UNRELEASED.md](UNRELEASED.md).

---

## 1. Développement local

```bash
docker compose up --build
# → http://localhost:8000
```

```bash
make install-dev
make test-unit
make test-integration
make test-android
make i18n
make verify
```

---

## 2. Déploiement sur le terrain

Relier la machine du projecteur et les tablettes au même réseau local privé. L’application ne dépend pas d’Internet. Three.js est fourni dans le dépôt.

Le déploiement sécurisé passe par la passerelle nginx mTLS de [docker-compose.secure.yml](docker-compose.secure.yml). La passerelle vérifie le certificat client, déduit le rôle `kid` ou `manager` de l’OU du certificat, et transmet ce rôle à FastAPI en boucle locale. Lancer uvicorn directement en TLS sur une interface publique n’applique pas ces contrôles de rôle. Les détails sont dans [DEVELOPMENT.md](DEVELOPMENT.md).

Pour un essai sans mTLS :

```bash
cd pi-server
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Ouvrir la page du projecteur en plein écran dans Chromium ou Chrome. Le profil visuel par défaut est `laptop-high`.

---

## 3. Certificats (mTLS)

```bash
cd pi-server/certs && SERVER_IP=<ADRESSE_IP_LOCALE> ./generate_certs.sh
```

Le certificat du serveur doit contenir un `subjectAltName` pour l’adresse IP : Android ne se fie pas au seul nom commun.

```bash
mkdir -p android/app/src/main/assets android/manager/src/main/assets
cp pi-server/certs/client.p12 pi-server/certs/ca.crt android/app/src/main/assets/
cp pi-server/certs/manager.p12 pi-server/certs/ca.crt android/manager/src/main/assets/
```

Ces fichiers sont ignorés par Git et ne doivent jamais être commités. Les constructions de publication utilisent HTTPS et mTLS. Les constructions de débogage utilisent HTTP en clair, uniquement pour le laboratoire.

---

## 4. Application Android (kiosque)

1. Ouvrir `android/` dans Android Studio.
2. Construire et installer.
3. Pour le mode application unique (propriétaire de l’appareil) :

```bash
adb shell dpm set-device-owner com.kidsgalaxy/.DeviceAdminReceiver
```

Lorsque l’application de dessin est propriétaire de l’appareil, elle entre elle-même en mode verrouillé (Lock Task) et masque les barres système. Une installation de débogage ordinaire n’est pas épinglée.

---

## 5. Sécurité

- Taille d’envoi rejetée avant la mise en mémoire du corps
- Validation des octets magiques, puis réencodage avec Pillow
- Noms de fichiers assainis et stockage par identifiant ; le nom affiché reste dans les métadonnées
- Protection contre la traversée de chemin
- Limite de débit par client
- mTLS avec rôles dérivés du certificat, via la passerelle locale
- Les constructions de publication refusent le HTTP en clair ; le débogage l’autorise pour le banc d’essai
- Réseau local seulement

L’impression et l’export STL sont exposés par l’application de gestion. Ces deux actions non destructives ne sont pas verrouillées par un rôle côté serveur : la séparation des applications est la frontière choisie. La suppression et le vidage de la galerie restent protégés par le rôle gestionnaire quand l’autorisation est activée.

---

## 6. Branches et publications

Le cycle est un GitFlow léger : travail court → `develop` → `release/x.y.z` → `main`, avec des étiquettes sur `main`. Voir [BRANCHING.md](BRANCHING.md).

---

## Licence

Projecteur Kids Galaxy utilise une **double licence à source disponible**.

| Usage | Licence |
|-----|---------|
| Usage personnel ou hobby | Permis par la [licence source non commerciale](LICENSE) |
| Éducation et recherche non commerciale | Permis par la [licence source non commerciale](LICENSE) |
| Évaluation d’affaires / preuve de concept | Permis si ce n’est pas un usage de production ni un service payant |
| Usage de production dans une entreprise | **Licence commerciale requise** |
| Produit, installation, événement ou service payant | **Licence commerciale requise** |
| Service commercial hébergé | **Licence commerciale requise** |
| Intégration OEM, redistribution, revente ou changement de marque | **Licence commerciale requise** |

Voir [LICENSE](LICENSE) et [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).

Les versions déjà distribuées sous la licence MIT restent soumises aux conditions MIT de ces copies.

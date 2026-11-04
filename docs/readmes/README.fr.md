<!-- Generated from docs/readmes/content.json by npm run docs:readme. -->
<div align="center">
<a id="readme-top"></a>

<img src="../../docs/assets/readfinch-banner.png" alt="ReadFinch · 伴读雀 — A little help, right beside your words." width="1280">

# ReadFinch · 伴读雀

**Un compagnon de lecture, juste à côté de vos mots.**

ReadFinch est une application de bureau open source dédiée à la lecture et à l’écriture. Traduisez une sélection, consultez un mot, améliorez un texte et enregistrez des notes depuis vos applications. L’OCR permet de récupérer le texte que vous ne pouvez pas sélectionner.

<p><a href="../../README.md">English</a> · <a href="../../docs/readmes/README.zh-CN.md">简体中文</a> · <a href="../../docs/readmes/README.zh-TW.md">繁體中文</a> · <a href="../../docs/readmes/README.ja.md">日本語</a> · <a href="../../docs/readmes/README.ko.md">한국어</a> · <strong>Français</strong> · <a href="../../docs/readmes/README.de.md">Deutsch</a> · <a href="../../docs/readmes/README.es.md">Español</a></p>

<p>
<a href="../../LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-4d443e?style=flat-square" alt="GPL-3.0-only"></a>
<img src="https://img.shields.io/badge/Version-1.2.0-4d443e?style=flat-square" alt="1.2.0">
<img src="https://img.shields.io/badge/AI-Bring_your_own_provider-74675d?style=flat-square" alt="Bring your own AI provider">
</p>

[Télécharger la dernière version](https://github.com/0xlane/ReadFinch/releases/latest) · [Bien démarrer](#get-started) · [Fonctionnalités](#features) · [Documentation](#documentation) · [Signaler un problème](https://github.com/0xlane/ReadFinch/issues)

</div>

## Gardez le fil de votre lecture

Sélectionnez du texte dans un navigateur, un lecteur PDF ou un éditeur. ReadFinch affiche une petite barre d’outils près du curseur, puis la réponse à côté du texte d’origine. Épinglez un résultat pour comparer ou conservez un mot utile pour plus tard.

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/reading-en-dark.png">
  <img src="../../docs/assets/reading-en-light.png" width="640" alt="ReadFinch affiche un passage sélectionné, sa traduction progressive et des mots proposés pour un carnet local.">
</picture>
<br><em>Sélectionner → comprendre → conserver. Du texte inconnu à des connaissances réutilisables.</em>
</p>

<a id="features"></a>

## Fonctionnalités

| Votre besoin | L’aide de ReadFinch |
| --- | --- |
| **Lire et comprendre** | Suivez la traduction à mesure qu’elle s’affiche, consultez la prononciation et les exemples, et décomposez les phrases longues. |
| **Mieux écrire** | Repérez les modifications dans le texte d’origine, comprenez leur raison et reprenez la version améliorée dans votre éditeur. |
| **Lire du texte non sélectionnable** | Capturez une zone de l’écran ou importez une image pour en extraire le texte, puis traduisez-le, consultez le dictionnaire ou lancez une commande personnalisée. |
| **Écouter en lisant** | Écoutez sélections, traductions et exemples avec les voix système hors ligne ou la synthèse vocale en ligne. Choisissez et essayez une voix par langue ; les réglages de lecture dépendent du service vocal. |
| **Créer vos commandes IA** | Définissez le fournisseur, les prompts, l’icône, le raccourci et les champs de sortie typés. Composez les cartes avec HTML + Liquid et associez les champs à un carnet local. |
| **Garder l’essentiel** | Enregistrez un résultat ou acceptez une suggestion de vocabulaire. Recherchez dans vos carnets locaux et retrouvez le passage d’origine avec la réponse enregistrée. |

<details>
<summary><strong>Découvrir les commandes et les carnets</strong></summary>

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/commands-en-dark.png">
  <img src="../../docs/assets/commands-en-light.png" width="860" alt="Réglages de mise en page d’une commande IA personnalisée, avec aperçu d’une fiche de dictionnaire.">
</picture>
<br><em>Transformez les réponses structurées en fiches lisibles. Vérifiez la mise en page à différentes largeurs, en mode clair ou sombre.</em>
</p>

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/notebook-en-dark.png">
  <img src="../../docs/assets/notebook-en-light.png" width="860" alt="Carnet local ReadFinch affichant du vocabulaire enregistré et son texte d’origine.">
</picture>
<br><em>Gardez vos découvertes à portée de main pour les retrouver et les relire.</em>
</p>

</details>

### Un fournisseur pour chaque fonction

Connectez votre propre compte API grâce aux préréglages OpenAI, Anthropic, Gemini, DeepSeek, Azure, Amazon Bedrock, OpenRouter et d’autres, ou ajoutez une API compatible Chat Completions ou Responses. Les services de traduction spécialisés sont également pris en charge. Chaque entrée de fournisseur IA utilise un modèle ; dupliquez-la pour en utiliser un autre. Affectez des fournisseurs distincts à la traduction, au dictionnaire, à la rédaction, à l’OCR, à la détection de langue et à la synthèse vocale en ligne. Selon le service, vous disposez de suggestions de modèles, de tests de connexion, de la température, d’en-têtes personnalisés et d’un proxy par fournisseur.

### Langues

Huit langues prédéfinies sont proposées pour les traductions et les explications :

**English · 简体中文 · 繁體中文 · 日本語 · 한국어 · Français · Deutsch · Español**

L’**interface est disponible en anglais et en chinois simplifié** et suit par défaut la langue du système. La langue de l’interface et celle des résultats se règlent séparément. La qualité des traductions et les langues couvertes dépendent du fournisseur et du modèle choisis.

<a id="get-started"></a>

## Bien démarrer

**[Télécharger la dernière version](https://github.com/0xlane/ReadFinch/releases/latest)**

Choisissez le paquet adapté à votre système dans la dernière version publiée. Aucun outil de développement n’est nécessaire pour utiliser l’application précompilée.

| Système | Paquet |
| --- | --- |
| Windows x64 | `*-setup.exe` pour installer, ou `*-portable.exe` pour utiliser la version sans installation. |
| macOS | `arm64` pour les puces Apple ou `x64` pour Intel ; formats `.dmg` et `.zip`. |
| Linux x64 | `.AppImage` pour une exécution directe, ou `amd64.deb` pour Debian et Ubuntu. |

La recherche automatique de mises à jour est activée par défaut. Vous pouvez la régler ou lancer une recherche manuelle dans About. Les installations Windows et les AppImages Linux peuvent appliquer une mise à jour téléchargée à la fermeture ; les versions portables Windows, macOS et les paquets DEB Linux nécessitent une installation manuelle.

### Premiers pas

1. **Connectez un fournisseur.** Dans API Providers, choisissez un préréglage ou une API compatible, renseignez les identifiants nécessaires et le modèle, puis testez la connexion. Affectez-le par défaut ou à une fonction précise.
2. **Sélectionnez une phrase.** Cliquez sur Translate dans la barre d’outils, choisissez la langue cible et épinglez le résultat pour continuer à lire en parallèle.
3. **Récupérez du texte dans une image.** Utilisez le raccourci OCR ci-dessous pour sélectionner une zone, vérifiez le texte reconnu, puis choisissez une commande.

### Raccourcis utiles

| Commande | Windows / Linux | macOS |
| --- | --- | --- |
| Traduire la sélection | `Alt + T` | `Option + T` |
| Ouvrir le dictionnaire | `Alt + Shift + D` | `Option + Shift + D` |
| Améliorer la rédaction | `Alt + Shift + W` | `Option + Shift + W` |
| Choisir une commande | `Ctrl + Shift + Space` | `Command + Shift + Space` |
| Capturer du texte par OCR | `Ctrl + Shift + 2` | `Command + Shift + 2` |
| Lire le presse-papiers | `Ctrl + Shift + V` | `Command + Shift + V` |

Les raccourcis sont modifiables sur une page dédiée. Les réglages sont enregistrés automatiquement ; l’apparence suit le système ou votre choix clair/sombre. Le démarrage à la connexion est désactivé par défaut et se règle depuis le menu de la zone de notification.

### Plateformes prises en charge

| Plateforme | Acquisition du texte |
| --- | --- |
| Windows | Lit les sélections exposées par l’application au premier plan via UI Automation. |
| macOS | L’accès au texte sélectionné nécessite l’autorisation Accessibilité ; les captures nécessitent l’autorisation Enregistrement de l’écran. |
| Linux | Utilise la sélection PRIMARY sous X11 (`xclip`, `xdotool`, `xprop`). Sous Wayland, utilise le presse-papiers ou le portail de capture du bureau ; les raccourcis dépendent de l’environnement. |

La détection automatique dépend de l’accès au texte sélectionné fourni par l’application active. Sinon, utilisez l’OCR ou le presse-papiers. Les autorisations, limites et validations par plateforme figurent dans la [matrice de prise en charge](../../docs/PLATFORMS.md).

## Données et confidentialité

**Sur votre appareil.** Le contenu des carnets reste sur votre appareil. L’OCR intégré traite les images localement et les voix système hors ligne ne nécessitent pas de service vocal en ligne.

**Les requêtes vont au fournisseur choisi.** La traduction et les commandes IA envoient le texte nécessaire à la requête ; la synthèse vocale en ligne envoie le texte à lire. L’OCR en ligne transmet la zone capturée ou l’image importée au fournisseur de vision sélectionné. Les comptes, la disponibilité et les frais d’utilisation relèvent de chaque service.

**Des réglages transférables.** Importez ou exportez un fichier, ou synchronisez manuellement la configuration par WebDAV. Fournisseurs, commandes, raccourcis et correspondances des champs de carnet sont transférés ensemble. Les clés API et les en-têtes personnalisés restent propres à chaque appareil. Le contenu des carnets n’est pas inclus dans la synchronisation des réglages.

<a id="documentation"></a>

## Documentation

- [Architecture et organisation du code](../../docs/ARCHITECTURE.md)
- [Fournisseurs, modèles et affectation des fonctions](../../docs/MODELS.md)
- [Reconnaissance de texte dans les captures et images (OCR)](../../docs/OCR.md)
- [Configuration et WebDAV](../../docs/CONFIGURATION.md)
- [Plateformes et autorisations](../../docs/PLATFORMS.md)
- [Langues de l’interface et de traduction](../../docs/LANGUAGES.md)
- [Versions et mises à jour de l’application](../../docs/UPDATES.md)

La documentation technique est disponible en chinois ou en anglais.

## Contribuer

Les rapports de bugs reproductibles, suggestions d’ergonomie, corrections de traduction et pull requests sont les bienvenus. Indiquez votre système et la version de l’application, et retirez les identifiants et textes privés de vos exemples. [Ouvrir un ticket](https://github.com/0xlane/ReadFinch/issues) · [Contribuer au code](https://github.com/0xlane/ReadFinch/pulls).

### Compiler depuis les sources

Pour compiler localement, installez **Node.js 24**, npm et Git. Sous Windows, le compilateur C# de .NET Framework 4.8 est nécessaire ; sous macOS, installez les outils de ligne de commande Xcode.

```sh
git clone https://github.com/0xlane/ReadFinch.git
cd ReadFinch
npm ci
npm run assets:ocr
npm run build
npm start
```

`assets:ocr` télécharge les données de reconnaissance **pendant la préparation du développement**. Elles sont incluses dans l’application : aucune langue n’est à télécharger après l’installation. Exécutez `npm run dist` sur le système cible pour créer les paquets dans `release/`.

```sh
npm run typecheck
npm test
npm run build
```

Les textes du README se trouvent dans `docs/readmes/content.json`. Après une modification, lancez `npm run docs:readme` : le générateur vérifie que les traductions couvrent les langues cibles de l’application.

## Licence et remerciements

ReadFinch est distribué sous licence **GPL-3.0-only**. Les interactions de la barre de sélection et des cartes de commande s’inspirent de **Read Frog**. ReadFinch est un projet de bureau indépendant, pas une version officielle de Read Frog.

[GPL-3.0-only](../../LICENSE) · [Read Frog](https://github.com/mengxi-ream/read-frog) · [Mentions des composants tiers](../../THIRD_PARTY_NOTICES.md)

<div align="right">

[↑ Retour en haut](#readme-top)

</div>

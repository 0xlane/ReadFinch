<!-- Generated from docs/readmes/content.json by npm run docs:readme. -->
<div align="center">
<a id="readme-top"></a>

<img src="../../docs/assets/readfinch-banner.png" alt="ReadFinch · 伴读雀 — A little help, right beside your words." width="1280">

# ReadFinch · 伴读雀

**Un compagnon de lecture, juste à côté de vos mots.**

Traduisez un passage, comprenez une phrase difficile ou améliorez votre rédaction, sans quitter l’application que vous utilisez.

A desktop reading and writing companion. · 随选随用的桌面阅读与写作助手。

<p><a href="../../README.md">English</a> · <a href="../../docs/readmes/README.zh-CN.md">简体中文</a> · <a href="../../docs/readmes/README.zh-TW.md">繁體中文</a> · <a href="../../docs/readmes/README.ja.md">日本語</a> · <a href="../../docs/readmes/README.ko.md">한국어</a> · <strong>Français</strong> · <a href="../../docs/readmes/README.de.md">Deutsch</a> · <a href="../../docs/readmes/README.es.md">Español</a></p>

<p>
<a href="../../LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-4d443e?style=flat-square" alt="GPL-3.0-only"></a>
<img src="https://img.shields.io/badge/Version-0.12.1-4d443e?style=flat-square" alt="0.12.1">
<img src="https://img.shields.io/badge/Offline_OCR-中文_+_English-a9643f?style=flat-square" alt="Offline OCR: Simplified Chinese and English">
<img src="https://img.shields.io/badge/AI-Bring_your_own_provider-74675d?style=flat-square" alt="Bring your own AI provider">
</p>

[Bien démarrer](#get-started) · [Fonctionnalités](#features) · [Documentation](#documentation) · [Signaler un problème](https://github.com/0xlane/ReadFinch/issues)

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

## Un coup de main là où se trouve votre texte

| Votre besoin | L’aide de ReadFinch |
| --- | --- |
| **Lire et comprendre** | Suivez la traduction à mesure qu’elle s’affiche, consultez la prononciation et les exemples, et décomposez les phrases longues. |
| **Mieux écrire** | Repérez les modifications dans le texte d’origine, comprenez leur raison et reprenez la version améliorée dans votre éditeur. |
| **Lire du texte non sélectionnable** | Capturez une zone de l’écran ou importez une image. L’OCR intégré reconnaît le chinois simplifié et l’anglais hors ligne. Vérifiez le texte avant de lancer une commande. |
| **Écouter en lisant** | Faites lire une sélection, une traduction ou un exemple. Choisissez des voix système hors ligne ou des voix en ligne compatibles par langue, puis réglez le débit, la hauteur et le volume. |
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

### Votre fournisseur. Votre modèle. Votre choix.

Utilisez les préréglages OpenAI, DeepSeek, Gemini, Alibaba Cloud, SiliconFlow et OpenRouter, ou connectez une API Chat Completions compatible OpenAI. Chaque entrée de fournisseur contient un modèle ; dupliquez-la pour en utiliser un autre. Traduction, dictionnaire, rédaction et reconnaissance d’image peuvent utiliser des fournisseurs différents. Les réglages proposent des suggestions de modèles, un test de connexion, la température et des en-têtes personnalisés.

### Lire dans votre langue

Les traductions du README correspondent aux huit langues cibles prédéfinies dans l’application :

**English · 简体中文 · 繁體中文 · 日本語 · 한국어 · Français · Deutsch · Español**

**L’interface de l’application est actuellement disponible en anglais et en chinois simplifié**, avec sélection automatique selon le système. La qualité des traductions et la prise en charge d’autres langues dépendent du modèle. L’OCR hors ligne intégré reconnaît le chinois simplifié et l’anglais.

<a id="get-started"></a>

## Bien démarrer

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

### Vos premiers pas

1. **Connectez un fournisseur.** Dans API Providers, choisissez un préréglage ou une API compatible, renseignez les identifiants nécessaires et le modèle, puis testez la connexion. Affectez-le par défaut ou à une fonction précise.
2. **Sélectionnez une phrase.** Cliquez sur Translate dans la barre d’outils, choisissez la langue cible et épinglez le résultat pour continuer à lire en parallèle.
3. **Essayez une capture.** Avec le raccourci OCR ci-dessous, sélectionnez une zone puis vérifiez le texte reconnu. L’OCR hors ligne et les voix système fonctionnent avant toute configuration d’un fournisseur IA.

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

### Intégration au bureau

| Plateforme | Acquisition du texte |
| --- | --- |
| Windows | Lit les sélections exposées par l’application au premier plan via UI Automation. |
| macOS | L’accès au texte sélectionné nécessite l’autorisation Accessibilité ; les captures nécessitent l’autorisation Enregistrement de l’écran. |
| Linux | Utilise la sélection PRIMARY sous X11 (`xclip`, `xdotool`, `xprop`). Sous Wayland, utilise le presse-papiers ou le portail de capture du bureau ; les raccourcis dépendent de l’environnement. |

Windows a été vérifié sur la machine de développement. Des implémentations macOS et Linux sont présentes, mais les interactions natives doivent encore être validées sur les systèmes cibles. Consultez la [matrice de prise en charge](../../docs/PLATFORMS.md).

## Des limites claires pour vos données

**Des notes et des fonctions hors ligne sur votre appareil.** Les carnets sont stockés dans une base SQLite locale. L’OCR hors ligne et les voix système s’exécutent localement. La page des carnets locaux n’affiche que du contenu local.

**L’IA utilise le fournisseur choisi.** La traduction et les commandes envoient le texte nécessaire ; la synthèse vocale en ligne envoie le texte à lire. La reconnaissance d’image distante affiche d’abord l’image et son destinataire, puis attend votre lancement explicite.

**Des réglages transférables.** Importez ou exportez un fichier, ou synchronisez manuellement la configuration par WebDAV. Fournisseurs, commandes, raccourcis et correspondances des champs de carnet sont transférés ensemble. Les clés API et les en-têtes personnalisés restent propres à chaque appareil. Le contenu des carnets n’est pas inclus dans la synchronisation des réglages.

<a id="documentation"></a>

## Pour aller plus loin

- [Architecture et organisation du code](../../docs/ARCHITECTURE.md)
- [Fournisseurs, modèles et affectation des fonctions](../../docs/MODELS.md)
- [OCR hors ligne et API de vision](../../docs/OCR.md)
- [Configuration et WebDAV](../../docs/CONFIGURATION.md)
- [Plateformes et autorisations](../../docs/PLATFORMS.md)

La documentation technique est actuellement maintenue en chinois.

## Faisons grandir ReadFinch

Les rapports de bugs reproductibles, suggestions d’ergonomie, corrections de traduction et pull requests sont les bienvenus. Indiquez votre système et la version de l’application, et retirez les identifiants et textes privés de vos exemples. [Ouvrir un ticket](https://github.com/0xlane/ReadFinch/issues) · [Contribuer au code](https://github.com/0xlane/ReadFinch/pulls).

```sh
npm run typecheck
npm test
npm run build
```

Les textes du README se trouvent dans `docs/readmes/content.json`. Après une modification, lancez `npm run docs:readme` : le générateur vérifie que les traductions couvrent les langues cibles de l’application.

## Licence et remerciements

ReadFinch est distribué sous licence **GPL-3.0-only**. Les interactions de la barre de sélection et des cartes de commande s’inspirent de **Read Frog**. ReadFinch est un projet de bureau indépendant, pas une version officielle de Read Frog.

[GPL-3.0-only](../../LICENSE) · [Read Frog](https://github.com/mengxi-ream/read-frog) · [Mentions des composants tiers](../../THIRD_PARTY_NOTICES.md).

<div align="right">

[↑ Retour en haut](#readme-top)

</div>

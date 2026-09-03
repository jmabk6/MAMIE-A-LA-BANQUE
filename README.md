# Mamie à la banque

Prototype web-app mobile pour iPhone.

## Publication sur GitHub Pages
1. Créer un dépôt GitHub nommé `mamie-a-la-banque`
2. Ajouter `index.html`, `style.css`, `app.js`, `manifest.json`
3. Dans GitHub : Settings > Pages
4. Source : Deploy from a branch
5. Branch : `main` / dossier `/root`
6. Enregistrer

L'application fonctionne sans serveur et stocke les données dans `localStorage` sur l'appareil.

## V1 incluse
- Tableau de bord
- Dépenses
- Ajout dépense / recette / prélèvement
- Recherche et filtres
- Vérification du relevé
- Marquage "NOUVEAU"
- Pointage
- Stockage local


## V2
- Recettes récurrentes configurables
- Prélèvements récurrents configurables
- Ajout / modification / suppression des modèles
- Jour habituel et montant habituel
- Bouton pour générer les récurrents du mois
- Protection contre les doublons du même modèle dans le même mois

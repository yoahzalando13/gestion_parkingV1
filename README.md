# Système de Gestion de Parking (Node.js / Express)

Application full-stack **Node.js 22 / Express / EJS** qui informatise la gestion des places, des abonnés, des réservations, des entrées/sorties, de la facturation et des statistiques d'un parking privé.

Ce projet a été migré depuis Java/Spring Boot vers **Node.js (TypeScript/Express/EJS)** dans le cadre de l'import AI Studio, tout en conservant l'intégralité de la logique métier, des règles tarifaires et de l'interface utilisateur.

---

## 1. Stack technique

| Composant | Description |
|---|---|
| Runtime | Node.js 22 (TypeScript) |
| Framework Web | Express 5 |
| Moteur de template | EJS (conservant la structure HTML et les styles CSS d'origine) |
| Persistance | Données pré-chargées en mémoire (In-Memory Store avec 46 places, usagers, véhicules et règles tarifaires) |
| Port | 3000 (hôte 0.0.0.0) |

---

## 2. Comptes de démonstration

Ces comptes sont pré-initialisés avec leurs véhicules et rôles :

| Identifiant | Mot de passe | Rôle | Droits |
|---|---|---|---|
| `admin` | `admin123` | ADMIN | Configuration : places, tarifs, utilisateurs, API |
| `manager` | `manager123` | MANAGER | Gestion : abonnements, facturation, statistiques |
| `operator` | `operator123` | OPERATOR | Opérations : entrées / sorties, véhicules |
| `client` | `client123` | USER | Consultation et ses propres réservations |
| `vip` | `vip123` | USER (VIP) | Places VIP prioritaires |
| `pmr` | `pmr123` | USER (PMR) | Places PMR prioritaires |

Un sélecteur rapide de compte est disponible directement en bas du menu latéral pour basculer facilement d'un profil à un autre.

---

## 3. Lancement

```bash
npm run dev
```

L'application démarre sur `http://localhost:3000`.

---

## 4. Fonctionnalités

- **Tableau de bord** (`/dashboard`) : indicateurs KPI en temps réel, plan visuel des places par zone, véhicules actuellement présents, taux d'occupation par zone.
- **Plan du parking** (`/spaces/map`) : grille visuelle codée par couleur (vert = libre, orange = réservée, rouge = occupée, gris = hors service).
- **Places disponibles** (`/spaces/available`) : recherche rapide par zone et par type.
- **Toutes les places** (`/spaces`) : inventaire, filtres combinables, pagination et gestion opérationnelle (mise hors service / remise en service).
- **Réservations** (`/reservations`) : création, modification, annulation et détection des conflits de créneaux.
- **Entrée véhicule** (`/sessions/entry`) : prise en compte automatique de réservation ou attribution automatique par ordre de préférence (VIP, PMR, ABONNE, STANDARD).
- **Sortie véhicule** (`/sessions/exit`) : calcul automatique de la facture avec application des franchises, forfaits, coefficients véhicule et pénalités de dépassement.
- **Historique sessions** (`/sessions`) : traçabilité complète des entrées et sorties.
- **Abonnements** (`/subscriptions`) : formules Journalière, Hebdomadaire, Mensuelle et Annuelle, suspension et réactivation.
- **Facturation** (`/invoices`) : consultation des factures, décomposition détaillée du tarif et encaissement.
- **Statistiques** (`/statistics`) : chiffre d'affaires, panier moyen, recettes de dépassement, graphe quotidien et occupation par type.
- **Configuration** (`/users`, `/tariffs`, `/vehicles`) : gestion des usagers, règles tarifaires paramétrables et véhicules.
- **API REST** (`/api/**`) : documentation accessible via `/api/docs` ou `/swagger-ui.html`.

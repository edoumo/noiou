# UX19 — Parcours impartial NOIOU

UX19 transforme le parcours alpha pour que NOIOU ne soit pas seulement un outil de l'organisateur : l'application contrôle les invariants de la partie et affiche clairement ce qu'elle peut vérifier, ce qu'elle refuse et ce qui reste une attestation humaine.

## 1. Argent et jetons sont séparés

Une partie configure désormais explicitement :

- le montant d'une cave / d'un rebuy ;
- le nombre de jetons (unités de stack) remis pour une cave.

Exemple : une cave de 100 sats peut remettre 10 jetons. Deux caves payées impliquent 20 jetons physiques émis, pas 200. À la fin, le total des stacks saisis doit être exactement égal au nombre de jetons émis avant que le règlement puisse être calculé.

Les anciennes sessions schema-v1 restent lisibles : si `chipsPerBuyIn` est absent, l'ancien calcul à partir de `chipValue` est utilisé uniquement comme compatibilité historique.

## 2. Wallet externe : destination associée, puis demande exacte

Le mode s'appelle simplement `Wallet externe manuel`.

Une destination réutilisable de l'organisateur sert à identifier le point de réception. Elle n'est pas automatiquement présentée comme un QR de cave car une destination réutilisable peut ne pas lier un montant.

Pour chaque cave/rebuy :

1. NOIOU détermine le montant exact attendu.
2. Si la destination est une Lightning Address ou un LNURL-pay, NOIOU tente de demander au service une invoice BOLT11 pour ce montant exact.
3. L'invoice retournée est validée localement au moins sur son format Bech32/checksum et son montant encodé.
4. Si cette préparation automatique n'est pas possible (service inaccessible, plage de montant incompatible, BOLT12 actuellement non dérivé par NOIOU, etc.), l'application demande une invoice BOLT11 du montant exact à l'organisateur.
5. Une demande incorrecte est refusée avec une raison visible. Elle n'est jamais affichée comme QR officiel NOIOU.
6. Quand une BOLT11 exacte est prête, NOIOU affiche le grand QR à montrer au joueur.
7. Après le paiement, et seulement après vérification réelle dans son wallet, l'organisateur atteste la réception dans NOIOU.

Cette dernière confirmation reste une attestation humaine en mode wallet externe : NOIOU ne prétend pas observer un wallet auquel il n'a pas accès.

## 3. Traçabilité

Chaque demande reçoit une référence courte et lisible, par exemple :

`NOIOU A1B2C3D4 · Alice · Cave`

La référence associe : partie, joueur et action. Elle est conservée dans le journal NOIOU. Elle est aussi utilisée comme memo NWC. Pour LNURL-pay, elle est envoyée comme commentaire uniquement si le service annonce explicitement `commentAllowed` (LUD-12), tronquée à la taille autorisée.

Le fait qu'un wallet affiche ce commentaire dans son historique dépend de ses capacités : la traçabilité interne NOIOU ne dépend jamais de cet affichage externe.

## 4. Refus explicites

NOIOU ne doit pas échouer silencieusement. Les erreurs de préparation affichent une raison exploitable :

- mauvais montant (montant reçu et montant attendu) ;
- checksum Bech32 incorrect ;
- format non reconnu ;
- destination non compatible avec la génération automatique ;
- plage min/max LNURL-pay incompatible ;
- callback/service inaccessible ;
- réponse du service invalide.

Le message indique que la même demande ne doit pas être rescannée indéfiniment.

## 5. Payouts

Le même principe s'applique aux sorties : NOIOU calcule le montant, puis exige une invoice BOLT11 de ce montant exact avant que l'organisateur puisse confirmer le paiement Lightning.

- Lightning Address / LNURL : tentative de préparation automatique d'une invoice exacte ;
- autre destination ou échec : fallback BOLT11 exact fourni par le bénéficiaire ;
- mauvais montant : refus ;
- invoice correcte : grand QR + lien `lightning:` pour ouvrir un wallet sur le même appareil ;
- confirmation finale manuelle par l'organisateur.

NOIOU ne possède aucune permission de dépense et ne signe aucun paiement sortant.

## 6. Guide de prochaine action

L'interface expose une prochaine action persistante :

- ajouter un joueur ;
- encaisser le prochain joueur ;
- confirmer que toutes les caves sont reçues ;
- compter les jetons ;
- régler le prochain bénéficiaire ;
- régler le dealer si nécessaire ;
- clôturer.

Après une cave initiale confirmée, l'application revient automatiquement vers le prochain joueur non encaissé. Après un payout confirmé, elle passe au bénéficiaire suivant.

## 7. Limites alpha explicites

- Le mode wallet externe réel reste limité aux parties SATS.
- BOLT12 reste accepté comme destination réutilisable, mais UX19 ne dérive pas encore automatiquement une invoice exacte depuis une offre BOLT12. Le fallback est une BOLT11 exacte.
- La validation BOLT11 actuelle contrôle le format Bech32/checksum et le montant encodé ; le wallet payeur reste l'autorité finale de validation cryptographique/routage de l'invoice.
- Les encaissements externes sont attestés manuellement après vérification dans le wallet organisateur.
- Les sorties Lightning restent manuelles et non custodiales.

## 8. Références protocolaires

- LNURL-pay LUD-06 : callback avec montant en millisatoshis, retour d'une invoice spécifique, vérification du montant.
- LUD-12 : commentaire optionnel uniquement lorsque le service expose `commentAllowed`.

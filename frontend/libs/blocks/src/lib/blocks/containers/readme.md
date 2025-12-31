# container block


c'est le block container qui s'impose sur le canvas manager.


si on part sur l'idée que le container est responsable du positionnement de son child:

- il doit etre affiché avant
- il ne doit dépendre que de lui même
- basé sur son paramétrage, ses dimensions, sa position et ses children il va:
    - looper sur les children
    - les positionner


- quand on updateBlockInDom il faut vérifier s'il n'est pas dans un container pour sous traiter la tache


Quid des positions dans le builder ? 
- je resize le container => je dois appliquer les changements aux children
- si le container à un setting "header(A)|2 cols(B,C)|footer(D)" en destkop 



en fait les containers c'est un peu des constrainers mais apportés par des blocks
on peut imaginer que si un constrainer de block "capte" un block => on applique pas les autres constrainers


quand on drop on appelle : this.mainCanvasManager.addBlockToCurrentCanvas(blockDrop);
-> addBlockToCanvas
-> applyConstraints ("create")
-> setCanvas
-> updateCurrentCanvasInDom

-------------

chaque container enlsit des zones d'interactions
le canvas manager, de façon pertinente, loop sur les zones qui intersectent avec le curseur par ordre du rank on top to behind
quand un block enlist une zone dans le canvas manager il definit le callback de traitement
le callback return en premiere valeur un boolean (propagate) : si il est false: alors on arrete la boucle (c'est un peu comme un catch and don't share). Si il est true, alors on continue de boucler sur les zones. 
chaque callback accept aussi un argument : "preview"  (si il est true: c'est pour permettre à la zone de réagir, d'afficher par exemple un hover, du moins un effet d'interaction, alors que c'est false c'est pour de vrai: il faut trigger le processing du callback)
L'idée c'est de pouvoir drag un block au dessus du canvas et 

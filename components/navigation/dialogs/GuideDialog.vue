<script setup lang="ts">
const visible = defineModel<boolean>('visible', { required: true })
</script>

<template>
  <Dialog
    v-model:visible="visible"
    header="Guide d'utilisation"
    pt:root:class="max-w-50em"
    modal
  >
    <Accordion>
      <AccordionPanel value="0">
        <AccordionHeader>Premiers pas</AccordionHeader>
        <AccordionContent>
          <div class="flex flex-col gap-2">
            <p>BULB-MAX permet de créer des plans de ligne de transport dans le style des plans officiels RATP, Île-de-France Mobilités et SNCF Voyageurs.</p>
            <p>Le plus simple pour découvrir l'outil est de partir d'un préréglage :</p>
            <ol>
              <li>Dans le panneau <b>Propriétés</b> (à droite), cliquez sur <b>Utiliser un préréglage</b>.</li>
              <li>Choisissez une ligne (Métro, RER, Transilien, Tramway…). Les préréglages marqués d'une pastille chargent le plan complet avec tous les arrêts et correspondances.</li>
              <li>Le plan apparaît dans l'éditeur : cliquez sur un arrêt pour modifier ses propriétés.</li>
            </ol>
            <p>Pour partir de zéro, ouvrez le <b>Menu principal</b> (en haut à gauche) et cliquez sur <b>Nouveau projet</b>. Pensez à <b>Sauvegarder</b> régulièrement : votre projet est enregistré dans un fichier que vous pourrez rouvrir plus tard avec <b>Ouvrir</b>.</p>
          </div>
        </AccordionContent>
      </AccordionPanel>

      <AccordionPanel value="1">
        <AccordionHeader>La boîte à outils</AccordionHeader>
        <AccordionContent>
          <div class="flex flex-col gap-2">
            <p>La boîte à outils, en bas de l'éditeur, contient les briques du plan. Faites-les glisser sur le plan pour construire votre ligne :</p>
            <ul>
              <li><b>Arrêt</b> : un point de desserte. Cliquez dessus ensuite pour définir son nom, son sous-titre et toutes ses propriétés.</li>
              <li><b>Branche</b> : un tronçon de ligne qui accueille des arrêts.</li>
              <li><b>Fourche</b> : sépare la ligne en deux directions (comme le RER C ou le métro 13). Son orientation et sa forme se règlent dans ses propriétés.</li>
              <li><b>Branches parallèles</b> : deux tronçons superposés, pratiques pour représenter des dessertes alternées.</li>
              <li><b>Demi-tour</b> : une boucle de retournement en bout de ligne.</li>
              <li><b>Espacement</b> : écarte deux éléments. Il devient invisible au moment de l'export.</li>
            </ul>
            <p>Astuce : pour saisir rapidement de nombreux arrêts, utilisez l'assistant <b>WarpAdd</b> depuis une branche — remplissez un arrêt, validez, et passez au suivant sans quitter le clavier.</p>
          </div>
        </AccordionContent>
      </AccordionPanel>

      <AccordionPanel value="2">
        <AccordionHeader>Les correspondances</AccordionHeader>
        <AccordionContent>
          <div class="flex flex-col gap-2">
            <p>Chaque arrêt peut afficher ses correspondances : lignes de métro, RER, tramway, services (TGV, TER, aéroports…).</p>
            <ol>
              <li>Cliquez sur un arrêt, puis ouvrez ses <b>correspondances</b>.</li>
              <li>Créez un <b>groupe de correspondances</b> et choisissez son mode de transport ou son service.</li>
              <li>Ajoutez les lignes une à une : les pictogrammes officiels s'affichent automatiquement.</li>
            </ol>
            <p>Les groupes peuvent être copiés d'un arrêt à l'autre avec <b>Copier</b> / <b>Coller</b> — un gain de temps précieux sur les grandes gares. Une correspondance peut aussi être marquée comme <b>piétonne</b>, ou décorée d'un texte ou d'un nom d'aéroport.</p>
          </div>
        </AccordionContent>
      </AccordionPanel>

      <AccordionPanel value="3">
        <AccordionHeader>Les styles de marque</AccordionHeader>
        <AccordionContent>
          <div class="flex flex-col gap-2">
            <p>C'est la grande spécificité de BULB-MAX : le sélecteur <b>Style graphique</b>, en haut du Menu principal, habille tout le plan selon l'identité visuelle choisie :</p>
            <ul>
              <li><b>RATP (Paris)</b> : le style historique de BULB, fidèle aux plans du réseau parisien.</li>
              <li><b>Île-de-France Mobilités</b> : typographie IDF Voyageur, colonne latérale et codes couleur du réseau francilien.</li>
              <li><b>SNCF Voyageurs</b> : polices Avenir, cartouche anthracite et styles de terminus propres aux lignes Transilien.</li>
            </ul>
            <p>Le champ <b>Opérateur</b> (RATP, SNCF Voyageurs, Keolis, Transdev…) complète l'habillage. Changez de style à tout moment : le plan se réhabille instantanément, sans rien perdre.</p>
          </div>
        </AccordionContent>
      </AccordionPanel>

      <AccordionPanel value="4">
        <AccordionHeader>Communes et zones tarifaires</AccordionHeader>
        <AccordionContent>
          <div class="flex flex-col gap-2">
            <p>Comme sur les plans officiels, BULB-MAX peut afficher un bandeau des communes desservies et un bandeau des zones tarifaires sous le plan.</p>
            <ol>
              <li>Cliquez sur un arrêt et renseignez sa <b>Commune</b> dans ses propriétés.</li>
              <li>Renseignez également sa <b>Zone tarifaire</b> (1 à 5).</li>
            </ol>
            <p>Les bandeaux se construisent automatiquement : les arrêts d'une même commune ou d'une même zone sont regroupés. Les préréglages fournis contiennent déjà ces informations pour plus de 40 lignes.</p>
          </div>
        </AccordionContent>
      </AccordionPanel>

      <AccordionPanel value="5">
        <AccordionHeader>Hors Île-de-France</AccordionHeader>
        <AccordionContent>
          <div class="flex flex-col gap-2">
            <p>Certaines lignes Transilien sortent de la région (comme la ligne K vers Crépy-en-Valois). Les plans officiels signalent ces portions par des hachures et un fond gris, avec la mention « Hors tarification Île-de-France ».</p>
            <p>Pour reproduire cet effet, ouvrez les propriétés de l'arrêt (ou de l'espacement) concerné et activez <b>Hors Île-de-France (hachures et fond gris)</b>. La zone hachurée s'étend automatiquement sur la portion de branche concernée.</p>
          </div>
        </AccordionContent>
      </AccordionPanel>

      <AccordionPanel value="6">
        <AccordionHeader>Pictogrammes personnalisés et bibliothèques</AccordionHeader>
        <AccordionContent>
          <div class="flex flex-col gap-2">
            <p>Besoin d'un indice de ligne qui n'existe pas (ligne fictive, réseau de province, projet d'extension) ? Créez vos propres pictogrammes :</p>
            <ol>
              <li>Ouvrez le <b>Menu principal</b> → <b>Indices personnalisés</b>.</li>
              <li>Créez une <b>bibliothèque</b> pour les ranger (par réseau, par projet… comme vous voulez).</li>
              <li>Cliquez sur <b>+</b> dans un mode de transport, puis composez votre indice : forme (cercle, carré arrondi, lignes, rectangle…), préfixe, valeur, suffixe et couleur.</li>
            </ol>
            <p>Vos pictogrammes sont utilisables comme indice de ligne et dans les correspondances, et peuvent être exportés en PNG. Ils sont conservés dans votre navigateur et peuvent être inclus dans vos fichiers de sauvegarde pour être partagés.</p>
          </div>
        </AccordionContent>
      </AccordionPanel>

      <AccordionPanel value="7">
        <AccordionHeader>Exporter son plan</AccordionHeader>
        <AccordionContent>
          <div class="flex flex-col gap-2">
            <p>Trois formats d'export sont disponibles depuis le Menu principal :</p>
            <ul>
              <li><b>Exporter au format PNG</b> : une image haute résolution du plan, idéale pour le partage.</li>
              <li><b>Exporter au format PDF</b> : passe par la boîte d'impression du navigateur. Si le résultat présente des défauts, préférez le PNG.</li>
              <li><b>Exporter vers Lumiplan</b> : génère un fichier chargeable dans le simulateur d'écran embarqué de bus. Choisissez la branche, l'heure de départ et l'intervalle entre arrêts — votre ligne s'affiche alors comme sur un véritable écran de bus, pictogrammes personnalisés compris. L'opération inverse existe aussi avec <b>Importer depuis Lumiplan</b>.</li>
            </ul>
          </div>
        </AccordionContent>
      </AccordionPanel>
    </Accordion>
  </Dialog>
</template>

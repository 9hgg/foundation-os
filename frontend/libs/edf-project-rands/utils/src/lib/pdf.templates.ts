/* reportTemplates.ts
   Drop-in replacement for what you already have: only CSS + Jinja HTML templates.
   No TS interfaces/types. No external CDN dependencies.
*/

const BASE_STYLES = `
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #111827;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.55;
  }

  /* Constrain content width for a report feel */
  .page {
    max-width: 980px;
    margin: 0 auto;
    padding: 24px 28px;
  }

  /* Rhythm */
  h1, h2, h3, p, ul, ol, table { margin: 0 0 10px; }
  hr { border: 0; border-top: 1px solid #e5e7eb; margin: 16px 0; }
  a { color: #111827; text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* Headings */
  h1 {
    font-size: 28px;
    line-height: 1.18;
    letter-spacing: -0.01em;
    margin-bottom: 6px;
  }
  h2 {
    font-size: 18px;
    line-height: 1.25;
    margin-top: 18px;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid #e5e7eb;
    color: #111827;
  }
  h3 {
    font-size: 15px;
    line-height: 1.3;
    margin-top: 14px;
    margin-bottom: 6px;
    color: #111827;
  }

  p { color: #374151; }
  .subtitle { color: #6b7280; font-size: 13px; margin-bottom: 12px; }
  .summary { color: #374151; margin-bottom: 14px; }
  .muted { color: #6b7280; font-size: 12px; }
  .small { font-size: 12px; }

  /* Cover / meta box (optional but “template-like”) */
  .meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 18px;
    padding: 12px 14px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #fafafa;
    margin: 12px 0 14px;
  }
  .meta div { font-size: 12px; color: #374151; }
  .meta strong { font-weight: 700; color: #111827; }

  /* Lists */
  ul, ol { padding-left: 18px; color: #374151; margin: 6px 0 12px; }
  li { margin: 2px 0; }

  /* Tables (report-grade) */
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin-top: 8px;
    font-size: 13px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    overflow: hidden;
  }
  th, td {
    padding: 7px 9px;
    vertical-align: top;
    border-bottom: 1px solid #e5e7eb;
  }
  thead th {
    background: #f3f4f6;
    font-weight: 700;
    color: #111827;
    text-align: left;
  }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:nth-child(even) td { background: #fafafa; }

  /* Numeric columns: add class="num" on td/th where needed */
  .num { text-align: right; font-variant-numeric: tabular-nums; }

  /* Cards (Word-like: no boxes, just spacing) */
  .deliverable-card, .activity, .batch, .card {
    border: 0;
    border-radius: 0;
    padding: 0;
    margin: 10px 0 14px;
    background: transparent;
  }
  .batch { margin-top: 16px; }
  .activity strong { display: block; margin-bottom: 4px; }

  /* Callouts (risques, hypothèses, décisions) */
  .callout {
    border-left: 4px solid #111827;
    background: #f9fafb;
    padding: 10px 12px;
    border-radius: 8px;
    margin: 10px 0 12px;
  }
  .callout .title { font-weight: 800; margin-bottom: 4px; color:#111827; }

  /* TOC */
  .toc {
    border: 0;
    border-radius: 0;
    padding: 0;
    background: transparent;
  }
  .toc h2 { border-bottom: 0; padding-bottom: 0; margin-top: 0; }
  .toc-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
  }
  .toc-table td {
    padding: 2px 0;
    border: 0;
    color: #374151;
    font-size: 13px;
  }
  .toc-table .toc-page {
    text-align: right;
    color: #6b7280;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .toc-indent-1 { padding-left: 14px; }
  .toc-indent-2 { padding-left: 28px; }

  /* Page break control */
  .page-break { break-after: page; }
  .avoid-break { break-inside: avoid; }
  h2, h3 { break-after: avoid; }
  table, .activity, .deliverable-card, .callout, .toc, .meta { break-inside: avoid; }

  /* Print / PDF */
  @page { margin: 18mm 12mm; }
  @media print {
    body { padding: 0; }
    .page { margin: 0; max-width: none; padding: 0; }
    a { color: #000; text-decoration: none; }
  }
`;

/* ----------------------------- Jinja fragments ----------------------------- */

const REPORT_COVER_TEMPLATE = `
  <section class="cover">
    {% if meta and meta.type %}
      <div class="muted small" style="letter-spacing:.06em; text-transform:uppercase;">{{ meta.type }}</div>
    {% endif %}

    <h1>{{ title }}</h1>

    {% if subtitle %}
      <div class="subtitle">{{ subtitle }}</div>
    {% endif %}

    {% if meta %}
      <div class="meta avoid-break">
        {% if meta.project %}<div><strong>Projet</strong> : {{ meta.project }}</div>{% endif %}
        {% if meta.projectCode %}<div><strong>Code</strong> : {{ meta.projectCode }}</div>{% endif %}
        {% if meta.version %}<div><strong>Version</strong> : {{ meta.version }}</div>{% endif %}
        {% if meta.date %}<div><strong>Date</strong> : {{ meta.date }}</div>{% endif %}
        {% if meta.author %}<div><strong>Auteur</strong> : {{ meta.author }}</div>{% endif %}
        {% if meta.owner %}<div><strong>Responsable</strong> : {{ meta.owner }}</div>{% endif %}
        {% if meta.classification %}<div><strong>Classification</strong> : {{ meta.classification }}</div>{% endif %}
      </div>
    {% endif %}

    {% if summary %}
      <div class="summary">{{ summary }}</div>
    {% endif %}
  </section>
`;

const REPORT_TOC_TEMPLATE = `
  <div class="page-break"></div>
  <section class="toc avoid-break" id="sommaire">
    <h2>Sommaire</h2>
    <table class="toc-table">
      <tr>
        <td><a href="#avertissement">AVERTISSEMENT / CAUTION</a></td>
        <td class="toc-page">1</td>
      </tr>
      <tr>
        <td><a href="#synthese">SYNTHESE</a></td>
        <td class="toc-page">2</td>
      </tr>
      <tr>
        <td>SOMMAIRE</td>
        <td class="toc-page">4</td>
      </tr>
      <tr>
        <td><a href="#section-1">1. INTRODUCTION, METHODOLOGIE ET CALENDRIER DE L’ETUDE D’OPPORTUNITE</a></td>
        <td class="toc-page">6</td>
      </tr>
      <tr>
        <td class="toc-indent-1"><a href="#section-1-1">1.1. INTRODUCTION</a></td>
        <td class="toc-page">6</td>
      </tr>
      <tr>
        <td class="toc-indent-1"><a href="#section-1-2">1.2. METHODOLOGIE DE L’ETUDE D’OPPORTUNITE</a></td>
        <td class="toc-page">6</td>
      </tr>
      <tr>
        <td><a href="#section-2">2. CARTE D’IDENTITE DU PROJET</a></td>
        <td class="toc-page">8</td>
      </tr>
      <tr>
        <td><a href="#section-3">3. CONTEXTE ET BESOINS</a></td>
        <td class="toc-page">9</td>
      </tr>
      <tr>
        <td class="toc-indent-1"><a href="#section-3-1">3.1. CONTEXTE</a></td>
        <td class="toc-page">9</td>
      </tr>
      <tr>
        <td class="toc-indent-2"><a href="#section-3-1-1">3.1.1. Des data-scientists dans toutes nos unités</a></td>
        <td class="toc-page">9</td>
      </tr>
      <tr>
        <td class="toc-indent-2"><a href="#section-3-1-2">3.1.2. Évolution du SI du groupe EDF</a></td>
        <td class="toc-page">9</td>
      </tr>
      <tr>
        <td class="toc-indent-2"><a href="#section-3-1-3">3.1.3. Les projets/équipes R&amp;D déjà en cours</a></td>
        <td class="toc-page">10</td>
      </tr>
      <tr>
        <td class="toc-indent-2"><a href="#section-3-1-4">3.1.4. Intérêt extérieur pour l'outil Prob'Ex</a></td>
        <td class="toc-page">10</td>
      </tr>
      <tr>
        <td class="toc-indent-2"><a href="#section-3-1-5">3.1.5. Décisions stratégiques (GAI &amp; Sûreté)</a></td>
        <td class="toc-page">10</td>
      </tr>
      <tr>
        <td class="toc-indent-1"><a href="#section-3-2">3.2. BESOINS</a></td>
        <td class="toc-page">10</td>
      </tr>
      <tr>
        <td class="toc-indent-1"><a href="#section-3-3">3.3. ORIENTATION</a></td>
        <td class="toc-page">11</td>
      </tr>
      <tr>
        <td><a href="#section-4">4. OBJECTIFS ET VALEUR CREEE</a></td>
        <td class="toc-page">11</td>
      </tr>
      <tr>
        <td class="toc-indent-1"><a href="#section-4-1">4.1. OBJECTIFS GENERAUX</a></td>
        <td class="toc-page">11</td>
      </tr>
      <tr>
        <td class="toc-indent-1"><a href="#section-4-2">4.2. VALEURS CREEES POUR EDF HYDRO</a></td>
        <td class="toc-page">11</td>
      </tr>
      <tr>
        <td class="toc-indent-2"><a href="#section-4-2-1">4.2.1. Valeur opérationnelle</a></td>
        <td class="toc-page">11</td>
      </tr>
      <tr>
        <td class="toc-indent-2"><a href="#section-4-2-2">4.2.2. Valeur technique</a></td>
        <td class="toc-page">12</td>
      </tr>
      <tr>
        <td class="toc-indent-2"><a href="#section-4-2-3">4.2.3. Valeur organisationnelle</a></td>
        <td class="toc-page">12</td>
      </tr>
      <tr>
        <td class="toc-indent-2"><a href="#section-4-2-4">4.2.4. Valeur stratégique</a></td>
        <td class="toc-page">12</td>
      </tr>
      <tr>
        <td><a href="#section-5">5. PRODUITS &amp; SERVICES : LIVRABLES PRINCIPAUX DU PROJET</a></td>
        <td class="toc-page">13</td>
      </tr>
      {% if batches %}
        {% for batch in batches %}
          <tr>
            <td class="toc-indent-1"><a href="#batch-{{ loop.index }}">5.{{ loop.index }}. {{ batch.title }}</a></td>
            <td class="toc-page">—</td>
          </tr>
          {% if batch.activities %}
            {% for activity in batch.activities %}
              <tr>
                <td class="toc-indent-2">
                  <a href="#batch-{{ loop.index0 + 1 }}-activity-{{ loop.index }}">
                    5.{{ loop.index0 + 1 }}.{{ loop.index }}. Activité {{ loop.index0 + 1 }}.{{ loop.index }} – {{ activity.title }}
                  </a>
                </td>
                <td class="toc-page">—</td>
              </tr>
            {% endfor %}
          {% endif %}
        {% endfor %}
      {% endif %}
      <tr>
        <td><a href="#section-6">6. ORGANISATIONS ET MOYENS</a></td>
        <td class="toc-page">75</td>
      </tr>
      <tr>
        <td class="toc-indent-1"><a href="#section-6-1">6.1. ORGANISATION GENERALE DU PROJET</a></td>
        <td class="toc-page">75</td>
      </tr>
      <tr>
        <td class="toc-indent-1"><a href="#section-6-2">6.2. RESSOURCES R&amp;D</a></td>
        <td class="toc-page">75</td>
      </tr>
      <tr>
        <td class="toc-indent-1"><a href="#section-6-3">6.3. INTERFACES</a></td>
        <td class="toc-page">75</td>
      </tr>
      <tr>
        <td class="toc-indent-1"><a href="#section-6-4">6.4. MOYENS FINANCIERS</a></td>
        <td class="toc-page">75</td>
      </tr>
      <tr>
        <td class="toc-indent-1"><a href="#section-6-5">6.5. DONNEES SCIENTIFIQUES ET DONNEES A CARACTERE PERSONNEL</a></td>
        <td class="toc-page">76</td>
      </tr>
      <tr>
        <td class="toc-indent-1"><a href="#section-6-6">6.6. ÉVALUATION DES RISQUES</a></td>
        <td class="toc-page">77</td>
      </tr>
    </table>
  </section>
`;

const FALLBACK_SECTIONS_TEMPLATE = `
  <section id="avertissement">
    <h2>AVERTISSEMENT / CAUTION</h2>
    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec sed massa sed risus mollis hendrerit. Sed ut dolor in augue dignissim placerat.</p>
  </section>
  <section id="synthese">
    <h2>SYNTHESE</h2>
    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi viverra, neque at interdum porttitor, sem tortor finibus augue, sed dictum turpis odio vel lorem.</p>
  </section>
  <section id="section-1">
    <h2>1. INTRODUCTION, METHODOLOGIE ET CALENDRIER DE L’ETUDE D’OPPORTUNITE</h2>
    <section id="section-1-1">
      <h3>1.1. INTRODUCTION</h3>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla facilisi. Integer commodo pretium massa, nec molestie libero aliquet sed.</p>
    </section>
    <section id="section-1-2">
      <h3>1.2. METHODOLOGIE DE L’ETUDE D’OPPORTUNITE</h3>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Praesent ut ante sit amet augue vulputate malesuada.</p>
    </section>
  </section>
  <section id="section-2">
    <h2>2. CARTE D’IDENTITE DU PROJET</h2>
    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin in sapien nec mauris luctus tristique.</p>
  </section>
  <section id="section-3">
    <h2>3. CONTEXTE ET BESOINS</h2>
    <section id="section-3-1">
      <h3>3.1. CONTEXTE</h3>
      <section id="section-3-1-1">
        <h3>3.1.1. Des data-scientists dans toutes nos unités</h3>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
      </section>
      <section id="section-3-1-2">
        <h3>3.1.2. Évolution du SI du groupe EDF</h3>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
      </section>
      <section id="section-3-1-3">
        <h3>3.1.3. Les projets/équipes R&amp;D déjà en cours</h3>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
      </section>
      <section id="section-3-1-4">
        <h3>3.1.4. Intérêt extérieur pour l'outil Prob'Ex</h3>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
      </section>
      <section id="section-3-1-5">
        <h3>3.1.5. Décisions stratégiques (GAI &amp; Sûreté)</h3>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
      </section>
    </section>
    <section id="section-3-2">
      <h3>3.2. BESOINS</h3>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
    </section>
    <section id="section-3-3">
      <h3>3.3. ORIENTATION</h3>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
    </section>
  </section>
  <section id="section-4">
    <h2>4. OBJECTIFS ET VALEUR CREEE</h2>
    <section id="section-4-1">
      <h3>4.1. OBJECTIFS GENERAUX</h3>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
    </section>
    <section id="section-4-2">
      <h3>4.2. VALEURS CREEES POUR EDF HYDRO</h3>
      <section id="section-4-2-1">
        <h3>4.2.1. Valeur opérationnelle</h3>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
      </section>
      <section id="section-4-2-2">
        <h3>4.2.2. Valeur technique</h3>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
      </section>
      <section id="section-4-2-3">
        <h3>4.2.3. Valeur organisationnelle</h3>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
      </section>
      <section id="section-4-2-4">
        <h3>4.2.4. Valeur stratégique</h3>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
      </section>
    </section>
  </section>
  <section id="section-5">
    <h2>5. PRODUITS &amp; SERVICES : LIVRABLES PRINCIPAUX DU PROJET</h2>
    <p class="muted">Les lots et activités sont détaillés ci-dessous à partir des données projet.</p>
  </section>
  <section id="section-6">
    <h2>6. ORGANISATIONS ET MOYENS</h2>
    <section id="section-6-1">
      <h3>6.1. ORGANISATION GENERALE DU PROJET</h3>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
    </section>
    <section id="section-6-2">
      <h3>6.2. RESSOURCES R&amp;D</h3>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
    </section>
    <section id="section-6-3">
      <h3>6.3. INTERFACES</h3>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
    </section>
    <section id="section-6-4">
      <h3>6.4. MOYENS FINANCIERS</h3>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
    </section>
    <section id="section-6-5">
      <h3>6.5. DONNEES SCIENTIFIQUES ET DONNEES A CARACTERE PERSONNEL</h3>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
    </section>
    <section id="section-6-6">
      <h3>6.6. ÉVALUATION DES RISQUES</h3>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
    </section>
  </section>
`;

/* Narrative sections: paragraphs, bullets, callouts, tables */
const REPORT_SECTIONS_TEMPLATE = `
  <article id="content">
    {% if sections %}
      {% for section in sections %}
        <section id="{{ section.id }}">
          <h2>{{ section.heading }}</h2>

          {% if section.paragraphs %}
            {% for paragraph in section.paragraphs %}
              <p>{{ paragraph }}</p>
            {% endfor %}
          {% endif %}

          {% if section.bullets %}
            <ul>
              {% for bullet in section.bullets %}
                <li>{{ bullet }}</li>
              {% endfor %}
            </ul>
          {% endif %}

          {% if section.callouts %}
            {% for c in section.callouts %}
              <div class="callout avoid-break {% if c.kind %}{{ c.kind }}{% endif %}">
                {% if c.title %}<div class="title">{{ c.title }}</div>{% endif %}
                <p>{{ c.text }}</p>
              </div>
            {% endfor %}
          {% endif %}

          {% if section.tables %}
            {% for t in section.tables %}
              <div class="avoid-break">
                {% if t.title %}<h3>{{ t.title }}</h3>{% endif %}
                <table>
                  <thead>
                    <tr>
                      {% for h in t.headers %}
                        <th class="{% if h.numeric %}num{% endif %}">{{ h.label }}</th>
                      {% endfor %}
                    </tr>
                  </thead>
                  <tbody>
                    {% for row in t.rows %}
                      <tr>
                        {% for cell in row %}
                          <td class="{% if cell.numeric %}num{% endif %}">{{ cell.value }}</td>
                        {% endfor %}
                      </tr>
                    {% endfor %}
                  </tbody>
                </table>
              </div>
            {% endfor %}
          {% endif %}
        </section>

        {% if not loop.last %}
          <hr>
        {% endif %}
      {% endfor %}
    {% else %}
${FALLBACK_SECTIONS_TEMPLATE}
    {% endif %}
  </article>
`;

/* Activity card (used in batches and standalone) */
const ACTIVITY_CARD_TEMPLATE = `
  <div class="activity avoid-break">
    <strong>{% if activityNumber %}{{ activityNumber }} — {% endif %}{{ activity.title }}</strong>

    {% if activity.description %}
      <p>{{ activity.description }}</p>
    {% endif %}

    {% if activity.schedule or activity.owner or activity.effort or activity.cost %}
      <div class="muted">
        {% if activity.owner %}Responsable : {{ activity.owner }}{% endif %}
        {% if activity.effort %}{% if activity.owner %} · {% endif %}Charge : {{ activity.effort }}{% endif %}
        {% if activity.cost %}{% if activity.owner or activity.effort %} · {% endif %}Coût : {{ activity.cost }}{% endif %}
        {% if activity.schedule %}
          {% if activity.schedule.start %}{% if activity.owner or activity.effort or activity.cost %} · {% endif %}Début : {{ activity.schedule.start }}{% endif %}
          {% if activity.schedule.end %}{% if activity.schedule.start %} · {% endif %}Fin : {{ activity.schedule.end }}{% endif %}
        {% endif %}
      </div>
    {% endif %}

    {% if activity.risks %}
      <div class="callout risque">
        <div class="title">Risques</div>
        <ul>
          {% for r in activity.risks %}
            <li>{{ r }}</li>
          {% endfor %}
        </ul>
      </div>
    {% endif %}
  </div>
`;

/* Batches & activities */
const BATCHES_TEMPLATE = `
  {% if batches %}
    <section id="lots-activites">
      <h2>5. PRODUITS &amp; SERVICES : LIVRABLES PRINCIPAUX DU PROJET</h2>

      {% for batch in batches %}
        <div class="batch avoid-break">
          <h3 id="batch-{{ loop.index }}">5.{{ loop.index }}. {{ batch.title }}</h3>
          {% if batch.description %}<p>{{ batch.description }}</p>{% endif %}

          {% if batch.activities %}
            {% set batchIndex = loop.index %}
            {% for activity in batch.activities %}
              {% set activityNumber = "5." ~ batchIndex ~ "." ~ loop.index %}
              <div id="batch-{{ batchIndex }}-activity-{{ loop.index }}">
${ACTIVITY_CARD_TEMPLATE}
              </div>
            {% endfor %}
          {% else %}
            <p class="muted">Aucune activité associée.</p>
          {% endif %}
        </div>
      {% endfor %}
    </section>
  {% endif %}
`;

/* Deliverables */
const DELIVERABLES_TEMPLATE = `
  {% if deliverables %}
    <section id="delivrables">
      <h2>Délivrables</h2>

      {% for item in deliverables %}
        <div class="deliverable-card avoid-break">
          <h3>{{ item.title }}</h3>

          {% if item.description %}
            <p>{{ item.description }}</p>
          {% endif %}

          {% if item.status or item.cost or item.schedule %}
            <div class="muted">
              {% if item.status %}Statut : {{ item.status }}{% endif %}
              {% if item.cost %}{% if item.status %} · {% endif %}Coût : {{ item.cost }}{% endif %}
              {% if item.schedule %}
                {% if item.schedule.start %}{% if item.status or item.cost %} · {% endif %}Début : {{ item.schedule.start }}{% endif %}
                {% if item.schedule.end %}{% if item.schedule.start %} · {% endif %}Fin : {{ item.schedule.end }}{% endif %}
              {% endif %}
            </div>
          {% endif %}
        </div>
      {% endfor %}
    </section>
  {% endif %}
`;

/* Annexes (free HTML) */
const ANNEXES_TEMPLATE = `
  {% if annexesHtml %}
    <div class="page-break"></div>
    <section id="annexes">
      <h2>Annexes</h2>
      {{ annexesHtml | safe }}
    </section>
  {% endif %}
`;

/* ----------------------------- PDF header/footer (Playwright) ----------------------------- */
/* Must be self-contained inline HTML (Playwright limitation). Keep it tiny. */

export const PDF_HEADER_TEMPLATE = `
<div style="font-size:10px; width:100%; padding:0 12mm; color:#111827; display:flex; justify-content:center;">
  <span>{{ title }}</span>
</div>
`;

export const PDF_FOOTER_TEMPLATE = `
<div style="font-size:9px; width:100%; padding:0 12mm; color:#111827;">
  <div style="display:flex; width:100%; justify-content:space-between;">
    <span>{{ footerAccessibility }}</span>
    <span>Page <span class="pageNumber"></span> sur <span class="totalPages"></span></span>
    <span>© EDF — {{ footerDate }}</span>
  </div>
</div>
`;

/* ----------------------------- Full-document templates ----------------------------- */
/* One canonical “report template” that includes everything.
   Use this as your default, and you can still keep your smaller ones below if you want.
*/

export const PROJECT_TEMPLATE = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{ title }}</title>
    <style>
${BASE_STYLES}
    </style>
  </head>
  <body>
    <div class="page">
${REPORT_COVER_TEMPLATE}
${REPORT_TOC_TEMPLATE}
      <div class="page-break"></div>
${REPORT_SECTIONS_TEMPLATE}
${BATCHES_TEMPLATE}
${DELIVERABLES_TEMPLATE}
${ANNEXES_TEMPLATE}
    </div>
  </body>
</html>
`;

/* Backwards-compatible single-purpose templates (replace your existing ones) */

export const DELIVERABLE_TEMPLATE = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{ title }}</title>
    <style>
${BASE_STYLES}
    </style>
  </head>
  <body>
    <div class="page">
${REPORT_COVER_TEMPLATE}
      <div class="page-break"></div>
${REPORT_SECTIONS_TEMPLATE}
${DELIVERABLES_TEMPLATE}
    </div>
  </body>
</html>
`;

export const ACTIVITY_TEMPLATE = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{ title }}</title>
    <style>
${BASE_STYLES}
    </style>
  </head>
  <body>
    <div class="page">
${REPORT_COVER_TEMPLATE}
      <div class="page-break"></div>
${REPORT_SECTIONS_TEMPLATE}

      {% if activity %}
        ${ACTIVITY_CARD_TEMPLATE}
      {% endif %}

${DELIVERABLES_TEMPLATE}
    </div>
  </body>
</html>
`;

export const PROJECT_TEMPLATE_OLD = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{ title }}</title>
    <style>
${BASE_STYLES}
    </style>
  </head>
  <body>
    <div class="page">
${REPORT_COVER_TEMPLATE}
${REPORT_TOC_TEMPLATE}
      <div class="page-break"></div>
${REPORT_SECTIONS_TEMPLATE}
${BATCHES_TEMPLATE}
${DELIVERABLES_TEMPLATE}
    </div>
  </body>
</html>
`;

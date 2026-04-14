export const SIMPLE_REPORT_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{ title }}</title>
    <style>
      * {
        box-sizing: border-box;
      }
      body {
        font-family: Arial, sans-serif;
        color: #111827;
        margin: 0;
        padding: 24px 28px;
        line-height: 1.5;
      }
      h1 {
        font-size: 26px;
        margin: 0 0 8px;
      }
      h2 {
        font-size: 18px;
        margin: 20px 0 6px;
        color: #1f2937;
      }
      p {
        font-size: 14px;
        color: #374151;
        margin: 0 0 10px;
      }
      .subtitle {
        color: #6b7280;
        margin-bottom: 16px;
        font-size: 14px;
      }
      .summary {
        margin-bottom: 16px;
        font-size: 14px;
        color: #374151;
      }
      ul {
        padding-left: 18px;
        color: #374151;
        margin: 8px 0 12px;
      }
      li {
        margin-bottom: 4px;
        font-size: 14px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
        font-size: 13px;
      }
      th,
      td {
        border: 1px solid #e5e7eb;
        padding: 6px 8px;
        text-align: right;
        vertical-align: top;
      }
      th:first-child,
      td:first-child {
        text-align: left;
        font-weight: 600;
        color: #111827;
      }
      th {
        background: #f3f4f6;
        font-weight: 600;
        color: #111827;
      }
      .footer {
        margin-top: 24px;
        font-size: 12px;
        color: #6b7280;
      }
    </style>
  </head>
  <body>
    <h1>{{ title }}</h1>
    {% if subtitle %}
    <div class="subtitle">{{ subtitle }}</div>
    {% endif %}
    {% if summary %}
    <div class="summary">{{ summary }}</div>
    {% endif %}

    {% for section in sections %}
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
    {% if section.table %}
      <table>
        <thead>
          <tr>
            {% for header in section.table.headers %}
            <th>{{ header }}</th>
            {% endfor %}
          </tr>
        </thead>
        <tbody>
          {% for row in section.table.rows %}
          <tr>
            {% for cell in row %}
            <td>{{ cell }}</td>
            {% endfor %}
          </tr>
          {% endfor %}
        </tbody>
      </table>
    {% endif %}
    {% endfor %}

    {% if footer %}
    <div class="footer">{{ footer }}</div>
    {% endif %}
  </body>
</html>
`;

export const DEFAULT_PDF_HEADER_TEMPLATE = `
<div style="font-size:9px; width:100%; padding:0 12mm; color:#6b7280;">
  <span>{{ title }}</span>
</div>
`;

export const DEFAULT_PDF_FOOTER_TEMPLATE = `
<div style="font-size:9px; width:100%; padding:0 12mm; color:#6b7280; display:flex; justify-content:space-between;">
  <span>{{ document_type }}</span>
  <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>
`;
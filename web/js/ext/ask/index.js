// Ask: the way into the map's MCP server from the map itself. A top-bar button ("Pergunte à sua IA") opens a panel
// that says what MCP is in plain words, gives the server address to copy, the steps for Claude, ChatGPT and
// Cursor, ready questions (one about the place open on the map), and this week's anonymous index.
//
//   URL hash #ia=1 opens it · goals ask:open, ask:copy, ask:question (Operations Analytics, see ext/analytics)
import { esc } from "../../format.js";
import { icon } from "../../ui/icon.js";

const SERVER = "https://terra-a-vista.mcp.myagents.click/mcp";
const TRENDS = "https://terra-a-vista.mcp.myagents.click/trends/latest.json";
const PAGE = "pergunte/";
const RULES = "como-contamos/";

const goal = (name) => { try { window.analytics?.trackGoal(name); } catch { /* measuring never breaks the map */ } };

// A speech bubble with a small hex inside: talking to the map.
const GLYPH = `<svg class="icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 5.5h16v10.5H10l-4.5 3.5V16H4z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M12 7.6l2.6 1.5v3l-2.6 1.5-2.6-1.5v-3z" fill="currentColor"/></svg>`;

const CLIENTS = [
  { id: "claude", name: "Claude", steps: ["Abra Configurações e depois Conectores.", "Escolha Adicionar conector personalizado.", "Cole o endereço e salve. Pronto: pergunte na conversa."] },
  { id: "chatgpt", name: "ChatGPT", steps: ["Nos planos que aceitam conectores personalizados, abra Configurações e a área de conectores (modo desenvolvedor).", "Crie um conector com o endereço, sem autenticação.", "Ative-o na conversa e pergunte."] },
  { id: "code", name: "Cursor e outros", steps: ["Qualquer ferramenta que aceite um servidor MCP remoto: Cursor, Claude Code, VS Code e outras.", "Na configuração de MCP, acrescente:"], code: `{ "mcpServers": { "terra-a-vista": {\n  "url": "${SERVER}" } } }` },
];

const QUESTIONS = [
  "Que cidades de 50 a 150 mil habitantes do Centro-Oeste mais crescem, e o que elas exportam?",
  "Compare o Ideb, a mortalidade infantil e a banda larga do Ceará e de São Paulo.",
  "Onde a soja mais avançou desde 1985, e quanto de vegetação nativa sobrou ali?",
  "Quais prefeituras de Minas Gerais mais dependem do FPM?",
];

const CSS = `
.ask-btn { position: relative; border-color: rgba(236,208,142,.85) !important; box-shadow: 0 0 0 1px rgba(236,208,142,.25), 0 0 14px rgba(236,208,142,.18); }
.ask-btn .ask-new { margin-left: 6px; font-size: 9.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; padding: 1px 5px; border-radius: 3px; color: #1a1208; background: var(--gold-bright); }
@media (max-width: 700px) { .ask-btn .ask-new { display: none; } }
.ask-card { width: min(860px, 94vw); max-height: 90vh; overflow-y: auto; position: relative; padding: 26px 30px 22px; }
.ask-card .close { position: absolute; top: 12px; right: 12px; }
.ask-kicker { font-size: 11.5px; letter-spacing: .2em; text-transform: uppercase; color: var(--gold); margin: 0 0 6px; }
.ask-card h2 { font: 600 26px/1.2 var(--serif); color: var(--ink); margin: 0 0 10px; max-width: 640px; }
.ask-lede { color: var(--ink); font-size: 15px; line-height: 1.55; margin: 0 0 18px; max-width: 680px; }
.ask-lede b { color: var(--gold-bright); font-weight: 600; }
.ask-flow { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; align-items: center; gap: 8px; margin: 0 0 18px; }
.ask-node { border: 1px solid rgba(201,164,92,.45); border-radius: 6px; padding: 10px 12px; background: rgba(0,0,0,.25); text-align: center; }
.ask-node b { display: block; font: 600 14px var(--serif); color: var(--gold-bright); margin-bottom: 2px; }
.ask-node span { font-size: 12px; color: var(--ink-dim); }
.ask-node.map { border-color: var(--gold-bright); box-shadow: inset 0 0 0 1px rgba(236,208,142,.25); }
.ask-arrow { color: var(--gold); font-size: 12px; text-align: center; white-space: nowrap; }
.ask-arrow svg { display: block; margin: 0 auto 2px; }
.ask-addr { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 6px; }
.ask-addr code { flex: 1 1 300px; font: 14px ui-monospace, Menlo, monospace; padding: 10px 12px; border: 1px solid var(--line); border-radius: 6px; background: rgba(0,0,0,.35); color: var(--gold-bright); overflow-wrap: anywhere; }
.ask-primary { cursor: pointer; font-weight: 600; padding: 10px 16px; border-radius: 6px; border: 1px solid var(--gold-bright); background: var(--gold-bright); color: #1a1208; }
.ask-note { font-size: 12.5px; color: var(--ink-dim); margin: 0 0 16px; }
.ask-tabs { display: flex; gap: 4px; margin: 6px 0 8px; flex-wrap: wrap; }
.ask-tabs button { cursor: pointer; font-size: 12.5px; padding: 5px 11px; border-radius: 3px; color: var(--ink-dim); background: transparent; border: 1px solid rgba(201,164,92,.3); }
.ask-tabs button[aria-selected="true"] { color: #1a1208; background: var(--gold-bright); border-color: var(--gold-bright); }
.ask-steps { margin: 0 0 16px; padding-left: 20px; font-size: 14px; line-height: 1.55; }
.ask-steps pre { font: 12.5px/1.5 ui-monospace, Menlo, monospace; background: rgba(0,0,0,.35); border: 1px solid rgba(201,164,92,.3); border-radius: 6px; padding: 10px; margin: 6px 0 0; overflow-x: auto; color: var(--ink); }
.ask-h3 { font: 600 16px var(--serif); color: var(--gold-bright); margin: 4px 0 8px; }
.ask-qs { display: grid; gap: 6px; margin: 0 0 16px; }
.ask-q { cursor: pointer; text-align: left; font: italic 14px var(--serif); color: var(--ink); padding: 9px 12px; border-radius: 6px; border: 1px solid rgba(201,164,92,.3); background: rgba(0,0,0,.2); display: flex; justify-content: space-between; gap: 10px; align-items: center; }
.ask-q:hover { border-color: var(--gold); }
.ask-q small { font: 600 11px var(--sans); color: var(--gold); white-space: nowrap; font-style: normal; }
.ask-q.here { border-color: rgba(236,208,142,.7); }
.ask-trends { border-top: 1px solid rgba(201,164,92,.25); padding-top: 12px; font-size: 13.5px; color: var(--ink-dim); }
.ask-trends ol { margin: 6px 0 0; padding-left: 20px; color: var(--ink); }
.ask-foot { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 14px; font-size: 13px; }
.ask-foot a { color: var(--gold-bright); }
@media (max-width: 640px) {
  .ask-card { width: 100vw; max-height: 100dvh; height: 100dvh; border-radius: 0; padding: 18px 16px; }
  .ask-flow { grid-template-columns: 1fr; }
  .ask-arrow svg { transform: rotate(90deg); }
}
`;

const ARROW = `<svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true"><path d="M0 5h24M20 1l5 4-5 4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;

export function install(app) {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const btn = app.ui.addTopButton({ id: "btn-ask", label: "Pergunte à sua IA", title: "Pergunte à sua IA: ligue este mapa ao Claude, ao ChatGPT ou ao Cursor", onClick: () => (modal ? close() : show()) });
  if (btn) {
    btn.classList.add("ask-btn");
    btn.innerHTML = `${GLYPH}<span class="lbl">Pergunte à sua IA</span><span class="ask-new">novo</span>`;
  }

  let modal = null, client = "claude";

  // The place open on the map, for a question about it.
  function here() {
    const c = app.state?.selectedCity;
    if (c?.name) return c.full || c.name;
    const s = app.state?.selectedState;
    const st = s == null ? null : app.data.states?.[typeof s === "number" ? s : s.index] || app.data.states?.find((x) => x.abbr === s || x.fips === s);
    return st?.name || null;
  }

  function questions() {
    const place = here();
    const out = QUESTIONS.map((q) => ({ q }));
    if (place) out.unshift({ q: `Me fale de ${place}: quem mora, do que vive, o que exporta e como está a escola e a saúde.`, here: true });
    return out;
  }

  function show() {
    goal("ask:open");
    modal = document.createElement("div");
    modal.className = "modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "ask-title");
    modal.innerHTML = `
      <div class="panel ask-card">
        <button type="button" class="close icon-btn" data-close aria-label="Fechar">${icon("close", "x", { size: 13 })}</button>
        <p class="ask-kicker">Novo · servidor MCP aberto e grátis</p>
        <h2 id="ask-title">Converse com este mapa pelo seu assistente de IA.</h2>
        <p class="ask-lede">O <b>MCP</b> é o padrão que deixa um assistente de IA usar ferramentas de fora. Ligue o endereço abaixo no Claude, no ChatGPT ou no Cursor, e ele passa a consultar os dados deste mapa para responder você: qualquer município, cidade ou estado, cruzando o que quiser, com o ano e a fonte de cada número.</p>
        <div class="ask-flow" aria-label="Como funciona">
          <div class="ask-node"><b>Você pergunta</b><span>em português, na conversa</span></div>
          <div class="ask-arrow">${ARROW}</div>
          <div class="ask-node"><b>O seu assistente</b><span>Claude, ChatGPT, Cursor…</span></div>
          <div class="ask-arrow">${ARROW}consulta</div>
          <div class="ask-node map"><b>Terra à Vista</b><span>5.570 municípios, 32 fontes públicas</span></div>
        </div>
        <div class="ask-addr"><code data-addr>${esc(SERVER)}</code><button type="button" class="ask-primary" data-copy>Copiar o endereço</button></div>
        <p class="ask-note">Sem conta e sem chave: os dados são públicos. O assistente só consulta; nada é alterado.</p>
        <div class="ask-tabs" role="tablist" aria-label="Onde ligar">${CLIENTS.map((c) => `<button type="button" role="tab" data-client="${c.id}" aria-selected="${c.id === client}">${esc(c.name)}</button>`).join("")}</div>
        <ol class="ask-steps" data-steps></ol>
        <p class="ask-h3">Perguntas para começar</p>
        <div class="ask-qs" data-qs>${questions().map((x) => `<button type="button" class="ask-q${x.here ? " here" : ""}" data-q="${esc(x.q)}"><span>"${esc(x.q)}"</span><small>Copiar</small></button>`).join("")}</div>
        <div class="ask-trends" data-trends>Lendo o índice da semana…</div>
        <div class="ask-foot"><a href="${PAGE}">Página completa: Pergunte ao mapa</a><a href="${RULES}">Como contamos, sem saber quem perguntou</a><a href="https://github.com/ciro-maciel/terra-a-vista/tree/main/mcp">O código do servidor</a></div>
      </div>`;
    document.body.appendChild(modal);
    renderSteps();
    loadTrends();
    modal.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    btn?.setAttribute("aria-pressed", "true");
    modal.querySelector("[data-copy]").focus();
    app.hash.update?.();
  }

  function close() {
    if (!modal) return;
    modal.remove();
    modal = null;
    document.removeEventListener("keydown", onKey);
    btn?.setAttribute("aria-pressed", "false");
    btn?.focus();
    app.hash.update?.();
  }

  const onKey = (e) => { if (e.key === "Escape") close(); };

  function renderSteps() {
    const c = CLIENTS.find((x) => x.id === client);
    modal.querySelector("[data-steps]").innerHTML = c.steps.map((s) => `<li>${esc(s)}</li>`).join("") + (c.code ? `<li style="list-style:none"><pre>${esc(c.code)}</pre></li>` : "");
    for (const b of modal.querySelectorAll("[data-client]")) b.setAttribute("aria-selected", String(b.dataset.client === client));
  }

  async function copy(text, button, done = "Copiado") {
    const before = button.innerHTML;
    try { await navigator.clipboard.writeText(text); button.textContent = done; }
    catch { button.textContent = "Selecione e copie"; }
    setTimeout(() => { if (button.isConnected) button.innerHTML = before; }, 2000);
  }

  function onClick(e) {
    if (e.target === modal) return close();
    const t = e.target.closest("button");
    if (!t) return;
    if (t.hasAttribute("data-close")) close();
    else if (t.hasAttribute("data-copy")) { goal("ask:copy"); copy(SERVER, t); }
    else if (t.dataset.client) { client = t.dataset.client; renderSteps(); }
    else if (t.dataset.q != null) { goal("ask:question"); copy(t.dataset.q, t.querySelector("small"), "Copiada"); }
  }

  async function loadTrends() {
    const box = modal?.querySelector("[data-trends]");
    if (!box) return;
    try {
      const doc = await (await fetch(TRENDS)).json();
      if (!box.isConnected) return;
      const top = doc.rankings?.places?.slice(0, 5) || [];
      box.innerHTML = doc.week && top.length
        ? `<b style="color:var(--gold-bright)">O que o Brasil está pesquisando</b> (semana ${esc(doc.week)}): <ol>${top.map((r) => `<li>${esc(r.name)}</li>`).join("")}</ol>`
        : `<b style="color:var(--gold-bright)">O que o Brasil está pesquisando</b>: toda semana, os lugares e as perguntas que mais pessoas diferentes fizeram ao mapa, sem saber quem perguntou. O primeiro índice sai quando um lugar passar de 10 pessoas.`;
    } catch {
      if (box.isConnected) box.textContent = "O índice da semana não respondeu agora.";
    }
  }

  app.hash.register("ia", {
    get: () => (modal ? "1" : null),
    set(v) {
      if (v && !modal) show();
      else if (!v && modal) close();
    },
  });

  app.ask = { open: show, close };
}

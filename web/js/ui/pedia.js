// The Almanac: what every number means and exactly where it comes from.
import { resolveTables } from "../terrain.js";
import { esc } from "../format.js";
import { parseHex, luminance } from "../color.js";
import { icon, glyph } from "./icon.js";

const COVER_ICON = { forest_deciduous: "l-forest", forest_evergreen: "l-forest", forest_mixed: "l-forest", cropland: "l-farmland", pasture: "l-farmland", urban: "l-developed" };
// Glyph colour that reads on a resource medallion (dark on light faces such as nuclear yellow or silver).
const inkOn = (hex) => {
  try { return /^#[0-9a-f]{6}$/i.test(hex || "") && luminance(parseHex(hex)) > 0.4 ? "#1c1710" : "#f8f0d8"; } catch { return "#f8f0d8"; }
};
const CATEGORY = { energy: "Energia", mineral: "Minerais", agri: "Agropecuária" };

export function initPedia(data) {
  const modal = document.getElementById("pedia");
  const card = modal.querySelector(".modal-card");
  const nav = document.getElementById("pedia-nav");
  const body = document.getElementById("pedia-body");
  const srcName = (id) => data.sources?.find((s) => s.id === id)?.title || id || "";
  let restoreFocus = null;

  const h2 = (ic, fb, text) => `<h2>${icon(ic, fb, { size: 24 })}<span>${esc(text)}</span></h2>`;

  const pages = {
    "Sobre o mapa": () => `
      ${h2("pedia", "", "Sobre o mapa")}
      <p>Este é o Brasil de verdade, desenhado como um jogo de estratégia. Nada é inventado: cada hexágono, cidade e
      número vem de um dado público, listado em <i>Fontes</i>.</p>
      <h4>Como é feito</h4>
      <p>O país é projetado (Albers de áreas iguais, com os parâmetros do IBGE) e cortado em ${data.world.grid.cols}×${data.world.grid.rows}
      hexágonos de ${data.world.grid.radius * 2} km de ponta a ponta. Cada hexágono pertence ao estado e ao município da maioria
      dos seus 7 pontos de amostra. O relevo vem das altitudes medidas dentro de cada hexágono.</p>
      <p>${data.nation.city_rule ? esc(data.nation.city_rule) : ""} Os números de uma cidade cobrem todos os seus municípios,
      não só o principal.</p>
      <h4>Controles</h4>
      <p>Arraste ou use as setas / WASD para mover · role, use +/– ou dê um clique duplo para aproximar · clique numa cidade
      ou num estado para abrir · / ou ⌘K para buscar · L troca a lente · R mostra ou esconde os recursos · ? mostra todos os
      atalhos · Esc fecha.</p>
      <p>A barra de endereço sempre guarda um link para o que você está vendo (lente, seleção e enquadramento); use
      <i>Compartilhar</i> para copiar o link ou baixar uma imagem.</p>`,
    Rendimentos: () => `
      ${h2("y-production", "", "Rendimentos")}
      <p>Os rendimentos de um jogo de estratégia, ligados a medidas reais. Os rendimentos de trabalho contam <i>empregos
      formais assalariados</i> numa atividade, onde fica a empresa (o IBGE monta o Cadastro Central de Empresas a partir da
      RAIS). <b>Ouro é o PIB</b>: o que se produz num ano, contado onde o trabalho é feito.</p>
      <table>${data.nation.yields.map((y) => `<tr><td class="ic" style="color:${esc(y.color)}">${glyph(y, 26)}</td><td><b style="color:${esc(y.color)}">${esc(y.label)}${y.key === "gold" ? " (PIB)" : ""}</b><br>${esc(y.description)}</td></tr>`).join("")}</table>
      <h4>O que fica de fora</h4>
      <p>O trabalho informal, que é perto de 4 em cada 10 ocupados no Brasil, não está nos rendimentos de trabalho. Renda,
      aluguel e desemprego por cidade ainda não entraram: aparecem como "–", que quer dizer "sem dado", nunca zero.</p>`,
    Estados: () => `
      ${h2("terrain", "", "Estados")}
      <p>Clique em qualquer hexágono de terra sem cidade para abrir o seu estado. Os números de um estado são os totais do
      estado nas mesmas fontes das cidades (${esc(data.nation.vintage)}${data.nation.gdp_vintage ? `; PIB: ${esc(data.nation.gdp_vintage)}` : ""}),
      não a soma das cidades, então as áreas rurais também contam.</p>
      <p>As <b>posições</b> ("3º de 27") comparam as 26 unidades da federação e o Distrito Federal; 1 é o maior. As ilhas
      oceânicas mais distantes (Trindade e Martim Vaz, São Pedro e São Paulo) ficam fora do enquadramento do mapa.</p>
      <p>Cidades que cruzam divisas estaduais (Brasília com o entorno goiano, Petrolina e Juazeiro, Teresina e Timon…)
      aparecem em cada estado que tocam, com os números da cidade inteira.</p>
      ${data.states ? "" : `<p class="muted">Esta versão dos dados não tem states.json, então os painéis dos estados mostram só nomes e cidades.</p>`}`,
    Terreno: () => {
      const t = data.w?.tables || resolveTables(data.world.tables);
      const hasCover = Array.isArray(data.world.cover);
      const row = (x) => `<tr><td class="nm">${x.color ? `<span class="swatch" style="background:${esc(x.color)}"></span>` : ""}${
        COVER_ICON[x.key] ? icon(COVER_ICON[x.key], "", { size: 15 }) + " " : ""}<b>${esc(x.name)}</b></td><td>${esc(x.rule || "")}</td></tr>`;
      return `
      ${h2("terrain", "", "Terreno")}
      <p>Cada hexágono faz a média das altitudes do ETOPO1 dentro dele. O relevo vem da altitude média e da rugosidade
      (desvio-padrão) dessas amostras; o sombreado vem da diferença de altitude com os vizinhos, com luz vinda do noroeste.</p>
      <h4>${icon("l-forest", "", { size: 16 })} Cobertura do solo</h4>
      ${hasCover
        ? `<p>A cor de base de cada hexágono é o seu grupo de cobertura dominante: o maior grupo entre as amostras de terra
           dentro dele (ESA WorldCover 2021). Os símbolos pequenos mostram a mistura: as árvores crescem com a parcela de
           floresta, e roças, juncos, arbustos e tufos de capim marcam lavoura, área úmida, caatinga e campo. O WorldCover não
           separa pasto de campo.</p>
           <table>${t.cover.filter((x) => x.id > 0).map(row).join("")}</table>`
        : `<p class="muted">Esta versão dos dados ainda não tem cobertura do solo; a terra é colorida pela altitude.</p>`}
      <h4>Relevo</h4>
      <table>${t.relief.map(row).join("")}</table>
      <h4>${icon("r-hydro", "", { size: 16 })} Água</h4>
      <table>${t.water.filter((x) => x.id > 0).map(row).join("")}</table>
      <h4>Além das fronteiras</h4>
      <p class="muted">Os países vizinhos aparecem sob uma névoa leve: estão ali para dar contexto e não são mapeados em detalhe.</p>`;
    },
    Lentes: () => `
      ${h2("layers", "", "Lentes")}
      <p>As lentes recolorem o mapa por uma medida, feita a partir dos municípios (${esc(data.lenses.vintage)}). Cada hexágono
      é amostrado em 7 pontos, e um município que cobre parte deles conta como cobrindo essa parcela do hexágono.</p>
      <p>A legenda mostra quantos hexágonos caem em cada valor. Passe o mouse ou arraste nela para mostrar só aquela faixa no mapa.</p>
      ${(data.lenses.groups || [{ id: null, name: "" }]).map((g) => {
        const ls = data.lenses.lenses.filter((l) => !g.id || l.group === g.id);
        if (!ls.length) return "";
        return `${g.name ? `<h3 class="grp">${icon(`g-${g.id}`, "", { size: 16 })} ${esc(g.name)}</h3>` : ""}${ls.map((l) => `
          <div class="lens-entry"><div class="le-ic">${glyph(l, 26)}</div><div>
          <h4>${esc(l.name)}</h4><p>${esc(l.description)}<br>
          <i class="le-ramp" style="background:linear-gradient(90deg, ${(l.ramp || []).map(esc).join(",")})"></i>
          <span class="muted">Escala: ${esc(l.scale === "log" ? "logarítmica" : "linear")}, ${l.domain[0].toLocaleString("pt-BR")}–${l.domain[1].toLocaleString("pt-BR")} ${esc(l.unit)}${
            l.higher_is === "good" ? " · maior é melhor" : l.higher_is === "bad" ? " · maior é pior" : ""}${l.source ? " · " + esc(srcName(l.source)) : ""}</span></p></div></div>`).join("")}`;
      }).join("")}`,
    Recursos: () => {
      const r = data.resources;
      if (!r?.types?.length) return `${h2("resources", "", "Recursos")}<p class="muted">Esta versão dos dados ainda não tem a camada de recursos.</p>`;
      const count = new Map();
      for (const it of r.items || []) count.set(it.type, (count.get(it.type) || 0) + 1);
      const cats = [...new Set(r.types.map((t) => t.category || "other"))];
      return `
      ${h2("resources", "", "Recursos")}
      <p>Os recursos marcam as maiores usinas, minas e campos de petróleo e gás do país, nos hexágonos onde ficam. Só
      aparecem os locais relevantes: o limite de cada tipo está na descrição dele. Com o mapa afastado, cada hexágono mostra
      o seu recurso mais importante; aproxime para ver mais. Aperte <b>R</b> para mostrar ou esconder.</p>
      ${cats.map((c) => `<h4>${esc(CATEGORY[c] || c)}</h4><table class="res-table">
        <tr><th></th><th>Tipo</th><th>O que conta</th><th>Locais</th></tr>
        ${r.types.filter((t) => (t.category || "other") === c).map((t) => `<tr>
          <td class="ic"><span class="res-ic" style="background:${esc(t.color || "#24384f")};color:${inkOn(t.color)}">${glyph(t, 20)}</span></td>
          <td class="nm"><b>${esc(t.name)}</b>${t.unit ? `<br><span class="muted">valor em ${esc(t.unit)}</span>` : ""}</td>
          <td>${esc(t.description || "")}<br><span class="muted">Fonte: ${esc(srcName(t.source))}</span></td>
          <td class="num">${count.get(t.id) || 0}</td></tr>`).join("")}</table>`).join("")}`;
    },
    Fontes: () => `
      ${h2("pedia", "", "Fontes")}
      ${data.sources.map((s) => `
        <h4>${esc(s.title)}</h4>
        <p>${esc(s.description)}<br>
        <span class="muted">${esc(s.publisher)} · ${esc(s.license)}${s.vintage ? " · " + esc(s.vintage) : ""} ·
        <a href="${esc(s.homepage)}" target="_blank" rel="noopener">página</a></span></p>
        <table>${(s.files || []).map((f) => `<tr><td><code>${esc(f.url)}</code></td><td class="muted" style="white-space:nowrap">${esc((f.retrieved || "").slice(0, 10))}<br>${((f.bytes || 0) / 1e6).toFixed(1).replace(".", ",")} MB</td></tr>`).join("")}</table>`).join("")}`,
  };

  const show = (name) => {
    if (!pages[name]) name = "Sobre o mapa";
    body.innerHTML = pages[name]();
    body.scrollTop = 0;
    nav.querySelectorAll("button").forEach((b) => {
      const on = b.dataset.page === name;
      b.classList.toggle("active", on);
      b.setAttribute("aria-current", on ? "page" : "false");
    });
  };
  nav.innerHTML = `<div class="hd">Almanaque</div>` + Object.keys(pages).map((p) => `<button data-page="${esc(p)}">${esc(p)}</button>`).join("");
  nav.onclick = (e) => {
    const b = e.target.closest("button[data-page]");
    if (b) show(b.dataset.page);
  };
  const close = () => {
    if (modal.hidden) return;
    modal.hidden = true;
    if (restoreFocus && document.contains(restoreFocus)) restoreFocus.focus();
    restoreFocus = null;
  };
  modal.onclick = (e) => {
    if (e.target === modal || e.target.closest("[data-close]")) close();
  };
  // Keep Tab inside the dialog.
  modal.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const f = [...card.querySelectorAll("button, a[href], [tabindex]:not([tabindex='-1'])")].filter((x) => x.offsetParent);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  return {
    open(page = "Sobre o mapa") {
      if (modal.hidden) restoreFocus = document.activeElement;
      show(page);
      modal.hidden = false;
      (nav.querySelector("button.active") || card.querySelector("[data-close]"))?.focus();
    },
    close,
    get isOpen() {
      return !modal.hidden;
    },
  };
}

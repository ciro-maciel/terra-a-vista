// Keyboard & mouse cheat-sheet.
import { icon } from "../ui/icon.js";
import { tr } from "../i18n.js";

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
const MOD = isMac ? "⌘" : "Ctrl";

const ROWS = [
  [tr("Mover"), [
    [[tr("Arrastar"), "←↑→↓", "WASD"], tr("Mover o mapa")],
    [[tr("Rolar"), "+", "–"], tr("Aproximar e afastar")],
    [[tr("Clique duplo")], tr("Aproximar num ponto")],
    [[tr("Dois dedos")], tr("Pinçar para aproximar, arrastar para mover (toque)")],
    [[tr("Minimapa")], tr("Clicar ou arrastar para ir até lá")],
  ]],
  [tr("Explorar"), [
    [[tr("Clicar na cidade")], tr("Abrir a tela da cidade")],
    [[tr("Clicar no terreno")], tr("Abrir aquele estado")],
    [["/", `${MOD} K`], tr("Buscar cidades e estados")],
    [["L", "Shift L"], tr("Próxima lente / lente anterior")],
    [[tr("Legenda")], tr("Passar o mouse ou arrastar na escala para mostrar só aquela faixa")],
    [["R"], tr("Mostrar ou esconder os recursos")],
  ]],
  [tr("Painéis"), [
    [["?"], tr("Esta ajuda")],
    [["Esc"], tr("Fechar a ajuda, a busca, o Almanaque e, por fim, o painel")],
  ]],
];

export function initHelp() {
  const modal = document.getElementById("help");
  if (!modal) return { open() {}, close() {}, get isOpen() { return false; } };
  const card = modal.querySelector(".help-card");
  let restore = null;
  card.innerHTML = tr("\n    <button class=\"icon-btn help-close\" data-close aria-label=\"Fechar a ajuda\">{0}</button>\n    <h2 id=\"help-title\">{1}<span>Controles</span></h2>\n    <div class=\"help-cols\">{2}</div>\n    <p class=\"help-foot\">Todo número leva a um dado público: abra o <b>Almanaque</b> para ver as fontes.\n      O link na barra de endereço sempre reabre esta mesma vista.\n      Código-fonte: <a href=\"https://github.com/ciro-maciel/terra-a-vista\">github.com/ciro-maciel/terra-a-vista</a> (MIT), a partir do <a href=\"https://karpathy.ai/usaciv/\">usaciv</a> de Andrej Karpathy.</p>", icon("close", "✕", { size: 13 }), icon("help", "?", { size: 22 }), ROWS.map(([title, rows]) => `
      <section><h3>${title}</h3>${rows.map(([keys, what]) => `
        <div class="help-row"><span class="keys">${keys.map((k) => `<kbd>${k}</kbd>`).join("")}</span><span>${what}</span></div>`).join("")}
      </section>`).join(""));

  const close = () => {
    if (modal.hidden) return;
    modal.hidden = true;
    if (restore && document.contains(restore)) restore.focus();
    restore = null;
  };
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest("[data-close]")) close();
  });
  modal.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    e.preventDefault(); // the only focusable control is the close button
    card.querySelector("[data-close]").focus();
  });

  return {
    open() {
      if (!modal.hidden) return;
      restore = document.activeElement;
      modal.hidden = false;
      card.querySelector("[data-close]").focus();
    },
    close,
    toggle() { modal.hidden ? this.open() : close(); },
    get isOpen() { return !modal.hidden; },
  };
}

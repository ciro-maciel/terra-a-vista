// Keyboard & mouse cheat-sheet.
import { icon } from "../ui/icon.js";

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
const MOD = isMac ? "⌘" : "Ctrl";

const ROWS = [
  ["Mover", [
    [["Arrastar", "←↑→↓", "WASD"], "Mover o mapa"],
    [["Rolar", "+", "–"], "Aproximar e afastar"],
    [["Clique duplo"], "Aproximar num ponto"],
    [["Dois dedos"], "Pinçar para aproximar, arrastar para mover (toque)"],
    [["Minimapa"], "Clicar ou arrastar para ir até lá"],
  ]],
  ["Explorar", [
    [["Clicar na cidade"], "Abrir a tela da cidade"],
    [["Clicar no terreno"], "Abrir aquele estado"],
    [["/", `${MOD} K`], "Buscar cidades e estados"],
    [["L", "Shift L"], "Próxima lente / lente anterior"],
    [["Legenda"], "Passar o mouse ou arrastar na escala para mostrar só aquela faixa"],
    [["R"], "Mostrar ou esconder os recursos"],
  ]],
  ["Painéis", [
    [["?"], "Esta ajuda"],
    [["Esc"], "Fechar a ajuda, a busca, o Almanaque e, por fim, o painel"],
  ]],
];

export function initHelp() {
  const modal = document.getElementById("help");
  if (!modal) return { open() {}, close() {}, get isOpen() { return false; } };
  const card = modal.querySelector(".help-card");
  let restore = null;
  card.innerHTML = `
    <button class="icon-btn help-close" data-close aria-label="Fechar a ajuda">${icon("close", "✕", { size: 13 })}</button>
    <h2 id="help-title">${icon("help", "?", { size: 22 })}<span>Controles</span></h2>
    <div class="help-cols">${ROWS.map(([title, rows]) => `
      <section><h3>${title}</h3>${rows.map(([keys, what]) => `
        <div class="help-row"><span class="keys">${keys.map((k) => `<kbd>${k}</kbd>`).join("")}</span><span>${what}</span></div>`).join("")}
      </section>`).join("")}</div>
    <p class="help-foot">Todo número leva a um dado público: abra o <b>Almanaque</b> para ver as fontes.
      O link na barra de endereço sempre reabre esta mesma vista.
      Código-fonte: <a href="https://github.com/ciro-maciel/terra-a-vista">github.com/ciro-maciel/terra-a-vista</a> (MIT), a partir do <a href="https://karpathy.ai/usaciv/">usaciv</a> de Andrej Karpathy.</p>`;

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

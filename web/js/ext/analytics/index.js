// Analytics: tells Operations Analytics what people do on the map, through the app's own hooks.
// The tracker itself (window.analytics, loaded in index.html) counts the page view; this extension only adds goals.
//
//   lens:<id>         one of the map's lenses was chosen
//   timeline:<theme>  the timeline was opened, or its theme changed while open ("people" when no tema= in the hash)
//   advisor:<id>      an advisor was opened ("council" for the picker)
//   panel:city        a city panel was opened
//   panel:state       a state panel was opened
//   why:open          a "Por quê?" question was opened in the city or state panel
//   share             the Share button was pressed; share:copy and share:image are what was done from it
//   almanac:open      the Almanaque was opened
//   ask:open, ask:copy, ask:question  sent by ext/ask (the MCP panel) itself
//
// Names are built only from the app's fixed ids (lenses, advisors, timeline themes) and checked against a short
// pattern; nothing the person typed or any place they picked goes in a name. Without the tracker (a blocker,
// Do Not Track, localhost) every call does nothing, and measuring never breaks the map.

const SAFE_ID = /^[a-z0-9_-]{1,40}$/;

function goal(name) {
  try {
    window.analytics?.trackGoal(name);
  } catch {
    // Measuring must never break the map.
  }
}

function goalFor(prefix, id) {
  const value = String(id ?? "").toLowerCase();
  if (SAFE_ID.test(value)) goal(`${prefix}:${value}`);
}

export function install(app) {
  // The payload is the lens object (null when the lens is turned off). Advisors and the timeline paint the map
  // with lenses of their own and put the person's lens back when they close, so only the map's own lenses
  // (app.lensById) count, and only when they differ from the last one counted.
  let lastLens = null;
  app.on?.("lens", (lens) => {
    const id = lens?.id;
    if (!id || app.lensById?.get?.(id) !== lens || id === lastLens) return;
    lastLens = id;
    goalFor("lens", id);
  });

  let lastAdvisor = null;
  app.on?.("mode", ({ name, prev, params } = {}) => {
    if (name !== "advisor") return;
    const id = params?.id || "council";
    if (prev !== "advisor" || id !== lastAdvisor) goalFor("advisor", id);
    lastAdvisor = id;
  });

  app.on?.("select", (sel) => {
    if (sel?.kind === "city") goal("panel:city");
    else if (sel?.kind === "state") goal("panel:state");
  });

  // The timeline is not a mode: it lives in the hash (year= while open, tema= for the theme). The hash writer
  // commits with pushState/replaceState, so each commit is checked; the state the page was loaded with is the
  // baseline and is not counted, so a shared link does not look like an interaction.
  const timelineSig = () => {
    const hash = app.hash?.value;
    if (!hash || !hash("year")) return "";
    return String(app.timeline?.theme || hash("tema") || "people");
  };
  let lastTimeline = timelineSig();
  const checkTimeline = () => {
    const sig = timelineSig();
    if (sig && sig !== lastTimeline) goalFor("timeline", sig);
    lastTimeline = sig;
  };
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      try { checkTimeline(); } catch { /* never break navigation */ }
      return result;
    };
  }
  window.addEventListener("hashchange", () => { lastTimeline = timelineSig(); });

  // "Por quê?" answers are <details> inside the panel; toggle does not bubble, so listen in the capture phase.
  document.addEventListener("toggle", (e) => {
    const el = e.target;
    if (el?.tagName === "DETAILS" && el.open && el.closest?.(".why")) goal("why:open");
  }, true);

  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!target?.closest) return;
    // Capture phase: runs before the buttons' own handlers, so isOpen still tells opening from closing.
    if (target.closest("#btn-share")) { if (!app.share?.isOpen) goal("share"); }
    else if (target.closest("#btn-pedia")) { if (!app.pedia?.isOpen) goal("almanac:open"); }
    else {
      const act = target.closest("#share-pop [data-act]")?.getAttribute("data-act");
      if (act === "copy" || act === "image") goal(`share:${act}`);
    }
  }, true);
}

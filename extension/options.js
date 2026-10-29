// T() comes from i18n.js

const DEFAULTS = { port: 9614, intercept: true, minSizeKB: 0, bubbleSize: "normal", bubbleScale: null, bubbleStyle: "netlab" };
const OLD_SIZES = { small: 85, normal: 100, large: 125 };

function saved() {
  const el = document.getElementById("saved");
  el.textContent = T("saved");
  setTimeout(() => (el.textContent = ""), 1500);
}

/** Ask the app on `port` who it is. */
async function testPort(port) {
  const out = document.getElementById("testResult");
  out.className = "test";
  out.textContent = T("testing");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/ping`, { headers: { "X-EdsDown": "1" }, signal: ctrl.signal });
    const j = await r.json();
    if (!r.ok || j.app !== "EdsDown") throw new Error("not EdsDown");
    out.className = "test ok";
    out.textContent = T("testOk", j.version || "");
  } catch {
    out.className = "test err";
    out.textContent = T("testFail", port);
  } finally {
    clearTimeout(timer);
  }
}

async function init() {
  const opts = Object.assign({}, DEFAULTS, await chrome.storage.local.get(DEFAULTS));
  const intercept = document.getElementById("intercept");
  const minSize = document.getElementById("minSize");
  const port = document.getElementById("port");
  intercept.checked = opts.intercept;
  minSize.value = opts.minSizeKB;
  port.value = opts.port;

  // the "Download this video" button: size 50% - 200% and its look
  const scale = document.getElementById("bubbleScale");
  const scaleText = document.getElementById("bubbleScaleText");
  const pct = opts.bubbleScale != null ? Math.round(opts.bubbleScale * 100) : OLD_SIZES[opts.bubbleSize] || 100;
  scale.value = String(pct);
  scaleText.textContent = `${pct}%`;
  scale.addEventListener("input", () => {
    scaleText.textContent = `${scale.value}%`;
    chrome.storage.local.set({ bubbleScale: Number(scale.value) / 100 });
  });
  scale.addEventListener("change", saved);
  const style = document.getElementById("bubbleStyle");
  style.value = opts.bubbleStyle || "netlab";
  style.addEventListener("change", () => chrome.storage.local.set({ bubbleStyle: style.value }).then(saved));
  intercept.addEventListener("change", () => chrome.storage.local.set({ intercept: intercept.checked }).then(saved));
  minSize.addEventListener("change", () =>
    chrome.storage.local.set({ minSizeKB: Math.max(0, Number(minSize.value) || 0) }).then(saved)
  );
  port.addEventListener("change", () => {
    const p = Number(port.value);
    if (p >= 1024 && p <= 65535) {
      chrome.storage.local.set({ port: p }).then(saved);
      testPort(p);
    }
  });
  document.getElementById("test").addEventListener("click", () => testPort(Number(port.value) || DEFAULTS.port));
}

init();

// T() comes from i18n.js

const SIZES = ["small", "normal", "large"];

function note(text, ok) {
  const el = document.getElementById("note");
  el.textContent = text || "";
  el.className = "note" + (text ? (ok ? " ok" : " err") : "");
}

function renderMedia(tab, items) {
  if (!items || !items.length) return;
  const box = document.getElementById("media");
  box.replaceChildren();
  const title = (tab.title || "video").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 120);
  for (const m of items) {
    const row = document.createElement("div");
    row.className = "media";
    const info = document.createElement("div");
    info.textContent = m.label;
    const small = document.createElement("small");
    small.textContent = m.sub || "";
    info.appendChild(small);
    const btn = document.createElement("button");
    btn.textContent = T("download");
    btn.disabled = !!m.disabled;
    btn.addEventListener("click", () => {
      chrome.runtime.sendMessage(
        { type: "edsdown-download", item: m, title: tab.title, referrer: tab.url, fileName: `${title}.${m.ext || "mp4"}` },
        (res) => {
          btn.textContent = res && res.ok ? T("sent") : T("notRunningShort");
        }
      );
    });
    row.append(info, btn);
    box.appendChild(row);
  }
}

async function init() {
  document.getElementById("settings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  // "Send browser downloads to EdsDown" (same switch as in the settings page)
  const intercept = document.getElementById("intercept");
  chrome.storage.local.get({ intercept: true }, (o) => (intercept.checked = !!o.intercept));
  intercept.addEventListener("change", () => chrome.storage.local.set({ intercept: intercept.checked }));

  // size of the "Download this video" button on pages
  const sizes = [...document.querySelectorAll("#sizes button")];
  const mark = (v) => sizes.forEach((b) => b.classList.toggle("on", b.dataset.size === v));
  chrome.storage.local.get({ bubbleSize: "normal" }, (o) => mark(SIZES.includes(o.bubbleSize) ? o.bubbleSize : "normal"));
  for (const b of sizes) {
    b.addEventListener("click", () => {
      chrome.storage.local.set({ bubbleSize: b.dataset.size });
      mark(b.dataset.size);
    });
  }

  chrome.runtime.sendMessage({ type: "edsdown-status" }, (res) => {
    const el = document.getElementById("status");
    const ok = res && res.ok;
    el.textContent = ok ? T("connected") : T("notRunningShort");
    el.classList.toggle("on", !!ok);
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // a pasted link goes straight to the app
  const url = document.getElementById("url");
  document.getElementById("addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const link = url.value.trim();
    if (!/^https?:\/\/\S+$/i.test(link)) return note(T("invalidLink"), false);
    chrome.runtime.sendMessage({ type: "edsdown-add-url", url: link, referrer: tab && /^https?:/i.test(tab.url || "") ? tab.url : null }, (res) => {
      if (res && res.ok) {
        url.value = "";
        note(T("sentToApp"), true);
      } else {
        note(T("appNotRunning"), false);
      }
    });
  });

  if (!tab) return;
  const grab = document.getElementById("grab");
  grab.disabled = !/^https?:/i.test(tab.url || "");
  grab.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "edsdown-grab-video", tabId: tab.id });
    window.close();
  });

  chrome.runtime.sendMessage({ type: "edsdown-get-media", tabId: tab.id }, (items) => renderMedia(tab, items));
}

init();

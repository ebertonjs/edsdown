// T() comes from i18n.js

function note(text, ok) {
  const el = document.getElementById("note");
  el.textContent = text || "";
  el.className = "note" + (text ? (ok ? " ok" : " err") : "");
}

function mediaRow(label, sub, button) {
  const row = document.createElement("div");
  row.className = "media";
  const info = document.createElement("div");
  info.textContent = label;
  if (sub) {
    const small = document.createElement("small");
    small.textContent = sub;
    info.appendChild(small);
  }
  row.append(info, button);
  return row;
}

function button(text, onClick) {
  const b = document.createElement("button");
  b.className = "btn";
  b.textContent = text;
  if (onClick) b.addEventListener("click", () => onClick(b));
  return b;
}

function renderMedia(tab, items) {
  const box = document.getElementById("media");
  const playlist = /youtube\.com/i.test(tab.url || "") && /[?&]list=/.test(tab.url || "");
  if ((!items || !items.length) && !playlist) return;
  box.replaceChildren();
  const title = (tab.title || "video").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 120);
  const send = (item, btn) =>
    chrome.runtime.sendMessage(
      { type: "edsdown-download", item, title: tab.title, referrer: tab.url, fileName: `${title}.${item.ext || "mp4"}` },
      (res) => (btn.textContent = res && res.ok ? T("sent") : T("notRunningShort"))
    );
  // a YouTube playlist: all of its videos in the app's playlist window
  if (playlist) {
    box.appendChild(
      mediaRow(
        T("allVideosPlaylist"),
        "",
        button(T("downloadAll"), (btn) =>
          chrome.runtime.sendMessage({ type: "edsdown-playlist", url: tab.url }, (res) => {
            btn.textContent = res && res.ok ? T("opened") : T("notRunningShort");
          })
        )
      )
    );
  }
  for (const m of items || []) {
    const btn = button(T("download"), () => {
      if (!m.resolve) return send(m, btn);
      // a stream: its qualities come from the app, shown in its place
      btn.textContent = "…";
      btn.disabled = true;
      chrome.runtime.sendMessage({ type: "edsdown-resolve-video", resolve: m.resolve }, (res) => {
        if (!res || res.error || !res.items) {
          btn.textContent = (res && res.error) || T("notRunningShort");
          return;
        }
        row.replaceWith(...res.items.map((it) => mediaRow(it.label, it.sub, button(T("download"), (b2) => send(it, b2)))));
      });
    });
    btn.disabled = !!m.disabled;
    const row = mediaRow(m.label, m.sub || "", btn);
    box.appendChild(row);
  }
}

async function init() {
  document.getElementById("settings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  // the on / off switch: off = the browser keeps its downloads, no buttons
  // on videos, nothing is looked up (the add-in stays installed)
  const on = document.getElementById("enabled");
  const showOn = (v) => {
    on.checked = v;
    document.body.classList.toggle("off", !v);
    document.getElementById("onText").textContent = v ? T("isOn") : T("isPaused");
    document.getElementById("onHint").textContent = v ? T("isOnHint") : T("isPausedHint");
  };
  chrome.storage.local.get({ enabled: true }, (o) => showOn(o.enabled !== false));
  on.addEventListener("change", () => {
    chrome.storage.local.set({ enabled: on.checked });
    showOn(on.checked);
  });

  // "Send browser downloads to EdsDown" (same switch as in the settings page)
  const intercept = document.getElementById("intercept");
  chrome.storage.local.get({ intercept: true }, (o) => (intercept.checked = !!o.intercept));
  intercept.addEventListener("change", () => chrome.storage.local.set({ intercept: intercept.checked }));

  // the "Download this video" button on pages: its look and size
  const look = document.getElementById("look");
  chrome.storage.local.get({ bubbleStyle: "netlab" }, (o) => (look.value = o.bubbleStyle || "netlab"));
  look.addEventListener("change", () => chrome.storage.local.set({ bubbleStyle: look.value }));
  const scale = document.getElementById("scale");
  const scaleText = document.getElementById("scaleText");
  const OLD = { small: 85, normal: 100, large: 125 };
  const show = (v) => {
    scale.value = String(v);
    scaleText.textContent = `${v}%`;
  };
  chrome.storage.local.get({ bubbleScale: null, bubbleSize: "normal" }, (o) =>
    show(o.bubbleScale != null ? Math.round(o.bubbleScale * 100) : OLD[o.bubbleSize] || 100)
  );
  const save = (v) => {
    show(v);
    chrome.storage.local.set({ bubbleScale: v / 100 });
  };
  scale.addEventListener("input", () => save(Number(scale.value)));
  document.getElementById("scaleReset").addEventListener("click", () => save(100));

  chrome.runtime.sendMessage({ type: "edsdown-status" }, (res) => {
    const el = document.getElementById("status");
    const ok = res && res.ok;
    el.textContent = ok ? T("connected") : T("notRunningShort");
    el.classList.toggle("on", !!ok);
    el.classList.toggle("off", !ok);
    if (!ok) {
      // the program registers "edsdown:" when it is installed
      const open = document.createElement("a");
      open.href = "edsdown://open";
      open.className = "btn open";
      open.textContent = T("openApp");
      open.addEventListener("click", () => setTimeout(() => window.close(), 300));
      document.querySelector("section").appendChild(open);
    }
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

// Floating "Download this video" button, shown when the background worker
// detects a video/audio file or HLS stream on the page.
(() => {
  if (window.top !== window) return;

  const T = (key, ...subs) => {
    try {
      return chrome.i18n.getMessage(key, subs.map(String)) || key;
    } catch {
      return key;
    }
  };
  // live list: its length costs nothing, so pages without videos do no work
  const videos = document.getElementsByTagName("video");

  let items = [];
  // Options > File Types > "Download panel for web players"
  let panel = { enabled: true, skipSites: [] };
  const hostMatches = (host, p) => {
    p = String(p).replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
    if (!p) return false;
    if (p.includes("*")) {
      // every regex character is literal except "*" and "?"
      const re = p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
      return new RegExp("^" + re + "$").test(host);
    }
    return host === p || host.endsWith("." + p);
  };
  const panelAllowed = () =>
    panel.enabled !== false && !(panel.skipSites || []).some((s) => hostMatches(location.hostname.toLowerCase(), s));

  const fmtSize = (n) => {
    if (!n) return "";
    const u = ["B", "KB", "MB", "GB"];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
  };

  const cleanTitle = () =>
    (document.title || "video").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().slice(0, 120) || "video";

  // The video the user is watching: a playing one first, else the biggest
  // one on screen.
  function biggestVideo() {
    let best = null;
    let score = 0;
    for (const v of videos) {
      const r = v.getBoundingClientRect();
      if (r.width < 200 || r.height < 100) continue;
      const visible = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      if (visible < 60) continue;
      const s = r.width * visible * (!v.paused && !v.ended ? 4 : 1);
      if (s > score) {
        best = v;
        score = s;
      }
    }
    return best;
  }

  // Pages that are one video: their own address is the best link for it.
  const VIDEO_PAGE = [
    /youtube\.com\/(watch|shorts\/|live\/)/i,
    /tiktok\.com\/@[^/]+\/(video|photo)\//i,
    /instagram\.com\/(reels?|p|tv)\//i,
    /facebook\.com\/(.+\/videos\/|watch|reel\/|share\/[vr]\/)/i,
    /fb\.watch\//i,
    /(twitter|x)\.com\/[^/]+\/status\//i,
    /vimeo\.com\/\d+/i,
    /dailymotion\.com\/video\//i,
    /reddit\.com\/r\/[^/]+\/comments\//i,
    /twitch\.tv\/(videos\/|[^/]+\/clip\/)/i,
    /pinterest\.[a-z.]+\/pin\//i,
    /snapchat\.com\/(spotlight|add)\//i,
    /linkedin\.com\/(posts|feed\/update)\//i,
  ];
  const isVideoPage = (u) => VIDEO_PAGE.some((r) => r.test(u));

  // In feeds (Facebook, Instagram, X...) the page shows many videos: look for
  // the post / reel link around the video being watched.
  function linkFor(video) {
    if (isVideoPage(location.href)) return location.href;
    return ownLink(video) || location.href;
  }

  // the post / video link next to this very video ("" = none found)
  function ownLink(video) {
    let el = video;
    for (let depth = 0; el && depth < 25; depth++, el = el.parentElement) {
      const links = el.querySelectorAll ? el.querySelectorAll("a[href]") : [];
      for (const a of links) {
        if (isVideoPage(a.href)) return a.href.split("#")[0];
      }
      if (el.tagName === "ARTICLE") break;
    }
    return "";
  }

  let lastPage = "";
  function watchVideos() {
    if (!videos.length) return;
    const v = biggestVideo();
    if (!v) return;
    // ignore tiny muted background loops that never play for long
    if (v.paused && !(v.duration > 3) && !v.currentSrc) return;
    const page = linkFor(v);
    if (page !== lastPage) {
      lastPage = page;
      chrome.runtime.sendMessage({ type: "edsdown-video-seen", page }).catch?.(() => {});
    }
  }

  // ---------------------------------------------------------------- bubbles
  // One "Download" bubble on every video of the page. The main video (the
  // one playing / the biggest) uses what the add-in found for the page; any
  // other video is looked up when its bubble is clicked. A bubble can be
  // dragged anywhere on its video and stays there.
  const bubbles = new Map(); // video -> bubble
  // size of the button: add-in settings > "Size of the Download button"
  const ZOOM = { small: 0.85, normal: 1, large: 1.25 };
  let zoom = 1;
  const applyZoom = () => {
    for (const b of bubbles.values()) b.host.style.setProperty("--z", String(zoom));
  };
  try {
    chrome.storage.local.get({ bubbleSize: "normal" }, (o) => {
      zoom = ZOOM[o && o.bubbleSize] || 1;
      applyZoom();
    });
    chrome.storage.onChanged.addListener((ch) => {
      if (ch.bubbleSize) {
        zoom = ZOOM[ch.bubbleSize.newValue] || 1;
        applyZoom();
        for (const b of bubbles.values()) placeOne(b);
      }
    });
  } catch (_) {
    // storage not reachable (add-in reloading): default size
  }
  // NetNOC / NetLAB glass: a frosted pill with an orange icon
  const STYLE = `
    :host { all: initial; }
    .wrap { font: 600 11px/1.25 "Inter", system-ui, "Segoe UI", sans-serif; color: #eef0f8; display: inline-block; zoom: var(--z, 1); }
    .btn { display: inline-flex; align-items: center; gap: 6px; color: #eef0f8; border: 1px solid rgba(255,255,255,.12);
           background: rgba(36,38,64,.78); backdrop-filter: blur(14px) saturate(1.2); -webkit-backdrop-filter: blur(14px) saturate(1.2);
           border-radius: 999px; padding: 4px 9px 4px 5px; cursor: grab; box-shadow: 0 8px 22px rgba(5,6,20,.45);
           font: inherit; opacity: .92; transition: opacity .15s, background .15s; user-select: none; white-space: nowrap; }
    .btn:hover { opacity: 1; background: rgba(52,55,88,.88); }
    .btn.drag { cursor: grabbing; opacity: 1; }
    .ico { width: 16px; height: 16px; flex: none; }
    .caret { font-size: 9px; opacity: .7; }
    .x { margin-left: 2px; opacity: .6; padding: 0 2px; cursor: pointer; }
    .x:hover { opacity: 1; }
    .list { width: 250px; margin-top: 6px; background: rgba(36,38,64,.86); border: 1px solid rgba(255,255,255,.1);
            backdrop-filter: blur(18px) saturate(1.2); -webkit-backdrop-filter: blur(18px) saturate(1.2);
            border-radius: 16px; box-shadow: 0 18px 40px rgba(5,6,20,.5); overflow: hidden; max-height: 320px; overflow-y: auto; }
    .item { padding: 9px 12px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,.07); }
    .item:last-child { border-bottom: 0; }
    .item:hover { background: rgba(255,255,255,.07); }
    .t { font-weight: 600; font-size: 12px; }
    .s { color: #8c93ab; font-size: 11px; font-weight: 400; word-break: break-all; }
    .msg { padding: 9px 12px; color: #36c06f; }
    .off { cursor: default; opacity: .7; }
    .off:hover { background: transparent; }
    .err { color: #ff6b66; }
    @media (prefers-color-scheme: light) {
      .wrap, .btn { color: #1c2333; }
      .btn { background: rgba(240,244,250,.82); border-color: rgba(255,255,255,.8); box-shadow: 0 8px 22px rgba(48,70,110,.25); }
      .btn:hover { background: rgba(255,255,255,.92); }
      .list { background: rgba(240,244,250,.9); border-color: rgba(255,255,255,.8); box-shadow: 0 16px 36px rgba(48,70,110,.25); }
      .item { border-bottom-color: rgba(28,35,51,.08); }
      .item:hover { background: rgba(255,255,255,.7); }
      .s { color: #6b778d; }
      .msg { color: #168a4a; }
      .err { color: #d23b32; }
    }`;

  function isMain(video) {
    return video === biggestVideo();
  }

  function directSrc(video) {
    const src = video.currentSrc || video.src || "";
    return /^https?:/i.test(src) && !/\.m3u8|\.mpd/i.test(src) ? src : "";
  }

  function makeBubble(video) {
    const host = document.createElement("div");
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    host.style.setProperty("--z", String(zoom));
    const root = host.attachShadow({ mode: "closed" });
    // built element by element (no HTML strings)
    const el = (tag, props = {}, ...kids) => {
      const e = document.createElement(tag);
      for (const [k, v] of Object.entries(props)) {
        if (k === "text") e.textContent = v;
        else e.setAttribute(k, v);
      }
      e.append(...kids);
      return e;
    };
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("class", "ico");
    svg.setAttribute("viewBox", "0 0 16 16");
    const circle = document.createElementNS(svgNs, "circle");
    for (const [k, v] of [["cx", "8"], ["cy", "8"], ["r", "7.5"], ["fill", "#f59e2e"]]) circle.setAttribute(k, v);
    const arrow = document.createElementNS(svgNs, "path");
    arrow.setAttribute("d", "M6.6 3.5h2.8v4.6h2.3L8 12 4.3 8.1h2.3z");
    arrow.setAttribute("fill", "#2a1600");
    svg.append(circle, arrow);
    const list = el("div", { class: "list", id: "list" });
    list.hidden = true;
    root.append(
      el("style", { text: STYLE }),
      el(
        "div",
        { class: "wrap" },
        el(
          "div",
          { class: "btn", id: "main" },
          svg,
          el("span", { id: "label", text: T("downloadThisVideo") }),
          el("span", { class: "caret", text: "▼" }),
          el("span", { class: "x", id: "close", title: T("hide"), text: "✕" })
        ),
        list
      )
    );
    const b = { host, root, video, open: false, own: null, loading: false, dx: null, dy: null };
    const btn = root.getElementById("main");
    // drag: move it anywhere on the video; a short press is a click
    btn.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || e.target.id === "close") return;
      const hr = host.getBoundingClientRect();
      drag = { b, btn, x: e.clientX, y: e.clientY, ox: e.clientX - hr.left, oy: e.clientY - hr.top, moved: false };
      e.preventDefault();
    });
    root.getElementById("close").addEventListener("click", () => {
      b.dismissed = true;
      host.remove();
    });
    document.documentElement.appendChild(host);
    bubbles.set(video, b);
    renderOne(b);
    placeOne(b);
    return b;
  }

  // the bubble being pressed / dragged (one pair of listeners for all of them)
  let drag = null;
  addEventListener("mousemove", (e) => {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 5) return;
    drag.moved = true;
    drag.btn.classList.add("drag");
    const r = drag.b.video.getBoundingClientRect();
    drag.b.dx = e.clientX - drag.ox - r.left;
    drag.b.dy = e.clientY - drag.oy - r.top;
    placeOne(drag.b);
  });
  addEventListener("mouseup", () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.btn.classList.remove("drag");
    if (!d.moved) clicked(d.b);
  });

  function itemsOf(b) {
    if (b.own) return b.own;
    return isMain(b.video) ? items : [];
  }

  function clicked(b) {
    const list = itemsOf(b);
    if (list.length === 1 && !list[0].disabled && !list[0].yt) {
      download(b, list[0]);
      return;
    }
    if (!list.length && !b.loading) {
      // another video on the page: look it up now
      b.loading = true;
      b.open = true;
      renderOne(b, T("lookingForVideo"));
      chrome.runtime.sendMessage(
        // its own post / video link, or its own file; the page only when
        // neither is there
        {
          type: "edsdown-resolve-video",
          page: ownLink(b.video) || (directSrc(b.video) ? "" : location.href),
          src: directSrc(b.video),
        },
        (res) => {
          b.loading = false;
          if (chrome.runtime.lastError || !res) return renderOne(b, T("appNotRunningRetry"), true);
          if (res.error) return renderOne(b, res.error, true);
          b.own = res.items || [];
          renderOne(b);
        }
      );
      return;
    }
    b.open = !b.open;
    renderOne(b);
  }

  function renderOne(b, note, isError) {
    const list = itemsOf(b);
    const usable = list.filter((i) => !i.disabled).length;
    b.root.getElementById("label").textContent = usable > 1 ? T("downloadThisVideoN", usable) : T("downloadThisVideo");
    const box = b.root.getElementById("list");
    box.hidden = !b.open;
    box.replaceChildren();
    if (note) {
      const d = document.createElement("div");
      d.className = "msg" + (isError ? " err" : "");
      d.textContent = note;
      box.appendChild(d);
      return;
    }
    list.forEach((m) => {
      const div = document.createElement("div");
      div.className = "item" + (m.disabled ? " off" : "");
      const t = document.createElement("div");
      t.className = "t";
      t.textContent = m.label;
      const s = document.createElement("div");
      s.className = "s";
      const sub = m.sub || "";
      s.textContent = sub.length > 90 ? sub.slice(0, 90) + "…" : sub;
      div.append(t, s);
      if (!m.disabled) div.addEventListener("click", () => download(b, m));
      box.appendChild(div);
    });
  }

  function placeOne(b) {
    const r = b.video.getBoundingClientRect();
    const onScreen = r.bottom > 0 && r.top < innerHeight && r.width >= 200 && r.height >= 100 && b.video.isConnected;
    b.host.style.display = onScreen ? "block" : "none";
    if (!onScreen) return;
    // its real size (the user can make the button smaller or bigger)
    const w = b.host.getBoundingClientRect().width || 170;
    let x = b.dx == null ? r.right - w - 8 : r.left + b.dx;
    let y = b.dy == null ? r.top + 8 : r.top + b.dy;
    x = Math.max(r.left, Math.min(x, r.right - 60));
    y = Math.max(r.top, Math.min(y, r.bottom - 24));
    b.host.style.left = `${Math.max(4, Math.min(x, innerWidth - w))}px`;
    b.host.style.top = `${Math.max(4, Math.min(y, innerHeight - 28))}px`;
  }

  function place() {
    if (!bubbles.size && !videos.length) return;
    if (!panelAllowed()) return;
    const vids = [...videos].filter((v) => {
      const r = v.getBoundingClientRect();
      return r.width >= 200 && r.height >= 100;
    });
    // bubbles of videos that went away
    for (const [v, b] of bubbles) {
      if (!v.isConnected) {
        b.host.remove();
        bubbles.delete(v);
      }
    }
    // only when there is something to offer: the main video once the add-in
    // found media, any other one as soon as it is a real player
    for (const v of vids.slice(0, 12)) {
      let b = bubbles.get(v);
      if (!b) {
        if (isMain(v) ? !items.length : v.paused && !(v.duration > 3) && !directSrc(v)) continue;
        b = makeBubble(v);
      }
      if (!b.dismissed) placeOne(b);
    }
  }

  function flashOne(b, text, isError) {
    b.open = true;
    renderOne(b, text, isError);
    setTimeout(() => {
      b.open = false;
      renderOne(b);
    }, 2500);
  }

  function download(b, m) {
    const fileName = `${cleanTitle()}.${m.ext || "mp4"}`;
    chrome.runtime.sendMessage({ type: "edsdown-download", item: m, title: document.title, fileName }, (res) => {
      if (chrome.runtime.lastError || !res || !res.ok) {
        flashOne(b, T("appNotRunningRetry"), true);
      } else {
        flashOne(b, T("sentToApp"), false);
      }
    });
  }

  function update(newItems) {
    items = newItems || [];
    if (!items.length) {
      // new page / new video: forget the bubbles and "hidden"
      for (const b of bubbles.values()) b.host.remove();
      bubbles.clear();
      return;
    }
    if (!panelAllowed()) return;
    place();
    for (const b of bubbles.values()) if (!b.own && !b.loading) renderOne(b);
  }

  // every link of the page (or the selection) for "Download all links"
  function collectLinks(selectionOnly) {
    const sel = selectionOnly ? getSelection() : null;
    const inSel = (el) => !sel || (sel.rangeCount > 0 && sel.containsNode(el, true));
    const out = [];
    const seen = new Set();
    const add = (url, text) => {
      if (!url || !/^https?:/i.test(url)) return;
      url = url.split("#")[0];
      if (seen.has(url)) return;
      seen.add(url);
      out.push({ url, text: (text || "").replace(/\s+/g, " ").trim().slice(0, 200) });
    };
    for (const a of document.querySelectorAll("a[href]")) if (inSel(a)) add(a.href, a.innerText || a.title);
    for (const el of document.querySelectorAll("img[src], video[src], audio[src], source[src], embed[src]")) {
      if (inSel(el)) add(el.src, el.alt || el.title || "");
    }
    return { page: location.href, links: out };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "edsdown-media") update(msg.items);
    if (msg.type === "edsdown-collect-links") {
      sendResponse(collectLinks(!!msg.selection));
      return true;
    }
    if (msg.type === "edsdown-open-panel") {
      const v = biggestVideo();
      let b = v && bubbles.get(v);
      if (v && !b) b = makeBubble(v);
      if (b) {
        b.dismissed = false;
        document.documentElement.appendChild(b.host);
        b.open = true;
        renderOne(b);
        placeOne(b);
      }
    }
    return false;
  });
  chrome.runtime.sendMessage({ type: "edsdown-config" }, (res) => {
    if (!chrome.runtime.lastError && res) {
      panel = res;
      if (!panelAllowed()) {
        for (const b of bubbles.values()) b.host.remove();
        bubbles.clear();
      }
    }
  });
  // keys held while clicking a link: Alt = let the browser download it, etc.
  // Only clicks with a key held wake the add-in (plus the next plain click,
  // which clears the keys again).
  let keysSent = false;
  addEventListener(
    "mousedown",
    (e) => {
      const held = e.altKey || e.ctrlKey || e.shiftKey;
      if (!held && !keysSent) return;
      keysSent = held;
      try {
        chrome.runtime.sendMessage({ type: "edsdown-keys", alt: e.altKey, ctrl: e.ctrlKey, shift: e.shiftKey }).catch?.(() => {});
      } catch {
        /* add-in reloaded: this page keeps an old script */
      }
    },
    true
  );
  // media detected before this script loaded
  chrome.runtime.sendMessage({ type: "edsdown-media-request" }, (res) => {
    if (!chrome.runtime.lastError) update(res);
  });

  addEventListener("scroll", place, { passive: true });
  addEventListener("resize", place, { passive: true });
  setInterval(place, 700);
  setInterval(watchVideos, 1500);
  document.addEventListener("play", () => setTimeout(watchVideos, 300), true);
  addEventListener("popstate", () => setTimeout(watchVideos, 500));
})();

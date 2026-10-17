// ==UserScript==
// @name         저스트컴 스페이스클라우드 자동 마감
// @description  예약수첩에서 연 스페이스클라우드 예약 달력에서, 외부예약/휴무일 추가로 시간을 막는다 (지금은 구조 확인 기능만)
// @version      0.1
// @match        https://partner.spacecloud.kr/*
// @run-at       document-idle
// @updateURL    https://tkdeh46-svg.github.io/sms/justcom-spacecloud.user.js
// @downloadURL  https://tkdeh46-svg.github.io/sms/justcom-spacecloud.user.js
// ==/UserScript==

(function () {
  "use strict";
  const VERSION = "sc-0.1";
  const params = new URLSearchParams(location.hash.slice(1));
  if (!params.has("jc-probe")) return;
  history.replaceState(null, "", location.pathname + location.search);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, timeout = 15000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(250); }
    return null;
  }
  const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const ownText = (el) => (el.innerText || "").replace(/\s+/g, " ").trim();

  function overlay(title, text) {
    document.getElementById("jc-overlay")?.remove();
    const box = document.createElement("div");
    box.id = "jc-overlay";
    box.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;background:#1E1B26;color:#fff;" +
      "border-radius:12px;padding:12px;font:14px/1.4 -apple-system,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.4)";
    const h = document.createElement("div"); h.textContent = `${title} [${VERSION}]`; h.style.cssText = "font-weight:700;margin-bottom:8px";
    const ta = document.createElement("textarea"); ta.readOnly = true; ta.value = text;
    ta.style.cssText = "width:100%;height:38vh;font:11px/1.35 ui-monospace,Menlo,monospace;color:#111;background:#fff;border-radius:8px;padding:8px;box-sizing:border-box";
    const row = document.createElement("div"); row.style.cssText = "display:flex;gap:8px;margin-top:8px";
    const mk = (label, fn) => { const b = document.createElement("button"); b.textContent = label; b.style.cssText = "flex:1;padding:12px;border:0;border-radius:10px;font:700 15px -apple-system,sans-serif;background:#E39A8F;color:#2A1210"; b.onclick = fn; return b; };
    row.append(
      mk("복사", async () => {
        try { await navigator.clipboard.writeText(ta.value); h.textContent = "복사했어요. Claude 대화창에 붙여넣어 주세요."; }
        catch (e) { ta.focus(); ta.select(); h.textContent = "전체 선택했어요. 복사를 눌러주세요."; }
      }),
      mk("닫기", () => box.remove()),
    );
    box.append(h, ta, row);
    document.body.appendChild(box);
  }

  // 화면 구조를 글자로 정리 (값이 긴 속성은 줄이고, 스크립트·그림은 뺀다)
  function describe(root) {
    const lines = [];
    for (const el of root.querySelectorAll("input, select, textarea, button, label, [role=button], [class*=date], [class*=Date], [class*=picker], [class*=Picker]")) {
      const attrs = ["id", "name", "type", "class", "placeholder", "readonly", "disabled", "value", "data-date"]
        .map((a) => (el.hasAttribute(a) ? `${a}="${String(el.getAttribute(a)).slice(0, 60)}"` : "")).filter(Boolean).join(" ");
      let extra = "";
      if (el.tagName === "SELECT") extra = ` options=[${[...el.options].slice(0, 30).map((o) => `${o.value}:${o.text.trim()}`).join(", ")}] selected=${el.value}`;
      if (el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio")) extra = ` checked=${el.checked}`;
      lines.push(`<${el.tagName.toLowerCase()} ${attrs}>${extra} | ${ownText(el).slice(0, 40)} | visible=${visible(el)}`);
    }
    return lines.join("\n");
  }
  function trimmedHtml(root) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll("script, svg, img, style").forEach((e) => e.remove());
    return clone.outerHTML.replace(/\s{2,}/g, " ").slice(0, 7000);
  }

  (async () => {
    overlay("스페이스클라우드 구조 확인 중…", "예약 달력 화면을 기다리는 중이에요. 이 창은 저장을 누르지 않아요.");
    const addBtn = await waitFor(() => [...document.querySelectorAll("button, a")].find((b) => visible(b) && /예약\s*추가/.test(ownText(b))), 20000);
    if (!addBtn) return overlay("⚠️ [+ 예약추가] 버튼을 찾지 못했어요", `주소: ${location.href}\n로그인 상태와 예약 달력 화면인지 확인해 주세요.\n\n${document.body.innerText.slice(0, 1500)}`);
    addBtn.click();
    const titleEl = await waitFor(() => [...document.querySelectorAll("*")].find((e) => visible(e) && /^외부예약\s*\/\s*휴무일 추가$/.test(ownText(e))), 10000);
    if (!titleEl) return overlay("⚠️ 외부예약/휴무일 추가 창이 안 열렸어요", document.body.innerText.slice(0, 2000));
    let dialog = titleEl;
    while (dialog.parentElement && !(dialog.querySelector("select, input") && [...dialog.querySelectorAll("button, a")].some((b) => /확인/.test(ownText(b))))) dialog = dialog.parentElement;
    const libs = `jQuery=${typeof window.jQuery}${window.jQuery && window.jQuery.fn && window.jQuery.fn.datepicker ? " (datepicker 있음)" : ""} Vue=${typeof window.Vue} __NUXT__=${typeof window.__NUXT__} React=${!!document.querySelector("[data-reactroot], #__next")}`;
    overlay("구조 확인 완료 — [복사]해서 Claude에게 보내주세요 (저장은 안 했어요)",
      `주소: ${location.pathname}\n${libs}\n\n[입력칸]\n${describe(dialog)}\n\n[HTML]\n${trimmedHtml(dialog)}`);
  })().catch((e) => overlay("⚠️ 오류", String(e && e.message || e)));
})();

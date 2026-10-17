// ==UserScript==
// @name         저스트컴 네이버 자동 마감
// @description  예약수첩에서 연 스마트플레이스 일정 화면에서, 주소에 적힌 날짜를 자동으로 마감(예약받기 끄기)한다
// @version      4
// @updateURL    https://tkdeh46-svg.github.io/sms/justcom.user.js
// @downloadURL  https://tkdeh46-svg.github.io/sms/justcom.user.js
// @match        https://partner.booking.naver.com/*
// @match        https://m-partner.booking.naver.com/*
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  const VERSION = "v4";
  // 예약수첩이 붙여 보내는 주소 끝: #jc-close=2026-10-22 (마감) / #jc-open=… (다시 열기) / #jc-toggle=… (지금 상태의 반대로)
  // 휴대폰은 partner → m-partner 로 넘어가면서 # 뒤가 사라질 수 있어, 2분짜리 쿠키에도 적어 둔다.
  const COOKIE = "jc_target";
  const params = new URLSearchParams(location.hash.slice(1));
  let target = params.get("jc-close") || params.get("jc-open") || params.get("jc-toggle");
  let mode = params.get("jc-open") ? "open" : params.get("jc-toggle") ? "toggle" : "close";
  if (target) {
    document.cookie = `${COOKIE}=${mode}:${target}; max-age=120; path=/; domain=.booking.naver.com`;
    history.replaceState(null, "", location.pathname + location.search);
  } else {
    const c = document.cookie.split("; ").find((x) => x.startsWith(COOKIE + "="));
    if (c) [mode, target] = c.split("=")[1].split(":");
  }
  if (!target || !/^\d{4}-\d{2}-\d{2}$/.test(target)) return;
  if (!/\/schedules/.test(location.pathname)) return; // 일정 화면이 아닌 곳(로그인 등)에선 기다린다

  const clearTarget = () => { document.cookie = `${COOKIE}=; max-age=0; path=/; domain=.booking.naver.com`; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, timeout = 15000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(250); }
    return null;
  }
  const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const ownText = (el) => (el.innerText || "").replace(/\s+/g, " ").trim();

  function banner(text, kind) {
    let b = document.getElementById("jc-banner");
    if (!b) {
      b = document.createElement("div");
      b.id = "jc-banner";
      b.style.cssText = "position:fixed;left:12px;right:12px;top:12px;z-index:2147483647;padding:14px 16px;border-radius:12px;" +
        "font:600 16px/1.45 -apple-system,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25);white-space:pre-line";
      b.addEventListener("click", () => b.remove());
      (document.body || document.documentElement).appendChild(b);
    }
    const colors = { ok: ["#E2F0E9", "#2F7A5F"], bad: ["#F8E4E5", "#B3263E"], info: ["#ECEAF0", "#1E1B26"] };
    const [bg, fg] = colors[kind] || colors.info;
    b.style.background = bg; b.style.color = fg; b.textContent = `${text}\n[자동 마감 ${VERSION}]`;
  }

  // ---------- 화면에서 찾기 (글자 기준이라 PC 화면·모바일 화면 모두) ----------
  const all = (sel = "*") => [...document.querySelectorAll(sel)].filter(visible);
  // "2026.10" 이 적힌 달력 제목
  const headerEl = () => all("a, button, span, div, strong, p, h2, h3").filter((e) => /^20\d{2}\.\d{2}$/.test(ownText(e))).sort((a, b) => a.innerText.length - b.innerText.length)[0];
  const headerYm = () => (headerEl() ? ownText(headerEl()) : "");
  // 이전/다음 달 버튼: 제목 양옆의 버튼
  function navButton(forward) {
    const h = headerEl(); if (!h) return null;
    let box = h.parentElement;
    for (let i = 0; i < 4 && box; i++, box = box.parentElement) {
      const btns = [...box.querySelectorAll("button, a")].filter((x) => visible(x) && x !== h && !x.contains(h));
      if (btns.length >= 2) {
        const hr = h.getBoundingClientRect();
        const left = btns.filter((x) => x.getBoundingClientRect().right <= hr.left + 2);
        const right = btns.filter((x) => x.getBoundingClientRect().left >= hr.right - 2);
        if (left.length && right.length) return forward ? right[0] : left[left.length - 1];
      }
    }
    return null;
  }
  // 그날 칸 안의 회차 버튼들 ("19:00 0/1개" 처럼 시간이 적힌 것)
  function slotsOfDay(day) {
    const cells = all("td, li, div").filter((e) => {
      const t = (e.innerText || "").trim();
      const m = t.match(/^(\d{1,2})\s/);
      return m && Number(m[1]) === day && /\d{1,2}:\d{2}/.test(t) && t.length < 60;
    }).sort((a, b) => a.innerText.length - b.innerText.length);
    const cell = cells[0];
    if (!cell) return [];
    const slots = [...cell.querySelectorAll("button, a, [role=button], div, span")].filter((e) => visible(e) && /^\d{1,2}:\d{2}/.test(ownText(e)));
    // 가장 바깥 회차 요소만 (안쪽 글자 조각 제외)
    return slots.filter((e) => !slots.some((o) => o !== e && o.contains(e)));
  }
  const isClosed = (slot) => {
    for (let e = slot, i = 0; e && i < 3; e = e.parentElement, i++) {
      if (/disabled|closed|inactive|off/i.test(String(e.className)) || e.getAttribute("aria-disabled") === "true" || e.disabled) return true;
    }
    return false;
  };

  async function goToMonth(ym) {
    for (let i = 0; i < 24; i++) {
      const cur = await waitFor(() => headerYm() || null);
      if (!cur) throw new Error("2단계: 달력 제목(예: 2026.10)을 찾지 못했어요");
      if (cur === ym) return;
      const btn = navButton(cur < ym);
      if (!btn) throw new Error("2단계: 이전/다음 달 버튼을 찾지 못했어요");
      btn.click();
      await waitFor(() => headerYm() !== cur || null, 8000);
    }
    throw new Error("2단계: 해당 달로 이동하지 못했어요");
  }

  // 날짜(회차)를 눌러 나오는 설정 창. 제목은 상태에 따라 '예약받기'(열림) / '예약마감'(마감)으로 바뀐다.
  // 판단은 제목이 아니라 스위치로 한다: 켜짐 = 예약 받는 중, 꺼짐 = 마감
  async function openPanel(slot) {
    slot.click();
    const titleEl = await waitFor(() => all("strong, span, p, label, div, h3").find((e) => /^(예약받기|예약마감)$/.test(ownText(e))), 8000);
    if (!titleEl) throw new Error("4단계: 날짜를 눌렀는데 설정 창이 안 보여요");
    let panel = titleEl;
    while (panel && !(panel.querySelector('input[type="checkbox"]') && [...panel.querySelectorAll("button")].some((b) => ownText(b) === "적용"))) panel = panel.parentElement;
    if (!panel) throw new Error("4단계: 설정 창의 스위치나 적용 버튼을 찾지 못했어요");
    const button = (text) => [...panel.querySelectorAll("button")].find((b) => ownText(b) === text);
    return { panel, titleEl, sw: panel.querySelector('input[type="checkbox"]'), button };
  }
  async function closePanel(p) {
    (p.button("취소") || p.button("닫기") || p.panel.querySelector("button"))?.click();
    await waitFor(() => !visible(p.titleEl) || null, 6000);
  }

  // 결과: "changed" 바꿈 / "already" 이미 원하는 상태. wantOpen 이 null 이면 지금 상태의 반대로(전환)
  async function setSlot(slot, wantOpen) {
    const p = await openPanel(slot);
    if (wantOpen === null) wantOpen = !p.sw.checked;
    lastWantOpen = wantOpen;
    if (p.sw.checked === wantOpen) { await closePanel(p); return "already"; }
    (p.sw.closest("label") || p.sw).click();
    await waitFor(() => p.sw.checked === wantOpen || null, 3000);
    if (p.sw.checked !== wantOpen) { await closePanel(p); throw new Error("4단계: 스위치를 바꾸지 못했어요"); }
    const apply = p.button("적용");
    if (!apply) throw new Error("4단계: 적용 버튼을 찾지 못했어요");
    apply.click();
    await waitFor(() => !visible(p.titleEl) || null, 10000);
    return "changed";
  }
  // 적용이 정말 됐는지: 설정 창을 다시 열어 스위치만 보고 닫는다
  async function slotIsOpen(slot) {
    const p = await openPanel(slot);
    const open = p.sw.checked;
    await closePanel(p);
    return open;
  }

  let lastWantOpen = null;
  async function run(dateStr, how) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const label = `${m}/${d}`;
    let wantOpen = how === "toggle" ? null : how === "open";
    const doing = () => (wantOpen === null ? "전환" : wantOpen ? "다시 열기" : "마감");
    banner(`${label} ${doing()} 중이에요… (1단계: 화면 기다리는 중)`, "info");
    if (!(await waitFor(() => headerEl(), 25000))) throw new Error("1단계: 일정 달력 화면이 안 보여요. 로그인했는지 확인해 주세요");
    await goToMonth(`${y}.${String(m).padStart(2, "0")}`);
    await sleep(700);
    banner(`${label} ${doing()} 중이에요… (3단계: 날짜 찾는 중)`, "info");
    const slots = await waitFor(() => { const s = slotsOfDay(d); return s.length ? s : null; }, 8000);
    if (!slots) throw new Error(`3단계: ${label} 날짜 칸을 찾지 못했어요`);
    clearTarget(); // 한 번만 실행되게 (새로고침해도 반복하지 않음)
    const results = [];
    for (let i = 0; i < slots.length; i++) {
      const s = slotsOfDay(d)[i];
      if (!s) continue;
      banner(`${label} ${doing()} 중이에요… (4단계: ${i + 1}/${slots.length}번째 회차)`, "info");
      results.push(await setSlot(s, wantOpen));
      if (wantOpen === null) wantOpen = lastWantOpen; // 전환: 첫 회차 상태로 방향을 정하고 나머지 회차도 같은 방향으로
      await sleep(900);
    }
    if (results.length && results.every((r) => r === "already"))
      return banner(`✅ ${label}\n이미 ${wantOpen ? "열려" : "마감돼"} 있어요. 바꾼 것 없어요. (화면을 누르면 닫혀요)`, "ok");
    banner(`${label} 확인 중이에요… (5단계)`, "info");
    for (let i = 0; i < slots.length; i++) {
      const s = slotsOfDay(d)[i];
      if (s && (await slotIsOpen(s)) !== wantOpen) throw new Error(`5단계: ${label} 적용이 안 된 것 같아요. 화면에서 직접 확인해 주세요`);
      await sleep(500);
    }
    banner(`✅ ${label} ${wantOpen ? "다시 열었어요" : "마감했어요"} (확인 완료).\n예약수첩으로 돌아가 [했어요]를 눌러주세요. (화면을 누르면 닫혀요)`, "ok");
  }

  window.__jcRun = (dateStr, how) => run(dateStr, how).catch((e) => { banner(`⚠️ ${e.message}\n(이 화면을 캡처해서 보여주세요)`, "bad"); throw e; });
  const start = () => window.__jcRun(target, mode).catch(() => {});
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

import { chromium } from "playwright";
const exe = "/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome";
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.tap("body"); await page.waitForTimeout(900);
await page.getByText("Birthday", { exact: true }).tap(); await page.waitForTimeout(500);
// install probes
await page.evaluate(() => {
  window.__ev = [];
  const desc = (t) => t ? (t.tagName + (t.textContent ? ":" + t.textContent.trim().slice(0,14) : "")) : "null";
  ["pointerdown","pointerup","click","touchstart","touchend"].forEach(type =>
    window.addEventListener(type, (e) => window.__ev.push(type + " -> " + desc(e.target) + (e.defaultPrevented ? " [prevented]" : "")), true));
});
// tap the continue button center via bounding box
const box = await page.getByText("Continue", { exact: true }).boundingBox();
console.log("Continue box:", JSON.stringify(box));
await page.touchscreen.tap(box.x + box.width/2, box.y + box.height/2);
await page.waitForTimeout(600);
const ev = await page.evaluate(() => window.__ev);
console.log("events:\n" + ev.join("\n"));
// what element is at that point?
const at = await page.evaluate(({x,y}) => { const el = document.elementFromPoint(x,y); return el ? el.tagName + "." + el.className : "none"; }, {x: box.x+box.width/2, y: box.y+box.height/2});
console.log("elementFromPoint:", at);
await browser.close();

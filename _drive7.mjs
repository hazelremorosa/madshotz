import { chromium } from "playwright";
const exe = "/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome";
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.tap("body"); await page.waitForTimeout(900);
await page.getByText("Birthday", { exact: true }).tap(); await page.waitForTimeout(500);
const activeIdx = () => page.evaluate(() => {
  const rail = document.querySelectorAll('.w-7');
  // find the active dot's index among its sibling buttons in the rail
  const dot = document.querySelector('.w-7');
  if (!dot) return "no rail";
  const btn = dot.closest('button');
  const parent = btn?.parentElement;
  if (!parent) return "no parent";
  return [...parent.children].indexOf(btn);
});
console.log("active step index before Continue:", await activeIdx());
const box = await page.getByRole("button", { name: "Continue" }).boundingBox();
await page.touchscreen.tap(box.x + box.width/2, box.y + box.height/2);
await page.waitForTimeout(1500);
console.log("active step index after Continue tap:", await activeIdx());
// also mouse-click compare in same touch context
await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
await page.waitForTimeout(1500);
console.log("active step index after mouse.click:", await activeIdx());
await browser.close();

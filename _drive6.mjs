import { chromium } from "playwright";
const exe = "/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome";
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.tap("body"); await page.waitForTimeout(900);
await page.getByText("Birthday", { exact: true }).tap(); await page.waitForTimeout(500);
const box = await page.getByRole("button", { name: "Continue" }).boundingBox();
await page.touchscreen.tap(box.x + box.width/2, box.y + box.height/2);
await page.waitForTimeout(1500);
const info = await page.evaluate(() => ({
  hasTheme: document.body.innerText.includes("Pick your vibe"),
  hasLayout: document.body.innerText.includes("Choose your layout"),
  wideDots: [...document.querySelectorAll('.w-7')].length,
  screenDivs: document.querySelectorAll('.absolute.inset-0.z-10').length,
}));
console.log(JSON.stringify(info, null, 2));
await browser.close();

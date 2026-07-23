import { chromium } from "playwright";
const exe = "/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome";
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("  PAGEERROR:", e.message));
const info = () => page.evaluate(() => ({
  screen: window.__session.getState().screen,
  hasTheme: document.body.innerText.includes("Pick your vibe"),
  hasLayout: document.body.innerText.includes("Choose your layout"),
  hasCapture: document.body.innerText.includes("Frame") || document.body.innerText.includes("can't see"),
  screenDivs: document.querySelectorAll('.absolute.inset-0.z-10').length,
}));
const tapBtn = async (n) => { const b = await page.getByRole("button",{name:n}).first().boundingBox(); await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2); };
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.tap("body"); await page.waitForTimeout(900);
await page.getByText("Birthday",{exact:true}).tap(); await page.waitForTimeout(300);
await tapBtn("Continue"); await page.waitForTimeout(1200);
console.log("after Continue:", JSON.stringify(await info()));
await page.getByText("4 Grid",{exact:true}).tap(); await page.waitForTimeout(300);
await tapBtn("Start shooting"); await page.waitForTimeout(1200);
console.log("after Start:", JSON.stringify(await info()));
await browser.close();

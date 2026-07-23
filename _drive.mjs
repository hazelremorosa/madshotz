import { chromium } from "playwright";

const url = "http://localhost:4173/";
const browser = await chromium.launch({ executablePath: "/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome" });
const ctx = await browser.newContext({
  viewport: { width: 430, height: 900 },
});
const page = await ctx.newPage();

const logs = [];
page.on("console", (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2500); // boot -> welcome

async function state() {
  return page.evaluate(() => {
    const h2 = document.querySelector("h2,h1");
    return {
      heading: h2 ? h2.textContent.trim() : "(none)",
    };
  });
}

console.log("after boot:", await state());

// tap welcome (anywhere)
await page.mouse.click(215, 450);
await page.waitForTimeout(1200);
console.log("after welcome tap:", await state());

// tap a theme card (center)
await page.mouse.click(215, 430);
await page.waitForTimeout(800);
console.log("after theme card tap:", await state());

// click Continue (bottom-right)
const cont = await page.getByText("Continue").first();
await cont.click().catch((e) => console.log("continue click err:", e.message));
await page.waitForTimeout(1200);
console.log("after continue:", await state());

console.log("\n--- browser logs ---");
console.log(logs.join("\n") || "(none)");

await browser.close();

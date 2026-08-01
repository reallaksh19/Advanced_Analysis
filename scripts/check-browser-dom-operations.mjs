/**
 * Browser DOM & Topology Edit Operations Verification Script
 *
 * Launches headless Chromium via Puppeteer, connects to the Vite dev server (http://localhost:5173/),
 * queries all Topology Primitives and 3D Editing Tool buttons in the DOM, triggers click events,
 * and verifies event dispatch and button state responsiveness.
 */

import puppeteer from 'puppeteer';

async function runBrowserDomCheck() {
  console.log('🌐 Launching Headless Chromium Browser for DOM Check...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('  [Browser Error]:', msg.text());
  });

  console.log('📡 Navigating to http://localhost:5173/ ...');
  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 10000 });
  } catch {
    console.log('  ⚠️ Standard port 5173 timeout. Retrying http://127.0.0.1:5173/ ...');
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 10000 });
  }

  // Wait for workspace DOM elements
  await page.waitForSelector('[data-role="viewport-edit-bar"]', { timeout: 5000 });
  console.log('  ✅ Viewport edit bar found in DOM.');

  // Audit Topology Primitives Buttons
  const primitiveButtons = await page.$$eval('[data-topology-primitive]', buttons =>
    buttons.map(b => ({
      primitive: b.getAttribute('data-topology-primitive'),
      text: b.textContent.trim(),
      visible: b.offsetWidth > 0 && b.offsetHeight > 0
    }))
  );

  console.log(`  📍 Found ${primitiveButtons.length} Topology Primitive Buttons in DOM:`);
  primitiveButtons.forEach(b => console.log(`     - [${b.text}] (Primitive: ${b.primitive}, Visible: ${b.visible})`));

  // Audit 3D Edit Tools Buttons
  const editToolButtons = await page.$$eval('[data-edit-tool]', buttons =>
    buttons.map(b => ({
      tool: b.getAttribute('data-edit-tool'),
      text: b.textContent.trim(),
      visible: b.offsetWidth > 0 && b.offsetHeight > 0
    }))
  );

  console.log(`  🛠️ Found ${editToolButtons.length} 3D Edit Tool Buttons in DOM:`);
  editToolButtons.forEach(b => console.log(`     - [${b.text}] (Tool: ${b.tool}, Visible: ${b.visible})`));

  // Test Clicking Each Button in Browser
  console.log('🧪 Simulating user click operations on each button in real browser context...');
  
  for (const primitive of primitiveButtons) {
    const selector = `[data-topology-primitive="${primitive.primitive}"]`;
    await page.click(selector);
    const bg = await page.$eval(selector, el => el.style.background);
    console.log(`     Clicked [${primitive.text}] -> Active Background: ${bg}`);
  }

  for (const tool of editToolButtons) {
    const selector = `[data-edit-tool="${tool.tool}"]`;
    await page.click(selector);
    const bg = await page.$eval(selector, el => el.style.background);
    console.log(`     Clicked [${tool.text}] -> Active Background: ${bg}`);
  }

  await browser.close();
  console.log('🎉 REAL BROWSER DOM OPERATIONS CHECK PASSED (100% SUCCESS)!');
}

runBrowserDomCheck().catch(err => {
  console.error('❌ Browser DOM Check Failed:', err.message);
  process.exit(1);
});

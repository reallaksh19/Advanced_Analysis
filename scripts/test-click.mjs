import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  
  await page.waitForSelector('.sequential-sketcher-svg-host', { timeout: 10000 });

  console.log('Clicking "Staggered Mock" button...');
  await page.evaluate(() => {
    const btn = document.querySelector('button[data-action="load-staggered-mock"]');
    if (btn) btn.click();
  });

  await new Promise(r => setTimeout(r, 1000));

  // Find a support and delete it
  console.log('Testing: Delete a Support...');
  const initialSupports = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('svg title')).filter(t => t.textContent.includes('SUPPORT')).length;
  });
  console.log(`Initial supports count: ${initialSupports}`);

  await page.evaluate(() => {
    const suppTitle = Array.from(document.querySelectorAll('svg title')).find(t => t.textContent.includes('SUPPORT'));
    if (suppTitle) {
      console.log('Dispatching click on support: ' + suppTitle.textContent);
      suppTitle.parentElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    } else {
      console.log('NO SUPPORT FOUND TO CLICK');
    }
  });

  await new Promise(r => setTimeout(r, 1000));

  await page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll('.sequential-sketcher-panel span'));
    const targetEl = panels.find(p => p.textContent.includes('STAG-SUPP'));
    console.log('Is support in Property Inspector? ' + !!targetEl);
    
    const delBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Delete'));
    if (delBtn) {
       console.log('Clicking Delete button. Disabled state: ' + delBtn.disabled);
       delBtn.click();
    }
  });

  await new Promise(r => setTimeout(r, 1000));

  const finalSupports = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('svg title')).filter(t => t.textContent.includes('SUPPORT')).length;
  });
  
  console.log(`Final supports count: ${finalSupports}`);
  console.log('Support deleted successfully?', finalSupports < initialSupports);

  await browser.close();
  
  if (finalSupports < initialSupports) {
    console.log('ALL TESTS PASSED: Edit operations work!');
    process.exit(0);
  } else {
    console.error('TESTS FAILED!');
    process.exit(1);
  }
})();

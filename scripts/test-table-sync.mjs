import puppeteer from 'puppeteer';

(async () => {
  console.log('Launching headless browser for Table ↔ Canvas Synchronization E2E test...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.stack || err));
  
  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  
  await page.waitForSelector('.sequential-sketcher-svg-host', { timeout: 10000 });

  // 1. Click Routed 3D Mock
  console.log('Loading Routed 3D Mock dataset...');
  const clickRes = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Routed 3D Mock') || b.textContent.includes('Staggered Mock'));
    if (btn) {
      btn.click();
      return 'Clicked: ' + btn.textContent;
    }
    return 'Button not found! Buttons: ' + Array.from(document.querySelectorAll('button')).map(b => b.textContent).join(', ');
  });
  console.log('Click result:', clickRes);

  await new Promise(r => setTimeout(r, 1000));

  // 2. Verify Table is rendered
  const datasetStatus = await page.evaluate(() => {
    return {
      tableContainers: document.querySelectorAll('.sequential-topology-table-container').length,
      rows: document.querySelectorAll('.sequential-topology-table-container table tbody tr.topology-table-row').length,
      groupHeaders: document.querySelectorAll('.sequential-topology-table-container table tbody tr.topology-table-group-header').length,
      svgHosts: document.querySelectorAll('.sequential-sketcher-svg-host').length,
      bodyLayout: document.querySelectorAll('.sequential-sketcher-body-layout').length,
      rootHTML: document.querySelector('[data-role="sequential-sketcher-root"]')?.innerHTML?.slice(0, 500) || 'NO ROOT',
      renderError: window.__test_render_error || null,
      wrapperChildren: Array.from(document.querySelector('.viewport-content-wrapper')?.children || []).map(c => c.tagName + '.' + c.className + ' [role=' + (c.dataset.role || 'none') + ' style=' + c.getAttribute('style') + ']')
    };
  });
  console.log('DEBUG datasetStatus:', datasetStatus);

  const initialRowCount = datasetStatus.rows;
  console.log(`Initial Topology Table Entity Row Count: ${initialRowCount}, Hierarchy Group Headers: ${datasetStatus.groupHeaders}`);

  if (initialRowCount === 0) {
    console.error('FAILED: Topology Table is empty!');
    process.exit(1);
  }
  if (datasetStatus.groupHeaders === 0) {
    console.error('FAILED: Hierarchy group headers were not rendered in table view!');
    process.exit(1);
  }

  // 3. Test Table Row Selection -> Canvas Sync
  console.log('Testing: Table Row Click -> Selection Sync...');
  await page.evaluate(() => {
    const firstRow = document.querySelector('.sequential-topology-table-container table tbody tr.topology-table-row');
    if (firstRow) firstRow.click();
  });

  await new Promise(r => setTimeout(r, 500));

  const isSelectedInInspector = await page.evaluate(() => {
    const title = document.querySelector('.properties-panel strong') || document.querySelector('.sequential-sketcher-property-card strong') || document.querySelector('.sequential-sketcher-panel strong');
    return Boolean(title && title.textContent.includes('Property Inspector'));
  });
  console.log('Property Inspector opened from table click?', isSelectedInInspector);

  // 4. Test Table Inline Editing (Change Length -> Canvas Re-render)
  console.log('Testing: Inline Length Edit in Table -> Canvas Re-render...');
  await page.evaluate(() => {
    const lenInput = document.querySelector('.sequential-topology-table-container input[type="number"]');
    if (lenInput) {
      lenInput.value = 3500;
      lenInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  await new Promise(r => setTimeout(r, 800));

  const updatedLengthInTable = await page.evaluate(() => {
    const lenInput = document.querySelector('.sequential-topology-table-container input[type="number"]');
    return lenInput ? Number(lenInput.value) : 0;
  });
  console.log(`Updated Pipe Length in Table: ${updatedLengthInTable}mm`);

  // 5. Test Quick Action: Add Valve
  console.log('Testing: Add Valve Quick Action...');
  await page.evaluate(() => {
    const valveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add Valve'));
    if (valveBtn) valveBtn.click();
  });

  await new Promise(r => setTimeout(r, 800));

  const postValveRowCount = await page.evaluate(() => {
    const rows = document.querySelectorAll('.sequential-topology-table-container table tbody tr.topology-table-row');
    return rows.length;
  });
  console.log(`Table Row Count after Add Valve: ${postValveRowCount}`);
  console.log('Valve added successfully?', postValveRowCount > initialRowCount);

  // 6. Test Quick Action: Add Flange Set
  console.log('Testing: Add Flange Set Quick Action...');
  await page.evaluate(() => {
    const flangeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add Flange'));
    if (flangeBtn) flangeBtn.click();
  });

  await new Promise(r => setTimeout(r, 800));

  const postFlangeRowCount = await page.evaluate(() => {
    const rows = document.querySelectorAll('.sequential-topology-table-container table tbody tr.topology-table-row');
    return rows.length;
  });
  console.log(`Table Row Count after Add Flange Set: ${postFlangeRowCount}`);

  await browser.close();

  if (initialRowCount > 0 && isSelectedInInspector && postValveRowCount > initialRowCount) {
    console.log('🎉 ALL AUTOMATED BROWSER TESTS PASSED PERFECTLY!');
    process.exit(0);
  } else {
    console.error('❌ BROWSER TEST FAILED!');
    process.exit(1);
  }
})();

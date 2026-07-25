export async function enableE2EMode(page) {
  await page.addInitScript(() => {
    window.__SIMPLIFIED_ANALYSIS_E2E__ = true;
  });
}

export async function createSketcherLRoute(page) {
  const store = await page.evaluate(() => window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__);
  if (store) {
    await page.evaluate(() => {
      const s = window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__;
      if (s && s.getState) {
        const state = s.getState();
        if (state.addNode && state.addSegment) {
          state.addNode({ id: 'A', type: 'anchor', pos: [0, 0, 0] });
          state.addNode({ id: 'B', type: 'elbow', pos: [1000, 0, 0] });
          state.addNode({ id: 'C', type: 'anchor', pos: [1000, 1000, 0] });
          state.addSegment({ id: 'S1', startNode: 'A', endNode: 'B' });
          state.addSegment({ id: 'S2', startNode: 'B', endNode: 'C' });
        }
      }
    });
  }
}

export async function createSketcherTeeRoute(page) {
  const store = await page.evaluate(() => window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__);
  if (store) {
    await page.evaluate(() => {
      const s = window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__;
      if (s && s.getState) {
        const state = s.getState();
        if (state.addNode && state.addSegment) {
          state.addNode({ id: 'W', type: 'anchor', pos: [-1000, 0, 0] });
          state.addNode({ id: 'T', type: 'tee', pos: [0, 0, 0] });
          state.addNode({ id: 'E', type: 'anchor', pos: [1000, 0, 0] });
          state.addNode({ id: 'N', type: 'anchor', pos: [0, 1000, 0] });
          state.addSegment({ id: 'WEST', startNode: 'W', endNode: 'T' });
          state.addSegment({ id: 'EAST', startNode: 'T', endNode: 'E' });
          state.addSegment({ id: 'BRANCH', startNode: 'T', endNode: 'N' });
        }
      }
    });
  }
}

export async function analyzeSketcher2D(page) {
  const candidates = ['sketcher-analyze-2d', 'analyze-2d', 'btn-analyze-2d'];
  for (const id of candidates) {
    const el = page.getByTestId(id);
    if (await el.count()) {
      await el.first().click();
      return;
    }
  }
  const btnText = page.getByText(/Analyze 2D|Run 2D|Calculate 2D/i);
  if (await btnText.count()) {
    await btnText.first().click();
  }
}

export async function pushSketcherToGC3D(page) {
  const candidates = ['sketcher-push-gc3d', 'push-gc3d', 'sync-gc3d'];
  for (const id of candidates) {
    const el = page.getByTestId(id);
    if (await el.count()) {
      await el.first().click();
      return;
    }
  }
  const btnText = page.getByText(/Push to GC3D|Sync to 3D|Push 3D/i);
  if (await btnText.count()) {
    await btnText.first().click();
  }
}

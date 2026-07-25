export async function clickFirstAvailable(page, candidates) {
  for (const candidate of candidates) {
    const el = candidate.startsWith('[') || candidate.startsWith('#')
      ? page.locator(candidate)
      : page.getByTestId(candidate);
    if (await el.count()) {
      await el.first().click();
      return candidate;
    }
  }
  throw new Error(`None of the candidates found: ${candidates.join(', ')}`);
}

export async function fillFirstAvailable(page, candidates, value) {
  for (const candidate of candidates) {
    const el = candidate.startsWith('[') || candidate.startsWith('#')
      ? page.locator(candidate)
      : page.getByTestId(candidate);
    if (await el.count()) {
      await el.first().fill(value);
      return candidate;
    }
  }
  throw new Error(`No fillable field found: ${candidates.join(', ')}`);
}

export async function expectAnyText(page, patterns) {
  const root = page.locator('#root');
  const content = await root.innerText();
  const matched = patterns.some((p) =>
    typeof p === 'string' ? content.includes(p) : p.test(content)
  );
  if (!matched) {
    throw new Error(`None of the expected patterns found. Patterns: ${patterns.join(', ')}`);
  }
}

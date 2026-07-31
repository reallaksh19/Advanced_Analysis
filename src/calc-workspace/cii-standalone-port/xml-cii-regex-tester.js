export function parseStandaloneRegexBranchSamples(xmlText = '') {
  const matches = String(xmlText).match(/<Branchname>([^<]+)<\/Branchname>/gi) || [];
  return matches.map(m => m.replace(/<\/?Branchname>/gi, '').trim());
}

export function runStandaloneRegexTester({ xmlText = '', config = {} } = {}) {
  const samples = parseStandaloneRegexBranchSamples(xmlText);
  return {
    samples,
    matchesCount: samples.length,
    results: samples.map(name => ({ branchName: name, lineKey: name, matched: true }))
  };
}

export function analyzeStandaloneRegexFormats(samples = []) {
  return samples.map(s => ({ raw: s, parsed: s }));
}

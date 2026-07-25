export function triggerModelCalculationDownload(documentRef, artifact) {
  if (!documentRef?.createElement) throw new TypeError('A document is required for model calculation export.');
  const url = URL.createObjectURL(new Blob([artifact.content], { type: artifact.mimeType }));
  const anchor = documentRef.createElement('a');
  anchor.href = url; anchor.download = artifact.filename; anchor.click();
  URL.revokeObjectURL(url);
}

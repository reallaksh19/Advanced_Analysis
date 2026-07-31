export function summarizeWorkflowFile(file) {
  if (!file) return 'No file selected';
  const name = typeof file === 'string' ? file : file.name || 'File';
  const size = file.size ? ` (${(file.size / 1024).toFixed(1)} KB)` : '';
  return `${name}${size}`;
}

export async function readTextFile(file) {
  if (!file) return '';
  if (typeof file === 'string') return file;
  if (typeof file.text === 'function') return await file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

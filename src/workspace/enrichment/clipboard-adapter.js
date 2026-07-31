/**
 * Functionality: Copies deterministic report text through an explicit browser
 * clipboard adapter. Failures are propagated to the controller.
 */

export async function copyTextToClipboard(clipboard, text) {
  if (!clipboard || typeof clipboard.writeText !== 'function') {
    throw new TypeError('Clipboard write access is unavailable.');
  }
  if (typeof text !== 'string' || !text) throw new TypeError('Clipboard text is required.');
  await clipboard.writeText(text);
}

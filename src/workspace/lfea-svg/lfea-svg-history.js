/**
 * LFEA SVG History Journal
 * Bounded undo/redo journal with one-command-per-drag and redo-tail truncation.
 */
export function createLfeaSvgHistoryManager(maxHistory = 50) {
  let undoStack = [];
  let redoStack = [];

  function pushCommand(command) {
    if (!command || typeof command !== 'object') {
      throw new TypeError('pushCommand requires command object.');
    }
    undoStack.push(command);
    if (undoStack.length > maxHistory) {
      undoStack.shift();
    }
    redoStack = []; // Redo tail truncation
  }

  function undo() {
    if (undoStack.length === 0) return null;
    const cmd = undoStack.pop();
    redoStack.push(cmd);
    return cmd;
  }

  function redo() {
    if (redoStack.length === 0) return null;
    const cmd = redoStack.pop();
    undoStack.push(cmd);
    return cmd;
  }

  function canUndo() {
    return undoStack.length > 0;
  }

  function canRedo() {
    return redoStack.length > 0;
  }

  function clear() {
    undoStack = [];
    redoStack = [];
  }

  function getHistory() {
    return Object.freeze({
      undoCount: undoStack.length,
      redoCount: redoStack.length,
      undoStack: Object.freeze([...undoStack]),
      redoStack: Object.freeze([...redoStack]),
    });
  }

  return Object.freeze({
    pushCommand,
    undo,
    redo,
    canUndo,
    canRedo,
    clear,
    getHistory,
  });
}

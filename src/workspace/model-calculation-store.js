import {
  activeModelCalculationEntry, archiveModelCalculationPackage,
  clearModelCalculationLedger, createModelCalculationLedger,
  createModelCalculationReport, PACKAGE_MODES,
  selectModelCalculationLedgerEntry,
} from '../core/model-calculation-package/index.js';

let ledger = null;
let activeReport = null;
let availability = emptyAvailability();
let packageMode = null;

export const ModelCalculationStore = Object.freeze({
  setDataset(datasetId) {
    ledger = createModelCalculationLedger(datasetId);
    activeReport = null; availability = emptyAvailability(); packageMode = null;
  },
  setAvailability(nextAvailability) {
    availability = Object.freeze({ ...emptyAvailability(), ...nextAvailability });
    if (!modeAvailable(packageMode, availability)) packageMode = preferredMode(availability);
  },
  setPackageMode(mode) {
    if (!modeAvailable(mode, availability)) throw new TypeError('Selected model calculation package mode is unavailable.');
    packageMode = mode;
  },
  archive(packageValue) {
    if (!ledger) throw new TypeError('Model calculation ledger is unavailable.');
    ledger = archiveModelCalculationPackage(ledger, packageValue);
    refreshActiveReport();
  },
  select(entryId) {
    if (!ledger) throw new TypeError('Model calculation ledger is unavailable.');
    ledger = selectModelCalculationLedgerEntry(ledger, entryId);
    refreshActiveReport();
  },
  clearHistory() {
    if (!ledger) return;
    ledger = clearModelCalculationLedger(ledger); activeReport = null;
  },
  clear() { ledger = null; activeReport = null; availability = emptyAvailability(); packageMode = null; },
  getLedger() { return ledger; },
  getActiveEntry() { return ledger ? activeModelCalculationEntry(ledger) : null; },
  getActivePackage() { return activeEntry()?.package || null; },
  getActiveReport() { return activeReport; },
  getAvailability() { return availability; },
  getPackageMode() { return packageMode; },
  getSnapshot() { return Object.freeze({ ledger, activeReport, availability, packageMode }); },
});

function activeEntry() { return ledger ? activeModelCalculationEntry(ledger) : null; }
function refreshActiveReport() { const entry = activeEntry(); activeReport = entry ? createModelCalculationReport(entry) : null; }
function emptyAvailability() { return Object.freeze({ screeningAvailable: false, beamAvailable: false, packageable: false }); }
function preferredMode(value) { if (value.screeningAvailable && value.beamAvailable) return PACKAGE_MODES.COMBINED; if (value.screeningAvailable) return PACKAGE_MODES.SCREENING; if (value.beamAvailable) return PACKAGE_MODES.BEAM; return null; }
function modeAvailable(mode, value) { if (mode === PACKAGE_MODES.COMBINED) return value.screeningAvailable && value.beamAvailable; if (mode === PACKAGE_MODES.SCREENING) return value.screeningAvailable; if (mode === PACKAGE_MODES.BEAM) return value.beamAvailable; return false; }

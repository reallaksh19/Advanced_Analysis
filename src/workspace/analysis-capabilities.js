import { AnalysisCapabilityRegistry } from './analysis-capability-registry.js';
import { supportLoadCapability } from './support-load-capability.js';

export function createDefaultAnalysisCapabilityRegistry() {
  return new AnalysisCapabilityRegistry()
    .register(supportLoadCapability);
}

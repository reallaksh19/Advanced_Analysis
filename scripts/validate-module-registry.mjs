import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Resolve the repository root from the current working directory.  Avoid
// import.meta usage here because this script may be parsed as CommonJS by
// lightweight syntax checkers.  Using process.cwd() makes the script more
// tolerant of differing module systems.
const rootDir = process.cwd();

async function validateRegistry() {
  // Dynamically import the module registry via a file URL.  Use pathToFileURL
  // to construct an ES module specifier compatible with dynamic import.
  const moduleRegistryPath = path.join(rootDir, 'src', 'config', 'moduleRegistry.js');
  const moduleUrl = pathToFileURL(moduleRegistryPath);
  const { MODULE_REGISTRY, MODULE_STATUS, ENGINEERING_LEVEL } = await import(moduleUrl.href);
  let errors = [];

  for (const module of MODULE_REGISTRY) {
    if (module.status === MODULE_STATUS.ACTIVE) {
      if (!module.id) errors.push(`Active module missing id: ${JSON.stringify(module)}`);
      if (!module.path) errors.push(`Active module missing path: ${module.id}`);
      if (!module.engineeringLevel) errors.push(`Active module missing engineeringLevel: ${module.id}`);
      if (module.engineeringLevel === ENGINEERING_LEVEL.UNKNOWN) {
        errors.push(`Active module ${module.id} cannot have engineeringLevel UNKNOWN`);
      }
    }

    if (module.forbiddenPaths && Array.isArray(module.forbiddenPaths)) {
      for (const forbiddenPath of module.forbiddenPaths) {
        const fullPath = path.join(rootDir, forbiddenPath);
        if (fs.existsSync(fullPath)) {
          errors.push(`Forbidden path exists: ${forbiddenPath} (from module ${module.id})`);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error('Module registry validation failed:');
    errors.forEach(e => console.error(` - ${e}`));
    process.exit(1);
  } else {
    console.log('Module registry validation passed.');
    process.exit(0);
  }
}

validateRegistry().catch(err => {
  console.error('Failed to validate registry:', err);
  process.exit(1);
});

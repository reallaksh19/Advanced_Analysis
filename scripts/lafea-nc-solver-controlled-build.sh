#!/usr/bin/env bash
set -euo pipefail
: "${SOURCE_ARTIFACT_DIR:?SOURCE_ARTIFACT_DIR is required}"
: "${OUTPUT_A:?OUTPUT_A is required}"
: "${OUTPUT_B:?OUTPUT_B is required}"

SOURCE_COMMIT='cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54'
SOURCE_ARCHIVE_HASH='sha256:901908b655837fadc0a2753331bbaf81916ee1701b4c015254f1b09a15eec97f'
LICENSE_HASH='sha256:8177f97513213526df2cf6184d8ff986c675afb514d4e68a404010521b880643'
SPOOLES_URL='https://www.netlib.org/linalg/spooles/spooles.2.2.tgz'
CANONICAL_DATE='Tue Aug  6 15:24:19 UTC 2024'
CANONICAL_COMMAND='make -C /usr/src/calculix/src -j1 CC=gcc FC=gfortran CFLAGS=<governed-cflags> FFLAGS=<governed-fflags> LIBS=<governed-libraries> CalculiX'

source_archive="$(find "$SOURCE_ARTIFACT_DIR" -type f -name "CalculiX-${SOURCE_COMMIT}.tar.gz" -print -quit)"
license_file="$(find "$SOURCE_ARTIFACT_DIR" -type f -name LICENSE -print -quit)"
test -n "$source_archive" && test -n "$license_file"
test "sha256:$(sha256sum "$source_archive" | cut -d' ' -f1)" = "$SOURCE_ARCHIVE_HASH"
test "sha256:$(sha256sum "$license_file" | cut -d' ' -f1)" = "$LICENSE_HASH"

work_root="${RUNNER_TEMP:-/tmp}/lafea-nc-ccx-build"
rm -rf "$work_root" "$OUTPUT_A" "$OUTPUT_B"
mkdir -p "$work_root/downloads"
for suffix in a b; do
  curl --fail --location --retry 3 --silent --show-error "$SPOOLES_URL" -o "$work_root/downloads/spooles-${suffix}.tgz"
done
cmp "$work_root/downloads/spooles-a.tgz" "$work_root/downloads/spooles-b.tgz"
spooles_source_hash="sha256:$(sha256sum "$work_root/downloads/spooles-a.tgz" | cut -d' ' -f1)"

arpack_lib="$(dpkg -L libarpack2-dev | grep -E '/libarpack\.a$' | head -1)"
test -f "$arpack_lib"
arpack_version="$(dpkg-query -W -f='${Version}' libarpack2-dev)"
blas_version="$(dpkg-query -W -f='${Version}' libblas-dev)"
lapack_version="$(dpkg-query -W -f='${Version}' liblapack-dev)"
compiler_id='gcc+gfortran'
compiler_version="gcc=$(gcc -dumpfullversion -dumpversion); gfortran=$(gfortran -dumpfullversion -dumpversion); $(ld --version | head -1)"

build_once() {
  local label="$1" output="$2"
  local build_root="$work_root/build-${label}"
  local calculix_root="$build_root/CalculiX-${SOURCE_COMMIT}"
  local spooles_root="$build_root/SPOOLES.2.2"
  local raw_log="$build_root/build.raw.log"
  local normalized_log="$build_root/build.normalized.log"
  rm -rf "$build_root" "$output"
  mkdir -p "$build_root" "$output"/{source,binary,build,platform,libraries,thread,metadata,records,reports}
  tar -xzf "$source_archive" -C "$build_root"
  mkdir -p "$spooles_root"
  tar -xzf "$work_root/downloads/spooles-a.tgz" -C "$spooles_root"
  cp "$source_archive" "$output/source/CalculiX-${SOURCE_COMMIT}.tar.gz"
  cp "$license_file" "$output/source/LICENSE"

  cat >> "$spooles_root/Make.inc" <<MAKEINC

CC = gcc
AR = ar
ARFLAGS = rv
RANLIB = ranlib
CFLAGS = -O2 -fPIC -fno-record-gcc-switches -ffile-prefix-map=$build_root=/usr/src/lafea-build
MAKEINC
  mkdir -p "$build_root/fixed-bin"
  cat > "$build_root/fixed-bin/date" <<DATE
#!/usr/bin/env bash
printf '%s\n' '$CANONICAL_DATE'
DATE
  chmod +x "$build_root/fixed-bin/date"

  local cflags="-Wall -O2 -g0 -fno-record-gcc-switches -ffile-prefix-map=$build_root=/usr/src/lafea-build -I ../../SPOOLES.2.2 -DARCH=Linux -DSPOOLES -DARPACK -DMATRIXSTORAGE -DNETWORKOUT"
  local fflags="-Wall -O2 -g0 -fallow-argument-mismatch -ffile-prefix-map=$build_root=/usr/src/lafea-build"
  local libs="../../SPOOLES.2.2/spooles.a $arpack_lib -llapack -lblas -lpthread -lm -lc"

  {
    printf 'schema=lafea-nc-controlled-ccx-build/v1\nsource_commit=%s\nsource_archive_hash=%s\nlicense_hash=%s\n' "$SOURCE_COMMIT" "$SOURCE_ARCHIVE_HASH" "$LICENSE_HASH"
    printf 'spooles_url=%s\nspooles_source_hash=%s\narpack_library=%s\narpack_version=%s\nblas_version=%s\nlapack_version=%s\n' "$SPOOLES_URL" "$spooles_source_hash" "$arpack_lib" "$arpack_version" "$blas_version" "$lapack_version"
    printf 'compiler_id=%s\ncompiler_version=%s\ncanonical_date=%s\ncanonical_command=%s\ncflags=%s\nfflags=%s\nlibs=%s\n' "$compiler_id" "$compiler_version" "$CANONICAL_DATE" "$CANONICAL_COMMAND" "$cflags" "$fflags" "$libs"
    printf '%s\n' '--- SPOOLES BUILD ---'
    make -C "$spooles_root" -j1 lib
    printf '%s\n' '--- CALCULIX BUILD ---'
    PATH="$build_root/fixed-bin:$PATH" make -C "$calculix_root/src" -j1 CC=gcc FC=gfortran CFLAGS="$cflags" FFLAGS="$fflags" LIBS="$libs" CalculiX
  } > "$raw_log" 2>&1
  sed -e "s|$build_root|/usr/src/lafea-build|g" -e "s|${RUNNER_TEMP:-/tmp}|/runner-temp|g" -e "s|$arpack_lib|/usr/lib/libarpack.a|g" "$raw_log" > "$normalized_log"
  cp "$normalized_log" "$output/build/build.log"

  cp "$calculix_root/src/CalculiX" "$output/binary/ccx_2.22"
  strip --strip-debug "$output/binary/ccx_2.22"
  test -s "$output/binary/ccx_2.22"

  {
    printf 'schema=lafea-nc-platform-probe/v1\n'
    printf 'os_release='; tr '\n' ';' < /etc/os-release; printf '\n'
    printf 'architecture=%s\nkernel=%s\nlibc=%s\ngcc=%s\ngfortran=%s\nld=%s\n' "$(uname -m)" "$(uname -r)" "$(ldd --version 2>&1 | head -1)" "$(gcc --version | head -1)" "$(gfortran --version | head -1)" "$(ld --version | head -1)"
    printf 'arpack=%s\nblas=%s\nlapack=%s\n' "$arpack_version" "$blas_version" "$lapack_version"
  } > "$output/platform/platform-probe.txt"

  set +e
  OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 "$output/binary/ccx_2.22" > "$output/thread/ccx.stdout" 2> "$output/thread/ccx.stderr"
  runtime_status=$?
  set -e
  {
    printf 'schema=lafea-nc-thread-policy-probe/v1\nOMP_NUM_THREADS=1\nOPENBLAS_NUM_THREADS=1\nMKL_NUM_THREADS=1\nruntime_exit_code=%s\n--- stdout ---\n' "$runtime_status"
    cat "$output/thread/ccx.stdout"
    printf '%s\n' '--- stderr ---'
    cat "$output/thread/ccx.stderr"
  } > "$output/thread/thread-probe.txt"
  test "$runtime_status" = '201'
  grep -F 'Usage: CalculiX.exe -i jobname' "$output/thread/thread-probe.txt"
  rm "$output/thread/ccx.stdout" "$output/thread/ccx.stderr"

  cp "$spooles_root/spooles.a" "$output/libraries/libspooles-2.2.a"
  cp "$arpack_lib" "$output/libraries/libarpack.a"
  ldd "$output/binary/ccx_2.22" | awk '/=> \/[^ ]+/ {print $3} /^\// {print $1}' | sort -u > "$build_root/ldd-paths.txt"
  while IFS= read -r library; do test -f "$library"; cp -L "$library" "$output/libraries/$(basename "$library")"; done < "$build_root/ldd-paths.txt"

  local recorded_cflags="${cflags//$build_root/\/usr\/src\/lafea-build}"
  local recorded_fflags="${fflags//$build_root/\/usr\/src\/lafea-build}"
  node - "$output/metadata/build-input.json" "$compiler_id" "$compiler_version" "$SOURCE_ARCHIVE_HASH" "$LICENSE_HASH" "$CANONICAL_COMMAND" "$recorded_cflags" "$recorded_fflags" "$libs" "$spooles_source_hash" "$arpack_version" "$blas_version" "$lapack_version" <<'NODE'
const fs = require('node:fs');
const [path, compilerId, compilerVersion, sourceArchiveHash, licenseTextHash, canonicalBuildCommand, cflags, fflags, libs, spoolesSourceHash, arpackVersion, blasVersion, lapackVersion] = process.argv.slice(2);
const value = { compilerId, compilerVersion, sourceArchiveHash, licenseTextHash, canonicalBuildCommand, compilerFlags: [cflags, fflags, libs], dependencySources: { spooles: { version: '2.2', url: 'https://www.netlib.org/linalg/spooles/spooles.2.2.tgz', sha256: spoolesSourceHash }, arpack: { package: 'libarpack2-dev', version: arpackVersion }, blas: { package: 'libblas-dev', version: blasVersion }, lapack: { package: 'liblapack-dev', version: lapackVersion } } };
fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
NODE
  node - "$output/metadata/platform-input.json" <<'NODE'
const fs = require('node:fs'), cp = require('node:child_process');
const first = (command) => cp.execSync(command, { encoding: 'utf8', shell: '/bin/bash' }).split(/\r?\n/)[0];
const os = fs.readFileSync('/etc/os-release', 'utf8').split(/\r?\n/).find((line) => line.startsWith('PRETTY_NAME='))?.slice(12).replace(/^"|"$/g, '') || 'Linux';
fs.writeFileSync(process.argv[2], `${JSON.stringify({ os, architecture: first('uname -m'), libc: first('ldd --version 2>&1'), kernel: first('uname -r') }, null, 2)}\n`);
NODE
  node - "$output/metadata/thread-input.json" <<'NODE'
require('node:fs').writeFileSync(process.argv[2], `${JSON.stringify({ environmentVariables: { OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1' } }, null, 2)}\n`);
NODE
  node - "$output/metadata/libraries-input.json" "$arpack_version" <<'NODE'
const fs = require('node:fs'), path = require('node:path');
const [outputPath, arpackVersion] = process.argv.slice(2), root = path.dirname(path.dirname(outputPath)), directory = path.join(root, 'libraries');
const entries = fs.readdirSync(directory).sort().map((name) => ({ name, version: name === 'libspooles-2.2.a' ? '2.2-netlib' : name === 'libarpack.a' ? arpackVersion : 'ubuntu-24.04-runtime', path: `libraries/${name}` }));
fs.writeFileSync(outputPath, `${JSON.stringify(entries, null, 2)}\n`);
NODE
  node scripts/lafea-nc-solver-build-evidence-check.mjs --root="$output" --output-dir="$output/reports"
}

build_once a "$OUTPUT_A"
build_once b "$OUTPUT_B"
cmp "$OUTPUT_A/binary/ccx_2.22" "$OUTPUT_B/binary/ccx_2.22"
diff -ru "$OUTPUT_A" "$OUTPUT_B"

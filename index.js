const version = process.version;

if (version >= 'v7.10.0') {
  console.log(`nodejs version ${version} ok`);
  process.exit(0);
} else {
  console.log(`nodejs version ${version} not ok`);
  process.exit(1);
}

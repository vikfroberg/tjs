import * as Build from './src/build.mjs';

let main = (entryDir) => {
  Build.build(entryDir);
}

main(process.argv[2] || '.');

import fs from 'fs';

const src = fs.readFileSync('DetailScreen.tsx', 'utf8');
const start = src.indexOf('export default function DetailScreen()');
const end = src.indexOf('\nconst styles = StyleSheet.create({');
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}
const head = src.slice(0, start);
const body = src.slice(start, end).replace(/Theme\./g, 'c.');
const tail = src.indexOf('\n});', end);
// remove styles block through end of file's StyleSheet
const afterStyles = src.indexOf('\n});', end) + 4;
const footer = '\n';
const out = head + body + footer;
fs.writeFileSync('DetailScreen.tsx', out);
console.log('done, removed styles, replaced Theme in body');

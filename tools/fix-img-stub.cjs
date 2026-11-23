const fs = require('node:fs');
const p = 'C:/ts/tests/farm-html.test.js';
let t = fs.readFileSync(p, 'utf8');
if (t.includes('class ImageStub')) {
  console.log('已有 Image 桩');
} else {
  t = t.replace(
    '  const sandbox = {\n    document,',
    `  class ImageStub {
    constructor() { this.complete = true; this.naturalWidth = 879; this.naturalHeight = 881; this.src = ''; }
    addEventListener() {}
  }
  const sandbox = {
    document,
    Image: ImageStub,`,
  );
  fs.writeFileSync(p, t, 'utf8');
  console.log('已加 Image 桩');
}

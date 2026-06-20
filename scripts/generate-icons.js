const Jimp     = require('jimp');
const pngToIco = require('png-to-ico').default;
const path     = require('path');
const fs       = require('fs');
const os       = require('os');

const OUT       = path.join(__dirname, '..', 'app', 'icons');
const BUILD_DIR = path.join(__dirname, '..', 'build');
const ICO_SIZES = [16, 32, 48, 64, 128, 256];

fs.mkdirSync(OUT, { recursive: true });

async function makeImage(size) {
  const img = new Jimp(size, size, 0x141414ff);
  const cx = size / 2;
  const cy = size / 2;
  const bw = size * 0.55;
  const bh = size * 0.80;
  const br = size * 0.18;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ax = Math.abs(x - cx);
      const ay = Math.abs(y - cy);
      const dx = Math.max(0, ax - (bw / 2 - br));
      const dy = Math.max(0, ay - (bh / 2 - br));
      if (ax <= bw / 2 && ay <= bh / 2 && Math.hypot(dx, dy) <= br) {
        img.setPixelColor(0x2a2a2aff, x, y);
      }
    }
  }

  const ringR = size * 0.15;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (Math.hypot(x - cx, y - cy) <= ringR) {
        img.setPixelColor(0x1e1e1eff, x, y);
      }
    }
  }

  return img;
}

async function generate(size) {
  const img = await makeImage(size);
  await img.writeAsync(path.join(OUT, `icon-${size}.png`));
  console.log(`  icon-${size}.png`);
}

async function generateIco() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tvremote-ico-'));
  try {
    const pngPaths = [];
    for (const size of ICO_SIZES) {
      const img = await makeImage(size);
      const p   = path.join(tmpDir, `icon-${size}.png`);
      await img.writeAsync(p);
      pngPaths.push(p);
    }
    const buf = await pngToIco(pngPaths);
    fs.mkdirSync(BUILD_DIR, { recursive: true });
    fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), buf);
    console.log('  build/icon.ico');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

(async () => {
  console.log('Generating icons…');
  await generate(192);
  await generate(512);
  await generateIco();
  console.log('Done.');
})().catch(e => { console.error(e); process.exit(1); });

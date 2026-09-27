// One-off: turns the four uploaded photos into optimized, responsive WebP assets.
import sharp from 'sharp';
const U = '/mnt/user-data/uploads/';
const src = {
  profile: U + 'WhatsApp_Image_2026-09-27_at_11_49_20_AM.jpeg',
  logo: U + 'WhatsApp_Image_2026-09-27_at_10_55_46_AM.jpeg',
  featured: U + 'WhatsApp_Image_2026-09-27_at_10_55_51_AM.jpeg',
  second: U + 'WhatsApp_Image_2026-09-27_at_10_55_43_AM.jpeg',
};
const out = 'public/images/';
for (const w of [480, 720, 928]) await sharp(src.profile).resize(w).webp({ quality: 80 }).toFile(`${out}profile-${w}.webp`);
await sharp(src.profile).resize(1200, 630, { fit: 'cover', position: 'top' }).jpeg({ quality: 82 }).toFile(`${out}og.jpg`);
for (const [k, name] of [['featured', 'project-dashboard'], ['second', 'project-ai-workspace']])
  for (const w of [640, 1024, 1376]) await sharp(src[k]).resize(w).webp({ quality: 78 }).toFile(`${out}${name}-${w}.webp`);

// Logo: the upload is a JPEG with a baked-in "transparency" checkerboard. Keep only the
// gold ZM mark by keying on colour saturation, then crop to it.
const { data, info } = await sharp(src.logo).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
const px = Buffer.from(data);
let minX = 1e9, minY = 1e9, maxX = 0, maxY = 0;
for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
  const i = (y * info.width + x) * 4, r = px[i], g = px[i + 1], b = px[i + 2];
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  const gold = r > g && g > b && sat > 30 && y < 600; // mark only, not the grey wordmark below
  const a = gold ? Math.min(255, Math.round(((sat - 30) / 50) * 255)) : 0;
  px[i + 3] = a;
  if (a > 40) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
}
const pad = 6;
const box = { left: minX - pad, top: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
console.log('logo box', box);
const mark = sharp(px, { raw: info }).extract(box);
await mark.clone().png().toFile('public/brand/zm-mark.png');
await mark.clone().resize({ height: 96 }).webp({ quality: 90, alphaQuality: 100 }).toFile('public/brand/zm-mark.webp');
// Square favicons on the site's near-black
const markBuf = await mark.clone().png().toBuffer();
for (const s of [32, 180, 192, 512]) {
  const inner = await sharp(markBuf).resize({ width: Math.round(s * 0.74), height: Math.round(s * 0.74), fit: 'inside' }).toBuffer();
  await sharp({ create: { width: s, height: s, channels: 4, background: '#07090d' } })
    .composite([{ input: inner, gravity: 'center' }]).png().toFile(`public/brand/icon-${s}.png`);
}
await sharp(src.logo).resize(512).webp({ quality: 85 }).toFile('public/brand/zm-logo-original.webp');
console.log('done');

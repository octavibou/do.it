import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import toIco from "png-to-ico";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "brand", "do-it-logo-source.png");

const WHITE_LUMA = 236;
const ICON_BLACK = { r: 10, g: 10, b: 10, alpha: 1 };
const OG_BG = "#0A0A0A";
const OG_FG = "#F5F5F5";
const OG_MUTED = "#A3A3A3";

function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isNearWhite(r, g, b, a, threshold = WHITE_LUMA) {
  if (a < 10) {
    return true;
  }
  return luma(r, g, b) >= threshold;
}

function floodCorners(data, width, height, onPixel) {
  const seen = new Uint8Array(width * height);
  const stack = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) {
      continue;
    }
    const idx = y * width + x;
    if (seen[idx]) {
      continue;
    }
    seen[idx] = 1;
    const i = idx * 4;
    if (!isNearWhite(data[i], data[i + 1], data[i + 2], data[i + 3])) {
      continue;
    }
    onPixel(i);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}

async function readRgba(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: Buffer.from(data), info };
}

function findContentBox(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (isNearWhite(data[i], data[i + 1], data[i + 2], data[i + 3], 250)) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0) {
    throw new Error("No se encontró el cuadrado del logo en la fuente.");
  }

  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function extractRegion(data, width, box) {
  const out = Buffer.alloc(box.width * box.height * 4);
  for (let y = 0; y < box.height; y += 1) {
    const src = ((box.top + y) * width + box.left) * 4;
    data.copy(out, y * box.width * 4, src, src + box.width * 4);
  }
  return out;
}

function sampleInk(data, width, height) {
  const x = Math.floor(width * 0.08);
  const y = Math.floor(height * 0.5);
  const i = (y * width + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

async function fromRaw(data, width, height) {
  return sharp(data, { raw: { width, height, channels: 4 } }).png();
}

async function resizePng(pipeline, size) {
  return pipeline
    .clone()
    .resize(size, size, { fit: "fill", kernel: "lanczos3" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function writePng(filePath, buffer) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
  const meta = await sharp(buffer).metadata();
  console.log(
    `${path.relative(root, filePath)} ${meta.width}x${meta.height} ${buffer.length}B`
  );
  return meta;
}

async function makeMaskable(iconPng, size) {
  const inner = Math.round(size * 0.8);
  const left = Math.round((size - inner) / 2);
  const scaled = await sharp(iconPng)
    .resize(inner, inner, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: ICON_BLACK,
    },
  })
    .composite([{ input: scaled, left, top: left }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function makeOgImage(iconPng) {
  const width = 1200;
  const height = 630;
  const mark = 240;
  const overlay = await sharp(iconPng)
    .resize(mark, mark, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();

  const type = Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="${OG_BG}"/>
      <text x="600" y="430" text-anchor="middle" fill="${OG_FG}" font-size="56" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-weight="560" letter-spacing="-1.2">do.it</text>
      <text x="600" y="478" text-anchor="middle" fill="${OG_MUTED}" font-size="22" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif">Backlog para proyectos, humanos y bots</text>
    </svg>`
  );

  return sharp(type)
    .composite([{ input: overlay, left: Math.round((width - mark) / 2), top: 128 }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

const source = await readRgba(sourcePath);
const box = findContentBox(source.data, source.info.width, source.info.height);
const cropped = extractRegion(source.data, source.info.width, box);
const ink = sampleInk(cropped, box.width, box.height);

const transparent = Buffer.from(cropped);
floodCorners(transparent, box.width, box.height, (i) => {
  transparent[i] = 0;
  transparent[i + 1] = 0;
  transparent[i + 2] = 0;
  transparent[i + 3] = 0;
});

const solid = Buffer.from(cropped);
floodCorners(solid, box.width, box.height, (i) => {
  solid[i] = ink.r;
  solid[i + 1] = ink.g;
  solid[i + 2] = ink.b;
  solid[i + 3] = 255;
});

const transparentPipe = await fromRaw(transparent, box.width, box.height);
const solidPipe = await fromRaw(solid, box.width, box.height);

console.log(
  `source ${source.info.width}x${source.info.height} → crop ${box.width}x${box.height} @ ${box.left},${box.top} ink rgb(${ink.r},${ink.g},${ink.b})`
);

const png16 = await resizePng(transparentPipe, 16);
const png32 = await resizePng(transparentPipe, 32);
const png48 = await resizePng(transparentPipe, 48);
const png192 = await resizePng(transparentPipe, 192);
const png256 = await resizePng(transparentPipe, 256);
const png512 = await resizePng(transparentPipe, 512);
const apple180 = await resizePng(solidPipe, 180);
const brand256 = await resizePng(solidPipe, 256);
const maskable192 = await makeMaskable(await resizePng(solidPipe, 192), 192);
const maskable512 = await makeMaskable(await resizePng(solidPipe, 512), 512);
const og = await makeOgImage(await resizePng(solidPipe, 512));
const favicon = await toIco([png16, png32, png48]);

await writePng(path.join(root, "app", "icon.png"), png32);
await writePng(path.join(root, "app", "apple-icon.png"), apple180);
await writePng(path.join(root, "app", "opengraph-image.png"), og);
await writePng(path.join(root, "app", "twitter-image.png"), og);
await writeFile(path.join(root, "app", "favicon.ico"), favicon);
console.log(`app/favicon.ico ${favicon.length}B`);

await writePng(path.join(root, "public", "favicon-16x16.png"), png16);
await writePng(path.join(root, "public", "favicon-32x32.png"), png32);
await writePng(path.join(root, "public", "apple-touch-icon.png"), apple180);
await writePng(path.join(root, "public", "brand", "icon.png"), brand256);
await writePng(path.join(root, "public", "brand", "icon-transparent.png"), png256);
await writePng(path.join(root, "public", "icons", "icon-192.png"), png192);
await writePng(path.join(root, "public", "icons", "icon-512.png"), png512);
await writePng(path.join(root, "public", "icons", "icon-maskable-192.png"), maskable192);
await writePng(path.join(root, "public", "icons", "icon-maskable-512.png"), maskable512);

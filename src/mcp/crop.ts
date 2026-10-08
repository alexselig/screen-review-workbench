import sharp from "sharp";

export const CROP_WIDTH = 800;
export const CROP_HEIGHT = 600;
export const MAX_IMAGE_WIDTH = 800;
// Long full-page captures are downscaled to fit this height as well.
export const MAX_FULL_HEIGHT = 4000;

export type PinImage = {
  data: Buffer;
  mimeType: "image/png" | "image/jpeg";
  // Region of the capture shown, in capture pixels.
  region: { left: number; top: number; width: number; height: number };
  capture: { width: number; height: number };
  // Output size and where the pin sits in it, in output pixels.
  width: number;
  height: number;
  pin: { x: number; y: number };
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function marker(width: number, height: number, x: number, y: number) {
  const radius = 22;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <circle cx="${x}" cy="${y}" r="${radius}" fill="none" stroke="#ffffff" stroke-width="9"/>
      <circle cx="${x}" cy="${y}" r="${radius}" fill="none" stroke="#c2410c" stroke-width="5"/>
      <circle cx="${x}" cy="${y}" r="5" fill="#c2410c" stroke="#ffffff" stroke-width="2"/>
    </svg>`,
  );
}

// Crops a capture around a pin (x, y in 0..1) and marks the pin with a ring.
// With `full`, returns the whole capture downscaled instead of a crop.
export async function renderPinImage(
  capture: Buffer,
  pin: { x: number; y: number },
  { full = false }: { full?: boolean } = {},
): Promise<PinImage> {
  const meta = await sharp(capture).metadata();
  const captureWidth = meta.width;
  const captureHeight = meta.height;
  if (!captureWidth || !captureHeight) {
    throw new Error("Capture has no readable size.");
  }
  const pinX = clamp(Math.round(pin.x * captureWidth), 0, captureWidth - 1);
  const pinY = clamp(Math.round(pin.y * captureHeight), 0, captureHeight - 1);

  let region = { left: 0, top: 0, width: captureWidth, height: captureHeight };
  if (!full) {
    const width = Math.min(CROP_WIDTH, captureWidth);
    const height = Math.min(CROP_HEIGHT, captureHeight);
    region = {
      left: clamp(Math.round(pinX - width / 2), 0, captureWidth - width),
      top: clamp(Math.round(pinY - height / 2), 0, captureHeight - height),
      width,
      height,
    };
  }
  const scale = Math.min(
    1,
    MAX_IMAGE_WIDTH / region.width,
    full ? MAX_FULL_HEIGHT / region.height : 1,
  );
  const width = Math.max(1, Math.round(region.width * scale));
  const height = Math.max(1, Math.round(region.height * scale));

  let pipeline = sharp(capture).extract(region).resize(width, height);
  if (full) pipeline = pipeline.flatten({ background: "#ffffff" });
  const scaled = await pipeline.toBuffer();
  const outX = Math.round((pinX - region.left) * scale);
  const outY = Math.round((pinY - region.top) * scale);
  const marked = sharp(scaled).composite([
    { input: marker(width, height, outX, outY), left: 0, top: 0 },
  ]);
  const data = full
    ? await marked.jpeg({ quality: 80 }).toBuffer()
    : await marked.png().toBuffer();
  return {
    data,
    mimeType: full ? "image/jpeg" : "image/png",
    region,
    capture: { width: captureWidth, height: captureHeight },
    width,
    height,
    pin: { x: outX, y: outY },
  };
}

// src/constants.ts

import path from "path";

export const hostname = "localhost";
export const port = 5000;
export const TARGET_DIR = path.join(process.cwd(), "flash-demo-app");
export const NODE_MODULES_DIR = path.join(TARGET_DIR, "node_modules");
export const SOURCE_DIR = path.join(TARGET_DIR, "src");

export const imageExtensions = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "tiff",
  "svg",
  "webp",
  "heif",
  "heic",
  "avif",
  "eps",
  "pdf",
  "ai",
  "raw",
  "cr2",
  "nef",
  "orf",
  "sr2",
  "apng", // Animated PNG
  "ico", // Icon format
  "xbm", // X BitMap
  "pbm", // Portable Bitmap
  "pgm", // Portable Graymap
  "ppm", // Portable Pixmap
  "exr", // OpenEXR
];

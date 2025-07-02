import fs from "fs";
import path from "path";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { Buffer } from "buffer";

export function zeroPad(num: number, length = 3) {
  return num.toString().padStart(length, "0");
}

const INVALID_CHARS = /[\\/:*?"<>|]/g;
export function sanitize(name: string) {
  return name.replace(INVALID_CHARS, "_");
}

export function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function writeFileSafe(filePath: string, data: Buffer) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, data);
} 
import fs from "fs";
import path from "path";
import { NODE_MODULES_DIR } from "./constants";

export function getEntryPoint(packageName: string): string {
  const packagePath = path.join(NODE_MODULES_DIR, packageName, "package.json");

  if (fs.existsSync(packagePath)) {
    const packageJson = require(packagePath);

    const entryPoint = packageJson.module || packageJson.main;

    if (entryPoint) {
      return path.resolve(path.dirname(packagePath), entryPoint);
    }
    return path.join(packageName, "index.js");
  }

  return path.join("node_modules", packageName, "index.js");
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function resolveFilePath(
  moduleName: string,
  fileName: string
): string | null {
  const filePath = path.join(NODE_MODULES_DIR, moduleName, fileName);

  if (fileExists(filePath)) {
    return filePath;
  } else {
    console.warn(`File not found: ${moduleName}/${fileName}`);
    return null;
  }
}

export function getRelativePath(fullPath: string) {

  const absolutePath = path.resolve(fullPath);

  const parts = absolutePath.split("\\");

  const relativePath = parts
    .filter((part) => part)
    .slice(-2)
    .join("/")
    .toLowerCase();

  return relativePath;
}

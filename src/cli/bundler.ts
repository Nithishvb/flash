import { build } from "esbuild";
import path from "path";
import { NODE_MODULES_DIR } from "./constants";
import { getEntryPoint } from "./utils";

export async function bundlePackage(packageName: string) {
  try {
    const entryPoint = getEntryPoint(packageName);
    const outputPath = path.join(
      NODE_MODULES_DIR,
      ".flash",
      "deps",
      `${packageName}.js`
    );

    await build({
      entryPoints: [entryPoint],
      bundle: true,
      outfile: outputPath,
      format: "esm",
      platform: "browser",
    });

    console.log(`Bundled ${packageName} to ${outputPath}`);
  } catch (error) {
    console.error(`Failed to bundle ${packageName}:`, error);
  }
}

export async function bundleFile(
  moduleName: string,
  fileName: string,
  entryPoint: string
): Promise<void> {
  const outputFileName = fileName.replace(/[\\/]/g, "_"); // Replace slashes with underscores
  const outDir = path.join(NODE_MODULES_DIR, ".flash", "deps");

  try {
    await build({
      entryPoints: [entryPoint],
      outfile: path.join(outDir, outputFileName),
      bundle: true,
      format: "esm",
      platform: "browser",
      metafile: true,
    });
    console.log(`Successfully bundled: ${moduleName}/${fileName}`);
  } catch (error) {
    console.error(`Error bundling file: ${moduleName}/${fileName}`, error);
  }
}

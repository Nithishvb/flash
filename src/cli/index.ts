import { Command } from "commander";
import http from "http";
import { build } from "esbuild";
import path from "path";
import fs from "fs";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";
import mime from "mime-types";

const hostname = "localhost";
const port = 5000;
const TARGET_DIR = path.join(process.cwd(), "flash-demo-app");

const program = new Command();

const imageExtensions = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'bmp',
  'tiff',
  'svg',
  'webp',
  'heif',
  'heic',
  'avif',
  'eps',
  'pdf',
  'ai',
  'raw',
  'cr2',
  'nef',
  'orf',
  'sr2',
  'apng', // Animated PNG
  'ico',  // Icon format
  'xbm',  // X BitMap
  'pbm',  // Portable Bitmap
  'pgm',  // Portable Graymap
  'ppm',  // Portable Pixmap
  'exr',  // OpenEXR
];


program
  .name("flash")
  .description("Start React dev server")
  .action(() => {
    console.log("Starting Flash Dev Server...");

    const server = http.createServer(async (req, res) => {
      console.log(`Request received: ${req.method} ${req.url}`);

      if (req.url) {
        if (req.url === "/favicon.ico") {
          res.writeHead(204);
          res.end();
          return;
        }

        const initialHtmlTemplate = path.join(TARGET_DIR, "index.html");
        const filePath = path.join(TARGET_DIR, req?.url);

        const query = req.url.split("?")[1];

        // Handle requests that contain the "import" query parameter
        if (query === "import") {
          const filePath = path.join(TARGET_DIR, req.url.split("?")[0]);
      
          if (fs.existsSync(filePath)) {
            const fileUrl = `/${path.relative(TARGET_DIR, filePath).replace(/\\/g, "/")}`;
            const jsResponse = `export default ${JSON.stringify(fileUrl)};`;
            res.writeHead(200, { "Content-Type": "application/javascript" });
            res.end(jsResponse);
            return;
          } else {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Asset not found");
            return;
          }
        }

        if (req.url === "/") {
          fs.readFile(
            initialHtmlTemplate,
            "utf8",
            (err: NodeJS.ErrnoException | null, data: string) => {
              if (err) {
                console.error("Error reading file:", err);
                res.writeHead(500, { "Content-Type": "text/plain" });
                res.end("Internal Server Error");
                return;
              }

              res.writeHead(200, { "Content-Type": "text/html" });
              res.end(data);
            }
          );
          return;
        }

        // Handle CSS files
        if (req.url.includes(".css")) {
          if (fs.existsSync(filePath)) {
            const cssContent = fs.readFileSync(filePath, "utf-8");
            const jsResponse = `
            const __cssContent = ${JSON.stringify(cssContent)};
            const __cssId = ${JSON.stringify(filePath)};
            (function() {
              let style = document.querySelector(\`style[data-id="\${__cssId}"]\`);
              if (!style) {
                style = document.createElement("style");
                style.setAttribute("data-id", __cssId);
                document.head.appendChild(style);
              }
              style.textContent = __cssContent;
            })();
          `;
            res.writeHead(200, { "Content-Type": "application/javascript" });
            res.end(jsResponse);
            return;
          }
        }

        //Handle image files
        const mimeType = mime.lookup(filePath);
        if (mimeType && mimeType.startsWith("image/")) {
          const mimeType = mime.lookup(filePath); // Get the MIME type based on file extension
          if (mimeType && mimeType.startsWith("image/")) {
            const imageFile = fs.readFileSync(filePath); // Read the binary data of the image
            res.writeHead(200, { "Content-Type": mimeType }); // Set the correct Content-Type
            res.end(imageFile); // Send the binary image data
          }
        }

        //Handle dependency files
        if (req.url && req.url.includes("node_modules")) {
          if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath);

            res.writeHead(200, {
              "Content-Type": "application/javascript",
            });
            res.end(data);
          } else {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("File not found");
          }
          return;
        }

        // Handle JavaScript or TypeScript files
        if (
          filePath.endsWith(".js") ||
          filePath.endsWith(".ts") ||
          filePath.endsWith(".tsx")
        ) {
          try {
            const result = await build({
              entryPoints: [filePath],
              bundle: false,
              write: false,
              loader: {
                ".js": "jsx",
                ".ts": "ts",
                ".tsx": "tsx",
              },
              format: "esm",
              jsx: "automatic",
            });

            const modifiedCode = await rewriteBareImports(
              result.outputFiles[0].text
            );
            res.writeHead(200, { "Content-Type": "application/javascript" });
            res.end(modifiedCode);
          } catch (error) {
            console.error("Error processing JS/TS file:", error);
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Internal Server Error");
          }
          return;
        }
      }

    });

    server.listen(port, hostname, async () => {
      console.log(`Server running at http://${hostname}:${port}/`);
      // await preBundleDependencies();
    });
  });

export default program;

async function rewriteBareImports(code: string) {

  const ast = parse(code, {
    sourceType: "module", // Treat as an ES module
    plugins: ["jsx"], // Add support for JSX if needed
  });

  traverse(ast, {
    ImportDeclaration(path) {
      const importPath = path.node.source.value;

      const splitImportPath = importPath.split(".");

      if (importPath === "react-dom/client") {
        // Generate a new unique import variable
        const importVariableName = "__flash_import_reactDom_client";
        const importedSpecifiers = path.node.specifiers;

        // Replace the import path with the pre-bundled path
        const preBundledPath = `/node_modules/.flash/deps/react-dom_client.js`;
        path.node.source.value = preBundledPath;

        // Rewrite the import to a default import
        path.node.specifiers = [
          t.importDefaultSpecifier(t.identifier(importVariableName)),
        ];

        // Add a new variable declaration for `createRoot`
        const createRootDeclaration = t.variableDeclaration("const", [
          t.variableDeclarator(
            t.identifier("createRoot"),
            t.memberExpression(
              t.identifier(importVariableName),
              t.stringLiteral("createRoot"),
              true // Computed property
            )
          ),
        ]);

        // Insert the variable declaration after the import statement
        path.insertAfter(createRootDeclaration);
      }
      if (importPath === "react") {
        const importVariableName = "__flash_import_react";
        const preBundledPath = `/node_modules/.flash/deps/react.js`;
        path.node.source.value = preBundledPath;

        let indentifierName: string = "";

        path.node.specifiers.forEach((specifier) => {
          if (t.isImportSpecifier(specifier)) {
            const importedName = specifier.imported;
            const localName = specifier.local.name;
            indentifierName = specifier.local.name;
          }
        });

        // Rewrite the import to a default import
        path.node.specifiers = [
          t.importDefaultSpecifier(t.identifier(importVariableName)),
        ];

        // Add a new variable declaration for `StrictMode`
        const strictModeDeclaration = t.variableDeclaration("const", [
          t.variableDeclarator(
            t.identifier(indentifierName),
            t.memberExpression(
              t.identifier(importVariableName),
              t.stringLiteral(indentifierName),
              true // Computed property
            )
          ),
        ]);

        path.insertAfter(strictModeDeclaration);
      }

      if (importPath === "react/jsx-runtime") {
        const preBundledPath = `/node_modules/.flash/deps/react_jsx-runtime.js`;
        path.node.source.value = preBundledPath;

        // Generate a new unique import variable
        const importVariableName = "__flash_import_reactRuntime";
        const importedSpecifiers = path.node.specifiers;

        // Rewrite the import to a default import
        path.node.specifiers = [
          t.importDefaultSpecifier(t.identifier(importVariableName)),
        ];

        // Add a new variable declaration for `createRoot`
        const createRootDeclaration = t.variableDeclaration("const", [
          t.variableDeclarator(
            t.identifier("Fragment"),
            t.memberExpression(
              t.identifier(importVariableName),
              t.stringLiteral("Fragment"),
              true // Computed property
            )
          ),
        ]);

        const createJsxDeclaration = t.variableDeclaration("const", [
          t.variableDeclarator(
            t.identifier("jsx"),
            t.memberExpression(
              t.identifier(importVariableName),
              t.stringLiteral("jsx"),
              true // Computed property
            )
          ),
        ]);

        const createJsxsDeclaration = t.variableDeclaration("const", [
          t.variableDeclarator(
            t.identifier("jsxs"),
            t.memberExpression(
              t.identifier(importVariableName),
              t.stringLiteral("jsxs"),
              true // Computed property
            )
          ),
        ]);

        // Insert the variable declaration after the import statement
        path.insertAfter(createRootDeclaration);
        path.insertAfter(createJsxDeclaration);
        path.insertAfter(createJsxsDeclaration);
      }

      //Insert import for the assets import statements
      if(splitImportPath.length > 0){
        const result = imageExtensions.includes(splitImportPath[splitImportPath.length - 1]);
        if(result){
          path.node.source.value = `${importPath}?import`;
        }
      }

      //non react modules imports
      // const nonReactModuleFilePath = `/node_modules/.flash/deps/${importPath},js`;
      // if(fs.readFileSync(nonReactModuleFilePath)){
      //   path.node.source.value = nonReactModuleFilePath;
      // }else{
      //   const buildPath = `/node_modules/${importPath}`;
      //   const result = await build({
      //     entryPoints: [buildPath],
      //     outfile: path.join(`/node_modules/.flash/deps`, `${importPath}.js`),
      //     bundle: true,
      //     format: "esm",
      //     platform: "browser",
      //     metafile: true,
      //   });

      // }
    },
  });

  // Generate updated code
  const { code: updatedCode } = generate(ast);
  return updatedCode;
}

async function preBundleDependencies() {
  const dependencies = [
    {
      name: "react",
      files: [
        "index.js",
        "cjs/react-jsx-runtime.development.js",
        "cjs/react-jsx-dev-runtime.development.js",
      ],
    },
    {
      name: "react-dom",
      files: ["index.js", "client.js", "cjs/react-dom.development.js"],
    },
  ];

  for (const dep of dependencies) {
    for (const file of dep.files) {
      const entryPoint: string | null = resolveFilePath(dep.name, file);
      if (entryPoint) {
        await bundleFile(dep.name, file, entryPoint);
      }
    }
  }
}

async function bundleFile(
  moduleName: string,
  fileName: string,
  entryPoint: string
): Promise<void> {
  const outputFileName: string = fileName.replace(/[\\/]/g, "_"); // Replace slashes with underscores
  const outDir: string = path.join(TARGET_DIR, "node_modules/.flash/deps");

  try {
    await build({
      entryPoints: [entryPoint],
      outfile: path.join(outDir, outputFileName),
      bundle: true,
      format: "esm",
      platform: "browser",
      metafile: true, // Generates a metafile for dependency insights
    });
    console.log(`Successfully bundled: ${moduleName}/${fileName}`);
  } catch (error) {
    console.error(`Error bundling file: ${moduleName}/${fileName}`, error);
  }
}

function resolveFilePath(moduleName: string, fileName: string): string | null {
  const filePath: string = path.join(
    TARGET_DIR,
    "node_modules",
    moduleName,
    fileName
  );
  if (fs.existsSync(filePath)) {
    return filePath;
  } else {
    console.warn(`File not found: ${moduleName}/${fileName}`);
    return null;
  }
}

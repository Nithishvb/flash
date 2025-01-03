import { Command } from "commander";
import http from "http";
import { build } from "esbuild";
import path from "path";
import fs from "fs";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";

const hostname = "localhost";
const port = 5000;
const TARGET_DIR = path.join(process.cwd(), "flash-demo-app");

const program = new Command();

program
  .name("flash")
  .description("Start React dev server")
  .action(() => {
    console.log("Starting Flash Dev Server...");

    const server = http.createServer(async (req, res) => {
      console.log(`Request received: ${req.method} ${req.url}`);

      if (req.url === "/favicon.ico") {
        res.writeHead(204);
        res.end();
        return;
      }

      const initialHtmlTemplate = path.join(TARGET_DIR, "index.html");

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
      } else {
        if (req.url) {
          const filePath = path.join(TARGET_DIR, req.url);
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
          } else {
            // Serve directly if the request is for node_modules
            if (req.url.includes("node_modules")) {
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

            // Process user source files with esbuild
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

            // Rewrite bare imports for user source files
            const modifiedCode = await rewriteBareImports(
              result.outputFiles[0].text
            );

            res.writeHead(200, { "Content-Type": "application/javascript" });
            res.end(modifiedCode);
          }
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
  // if (code) {
  //   const updatedCode = code.replace(
  //     /from\s+["']([^./][^"']*)["']/g,
  //     (match, packageName) => {
  //       console.log("Matched import", match);
  //       let resolvedPath = path.join(TARGET_DIR, "node_modules", packageName);

  //       if (packageName === "react") {
  //         return `from "/node_modules/react/cjs/react.development.js"`;
  //       }
  //       if (packageName === "react-dom") {
  //         return `from "/node_modules/react-dom/cjs/react-dom.development.js"`;
  //       }

  //       if (!fs.existsSync(resolvedPath)) {
  //         resolvedPath = `${resolvedPath}.js`;
  //       }

  //       const stats = fs.statSync(resolvedPath);

  //       if (fs.existsSync(resolvedPath)) {
  //         if (stats.isDirectory()) {
  //           return `from "/node_modules/${packageName}/index.js"`;
  //         }
  //         return `from "/node_modules/${packageName}.js"`;
  //       }
  //       console.log("operatijm ended");
  //       throw new Error(`Package ${packageName} not found`);
  //     }
  //   );
  //   return updatedCode;
  // }
  const ast = parse(code, {
    sourceType: "module", // Treat as an ES module
    plugins: ["jsx"], // Add support for JSX if needed
  });

  traverse(ast, {
    ImportDeclaration(path) {
      const importPath = path.node.source.value;
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
            console.log("imported name" ,importedName);
            console.log("imported name", localName);
          }
        })

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

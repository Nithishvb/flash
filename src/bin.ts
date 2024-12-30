import fs from "fs-extra";
import path from "path";

const TEMPLATE_DIR = path.join(__dirname, '..',  "templates/react-ts");
const TARGET_DIR = process.cwd();

const write = (file: string, projectName: string, content?: string) => {
  const tempDirName = TARGET_DIR + "/" + projectName;
  if(!fs.existsSync(tempDirName)){
    fs.mkdir(tempDirName);
  }
  const targetPath = path.join(tempDirName, file);
  if (content) {
    fs.writeFileSync(targetPath, content);
  } else {
    copy(path.join(TEMPLATE_DIR, file), targetPath);
  }
};

async function init() {
  console.log("🚀 Creating a new React project...");

  // Copy template files
  try {
    // await fs.copy(TEMPLATE_DIR, TARGET_DIR + "/flash-demo-app");
    const tempProjectName = "flash-demo-app";
    const files = fs.readdirSync(TEMPLATE_DIR);
    for (const file of files.filter((f) => f !== "package.json")) {
      write(file, tempProjectName);
    }

    const pkg = JSON.parse(
      fs.readFileSync(path.join(TEMPLATE_DIR, `package.json`), "utf-8")
    );

    pkg.name = "flash-react-app";

    write("package.json", tempProjectName , JSON.stringify(pkg, null, 2) + "\n");

    console.log("🎉 Project successfully created!");
  } catch (err) {
    console.error("❌ Failed to create project:", err);
  }
}

function copy(src: string, dest: string) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDir(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
}

function copyDir(srcDir: string, destDir: string) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file);
    const destFile = path.resolve(destDir, file);
    copy(srcFile, destFile);
  }
}

init();

import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist/legacy", { recursive: true });
await copyFile("legacy/index.html", "dist/legacy/index.html");
await copyFile("LICENSE", "dist/legacy/LICENSE");

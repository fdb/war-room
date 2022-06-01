import * as fs from "fs/promises";
import * as path from "path";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

if (!process.env.FIGMA_TOKEN) {
  console.log("Error: No Figma token found.");
  console.log("Set the FIGMA_TOKEN environment variable first.");
  console.log(
    "Copy .env.example to .env and update the file with your personal token."
  );
  process.exit(1);
}

const ASSETS_DIR = path.join("./assets");

const CONTENT_TYPE_TO_FILE_EXTENSION = {
  "image/png": "png",
  "image/jpeg": "jpg",
};

async function _ensureDirectory(dir) {
  try {
    await fs.mkdir(dir);
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
}

async function _figmaApi(url) {
  const response = await fetch(url, {
    headers: { "X-Figma-Token": process.env.FIGMA_TOKEN },
  });
  if (response.status !== 200) {
    throw new Error(`Figma API request failed with status ${response.status}`);
  }
  const data = await response.json();
  return data;
}

async function downloadDocument(key, documentDir) {
  console.log(`Downloading document ${key}...`);
  const url = `https://api.figma.com/v1/files/${key}?geometry=paths`;
  const json = await _figmaApi(url);
  const filePath = path.join(documentDir, "_document.json");
  await fs.writeFile(filePath, JSON.stringify(json, null, 2));
}

async function downloadImageFills(key, documentDir) {
  console.log(`Downloading image fills for ${key}...`);
  const url = `https://api.figma.com/v1/files/${key}/images`;
  const json = await _figmaApi(url);
  if (json.status !== 200) {
    throw new Error(`Invalid status ${json.status}`);
  }
  const meta = json.meta;
  return meta.images;
}

async function downloadImages(images, documentDir) {
  const imageResults = {};
  for (const key in images) {
    console.log(`Downloading image ${key}...`);
    const url = images[key];
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = res.headers.get("Content-Type");
    const extension = CONTENT_TYPE_TO_FILE_EXTENSION[contentType];
    const fileName = `${key}.${extension}`;
    const filePath = path.join(documentDir, fileName);
    await fs.writeFile(filePath, buffer);
    imageResults[key] = fileName;
  }
  const imagesPath = path.join(documentDir, "_images.json");
  await fs.writeFile(imagesPath, JSON.stringify(imageResults, null, 2));
}

async function main() {
  const key = "5vvUJOGjivfEyfjCSN8Uod";
  const documentDir = path.join(ASSETS_DIR, key);
  await _ensureDirectory(documentDir);
  await downloadDocument(key, documentDir);
  const images = await downloadImageFills(key, documentDir);
  await downloadImages(images, documentDir);
}

main();

import * as fs from "fs/promises";
import { existsSync } from "fs";
import * as path from "path";

async function loadFigmaDocument(key) {
  const text = await fs.readFile(`./assets/${key}/_document.json`, "utf8");
  const json = JSON.parse(text);
  // The top-level element of a Figma document contains a "document" element.
  const document = json.document;
  // A document contains pages. Get the first page.
  const page = document.children[0];
  if (page.type !== "CANVAS") {
    throw new Error("Expected a CANVAS element");
  }
  // A page contains frames. Get the first frame.
  const frame = page.children[0];
  if (frame.type !== "FRAME") {
    throw new Error("Expected a FRAME element");
  }

  return frame;
}

function convertFigmaName(name) {
  name = name.replace(/[^a-zA-Z0-9]/g, "_");
  name += "_";
  name += Math.floor(Math.random() * 10000);
  return name;
}

function generatePlane(frame, rect) {
  let imageFill = rect.fills.find((fill) => fill.type === "IMAGE");
  if (!imageFill) {
    console.log(`Rectangle ${rect.name} does not have an image`);
    return;
  }

  let [frameX, frameY, frameWidth] = [
    frame.absoluteBoundingBox.x,
    frame.absoluteBoundingBox.y,
    frame.absoluteBoundingBox.width,
  ];
  let x = (rect.absoluteBoundingBox.x - frameX) / 10;
  let y = (rect.absoluteBoundingBox.y - frameY) / 10;
  let width = rect.absoluteBoundingBox.width / 10;
  let height = rect.absoluteBoundingBox.height / 10;
  let angle = (x / width) * 360;

  let figmaName = convertFigmaName(rect.name);
  let materialName = `Mat_${figmaName}`;
  rect.materialName = materialName;
  let usda = `def Xform "${figmaName}"
  {
      float3 xformOp:rotateXYZ = (0, 0, 0)
      float3 xformOp:translate = (${x}, ${y}, 0)
      float3 xformOp:scale = (${width}, ${height}, 1)
      uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]
  
      def Mesh "Plane"
      {
          uniform bool doubleSided = 1
          int[] faceVertexCounts = [4]
          int[] faceVertexIndices = [0, 1, 3, 2]
          rel material:binding = </_materials/${materialName}>
          normal3f[] normals = [(0, 0, 1), (0, 0, 1), (0, 0, 1), (0, 0, 1)] (
              interpolation = "faceVarying"
          )
          point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (1, 1, 0)]
          texCoord2f[] primvars:UVMap = [(0, 0), (1, 0), (1, 1), (0, 1)] (
              interpolation = "faceVarying"
          )
          uniform token subdivisionScheme = "none"
      }
  }
  `;
  return usda;
}

function generateMaterial(documentId, frame, rect) {
  let materialName = rect.materialName;
  let materialPath = `/_materials/${materialName}`;
  let imageFill = rect.fills.find((fill) => fill.type === "IMAGE");
  if (!imageFill) return;
  const imageRef = imageFill.imageRef;
  let imageFilename;
  if (existsSync(`./_export/images/${imageRef}.jpg`)) {
    imageFilename = `images/${imageRef}.jpg`;
  } else if (existsSync(`./_export/images/${imageRef}.png`)) {
    imageFilename = `images/${imageRef}.png`;
  } else {
    console.log(imageFill);
    throw new Error(`Image ${imageRef} not found`);
  }
  // console.log(imageFilename);

  let usda = `
  def Material "${materialName}"
  {
    token outputs:surface.connect = <${materialPath}/preview/Principled_BSDF.outputs:surface>

    def Scope "preview"
    {
      def Shader "Principled_BSDF"
      {
        uniform token info:id = "UsdPreviewSurface"
        float3 inputs:diffuseColor.connect = <${materialPath}/preview/Image_Texture.outputs:rgb>
        token outputs:surface
      }

      def Shader "Image_Texture"
      {
        uniform token info:id = "UsdUVTexture"
        asset inputs:file = @${imageFilename}@
        token inputs:sourceColorSpace = "sRGB"
        float2 inputs:st.connect = <${materialPath}/preview/uvmap.outputs:result>
        float3 outputs:rgb
      }

      def Shader "uvmap"
      {
        uniform token info:id = "UsdPrimvarReader_float2"
        token inputs:varname = "UVMap"
        float2 outputs:result
      }

    }
  }\n`;
  return usda;
}

async function main() {
  const documentId = "5vvUJOGjivfEyfjCSN8Uod";
  const frame = await loadFigmaDocument(documentId);
  let usda = `#usda 1.0\n\n`;

  frame.children = frame.children; // .slice(0, 1);

  // A frame contains rectangles. Get all rectangles and convert them to USD planes.
  for (const rect of frame.children) {
    if (rect.type !== "RECTANGLE") continue;
    usda += generatePlane(frame, rect);
  }

  usda += `\ndef "_materials"\n`;
  usda += `{\n`;
  for (const rect of frame.children) {
    if (rect.type !== "RECTANGLE") continue;
    usda += generateMaterial(documentId, frame, rect);
  }
  usda += `}\n`;

  await fs.writeFile("./_export/blob.usda", usda);
}

main();

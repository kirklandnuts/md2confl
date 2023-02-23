import * as p from "@clack/prompts";
import { setTimeout } from "node:timers/promises";
import color from "picocolors";
import * as figma from "figma-js";
import * as fs from "fs";

import { parseEnv } from "znv";
import { z } from "zod";
const url = require("url");

export const { FIGMA_PERSONAL_ACCESS_TOKEN } = parseEnv(process.env, {
  FIGMA_PERSONAL_ACCESS_TOKEN: z
    .string()
    .length(45, "Invalid Figma Personal Access Token"),
});

const isValidFigmaNodeUrl = (figmaNodeUrl: string) => {
  const parsedUrl = url.parse(figmaNodeUrl, true);
  console.debug(
    `parsedUrl.pathname.split("/"): ${parsedUrl.pathname.split("/")}`
  );
  console.debug(`parsedUrl.query["node-id"]: ${parsedUrl.query["node-id"]}`);
  if (
    parsedUrl.pathname.split("/").length === 4 &&
    parsedUrl.query["node-id"]
  ) {
    return true;
  }
  return false;
};

const parseFigmaNodeUrl = (figmaNodeUrl: string) => {
  let error = undefined;
  if (!isValidFigmaNodeUrl(figmaNodeUrl)) {
    error = Error("Invalid Figma node URL");
  }
  const parsedUrl = url.parse(figmaNodeUrl, true);
  const fileId = parsedUrl.pathname.split("/")[2];
  const nodeId = parsedUrl.query["node-id"];
  return { fileId, nodeId, error };
};

const getImageURLFromFigmaNode = async (fileId: string, nodeId: string) => {
  // initialize figma client
  const client = figma.Client({
    personalAccessToken: FIGMA_PERSONAL_ACCESS_TOKEN,
  });
  // fetch png image from figma node
  const imageResp = await client
    .fileImages(fileId, {
      ids: [nodeId],
      format: "png",
      scale: 1,
    })
    .then((res: any) => res.data);

  const error = imageResp.err
    ? Error(`failed to render image from figma node: ${imageResp.err}`)
    : undefined;

  const imageURL = imageResp.images[nodeId];

  return { imageURL, error };
};

const saveImageLocally = async (
  imageURL: string,
  localImageDir: string,
  nodeId: string
) => {
  const path = require("path");
  const axios = require("axios");

  const image = await axios.get(imageURL, {
    responseType: "arraybuffer",
  });

  // const imageBuffer = Buffer.from(image.data, "binary");

  const imageFileName = `${nodeId}.png`;
  const imageFilePath = path.join(localImageDir, imageFileName);

  let error = undefined;

  // If directory does not exist, create it
  if (!fs.existsSync(localImageDir)) fs.mkdirSync(localImageDir);

  fs.writeFile(imageFilePath, image.data, (err: any) => {
    if (err) {
      error = err;
    }
  });
  return { savedImageFilePath: imageFilePath, error };
};

async function main() {
  console.clear();

  await setTimeout(1000);

  p.intro(`${color.bgCyan(color.black(" Figma Image Fetcher "))}`);

  const figmaImageFetcher = await p.group(
    {
      figmaNodeURL: () =>
        p.text({
          message:
            "Please provide the URL to the figma node that you'd to fetch as an image?",
          validate: (value) => {
            if (!isValidFigmaNodeUrl(value)) {
              return "Please provide a valid Figma node URL";
            }
          },
        }),
      localImageDir: () =>
        p.text({
          message: "Where would you like to save the image to?",
          initialValue: `.output/images/`,
        }),
      fetchImage: () =>
        p.confirm({
          message: `Save image locally?`,
          initialValue: false,
        }),
    },
    {
      onCancel: () => {
        p.cancel("Operation cancelled.");
        process.exit(0);
      },
    }
  );

  if (figmaImageFetcher.fetchImage) {
    const s = p.spinner();
    s.start(`Fetching image from ${figmaImageFetcher.figmaNodeURL}`);
    const {
      fileId,
      nodeId,
      error: urlError,
    } = parseFigmaNodeUrl(figmaImageFetcher.figmaNodeURL);
    if (urlError) {
      throw new Error(`Error parsing Figma node URL: ${urlError}`);
    }
    const { imageURL, error: imageError } = await getImageURLFromFigmaNode(
      fileId,
      nodeId
    );
    if (imageError) {
      throw new Error(`Error getting image from Figma node: ${imageError}`);
    }
    const { savedImageFilePath, error: saveError } = await saveImageLocally(
      imageURL,
      figmaImageFetcher.localImageDir,
      nodeId
    );
    if (saveError) {
      throw new Error(`Error saving image locally: ${saveError}`);
    }
    s.stop(`Saved image to ${savedImageFilePath}`);
  }

  p.outro(`Problems? ${color.underline(color.cyan("don't care 😜"))}`);
}

main().catch(console.error);

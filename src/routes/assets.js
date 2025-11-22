const express = require("express");
const { v4: uuid } = require("uuid");
const { z } = require("zod");

const router = express.Router();
const assets = [];

const assetSchema = z.object({
  datasetId: z.string(),
  title: z.string(),
  uri: z.string().url(),
  assetType: z.enum(["CityGML", "3DTiles", "GeoTIFF", "Other"]),
  fileStatus: z.enum(["draft", "published", "retired"]),
  checksum: z.string().optional(),
  sizeBytes: z.number().optional(),
  description: z.string().optional(),
});

router.get("/", (_req, res) => {
  res.json({ assets });
});

router.post("/", (req, res) => {
  const parsed = assetSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.errors.map(
      (err) => `${err.path.join(".")}: ${err.message}`
    );
    return res.status(400).json({ errors });
  }

  const asset = {
    id: uuid(),
    ...parsed.data,
    createdAt: new Date().toISOString(),
  };

  assets.push(asset);
  return res.status(201).json(asset);
});

module.exports = router;

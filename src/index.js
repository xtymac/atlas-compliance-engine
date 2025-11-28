require("dotenv").config();
const express = require("express");
const { v4: uuid } = require("uuid");
const { getTemplates, getTemplateById } = require("./templates");
const { validateItemAgainstTemplate } = require("./validation");
const { CkanAdapter } = require("./integrations/ckan");
const { OrionPublisher } = require("./integrations/orion");
const { issueToken, ensureAuthenticated } = require("./security/oauth");
const assetsRouter = require("./routes/assets");
const excelSchemaRouter = require("./routes/excel-schema");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 4000;
const models = new Map();
const records = new Map();
const ckan = new CkanAdapter();
const orion = new OrionPublisher();

app.get("/status", (_req, res) => {
  res.json({
    service: "Atlas Compliance Engine (ACE) Prototype",
    oauth: "oauth/token",
    api: "/v1",
  });
});

// OAuth 2.0 - Resource Owner Password style token issuance for prototype
app.post("/oauth/token", issueToken);

// Protect everything under /v1
app.use("/v1", ensureAuthenticated);

app.get("/v1/model-templates", (_req, res) => {
  res.json({ templates: getTemplates() });
});

// One-click rigor: instantiate model with schema automatically
app.post("/v1/model-templates/:id/apply", (req, res) => {
  const template = getTemplateById(req.params.id);
  if (!template) {
    return res.status(404).json({ error: "Template not found" });
  }

  const modelId = req.body.modelId || template.id;
  const title = req.body.title || template.label;
  models.set(modelId, { ...template, title });
  records.set(modelId, []);

  return res.status(201).json({
    modelId,
    schema: template.fields,
    enforced: template.fields
      .filter((f) => f.required || f.mandatoryMark === "◎")
      .map((f) => f.fieldKey),
  });
});

app.get("/v1/models/:id/schema", (req, res) => {
  const model = models.get(req.params.id) || getTemplateById(req.params.id);
  if (!model) return res.status(404).json({ error: "Model not found" });
  res.json({ modelId: req.params.id, schema: model.fields });
});

// Item creation with GIF validation and controlled vocabulary enforcement
app.post("/v1/models/:id/items", (req, res) => {
  const model = models.get(req.params.id) || getTemplateById(req.params.id);
  if (!model) return res.status(404).json({ error: "Model not found" });

  const validation = validateItemAgainstTemplate(req.params.id, req.body);
  if (!validation.ok) {
    return res.status(400).json({ errors: validation.errors });
  }

  const item = { id: uuid(), ...validation.value };
  if (!records.has(req.params.id)) {
    records.set(req.params.id, []);
  }
  records.get(req.params.id).push(item);
  return res.status(201).json({ item });
});

app.get("/v1/models/:id/items", (req, res) => {
  const items = records.get(req.params.id) || [];
  res.json({ items });
});

// Publish to Orion-LD
app.post("/v1/models/:id/items/:itemId/publish/orion", async (req, res) => {
  const model = models.get(req.params.id) || getTemplateById(req.params.id);
  if (!model) return res.status(404).json({ error: "Model not found" });
  const items = records.get(req.params.id) || [];
  const item = items.find((i) => i.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: "Item not found" });

  const result = await orion.publish(req.params.id, item, model);
  return res.status(result.statusCode).json(result.body);
});

// RESTful datasets -> CKAN Action API adapter
app.post("/v1/datasets", async (req, res) => {
  const result = await ckan.createDataset(req.body);
  return res.status(result.statusCode).json(result.body);
});

app.use("/v1/assets", assetsRouter); // DAS abstraction layer - heavy files
app.use("/v1/excel-to-schema", excelSchemaRouter); // AI-powered Excel to schema

// Error abstraction: consistent HTTP status codes
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal Error", detail: err.message });
});

app.listen(PORT, () => {
  console.log(`ACE prototype running on http://localhost:${PORT}`);
});

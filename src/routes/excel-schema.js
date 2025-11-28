const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const { z } = require("zod");
const {
  analyzeColumns,
  generateSchemaWithAI,
  generateRuleBasedSchema,
} = require("../services/ai-schema-generator");
const { addTemplate } = require("../templates");

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv",
    ];
    const allowedExtensions = /\.(xlsx|xls|csv)$/i;

    if (
      allowedMimes.includes(file.mimetype) ||
      allowedExtensions.test(file.originalname)
    ) {
      cb(null, true);
    } else {
      cb(
        new Error("Only Excel (.xlsx, .xls) and CSV files are allowed"),
        false
      );
    }
  },
});

function parseExcelFile(buffer, filename) {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert to JSON with headers
  const jsonData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  if (jsonData.length < 2) {
    throw new Error(
      "Excel file must have headers and at least one data row"
    );
  }

  const headers = jsonData[0].map((h) => (h ? String(h).trim() : ""));
  const dataRows = jsonData.slice(1, 11); // Sample first 10 data rows

  // Filter out completely empty columns
  const nonEmptyIndices = headers
    .map((h, i) => (h ? i : -1))
    .filter((i) => i !== -1);
  const filteredHeaders = nonEmptyIndices.map((i) => headers[i]);
  const filteredData = dataRows.map((row) =>
    nonEmptyIndices.map((i) => row[i])
  );

  const columns = analyzeColumns(filteredHeaders, filteredData);

  return {
    filename,
    sheetName,
    headers: filteredHeaders,
    sampleData: filteredData,
    totalRows: jsonData.length - 1,
    columns,
  };
}

// POST /v1/excel-to-schema/analyze - Upload and analyze Excel file
router.post("/analyze", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const analysis = parseExcelFile(req.file.buffer, req.file.originalname);

    // Check if AI should be skipped (for testing or if explicitly requested)
    const skipAI = req.query.skipAI === "true";

    let result;
    if (skipAI) {
      result = {
        schema: generateRuleBasedSchema(analysis),
        aiGenerated: false,
        provider: "rule-based",
      };
    } else {
      result = await generateSchemaWithAI(analysis, {
        forceStrict: req.query.strict === "true",
      });
    }

    return res.json({
      ...result,
      analysis: {
        filename: analysis.filename,
        sheetName: analysis.sheetName,
        totalRows: analysis.totalRows,
        columnCount: analysis.headers.length,
        columns: analysis.columns.map((c) => ({
          header: c.header,
          inferredType: c.inferredType,
          distinctCount: c.distinctCount,
          hasNulls: c.hasNulls,
          gifMatch: c.gifMatch ? true : false,
        })),
      },
    });
  } catch (error) {
    console.error("Excel analysis error:", error);

    if (error.message.includes("Only Excel")) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(500).json({
      error: "Failed to analyze Excel file",
      detail: error.message,
    });
  }
});

// Schema validation for confirm endpoint
const confirmSchema = z.object({
  schema: z.object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, "ID must be kebab-case"),
    label: z.string().min(1),
    description: z.string().optional(),
    oneClickRigor: z.boolean().optional().default(false),
    fields: z
      .array(
        z.object({
          fieldKey: z
            .string()
            .min(1)
            .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Invalid field key"),
          label: z.string().min(1),
          description: z.string().optional(),
          type: z.enum([
            "string",
            "number",
            "date",
            "boolean",
            "latitude",
            "longitude",
            "controlledVocabulary",
          ]),
          required: z.boolean().optional().default(false),
          pattern: z.string().optional(),
          mandatoryMark: z.string().optional(),
          options: z.array(z.string()).optional(),
        })
      )
      .min(1),
  }),
});

// POST /v1/excel-to-schema/confirm - Save the generated schema as a template
router.post("/confirm", (req, res) => {
  try {
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.errors.map(
        (err) => `${err.path.join(".")}: ${err.message}`
      );
      return res.status(400).json({ errors });
    }

    const { schema } = parsed.data;

    // Convert pattern strings to RegExp objects
    schema.fields = schema.fields.map((field) => {
      if (field.pattern) {
        try {
          field.pattern = new RegExp(field.pattern);
        } catch {
          delete field.pattern;
        }
      }
      return field;
    });

    const added = addTemplate(schema);

    return res.status(201).json({
      message: "Template created successfully",
      template: {
        id: added.id,
        label: added.label,
        fieldCount: added.fields.length,
      },
    });
  } catch (error) {
    console.error("Template confirm error:", error);

    if (error.message.includes("already exists")) {
      return res.status(409).json({ error: error.message });
    }

    return res.status(500).json({
      error: "Failed to create template",
      detail: error.message,
    });
  }
});

// Error handler for multer
router.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File size exceeds 10MB limit" });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message.includes("Only Excel")) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;

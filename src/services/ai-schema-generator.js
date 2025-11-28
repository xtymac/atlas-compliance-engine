const OpenAI = require("openai");

const PROVIDER = process.env.SCHEMA_AI_PROVIDER || "gpt-4o-mini";
const ENABLE_STRICT_ESCALATION =
  process.env.SCHEMA_AI_STRICT_ESCALATION !== "false";

// GIF standard field mappings for Japanese government open data
const GIF_FIELD_MAPPINGS = {
  全国地方公共団体コード: {
    fieldKey: "localGovernmentCode",
    pattern: "^[0-9]{6}$",
    type: "string",
  },
  ID: { fieldKey: "identifier", pattern: "^[A-Za-z0-9_-]+$", type: "string" },
  名称: { fieldKey: "name", type: "string" },
  名称_英語: { fieldKey: "nameEn", type: "string" },
  住所: { fieldKey: "address", type: "string" },
  郵便番号: { fieldKey: "postalCode", pattern: "^[0-9]{7}$", type: "string" },
  電話番号: { fieldKey: "phoneNumber", type: "string" },
  緯度: { fieldKey: "latitude", type: "latitude" },
  経度: { fieldKey: "longitude", type: "longitude" },
  備考: { fieldKey: "note", type: "string" },
  データセット_最終更新日: { fieldKey: "datasetUpdatedAt", type: "date" },
};

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function sanitizeFieldKey(header) {
  // Convert to camelCase and remove invalid characters
  return header
    .replace(/[^\w\s]/g, "")
    .replace(/\s+(.)/g, (_, c) => c.toUpperCase())
    .replace(/\s/g, "")
    .replace(/^(.)/, (c) => c.toLowerCase())
    .replace(/^[0-9]/, "_$&") || "field";
}

function isDateLike(value) {
  if (typeof value !== "string") return false;
  return /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(value);
}

function isBoolean(value) {
  if (typeof value === "boolean") return true;
  if (typeof value !== "string") return false;
  const lower = value.toLowerCase();
  return ["yes", "no", "true", "false", "はい", "いいえ", "有", "無"].includes(
    lower
  );
}

function isLatitude(values) {
  return values.every((v) => {
    const num = Number(v);
    return !isNaN(num) && num >= -90 && num <= 90;
  });
}

function isLongitude(values) {
  return values.every((v) => {
    const num = Number(v);
    return !isNaN(num) && num >= -180 && num <= 180;
  });
}

function inferType(values, header) {
  const nonEmpty = values.filter((v) => v != null && v !== "");
  if (nonEmpty.length === 0) return "string";

  // Check for GIF field match first
  const gifMatch = GIF_FIELD_MAPPINGS[header];
  if (gifMatch) return gifMatch.type;

  // Check header hints for coordinates
  const headerLower = header.toLowerCase();
  if (headerLower.includes("緯度") || headerLower.includes("latitude")) {
    return "latitude";
  }
  if (headerLower.includes("経度") || headerLower.includes("longitude")) {
    return "longitude";
  }

  // Check values
  if (nonEmpty.every((v) => typeof v === "number")) return "number";
  if (nonEmpty.every((v) => !isNaN(Number(v)) && String(v).trim() !== "")) {
    // All numeric strings
    if (isLatitude(nonEmpty) && headerLower.includes("lat")) return "latitude";
    if (isLongitude(nonEmpty) && headerLower.includes("lon"))
      return "longitude";
    return "number";
  }
  if (nonEmpty.every(isDateLike)) return "date";
  if (nonEmpty.every(isBoolean)) return "boolean";

  // Check for controlled vocabulary (few distinct values)
  const distinct = [...new Set(nonEmpty)];
  if (distinct.length <= 10 && distinct.length < nonEmpty.length * 0.5) {
    return "controlledVocabulary";
  }

  return "string";
}

function analyzeColumns(headers, dataRows) {
  return headers.map((header, colIndex) => {
    const values = dataRows.map((row) => row[colIndex]).filter((v) => v != null);
    const inferredType = inferType(values, header);
    const distinctValues = [...new Set(values)];

    const gifMatch = GIF_FIELD_MAPPINGS[header];

    return {
      header,
      index: colIndex,
      sampleValues: values.slice(0, 5),
      inferredType,
      distinctCount: distinctValues.length,
      distinctValues:
        inferredType === "controlledVocabulary" ? distinctValues : undefined,
      hasNulls: values.length < dataRows.length,
      gifMatch,
    };
  });
}

function buildSystemPrompt() {
  return `You are a data schema analyst for a GIF-compliant CMS system in Japan.
Your task is to analyze Excel column headers and sample data to generate a structured template schema.

The schema must follow this exact JSON format:
{
  "id": "kebab-case-id",
  "label": "Human readable name (Japanese or English)",
  "description": "Brief description of the template purpose",
  "oneClickRigor": true,
  "fields": [
    {
      "fieldKey": "camelCaseFieldKey",
      "label": "Display Label (日本語 or English)",
      "description": "Field description",
      "type": "string|number|date|controlledVocabulary|latitude|longitude|boolean",
      "required": true|false,
      "pattern": "optional regex pattern as string without delimiters",
      "mandatoryMark": "◎"
    }
  ]
}

Field type mapping rules:
- Text/String columns → "string"
- Numeric columns (integers, decimals) → "number"
- Date columns (YYYY-MM-DD, etc.) → "date"
- Columns with limited distinct values (< 10) → "controlledVocabulary" with "options" array
- Latitude/緯度 columns → "latitude"
- Longitude/経度 columns → "longitude"
- Yes/No, True/False columns → "boolean"

Japanese GIF standard fields to recognize:
- 全国地方公共団体コード → fieldKey: "localGovernmentCode", pattern: "^[0-9]{6}$"
- 緯度 → type: "latitude"
- 経度 → type: "longitude"
- ID/識別子 → pattern: "^[A-Za-z0-9_-]+$"
- 郵便番号 → pattern: "^[0-9]{7}$"

IMPORTANT:
- Return ONLY valid JSON, no markdown code blocks
- Preserve Japanese column names in labels
- Mark fields as required: true if they appear to be mandatory
- For controlledVocabulary, include an "options" array with the distinct values`;
}

function buildUserPrompt(analysis) {
  const { filename, headers, sampleData, columns } = analysis;

  const columnSummary = columns
    .map((col) => {
      let summary = `- ${col.header}: inferred type "${col.inferredType}"`;
      if (col.gifMatch) summary += ` (GIF standard field)`;
      if (col.distinctValues)
        summary += `, options: [${col.distinctValues.slice(0, 5).join(", ")}${col.distinctValues.length > 5 ? "..." : ""}]`;
      if (col.sampleValues.length > 0)
        summary += `, samples: [${col.sampleValues.slice(0, 3).join(", ")}]`;
      return summary;
    })
    .join("\n");

  return `Analyze this Excel file structure and generate a schema:

File name: ${filename}

Columns (${headers.length} total):
${columnSummary}

Sample data (first ${Math.min(sampleData.length, 5)} rows):
${sampleData
  .slice(0, 5)
  .map((row, i) => `Row ${i + 1}: ${JSON.stringify(row)}`)
  .join("\n")}

Generate a complete schema JSON following the specified format.
Suggest an appropriate id (kebab-case) and label based on the data content.`;
}

async function callOpenAI(prompt, systemPrompt, model, strict = false) {
  const client = getOpenAIClient();
  if (!client) throw new Error("OpenAI API key not configured");

  const options = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 4000,
  };

  if (model === "gpt-4o-mini" || model === "gpt-4o") {
    options.response_format = { type: "json_object" };
  }

  const response = await client.chat.completions.create(options);
  return response.choices[0].message.content;
}

function parseAIResponse(response) {
  // Try to parse directly first
  try {
    return JSON.parse(response);
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch =
      response.match(/```json\n?([\s\S]*?)\n?```/) ||
      response.match(/```\n?([\s\S]*?)\n?```/) ||
      response.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      return JSON.parse(jsonStr);
    }
    throw new Error("Could not parse JSON from AI response");
  }
}

function validateSchema(schema) {
  if (!schema || typeof schema !== "object") {
    throw new Error("Schema must be an object");
  }
  if (!schema.id || typeof schema.id !== "string") {
    throw new Error("Schema must have a string id");
  }
  if (!schema.label || typeof schema.label !== "string") {
    throw new Error("Schema must have a string label");
  }
  if (!Array.isArray(schema.fields) || schema.fields.length === 0) {
    throw new Error("Schema must have at least one field");
  }

  const validTypes = [
    "string",
    "number",
    "date",
    "boolean",
    "latitude",
    "longitude",
    "controlledVocabulary",
  ];

  // Validate and fix fields
  const seenKeys = new Set();
  schema.fields = schema.fields.map((field, index) => {
    if (!field.fieldKey) {
      field.fieldKey = `field${index + 1}`;
    }

    // Ensure unique fieldKeys
    let key = field.fieldKey;
    let counter = 1;
    while (seenKeys.has(key)) {
      key = `${field.fieldKey}_${counter++}`;
    }
    field.fieldKey = key;
    seenKeys.add(key);

    if (!field.label) {
      field.label = field.fieldKey;
    }

    if (!validTypes.includes(field.type)) {
      field.type = "string";
    }

    if (typeof field.required !== "boolean") {
      field.required = false;
    }

    return field;
  });

  return schema;
}

function generateRuleBasedSchema(analysis) {
  const { filename, columns } = analysis;

  // Generate id from filename
  const id = filename
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 50);

  const fields = columns.map((col) => {
    const gifMatch = col.gifMatch;
    const field = {
      fieldKey: gifMatch?.fieldKey || sanitizeFieldKey(col.header),
      label: col.header,
      description: `Auto-detected from column "${col.header}"`,
      type: col.inferredType,
      required: false,
    };

    if (gifMatch?.pattern) {
      field.pattern = gifMatch.pattern;
    }

    if (col.inferredType === "controlledVocabulary" && col.distinctValues) {
      field.options = col.distinctValues;
    }

    return field;
  });

  return {
    id: id || "imported-schema",
    label: filename.replace(/\.[^.]+$/, ""),
    description: "Schema generated from Excel file (rule-based)",
    oneClickRigor: false,
    fields,
  };
}

async function generateSchemaWithAI(analysis, options = {}) {
  const { forceStrict = false, maxRetries = 2 } = options;

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(analysis);

  let model =
    PROVIDER === "gpt-4o-strict" ? "gpt-4o" : PROVIDER === "gemini" ? null : PROVIDER;
  let useStrict = forceStrict || PROVIDER === "gpt-4o-strict";

  // Gemini not implemented yet, fall back to rule-based
  if (PROVIDER === "gemini") {
    console.warn("Gemini provider not implemented, using rule-based fallback");
    return {
      schema: generateRuleBasedSchema(analysis),
      aiGenerated: false,
      provider: "rule-based",
      warning: "Gemini provider not yet implemented",
    };
  }

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await callOpenAI(
        userPrompt,
        systemPrompt,
        model,
        useStrict
      );
      console.log("AI response (first 500 chars):", response?.substring(0, 500));
      const parsed = parseAIResponse(response);
      console.log("Parsed schema:", { id: parsed.id, label: parsed.label, fieldCount: parsed.fields?.length });
      const validated = validateSchema(parsed);

      return {
        schema: validated,
        aiGenerated: true,
        provider: model,
        strict: useStrict,
      };
    } catch (error) {
      lastError = error;
      console.warn(`AI attempt ${attempt + 1} failed:`, error.message);

      // On last retry with Mini, try escalating to strict mode
      if (
        attempt === maxRetries - 1 &&
        model === "gpt-4o-mini" &&
        ENABLE_STRICT_ESCALATION
      ) {
        console.log("Escalating to GPT-4o strict mode");
        model = "gpt-4o";
        useStrict = true;
      }
    }
  }

  // All retries failed, use rule-based fallback
  console.warn("AI schema generation failed, using rule-based fallback");
  return {
    schema: generateRuleBasedSchema(analysis),
    aiGenerated: false,
    provider: "rule-based",
    warning: `AI generation failed: ${lastError?.message}. Used rule-based fallback.`,
  };
}

module.exports = {
  analyzeColumns,
  generateSchemaWithAI,
  generateRuleBasedSchema,
  GIF_FIELD_MAPPINGS,
};

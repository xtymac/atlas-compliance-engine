const { z } = require("zod");
const { getTemplateById } = require("./templates");

const dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function coordinateSchema(fieldKey) {
  return z
    .number({
      required_error: `${fieldKey} is required`,
      invalid_type_error: `${fieldKey} must be a number`,
    })
    .finite()
    .refine((value) => Math.abs(value) <= (fieldKey === "latitude" ? 90 : 180), {
      message: `${fieldKey} must satisfy GIF coordinate bounds`,
    })
    .refine((value) => `${value}`.match(/^-?\d+(\.\d+)?$/), {
      message: `${fieldKey} must be numeric (GIF core data parts)`,
    });
}

function buildZodSchema(template) {
  const shape = {};

  template.fields.forEach((field) => {
    let base;
    if (field.type === "controlledVocabulary") {
      base = z.enum(field.options);
    } else if (field.type === "boolean") {
      base = z.boolean();
    } else if (field.type === "number") {
      base = z.number();
    } else if (field.type === "latitude" || field.type === "longitude") {
      base = coordinateSchema(field.fieldKey);
    } else if (field.type === "date") {
      base = z
        .string()
        .regex(dateRegex, `${field.fieldKey} must be YYYY-MM-DD`);
    } else {
      base = z.string();
    }

    if (field.pattern) {
      base = base.regex(field.pattern, `${field.fieldKey} is not valid`);
    }

    shape[field.fieldKey] = field.required ? base : base.optional();
  });

  // Ensure GIF coordinate pair presence if either is provided.
  return z
    .object(shape)
    .refine(
      (data) =>
        (data.latitude === undefined && data.longitude === undefined) ||
        (data.latitude !== undefined && data.longitude !== undefined),
      {
        message: "latitude and longitude must be provided together",
        path: ["latitude"],
      }
    );
}

function validateItemAgainstTemplate(templateId, data) {
  const template = getTemplateById(templateId);
  if (!template) {
    return { ok: false, errors: [`Unknown template: ${templateId}`] };
  }

  const schema = buildZodSchema(template);
  const parsed = schema.safeParse(data);

  if (!parsed.success) {
    const errors = parsed.error.errors.map(
      (err) => `${err.path.join(".")}: ${err.message}`
    );
    return { ok: false, errors };
  }

  // Mandatory mark enforcement (◎) - double-check required fields presence.
  const missingMandatory = template.fields
    .filter((f) => f.mandatoryMark === "◎" && (parsed.data[f.fieldKey] === undefined || parsed.data[f.fieldKey] === ""))
    .map((f) => f.fieldKey);

  if (missingMandatory.length > 0) {
    return {
      ok: false,
      errors: missingMandatory.map(
        (fieldKey) => `${fieldKey} is required (標準データセット 区分◎)`
      ),
    };
  }

  // GIF coordinate validation
  const coordinateErrors = validateCoordinates(
    parsed.data.latitude,
    parsed.data.longitude
  );

  if (coordinateErrors.length > 0) {
    return { ok: false, errors: coordinateErrors };
  }

  return { ok: true, value: parsed.data, template };
}

function validateCoordinates(latitude, longitude) {
  if (latitude === undefined || longitude === undefined) {
    return [];
  }

  const errors = [];
  if (Math.abs(latitude) > 90) {
    errors.push("latitude must be within -90 to 90 (GIF core data parts)");
  }
  if (Math.abs(longitude) > 180) {
    errors.push("longitude must be within -180 to 180 (GIF core data parts)");
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    errors.push("coordinates must be numeric");
  }
  if (latitude === 0 && longitude === 0) {
    errors.push("coordinates cannot both be zero (invalid GIF location)");
  }
  return errors;
}

module.exports = {
  buildZodSchema,
  validateItemAgainstTemplate,
  validateCoordinates,
};

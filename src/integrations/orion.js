const fetchFn = (...args) =>
  (typeof fetch !== "undefined"
    ? fetch(...args)
    : import("node-fetch").then(({ default: f }) => f(...args)));

class OrionPublisher {
  constructor(config = {}) {
    this.endpoint = config.endpoint || process.env.ORION_LD_URL;
    this.service = config.service || process.env.FIWARE_SERVICE || "ace";
    this.servicePath =
      config.servicePath || process.env.FIWARE_SERVICEPATH || "/";
    this.context =
      config.context || [
        "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
        "https://schema.lab.ace/contexts/standard.jsonld",
      ];
  }

  buildGeoProperty(latitude, longitude) {
    return {
      type: "GeoProperty",
      value: {
        type: "Point",
        coordinates: [Number(longitude), Number(latitude)],
      },
      observedAt: new Date().toISOString(),
    };
  }

  toNgsiEntity(modelId, item, template) {
    const base = {
      id: `urn:ace:${modelId}:${item.identifier}`,
      type: modelId.replace(/-/g, "_"),
      "@context": this.context,
    };

    template.fields.forEach((field) => {
      if (["latitude", "longitude"].includes(field.fieldKey)) return;
      if (item[field.fieldKey] === undefined) return;

      base[field.fieldKey] = {
        type: "Property",
        value: item[field.fieldKey],
      };
    });

    if (item.latitude !== undefined && item.longitude !== undefined) {
      base.location = this.buildGeoProperty(item.latitude, item.longitude);
    }

    return base;
  }

  async publish(modelId, item, template) {
    const entity = this.toNgsiEntity(modelId, item, template);

    if (!this.endpoint) {
      return {
        statusCode: 202,
        body: {
          message:
            "ORION_LD_URL not configured. NGSI-LD payload prepared only.",
          entity,
        },
      };
    }

    const res = await fetchFn(`${this.endpoint}/ngsi-ld/v1/entities`, {
      method: "POST",
      headers: {
        "Content-Type": "application/ld+json",
        Link: `<${this.context[0]}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`,
        FiwareService: this.service,
        FiwareServicepath: this.servicePath,
      },
      body: JSON.stringify(entity),
    });

    if (!res.ok) {
      const detail = await res.text();
      return {
        statusCode: res.status,
        body: { error: "Orion-LD publish failed", detail },
      };
    }

    return { statusCode: 201, body: { entityId: entity.id } };
  }
}

module.exports = {
  OrionPublisher,
};

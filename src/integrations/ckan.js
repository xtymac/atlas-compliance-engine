const fetch = (...args) =>
  import("node-fetch").then(({ default: fetchFn }) => fetchFn(...args));

class CkanAdapter {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || process.env.CKAN_BASE_URL;
    this.apiKey = config.apiKey || process.env.CKAN_API_KEY;
    this.schemaId = config.schemaId || "ace-standard-schema";
  }

  /**
   * Translate RESTful intent into CKAN Action API.
   */
  mapRestToAction(method, path) {
    if (method === "POST" && path === "/v1/datasets") return "package_create";
    if (method === "GET" && path.startsWith("/v1/datasets/")) return "package_show";
    if (method === "POST" && path.endsWith("/resources")) return "resource_create";
    return null;
  }

  translateDatasetPayload(restPayload) {
    return {
      name: restPayload.name,
      title: restPayload.title || restPayload.name,
      owner_org: restPayload.organization,
      schema_id: this.schemaId, // ckanext-scheming schema binding
      extras: [
        {
          key: "localGovernmentCode",
          value: restPayload.localGovernmentCode,
        },
        { key: "datasetUpdatedAt", value: restPayload.datasetUpdatedAt },
      ],
      resources: (restPayload.resources || []).map((resource) => ({
        name: resource.name,
        format: resource.format,
        url: resource.url,
        schema: resource.schema,
      })),
    };
  }

  translateResourcePayload(datasetId, resource) {
    return {
      package_id: datasetId,
      name: resource.name,
      url: resource.url,
      format: resource.format,
      schema: resource.schema,
    };
  }

  normalizeResponse(action, httpStatus, json) {
    if (!json) {
      return {
        statusCode: httpStatus || 502,
        body: { error: "No CKAN response", action },
      };
    }

    if (json.success === false) {
      const statusCode = this.mapErrorStatus(json.error);
      return {
        statusCode,
        body: {
          error: json.error || "CKAN error",
          action,
        },
      };
    }

    return {
      statusCode: httpStatus >= 400 ? httpStatus : 200,
      body: json.result || json,
    };
  }

  mapErrorStatus(error) {
    if (!error || !error.__type) return 400;
    if (error.__type === "Authorization Error") return 403;
    if (error.__type === "Not Found Error") return 404;
    return 400;
  }

  async callAction(action, payload) {
    if (!this.baseUrl) {
      return {
        statusCode: 202,
        body: {
          message:
            "CKAN_BASE_URL not configured. Action simulated for prototype.",
          action,
          payload,
        },
      };
    }

    const res = await fetch(`${this.baseUrl}/api/3/action/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiKey ? this.apiKey : "",
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);
    return this.normalizeResponse(action, res.status, json);
  }

  async createDataset(restPayload) {
    const payload = this.translateDatasetPayload(restPayload);
    return this.callAction("package_create", payload);
  }

  async createResource(datasetId, resource) {
    const payload = this.translateResourcePayload(datasetId, resource);
    return this.callAction("resource_create", payload);
  }
}

module.exports = {
  CkanAdapter,
};

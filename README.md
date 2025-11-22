# Atlas Compliance Engine (ACE) Prototype

Prototype of a governed CMS + DAS abstraction that eliminates manual schema design for Japan standard datasets while enforcing GIF rigor.

## What this prototype shows
- **ACE Core (CMS)** for structured records with one-click model templates (公共施設一覧, AED設置箇所一覧).
- **DAS abstraction** (`/v1/assets`) to manage heavy file metadata (CityGML, 3D Tiles) separately from record data.
- **Rigor abstraction**: mandatory fields (区分「◎」) enforced, controlled vocabulary inputs, GIF coordinate validation, field keys fixed to 標準 項目名英語.
- **API adapter**: REST resources mapped to CKAN Action API + scheming, NGSI-LD publisher for Orion-LD, OAuth 2.0 bearer tokens, and CKAN error normalization to HTTP status codes.
- **UI shim**: `public/index.html` gives simplified Select/Boolean controls and a coordinate widget aligned with the backend validators.

## Quick start
```bash
npm install
npm run dev  # http://localhost:4000
```
1) Get a token:
```bash
curl -X POST http://localhost:4000/oauth/token \
  -H "Content-Type: application/json" \
  -d '{"clientId":"ace-prototype-client","clientSecret":"ace-prototype-secret","scope":"datasets:write items:write"}'
```
2) Instantiate a model (one-click rigor):
```bash
curl -X POST http://localhost:4000/v1/model-templates/public-facilities/apply \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" -d '{"title":"City Public Facilities"}'
```
3) Create an item (mandatory ◎ + GIF coordinate validation):
```bash
curl -X POST http://localhost:4000/v1/models/public-facilities/items \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"localGovernmentCode":"131016","identifier":"fac-001","name":"中央図書館","facilityType":"library","latitude":35.6895,"longitude":139.6917,"datasetUpdatedAt":"2024-05-01"}'
```
4) Publish to Orion-LD (NGSI-LD GeoProperty):
```bash
curl -X POST http://localhost:4000/v1/models/public-facilities/items/<itemId>/publish/orion \
  -H "Authorization: Bearer <token>"
```

## Architecture
- **ACE Core (CMS)**: `src/index.js`, `src/templates.js`, `src/validation.js`. Model Templates remove schema design; validation enforces GIF rules and standard-required fields.
- **DAS Layer**: `src/routes/assets.js` handles heavy-file metadata (CityGML, 3D Tiles) with status, checksum, size; distinct from record CRUD.
- **API Adapter**: `src/integrations/ckan.js` maps REST nouns (`/v1/datasets`) to CKAN actions (e.g., `package_create`) and binds `schema_id` for ckanext-scheming. Error abstraction converts CKAN `{success:false}` to HTTP 4xx.
- **FIWARE/NGSI-LD**: `src/integrations/orion.js` converts items to NGSI-LD entities with `@context` and GeoProperty from GIF coordinates.
- **Security**: `src/security/oauth.js` issues bearer tokens (prototype RO password style) and guards all `/v1/*` routes.
- **UI**: `public/index.html` offers simplified select/boolean inputs for 統制語彙 fields and a coordinate widget that validates GIF bounds client-side.

## Compliance + Validation
- **Mandatory Field Enforcement**: All fields marked `mandatoryMark: "◎"` are required at API level; missing fields return HTTP 400.
- **ID Validation**:
  - `localGovernmentCode`: `文字列（半角数字）` length 6, regex enforced.
  - `identifier`: `文字列（半角英数字）`, regex enforced.
- **Naming Convention**: Field keys use 項目名英語 (e.g., `localGovernmentCode`, `identifier`, `nameEn`), surfaced in schemas and payloads.
- **Controlled Vocabulary**: Fields typed `controlledVocabulary` accept only allowed options (e.g., `pediatricSupport` yes/no, `facilityType` enum).
- **Geospatial widget**: Latitude/longitude validated to GIF bounds (-90/90, -180/180) and paired; zero/zero is rejected. Converted to NGSI-LD GeoProperty for Orion-LD.

## API surface (REST)
- `POST /oauth/token` → bearer token issuance (prototype).
- `GET /v1/model-templates` → list templates.
- `POST /v1/model-templates/:id/apply` → one-click rigor; materialize model schema.
- `GET /v1/models/:id/schema` → view enforced schema.
- `POST /v1/models/:id/items` → create item with GIF + ◎ validation.
- `GET /v1/models/:id/items` → list items (in-memory store).
- `POST /v1/models/:id/items/:itemId/publish/orion` → NGSI-LD publish.
- `POST /v1/datasets` → REST → CKAN `package_create` (scheming-aware).
- `POST /v1/assets` / `GET /v1/assets` → DAS asset metadata for heavy files.

## CKAN + Scheming mapping
- Adapter binds `schema_id` to ensure validation via `ckanext-scheming`.
- REST payload fields are translated to CKAN Action payloads; non-standard CKAN 200/fail responses are mapped to conventional HTTP codes (400/403/404).
- Configure env: `CKAN_BASE_URL`, `CKAN_API_KEY`, `ORION_LD_URL`, `FIWARE_SERVICE`, `FIWARE_SERVICEPATH`.

## Model Templates (標準データセット)
- **公共施設一覧** (`public-facilities`): required ◎ fields include `localGovernmentCode`, `identifier`, `name`, `address`, `facilityType`, `latitude`, `longitude`, `datasetUpdatedAt`. Controlled vocab: `facilityType`.
- **AED設置箇所一覧** (`aed-locations`): required ◎ fields include `localGovernmentCode`, `identifier`, `name`, `address`, `installationPlace`, `pediatricSupport`, `latitude`, `longitude`, `datasetUpdatedAt`. Controlled vocab: `pediatricSupport` (yes/no), `availability`.

## Notes
- Storage is in-memory for the prototype; persistence can be swapped for DB/CKAN resources without changing validation.
- UI preview posts to the API only if a bearer token is provided; otherwise, it remains an offline rigor checker.
- Network calls to CKAN/Orion are simulated when endpoints are not configured, but payloads are fully assembled for inspection.

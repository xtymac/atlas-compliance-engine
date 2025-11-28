const templates = [
  {
    id: "public-facilities",
    label: "公共施設一覧 / Public Facilities List",
    oneClickRigor: true,
    description:
      "Pre-built GIF-compliant schema for municipal public facilities. Required items follow the standard recommended dataset.",
    fields: [
      {
        fieldKey: "localGovernmentCode",
        label: "全国地方公共団体コード",
        description: "6-digit local government code (半角数字).",
        type: "string",
        required: true,
        pattern: /^[0-9]{6}$/,
        mandatoryMark: "◎",
      },
      {
        fieldKey: "identifier",
        label: "ID",
        description: "Record identifier (半角英数字).",
        type: "string",
        required: true,
        pattern: /^[A-Za-z0-9_-]+$/,
        mandatoryMark: "◎",
      },
      {
        fieldKey: "name",
        label: "名称",
        description: "Facility name.",
        type: "string",
        required: true,
        mandatoryMark: "◎",
      },
      {
        fieldKey: "nameEn",
        label: "名称_英語",
        description: "Facility name (English).",
        type: "string",
        required: false,
      },
      {
        fieldKey: "address",
        label: "住所",
        description: "Structured address string.",
        type: "string",
        required: true,
        mandatoryMark: "◎",
      },
      {
        fieldKey: "postalCode",
        label: "郵便番号",
        description: "7-digit postal code.",
        type: "string",
        required: false,
        pattern: /^[0-9]{7}$/,
      },
      {
        fieldKey: "phoneNumber",
        label: "電話番号",
        description: "Contact phone (半角).",
        type: "string",
        required: false,
      },
      {
        fieldKey: "facilityType",
        label: "施設分類",
        description: "統制語彙による施設分類。",
        type: "controlledVocabulary",
        required: true,
        mandatoryMark: "◎",
        options: [
          "cityOffice",
          "library",
          "communityCenter",
          "park",
          "gymnasium",
          "museum",
          "other",
        ],
      },
      {
        fieldKey: "administrator",
        label: "管理者",
        description: "Operating department or organization.",
        type: "string",
        required: false,
      },
      {
        fieldKey: "latitude",
        label: "緯度",
        description: "GIF Core Data Parts latitude.",
        type: "latitude",
        required: true,
        mandatoryMark: "◎",
      },
      {
        fieldKey: "longitude",
        label: "経度",
        description: "GIF Core Data Parts longitude.",
        type: "longitude",
        required: true,
        mandatoryMark: "◎",
      },
      {
        fieldKey: "datasetUpdatedAt",
        label: "データセット_最終更新日",
        description: "YYYY-MM-DD",
        type: "date",
        required: true,
        mandatoryMark: "◎",
      },
      {
        fieldKey: "note",
        label: "備考",
        description: "Free-form notes.",
        type: "string",
        required: false,
      },
    ],
  },
  {
    id: "aed-locations",
    label: "AED設置箇所一覧 / AED Locations List",
    oneClickRigor: true,
    description:
      "GIF-compliant schema for AED location open data with controlled vocabularies for mandatory choice fields.",
    fields: [
      {
        fieldKey: "localGovernmentCode",
        label: "全国地方公共団体コード",
        description: "6-digit local government code (半角数字).",
        type: "string",
        required: true,
        pattern: /^[0-9]{6}$/,
        mandatoryMark: "◎",
      },
      {
        fieldKey: "identifier",
        label: "ID",
        description: "Record identifier (半角英数字).",
        type: "string",
        required: true,
        pattern: /^[A-Za-z0-9_-]+$/,
        mandatoryMark: "◎",
      },
      {
        fieldKey: "name",
        label: "名称",
        description: "Installation name.",
        type: "string",
        required: true,
        mandatoryMark: "◎",
      },
      {
        fieldKey: "address",
        label: "住所",
        description: "Structured address string.",
        type: "string",
        required: true,
        mandatoryMark: "◎",
      },
      {
        fieldKey: "installationPlace",
        label: "設置場所詳細",
        description: "Floor, room, or descriptive placement.",
        type: "string",
        required: true,
        mandatoryMark: "◎",
      },
      {
        fieldKey: "availableHours",
        label: "利用可能時間",
        description: "Opening hours text (例: 09:00-18:00 / 24H).",
        type: "string",
        required: false,
      },
      {
        fieldKey: "pediatricSupport",
        label: "小児対応設備の有無",
        description: "Mandatory controlled vocabulary (yes/no).",
        type: "controlledVocabulary",
        required: true,
        mandatoryMark: "◎",
        options: ["yes", "no"],
      },
      {
        fieldKey: "availability",
        label: "利用可能曜日",
        description: "統制語彙 (weekday, weekend, holiday, allDays).",
        type: "controlledVocabulary",
        required: false,
        options: ["weekday", "weekend", "holiday", "allDays"],
      },
      {
        fieldKey: "contactPhone",
        label: "問い合わせ先電話番号",
        description: "Contact phone (半角).",
        type: "string",
        required: false,
      },
      {
        fieldKey: "latitude",
        label: "緯度",
        description: "GIF Core Data Parts latitude.",
        type: "latitude",
        required: true,
        mandatoryMark: "◎",
      },
      {
        fieldKey: "longitude",
        label: "経度",
        description: "GIF Core Data Parts longitude.",
        type: "longitude",
        required: true,
        mandatoryMark: "◎",
      },
      {
        fieldKey: "datasetUpdatedAt",
        label: "データセット_最終更新日",
        description: "YYYY-MM-DD",
        type: "date",
        required: true,
        mandatoryMark: "◎",
      },
      {
        fieldKey: "note",
        label: "備考",
        description: "Free-form notes.",
        type: "string",
        required: false,
      },
    ],
  },
];

function getTemplates() {
  return templates;
}

function getTemplateById(id) {
  return templates.find((tpl) => tpl.id === id);
}

function addTemplate(template) {
  // Check for duplicate ID
  if (templates.find((t) => t.id === template.id)) {
    throw new Error(`Template with ID "${template.id}" already exists`);
  }

  // Ensure required properties
  const newTemplate = {
    id: template.id,
    label: template.label,
    description: template.description || "",
    oneClickRigor: template.oneClickRigor || false,
    fields: template.fields || [],
    generatedAt: new Date().toISOString(),
  };

  templates.push(newTemplate);
  return newTemplate;
}

module.exports = {
  getTemplates,
  getTemplateById,
  addTemplate,
};

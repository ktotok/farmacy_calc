// Shop-section grouping for the Вироби tab (ported from the legacy app.js).
export const SECTION_ORDER = [
  "bandages", "mixture", "antidote", "miscellaneous",
  "ointment", "tonic", "animal", "drug", "__other",
];

export const SECTION_LABELS: Record<string, string> = {
  bandages: "Бинти",
  mixture: "Мікстури",
  antidote: "Антидоти",
  miscellaneous: "Різне",
  ointment: "Мазь",
  tonic: "Тонік",
  animal: "Ветеринарні препарати",
  drug: "Наркотичні",
  __other: "Інші вироби",
};

export const ITEM_TYPE_LABELS: Record<string, string> = {
  raw: "Сировина",
  intermediate: "Напівфабрикат",
  product: "Виріб",
};

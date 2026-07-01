// Shop-section grouping for the Вироби tab (ported from the legacy app.js).
export const SECTION_ORDER = [
  "BANDAGES", "MIXTURE", "ANTIDOTE", "MISCELLANEOUS",
  "ointment", "tonic", "animal", "drug", "__other",
];

export const SECTION_LABELS: Record<string, string> = {
  BANDAGES: "Бинти",
  MIXTURE: "Мікстури",
  ANTIDOTE: "Антидоти",
  MISCELLANEOUS: "Різне",
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

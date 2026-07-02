-- Normalize legacy uppercase shop sections (BANDAGES/MIXTURE/ANTIDOTE) to the
-- lowercase SECTION_ORDER/SECTION_LABELS keys used by the frontend.
UPDATE item SET shop_section = LOWER(shop_section) WHERE shop_section IS NOT NULL;

-- Fix laudanum: was mistyped as "shop", should be "product"
UPDATE item SET type = 'product' WHERE id = 'laudanum';

-- Delete legacy "shop" items no longer needed (recipe components cascade via ON DELETE CASCADE)
DELETE FROM item WHERE id IN ('analgesic_infusion', 'bandage_belt', 'spray_syringe');

-- ============================================================================
-- doctorVet — 0012: free-text product subcategory.
-- Adds a nullable `subcategory` column to `products` (e.g. "معلبات", "رمل",
-- "دراي فود") so the dynamic Mix & Match promotions can group cart items by it.
-- Apply AFTER 0001–0011. Safe to re-run.
-- ============================================================================

alter table products add column if not exists subcategory text;

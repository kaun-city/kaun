-- Five more civic project records (reviewed 2026-09-16). The record text lives in
-- apps/web/lib/civic-projects/; these rows exist so research submissions can
-- reference each project and so the ward attachments are queryable.
--
-- Ward rows are Kaun-derived: GBA-369 wards within a small buffer of each
-- project's alignment as mapped in OpenStreetMap. Cauvery Stage V has no ward
-- rows because no ward-level service map was found.

INSERT INTO public.civic_projects (
  slug, city_id, title, project_type, owner_agency, status, summary, latest_as_of
) VALUES
  ('ejipura-kendriya-sadan-flyover', 'bengaluru', 'Ejipura–Kendriya Sadan flyover', 'Elevated flyover', 'Greater Bengaluru Authority (GBA), formerly BBMP', 'delayed', 'The roughly 2.5 km flyover from Ejipura Junction to Kendriya Sadan began under BBMP in 2017 and missed its November 2019 deadline, then went through contract cancellation and repeat tenders. Reporting says the Karnataka cabinet revised the project cost to ₹307.96 crore in September 2023, while later public updates moved the completion target repeatedly. The reviewed public sources did not include the operative work order, current accepted contract value and payment schedule, or an official progress report as of the review date.', DATE '2026-09-16'),
  ('namma-metro-phase-2a-orr', 'bengaluru', 'Namma Metro Phase 2A: Central Silk Board to KR Puram', 'Elevated metro line', 'Bangalore Metro Rail Corporation Limited (BMRCL)', 'delayed', 'Phase 2A is a 19.75 km, 13-station elevated Blue Line section along the Outer Ring Road IT corridor, from Central Silk Board to KR Puram, approved by the Union Cabinet in April 2021 together with Phase 2B at ₹14,788.101 crore. Afcons Infrastructure and Shankaranarayana Constructions began civil work in mid-2021 on 30-month contracts; the opening has since moved from 2021 (2016 DPR) to about mid-2027, with October 2026 trial runs skipping the unfinished Marathahalli and Silk Board stations. Main evidence gap: no Phase-2A-specific cost, progress, or contractor delay figures are public — the sanctioned cost and the 72.75% progress both combine Phases 2A and 2B.', DATE '2026-09-16'),
  ('bsrp-corridor-2-mallige-line', 'bengaluru', 'Bengaluru Suburban Rail Corridor 2 (Mallige Line)', 'Suburban rail corridor', 'Rail Infrastructure Development Company (Karnataka) Limited (K-RIDE)', 'delayed', 'Corridor 2 (the Mallige Line, 25.01 km) is the only one of Bengaluru''s four suburban rail corridors whose land acquisition is complete, according to a July 2026 Lok Sabha answer. Its original civil contractor, Larsen & Toubro, terminated its contract in July 2025; K-RIDE disputes the termination, the claims are in arbitration, and the remaining civil work was re-tendered in three packages. K-RIDE now targets first services by December 2028. The terminated contract''s value, milestone schedule and payment history were not found in the public sources reviewed.', DATE '2026-09-16'),
  ('peripheral-ring-road-bengaluru-business-corridor', 'bengaluru', 'Peripheral Ring Road (Bengaluru Business Corridor)', 'Access-controlled expressway', 'Bangalore Development Authority (BDA), through Bengaluru Business Corridor Ltd', 'delayed', 'The Peripheral Ring Road, rebranded the Bengaluru Business Corridor and now described as 117 km, was first notified in 2005. Its record since includes land acquisition disputes, Supreme Court and High Court litigation, and a quashed environmental clearance. Package 1 (Madavara to Ballari Road) got a contractor in June 2026, against a latest government deadline of 2029. Public figures conflict on the total cost (₹27,000 crore or ₹17,000 crore), on the number and length of packages, and on tree loss. No public record reviewed establishes the original completion date or the outcome of the High Court petitions that officials expected to be decided by mid-2026.', DATE '2026-09-16'),
  ('cauvery-water-supply-scheme-stage-v', 'bengaluru', 'Cauvery Water Supply Scheme Stage V', 'Water supply and sewerage scheme', 'Bangalore Water Supply and Sewerage Board (BWSSB)', 'in_progress', 'Cauvery Stage V adds a 775 MLD treatment and transmission system from T.K. Halli and was planned to extend water and sewerage service to 110 villages added to Bengaluru. The water-supply system opened in October 2024 after successive deadline changes, but public updates through 2026 still described incomplete connections, sewerage works and legal obstacles at specific facilities. The main evidence gap is a current package-by-package completion, payment and deadline register covering the whole scheme.', DATE '2026-09-16')
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  project_type = EXCLUDED.project_type,
  owner_agency = EXCLUDED.owner_agency,
  status = EXCLUDED.status,
  summary = EXCLUDED.summary,
  latest_as_of = EXCLUDED.latest_as_of,
  updated_at = now();

INSERT INTO public.civic_project_areas (
  project_slug, boundary_system, corporation_id, ward_no, ward_name, relationship
) VALUES
  ('ejipura-kendriya-sadan-flyover', 'gba-369-2025', 1, 24, 'Agaram', 'intersects'),
  ('ejipura-kendriya-sadan-flyover', 'gba-369-2025', 4, 24, 'A Adugodi', 'intersects'),
  ('ejipura-kendriya-sadan-flyover', 'gba-369-2025', 4, 27, 'Sri Lakshmi Devi Ward', 'intersects'),
  ('ejipura-kendriya-sadan-flyover', 'gba-369-2025', 4, 28, 'Kormangala East', 'intersects'),
  ('ejipura-kendriya-sadan-flyover', 'gba-369-2025', 4, 29, 'Kormangala West', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 1, 12, 'Kasturi Nagar', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 1, 13, 'Krishnaiahnapalya', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 1, 24, 'Agaram', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 3, 18, 'Dooravaninagar', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 3, 19, 'K.S. Nissar Ahmed Ward', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 3, 20, 'A Narayanapura', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 3, 22, 'Mahadevapura', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 3, 36, 'Bharath Aikya Ward', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 3, 41, 'Munnenkolalu', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 3, 42, 'Priyadarshini Ward', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 3, 43, 'Dodda Nekkundi', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 3, 44, 'Ashwath Nagar', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 3, 45, 'Marathahalli', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 3, 47, 'Bellanduru', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 3, 48, 'Panathur', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 3, 49, 'Shivanasamudra Ward', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 4, 18, 'Viswamanava Kuvempu Ward', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 4, 20, 'Madiwala', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 4, 30, 'Jakkasandra', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 4, 70, 'Iblur', 'intersects'),
  ('namma-metro-phase-2a-orr', 'gba-369-2025', 4, 72, 'HSR Layout', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 1, 12, 'Kasturi Nagar', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 1, 13, 'Krishnaiahnapalya', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 11, 'Doddabommasandra', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 13, 'Kodigehalli', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 18, 'Kempapura', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 22, 'Nagavara', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 24, 'HBR Layout', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 25, 'Govindapura', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 26, 'Samadhana Nagar', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 27, 'K.G.Halli', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 28, 'Venkateshpuram', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 29, 'Lingarajpura', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 35, 'Kammanahalli', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 36, 'Maruthi Seva Nagara', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 38, 'Shampura', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 46, 'Sagayapuram', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 52, 'Vishwanatha Nagenahalli', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 56, 'Hebbal', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 57, 'Bhoopasandra', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 58, 'Nagashettyhalli', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 59, 'Geddalahalli', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 60, 'Jalahalli', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 61, 'HMT Ward', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 62, 'Brundavana Nagara', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 63, 'J.P PARK', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 65, 'Abbigere', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 66, 'Kammagondanahalli', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 2, 67, 'Shettihalli', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 5, 35, 'Goraguntepalya', 'intersects'),
  ('bsrp-corridor-2-mallige-line', 'gba-369-2025', 5, 48, 'Mathikere', 'intersects'),
  ('peripheral-ring-road-bengaluru-business-corridor', 'gba-369-2025', 3, 1, 'K Narayanapura', 'intersects'),
  ('peripheral-ring-road-bengaluru-business-corridor', 'gba-369-2025', 3, 28, 'Byrathi', 'intersects'),
  ('peripheral-ring-road-bengaluru-business-corridor', 'gba-369-2025', 3, 31, 'Kadugodi', 'intersects'),
  ('peripheral-ring-road-bengaluru-business-corridor', 'gba-369-2025', 3, 32, 'Channasandra', 'intersects'),
  ('peripheral-ring-road-bengaluru-business-corridor', 'gba-369-2025', 3, 39, 'Hagaduru', 'intersects'),
  ('peripheral-ring-road-bengaluru-business-corridor', 'gba-369-2025', 3, 40, 'Varthur', 'intersects'),
  ('peripheral-ring-road-bengaluru-business-corridor', 'gba-369-2025', 3, 50, 'Gunjur', 'intersects'),
  ('peripheral-ring-road-bengaluru-business-corridor', 'gba-369-2025', 2, 2, 'Aerocity', 'intersects'),
  ('peripheral-ring-road-bengaluru-business-corridor', 'gba-369-2025', 2, 3, 'Chowdeshwari ward', 'intersects'),
  ('peripheral-ring-road-bengaluru-business-corridor', 'gba-369-2025', 2, 20, 'Sampigehalli', 'intersects'),
  ('peripheral-ring-road-bengaluru-business-corridor', 'gba-369-2025', 2, 21, 'Kogilu', 'intersects'),
  ('peripheral-ring-road-bengaluru-business-corridor', 'gba-369-2025', 4, 34, 'Chikkathoguru', 'intersects')
ON CONFLICT (project_slug, boundary_system, ward_name) DO UPDATE SET
  corporation_id = EXCLUDED.corporation_id,
  ward_no = EXCLUDED.ward_no,
  relationship = EXCLUDED.relationship;

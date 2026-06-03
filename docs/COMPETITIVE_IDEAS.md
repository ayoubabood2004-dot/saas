# VetPassport — 100 Competitive Ideas (Deep-Research Synthesis)

> Researched against the leading veterinary PIMS & pet-health platforms: **ezyVet, Vetspire, Digitail, Provet Cloud, Shepherd, Instinct / Vet Radar, Covetrus Pulse, IDEXX Neo / Cornerstone / ezyVet / Vello, Hippo Manager, AVImark, Vetstoria, PetDesk, Airvet/Televet, Inventory Ally, Trupanion** + human-medical dashboards (Epic, athenahealth) and Linear/Stripe-tier UX.
>
> **Legend** — Tag: `[TS]` table-stakes · `[DIFF]` differentiator · `[INNOV]` innovative/emerging. Effort: L/M/H. `✓ HAVE` = VetPassport already has it (refine, don't rebuild). `★` = in the Top-20 shortlist.
>
> Claims marked **(verified)** survived 3-vote adversarial fact-checking; see Sources at the bottom.

---

## 1 · Practice MANAGEMENT

1. **Charge capture from the record** — administered treatments/products auto-post to the invoice as you chart, so nothing is missed. *(Shepherd, verified)* `[DIFF]` M ★
2. **Full billing & invoicing** — itemized estimates → invoice → receipt, taxes, discounts, deposits, partial payments. *(ezyVet, Cornerstone)* `[TS]` H ★
3. **Treatment estimates / quotes** — multi-option estimates (gold/silver/bronze care plans) the owner approves before work begins. *(ezyVet, Digitail)* `[DIFF]` M ★
4. **Inventory management** — stock levels, lot/expiry tracking, controlled-drug logs, supplier catalogs, reorder points. *(Cornerstone, Provet)* `[TS]` H ★
5. **ML predictive auto-reorder** — forecast demand from usage + seasonality + history; auto-generate weekly purchase orders. *(Inventory Ally, verified)* `[DIFF]` M ★
6. **Stock auto-deduct on use** — dispensing/administering a drug decrements inventory and bills it in one action. *(Shepherd, ezyVet)* `[DIFF]` M ★
7. **Room & resource board** — live map of exam rooms / kennels / surgery suites with occupancy and turnover. *(ezyVet)* `[DIFF]` M
8. **Boarding/kennel module** — cage cards, feeding/meds schedules, belongings, run assignments, check-in/out. *(ezyVet, Provet)* `[TS]` M ✓ HAVE (admissions/boarding — extend)
9. **Staff scheduling & shifts** — vet/tech rosters, capacity per provider, time-off, utilization. *(Provet, Cornerstone)* `[TS]` M
10. **KPI analytics dashboard** — revenue/visit, ATV, new vs returning clients, no-show rate, room utilization. *(ezyVet Insights)* `[DIFF]` M ★
11. **Multi-location / multi-branch** — shared client/patient DB, per-site inventory & schedules, group reporting. *(ezyVet, Provet)* `[DIFF]` H
12. **Online self-booking** — owner books real available slots by service/provider, synced to the master calendar. *(Vetstoria, Vello, verified)* `[TS]` M ★
13. **No-show / deposit policies** — require card-on-file or deposit for surgery; auto-charge no-shows. *(Vetstoria)* `[DIFF]` M
14. **Waitlist & smart fill** — auto-offer freed cancellations to waitlisted clients. *(Vetstoria)* `[DIFF]` M
15. **End-of-day reconciliation** — cash/card drawer close, daysheet, deposits, missed-charge audit. *(Cornerstone)* `[TS]` M
16. **Memberships & wellness plans** — recurring monthly preventive-care plans with auto-billing. *(ezyVet, Digitail)* `[INNOV]` H
17. **Triage acuity board** — color-coded priority queue (already have triage scoring; surface as a live ER board). *(Instinct)* `[DIFF]` M ✓ HAVE (triage — extend)

## 2 · ORGANIZATION & workflow / UX

18. **Digital treatment whiteboard (kanban)** — hospital-wide board of all in-patients with what's *due / done / overdue* per hour. *(Vet Radar, Instinct, verified)* `[DIFF]` M ★
19. **Task-due tracking & overdue alerts** — every scheduled treatment becomes a checkable task that flags when late. *(Vet Radar, verified)* `[DIFF]` M ★
20. **Global search across everything** — one bar for patients, owners, invoices, meds, notes (extend ⌘K). *(Vetspire, Linear)* `[DIFF]` L ✓ HAVE (⌘K — extend scope)
21. **Role-based home screens** — vet vs tech vs reception vs admin each land on their relevant board. *(ezyVet, Vetspire)* `[DIFF]` M
22. **Problem-oriented medical record (POMR)** — master problem list that threads visits/labs/meds per problem. *(Vetspire, Epic)* `[DIFF]` H ★
23. **Patient timeline / single-scroll history** — chronological unified feed of every visit, lab, med, weight, photo. *(Digitail, Epic)* `[DIFF]` M ★
24. **Keyboard-first charting** — shortcuts, slash-commands, snippet/macro expansion in notes. *(Vetspire, Linear)* `[DIFF]` M
25. **SOAP templates & smart-text** — per-presentation templates auto-fill objective/plan; ".dot" phrase macros. *(ezyVet, Vetspire)* `[TS]` M
26. **Saved filters & smart views** — "my open cases", "awaiting labs", "discharge today". *(Instinct)* `[DIFF]` L
27. **Bulk actions** — multi-select patients/tasks to assign, discharge, or message at once. *(Instinct)* `[DIFF]` L
28. **In-app team chat / case threads** — comment on a patient, @mention a colleague, hand-off notes. *(Digitail)* `[DIFF]` M
29. **Smart notifications center** — labs back, meds due, callbacks, low stock — one prioritized inbox. *(ezyVet)* `[DIFF]` M ✓ HAVE (notifications feed — extend)
30. **Callback / recheck queue** — structured to-do list of patients needing follow-up with due dates. *(Cornerstone)* `[TS]` L
31. **Audit trail & versioned records** — who changed what, when; locked finalized notes. *(ezyVet)* `[TS]` M
32. **Offline-first reliability** — keep charting if the network drops, sync on reconnect (PWA already). *(field tools)* `[DIFF]` H ✓ HAVE (PWA — harden)
33. **Quick-add anywhere** — global "+" to create appointment/patient/note/payment from any screen. *(Stripe, Linear)* `[DIFF]` L

## 3 · DESIGN & visual / interaction

34. **Command-center dashboard** — KPIs + activity curve + today's board + alerts at a glance. *(ezyVet, Epic)* `[DIFF]` M ✓ HAVE
35. **At-a-glance health rings** — vaccination/treatment completion, condition status on the chart. *(Apple Health-style)* `[DIFF]` M ✓ HAVE
36. **Trend sparklines everywhere** — weight, temp, labs as inline mini-charts in tables. *(Epic, Stripe)* `[DIFF]` L ✓ HAVE (weight)
37. **Dark mode / night-shift theme** — for overnight ER staff; reduce glare. *(Linear)* `[DIFF]` M ✓ HAVE
38. **Tablet/cage-side mode** — big tap targets, glove-friendly, one-hand charting on rounds. *(Vet Radar)* `[DIFF]` M ✓ HAVE (tap targets — extend to full tablet mode)
39. **Whiteboard wall-display mode** — full-screen, high-contrast board for the treatment-room TV. *(Instinct)* `[DIFF]` M
40. **Color-coded acuity & status** — consistent semantic color language (critical/warning/stable). *(Instinct)* `[TS]` L ✓ HAVE (tokens)
41. **Anatomical body-map annotation** — mark lesions/wounds on a species silhouette. *(ezyVet)* `[DIFF]` M ✓ HAVE
42. **Polished PDF/print outputs** — discharge instructions, vaccination certs, referral letters, estimates. *(all PIMS)* `[TS]` M ★
43. **Branded client-facing documents** — clinic logo/colors on every PDF & portal page. *(Vello)* `[DIFF]` L
44. **Accessibility (WCAG AA)** — keyboard nav, ARIA, contrast, screen-reader labels. *(Epic)* `[TS]` M
45. **Empty/loading/skeleton states** — never a blank screen; guide the next action. *(Stripe, Linear)* `[DIFF]` L ✓ HAVE
46. **Micro-interactions & sound** — tactile confirmation on critical actions (already have audio identity). *(consumer apps)* `[DIFF]` L ✓ HAVE
47. **Multi-pet household view** — see all of an owner's animals together, switch fast. *(PetDesk)* `[DIFF]` L
48. **Bilingual + full RTL** — Arabic/English parity, locale-aware dates/numbers. *(regional)* `[DIFF]` M ✓ HAVE
49. **Heatmap analytics** — appointment density by hour/day, revenue by service, to optimize staffing. *(ezyVet Insights)* `[DIFF]` M

## 4 · TREATMENT MANAGEMENT

50. **Scientific dose calculator** — weight-based mg/kg → volume, with concentration & rounding. *(Vet Radar, Plumb's, verified)* `[DIFF]` M ★
51. **Real-time drug-safety alerts** — overdose/underdose/duplicate-therapy/contraindication warnings before administering. *(Instinct + Plumb's, verified)* `[DIFF]` M ★
52. **CRI / infusion-rate calculator** — diluted & undiluted constant-rate infusions for fluids & drugs. *(Vet Radar, verified)* `[DIFF]` M ★
53. **Fluid-therapy planner** — maintenance + dehydration + ongoing losses → ml/hr, with bag changes. *(Vet Radar)* `[DIFF]` M
54. **Embedded drug formulary** — searchable reference (dose ranges, routes, warnings) inline at prescribing. *(Plumb's, verified)* `[DIFF]` M ★
55. **Treatment-plan templates / protocols** — one-click standardized care bundles (e.g., parvo, DKA, dental). *(Instinct, Vetspire)* `[DIFF]` M ★
56. **Hour-by-hour treatment sheet** — scheduled tasks across the day per patient (refine existing sheet). *(Instinct, verified)* `[DIFF]` M ✓ HAVE (extend to hourly grid)
57. **Anesthesia monitoring sheet** — timed vitals (HR/RR/SpO₂/ETCO₂/BP) charted as live trend graphs. *(Vet Radar, verified)* `[DIFF]` H
58. **Electronic vitals trend charts** — every captured vital graphed over the stay, not just flagged. *(Vet Radar, verified)* `[DIFF]` M ✓ HAVE (flagging — add trends)
59. **e-Prescribing & scripts** — generate prescription, send to in-house or online pharmacy, refill tracking. *(Vello, Covetrus)* `[TS]` H ★
60. **Vaccination scheduler & due-logic** — protocol-driven next-due dates, lot/site capture, certificates. *(all PIMS)* `[TS]` M ✓ HAVE (vaccines — add protocol engine)
61. **Lab ordering & results inline** — order, then auto-file IDEXX/Antech results into the record with flags. *(IDEXX, verified)* `[TS]` H ★
62. **Lab trend tracking** — graph chemistry/CBC values across visits with reference-range bands. *(ezyVet, Epic)* `[DIFF]` M
63. **Dental chart** — tooth-by-tooth charting with procedures & findings. *(ezyVet)* `[DIFF]` M
64. **Anesthesia/surgery checklist** — pre-op, intra-op, post-op safety checklists (WHO-style). *(Instinct)* `[DIFF]` M
65. **Care-team assignment per task** — who is responsible for each treatment, with handoff at shift change. *(Vet Radar)* `[DIFF]` L ✓ HAVE (per-day doctor — extend)
66. **Discharge-instruction builder** — auto-compose home-care + meds + recheck from the visit, as PDF/portal. *(Shepherd)* `[DIFF]` M ★

## 5 · ANIMAL CONDITION monitoring

67. **Per-species reference ranges** — vitals/labs flagged against species (and breed/age) norms. *(ezyVet)* `[DIFF]` M ✓ HAVE
68. **Standardized pain scoring** — validated scales (Glasgow CMPS, Feline Grimace) logged over time. *(Instinct)* `[DIFF]` M ★
69. **Body Condition Score (BCS 1–9)** — structured BCS capture with trend & target weight. *(Purina/WSAVA)* `[TS]` L ★
70. **Weight & growth curves** — plot against breed growth percentiles; flag deviations. *(Digitail)* `[DIFF]` M ✓ HAVE (weight curve — add percentiles)
71. **Early-warning score (MEWS-style)** — composite vitals score that escalates a deteriorating in-patient. *(human EWS)* `[INNOV]` M ★
72. **Predictive deterioration alert** — model flags decline hours ahead from trended vitals. *(Northwell RNN, verified — human-only)* `[INNOV]` H
73. **Computer-vision BCS from photo** — estimate body condition from an owner/clinic photo. *(Auburn + Purina, verified — roadmap)* `[INNOV]` H
74. **Wearable/IoT vitals ingest** — pull activity/HR/resp from pet collars (Whistle, PetPace) into the chart. *(PetPace)* `[INNOV]` H
75. **Nutrition & calorie planner** — RER/MER calc, diet recommendation, weight-loss program tracking. *(Purina)* `[DIFF]` M
76. **Chronic-condition trackers** — diabetes (glucose curves), CKD (IRIS staging), thyroid monitoring panels. *(ezyVet)* `[DIFF]` M ★
77. **Glucose-curve grapher** — plot serial BG readings to titrate insulin. *(specialty)* `[DIFF]` L
78. **Imaging/radiograph attachment + PACS** — store and view X-ray/ultrasound on the chart. *(IDEXX PACS, verified)* `[TS]` H
79. **Photo progress timeline** — serial wound/derm/dental photos side-by-side over time. *(Digitail)* `[DIFF]` M ✓ HAVE (media — add comparison)
80. **Allergy & alert banners** — persistent critical flags (allergies, aggressive, chronic) on every screen. *(all PIMS)* `[TS]` L ✓ HAVE (allergy chip — extend)
81. **Owner-reported symptom check-in** — pre-visit questionnaire / at-home symptom log feeds the record. *(Digitail)* `[DIFF]` M
82. **Quality-of-life tracker** — end-of-life QoL scales (HHHHHMM) for chronic/geriatric patients. *(specialty)* `[INNOV]` L
83. **Vitals capture from monitors** — pull readings from connected anesthesia/multiparameter monitors. *(Vet Radar)* `[INNOV]` H

## 6 · Application INTEGRATION

84. **Universal pet passport + cross-clinic QR** — portable record any clinic can scan. *(unique)* `[INNOV]` ✓ HAVE — **your moat; double down**
85. **Client portal / pet-owner app** — book, view records, vaccine history, refill requests, invoices. *(Vello, PetDesk, verified)* `[TS]` H ★
86. **Two-way SMS / WhatsApp** — texting with photo sharing from a unified clinic inbox (no staff personal #). *(Vello, PetDesk, verified)* `[TS]` M ★
87. **Automated reminders** — vaccines/rechecks/meds via SMS/email/WhatsApp/push, by appointment type. *(PetDesk, Vello, verified)* `[TS]` M ★
88. **Online payments / card-on-file** — pay invoices/deposits online, in-app, or via text-to-pay. *(IDEXX Payments)* `[TS]` M ★
89. **Reference-lab integration** — IDEXX VetConnect / Antech bidirectional order + result. *(IDEXX, verified)* `[TS]` H ★
90. **In-house analyzer integration** — auto-import CBC/chem/urine from bench analyzers. *(IDEXX)* `[DIFF]` H
91. **Telemedicine video + chat** — 24/7 or scheduled virtual consults with record continuity. *(Airvet, verified)* `[DIFF]` H ★
92. **AI clinical scribe (ambient)** — transcribe the visit, draft doctor-controlled SOAP into the record. *(Shepherd TranscribeAI, verified)* `[INNOV]` H ★
93. **AI visit summary / discharge writer** — LLM turns the SOAP into plain-language owner instructions. *(co.vet, Digitail)* `[INNOV]` M ★
94. **Microchip registry lookup/register** — verify & register chips with national databases. *(IDEXX)* `[TS]` M
95. **Pet insurance integration** — Trupanion-style direct claims / pre-approval at checkout. *(Trupanion, verified)* `[DIFF]` H
96. **Accounting sync** — push invoices/payments to QuickBooks/Xero. *(ezyVet)* `[TS]` M
97. **Online pharmacy & home delivery** — script handoff to Covetrus/Chewy-style fulfillment + clinic margin. *(Covetrus, Vello)* `[DIFF]` H
98. **Data portability / FHIR-style export** — owner can export the full record; standards-based API. *(interoperability)* `[INNOV]` M ★
99. **Public API & webhooks** — let third-parties build on VetPassport (the IDEXX 24-category playbook). *(IDEXX directory, verified)* `[DIFF]` H
100. **AI triage chatbot (owner-facing)** — symptom checker that routes to book / telehealth / ER. *(emerging)* `[INNOV]` H ★

---

## TOP 20 highest-impact additions VetPassport is missing
Ordered by impact ÷ effort (build roughly in this order):

1. **Scientific dose calculator + drug-safety alerts** (#50/#51) — clinical safety, you already planned it.
2. **CRI / fluid calculator** (#52/#53).
3. **Inventory + stock auto-deduct → bill** (#4/#6).
4. **Billing & invoicing + charge capture** (#1/#2).
5. **Treatment estimates / care plans** (#3).
6. **Hospital treatment whiteboard (kanban, due/overdue)** (#18/#19).
7. **Automated reminders (WhatsApp/SMS/push)** (#87).
8. **Client portal / pet-owner app** (#85).
9. **Two-way messaging inbox** (#86).
10. **Online payments / text-to-pay** (#88).
11. **Discharge & vaccination-certificate PDF builder** (#42/#66).
12. **Lab ordering + results inline (IDEXX/Antech)** (#61).
13. **e-Prescribing + refills** (#59).
14. **Patient timeline / unified history** (#23).
15. **KPI analytics + heatmaps** (#10/#49).
16. **Vitals trend graphs + anesthesia sheet** (#57/#58).
17. **Standardized pain scoring + BCS** (#68/#69).
18. **Treatment-protocol templates** (#55).
19. **Problem-oriented record (problem list)** (#22).
20. **Online self-booking with deposits/waitlist** (#12/#13/#14).

## 10 truly innovative / futuristic bets
1. **AI ambient scribe** — speak the visit, get a SOAP note *(verified: Shepherd TranscribeAI)*.
2. **AI discharge/summary writer** — LLM → plain-language owner instructions.
3. **AI owner-facing triage chatbot** — symptom-checker that routes to book/telehealth/ER.
4. **Predictive deterioration early-warning** — trend-based decline alerts *(verified human RNN ~17h; treat as inspiration — no vet validation yet)*.
5. **Computer-vision BCS from a photo** *(verified roadmap, Auburn + Purina; the "clinically deployable" claim was refuted — keep as assistive, not diagnostic)*.
6. **Wearable/IoT vitals ingest** — collar HR/activity/resp streamed onto the chart.
7. **Cross-clinic interoperability via the QR passport** — your existing moat as an open pet-health network + FHIR-style export.
8. **Predictive ML inventory auto-reorder** *(verified: Inventory Ally)*.
9. **No-show prediction** — flag high-risk appointments and trigger extra reminders/deposits.
10. **Owner health timeline + at-home symptom logging** feeding the clinical record.

---

## Sources (verified claims)
Vendor primary sources for feature-existence (appropriate for "does X exist"; efficacy figures are self-reported/marketing-grade):
- Treatment whiteboards, dose/CRI calcs, safety alerts, anesthesia/vitals charting — vetradar.com, instinct.vet, vetradar.com/cri-calculator, careville.instinct.vet; Cornell go-live (globenewswire).
- Automated charge capture + AI scribe — shepherd.vet/clinical-tools/automation, shepherd.vet/aitools/transcribeai.
- Integration ecosystem + client engagement — software.idexx.com/integrations, software.idexx.com/vello, petdesk.com.
- Telehealth — airvet.com. Insurance — vet.trupanion.com. Predictive inventory — inventoryally.com.
- **Innovative bets w/ academic backing (read caveats):** photo-BCS — Auburn CVM + *Frontiers in Vet Science* 2025 (the consumer AI app is a roadmap, not shipped; "<1-pt bias / clinically deployable" was **refuted 0-3**). Wearable RNN deterioration — *Nature Communications* 2025 (Northwell) — **human inpatients only**, small outcome count, known false-alarm/alarm-fatigue concerns; superiority is for *detection*, not survival.

*Research method: 5 search angles → 25 sources fetched → 120 claims extracted → 25 verified by 3-vote adversarial check (24 confirmed, 1 killed). Many named products (ezyVet core, Vetspire, Digitail, Provet, Covetrus Pulse, Hippo, Vetstoria, Galaxy Vets) were not independently re-verified; their feature attributions here reflect their public positioning and should be confirmed before relying on specifics.*

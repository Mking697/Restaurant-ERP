const DATA_DASHBOARD = [
  {
    id: 'dashboard',
    titleEn: 'Owner Dashboard',
    titleHi: 'Owner Dashboard',
    icon: 'layout-dashboard',
    summaryEn: 'A real-time snapshot page where every number comes directly from the database, never fake or sample data; missing data always shows a dash, never a wrong 0.',
    summaryHi: 'Yeh real-time snapshot page hai jahan har number seedha database se aata hai, kabhi fake ya sample data nahi; missing data hamesha dash dikhata hai, galat 0 kabhi nahi.',
    sections: [
      {
        headingEn: 'General Behaviour & Branch Selector',
        headingHi: 'General Behaviour & Branch Selector',
        items: [
          { en: 'Top-left branch selector: "All Branches" shows the compiled total across all branches.', hi: 'Top-left branch selector: "All Branches" select karne par sabhi branches ka compiled total dikhta hai.' },
          { en: 'Selecting a specific branch shows only its data; other branches\' rows do not appear in the table at all.', hi: 'Specific branch select karne par sirf uska data dikhta hai; dusri branches ki rows table mein bilkul nahi aati.' },
          { en: 'All cards show "-" until data finishes loading.', hi: 'Data load hone tak sabhi cards "-" dikhate hain.' },
        ],
      },
      {
        headingEn: 'Section 1 - KPI Cards (Top 5)',
        headingHi: 'Section 1 - KPI Cards (Top 5)',
        items: [
          { en: 'Card 1 "Sales - Today": shows today\'s revenue from completed sales, with footer showing the MTD (Month-To-Date) total.', hi: 'Card 1 "Sales - Today": aaj ka revenue (completed sales se) dikhata hai, footer mein MTD (Month-To-Date) total bhi hota hai.' },
          { en: 'Card 2 "Inventory Value": current stock\'s total value calculated as qty x latest vendor rate.', hi: 'Card 2 "Inventory Value": current stock ki total value = qty x latest vendor rate se calculate hoti hai.' },
          { en: 'If a raw material has no vendor rate set, it is excluded from the inventory value total, and the footer shows "X material(s) missing a vendor rate - excluded from this total".', hi: 'Agar kisi raw material ka vendor rate set nahi hai, toh woh inventory value total se exclude ho jaata hai, aur footer mein "X material(s) missing a vendor rate - excluded from this total" dikhta hai.' },
          { en: 'Card 3 "Avg. Food Cost %": averages sold items\' recipe (BOM) cost % only across branches that have a complete recipe+rate chain this month.', hi: 'Card 3 "Avg. Food Cost %": sirf un branches ka average liya jaata hai jinki recipe (BOM) cost % chain is month complete hai (recipe+rate dono).' },
          { en: 'Footer of Avg. Food Cost % card shows "X/Y branches measured" (e.g. 2 of 3 branches measured gives footer "2/3 branches measured" with the averaged % like 30%).', hi: 'Avg. Food Cost % card ke footer mein "X/Y branches measured" dikhta hai (jaise 3 mein se 2 branches measured hui toh footer "2/3 branches measured" ke saath averaged % jaise 30% dikhega).' },
          { en: 'Card 4 "Overdue Tasks": count of recurring or delegated tasks that crossed their due time and are still not marked Done.', hi: 'Card 4 "Overdue Tasks": un recurring ya delegated tasks ka count jo due time cross kar gaye aur abhi tak Done nahi hue.' },
          { en: 'Card 5 "MIS Score/Top MIS Branch": in single-branch view shows that branch\'s own MIS score; in All-branches view shows the name and score of the highest-scoring branch.', hi: 'Card 5 "MIS Score/Top MIS Branch": single-branch view mein us branch ka khud ka MIS score dikhta hai; All-branches view mein sabse high-scoring branch ka naam aur score dikhta hai.' },
          { en: 'Food Cost and MIS score show as null (not 0% or 100%) if there is genuinely no measurable data in that period, such as zero recipes sold or no tasks at all.', hi: 'Food Cost aur MIS score null dikhte hain (0% ya 100% nahi) agar us period mein genuinely koi measurable data hi nahi hai, jaise zero recipes sold ya koi task hi na ho.' },
        ],
      },
      {
        headingEn: 'Section 2 - Revenue Trend Chart (Last 14 Days)',
        headingHi: 'Section 2 - Revenue Trend Chart (Last 14 Days)',
        items: [
          { en: 'A line/area chart shows daily revenue for the last 14 days, either for a single branch or compiled for all branches.', hi: 'Line/area chart last 14 din ka daily revenue dikhata hai, ya single branch ka ya sabhi branches compiled.' },
          { en: 'This chart needs REPORTS module access to view; without it, the message "Revenue trend requires REPORTS access" shows, but the rest of the dashboard totals still display normally.', hi: 'Yeh chart dekhne ke liye REPORTS module access chahiye; access na hone par "Revenue trend requires REPORTS access" message dikhta hai, lekin baki dashboard totals normally dikhte rehte hain.' },
          { en: 'Example: an Owner with REPORTS access sees the chart, while a Cashier role without the REPORTS grant sees only this one chart blocked - everything else is normal.', hi: 'Example: REPORTS access wale Owner ko chart dikhta hai, jabki REPORTS grant na rakhne wale Cashier ko sirf yeh ek chart hi block dikhta hai - baki sab normal.' },
        ],
      },
      {
        headingEn: 'Section 3 - Order Channel Split (Pie Chart)',
        headingHi: 'Section 3 - Order Channel Split (Pie Chart)',
        items: [
          { en: 'Shows month-to-date revenue split into Dine-in / Takeaway / Swiggy / Zomato channels.', hi: 'Month-to-date revenue ko Dine-in / Takeaway / Swiggy / Zomato channels mein split karke dikhata hai.' },
          { en: 'If there is no completed sale this month, the message "No completed sales this month yet" shows instead of a chart.', hi: 'Agar is month koi completed sale nahi hui, toh chart ki jagah "No completed sales this month yet" message dikhta hai.' },
          { en: 'Only channels with revenue greater than 0 are shown in the pie chart.', hi: 'Pie chart mein sirf wahi channels dikhte hain jinka revenue 0 se zyada hai.' },
        ],
      },
      {
        headingEn: 'Section 4 - Revenue Today by Branch (Bar Chart)',
        headingHi: 'Section 4 - Revenue Today by Branch (Bar Chart)',
        items: [
          { en: 'Shows every branch\'s today\'s revenue side-by-side, most useful in the All-branches view.', hi: 'Har branch ka aaj ka revenue side-by-side dikhata hai, All-branches view mein sabse useful hota hai.' },
          { en: 'In single-branch view, this chart simply shows just one bar for that branch.', hi: 'Single-branch view mein yeh chart us ek branch ka sirf ek bar dikhata hai.' },
        ],
      },
      {
        headingEn: 'Section 5 - Pilferage Watch',
        headingHi: 'Section 5 - Pilferage Watch',
        items: [
          { en: 'A trailing 30-day "night variance" flag list showing branches where theft or wastage is suspected due to an expected-vs-actual stock mismatch.', hi: 'Trailing 30-din ka "night variance" flag list jo woh branches dikhata hai jahan theft ya wastage ka shaq hai (expected vs actual stock mismatch ki wajah se).' },
          { en: 'This card is purely a read-only alert - no action can be taken from here.', hi: 'Yeh card sirf read-only alert hai - yahan se koi action nahi liya ja sakta.' },
          { en: 'Only branches with pilferage flags greater than 0 show a row; if all branches have 0 flags, the message "No pilferage flags recorded in the trailing 30 days" shows instead.', hi: 'Sirf un branches ki row dikhti hai jinke pilferage flags 0 se zyada hain; sabhi branches ke 0 flags hone par "No pilferage flags recorded in the trailing 30 days" message dikhta hai.' },
          { en: 'Each flagged branch also shows its cash variance alongside the flag count.', hi: 'Har flagged branch apna cash variance bhi flag count ke saath dikhati hai.' },
        ],
        example: null,
      },
      {
        headingEn: 'Section 6 - Branch Drill-down Table',
        headingHi: 'Section 6 - Branch Drill-down Table',
        items: [
          { en: 'A big table at the bottom shows every branch\'s Revenue Today, Inventory Value, Prime Cost % (currently "N/A" since labor cost is not connected yet), Food Cost %, Overdue Tasks, MIS Score, and Cash Variance - all together.', hi: 'Neeche ek badi table har branch ka Revenue Today, Inventory Value, Prime Cost % (abhi "N/A" kyunki labor cost connect nahi hui), Food Cost %, Overdue Tasks, MIS Score, aur Cash Variance - sab ek saath dikhati hai.' },
          { en: 'Food Cost % above 35% gets a red ("destructive") badge; 35% or below gets a green badge.', hi: 'Food Cost % 35% se zyada hone par red ("destructive") badge milta hai; 35% ya usse kam hone par green badge.' },
          { en: 'Overdue Tasks greater than 0 gets an amber/warning badge; 0 shows as plain text.', hi: 'Overdue Tasks 0 se zyada hone par amber/warning badge milta hai; 0 hone par plain text dikhta hai.' },
          { en: 'In single-branch view, only that branch\'s own row shows - other branches\' rows are excluded by the system itself for security/isolation, not just a UI filter.', hi: 'Single-branch view mein sirf us branch ki apni row dikhti hai - dusri branches ki rows system khud exclude karta hai security/isolation ke liye, yeh sirf UI filter nahi hai.' },
        ],
      },
    ],
    example: { en: 'If "Mikocheni" branch\'s food cost comes out 38%, its badge in the drill-down table shows red and the owner immediately sees cost control is needed there.', hi: 'Agar "Mikocheni" branch ka food cost 38% aata hai, toh drill-down table mein uska badge red dikhta hai aur owner ko turant pata chal jaata hai ki wahan cost control ki zaroorat hai.' },
  },

  {
    id: 'reports',
    titleEn: 'Reports Module',
    titleHi: 'Reports Module',
    icon: 'bar-chart-3',
    summaryEn: '7 different reports (plus a bonus EOD Stock report), each gated by its own module-access grant, with CSV export available everywhere.',
    summaryHi: '7 alag reports (plus ek bonus EOD Stock report) hain, har ek apne alag module-access grant se gated hai, aur CSV export har jagah available hai.',
    sections: [
      {
        headingEn: 'Section 1 - Reports Hub & Access Grants',
        headingHi: 'Section 1 - Reports Hub & Access Grants',
        items: [
          { en: 'A grid of cards is shown, each representing one report; clicking a card opens that report\'s detail page.', hi: 'Cards ki ek grid dikhti hai, har card ek report represent karta hai; card click karne par us report ka detail page khulta hai.' },
          { en: 'Each report needs its own grant: "MIS Scorecard" needs MIS_PERFORMANCE grant.', hi: 'Har report ka apna grant chahiye: "MIS Scorecard" ke liye MIS_PERFORMANCE grant zaroori hai.' },
          { en: '"Inventory Variance" and "End-of-Day Stock & Reorder" reports need INVENTORY grant.', hi: '"Inventory Variance" aur "End-of-Day Stock & Reorder" reports ke liye INVENTORY grant zaroori hai.' },
          { en: '"Swiggy/Zomato Reconciliation" report needs AGGREGATOR_RECON grant.', hi: '"Swiggy/Zomato Reconciliation" report ke liye AGGREGATOR_RECON grant zaroori hai.' },
          { en: 'The rest - Sales Trend, Food Cost, and Cash Reconciliation reports - need only the plain REPORTS grant.', hi: 'Baki reports - Sales Trend, Food Cost, aur Cash Reconciliation - ke liye sirf plain REPORTS grant chahiye.' },
          { en: 'A report without the required access shows dimmed (opacity-70) and unclickable, with the message "Requires X access".', hi: 'Required access na hone par report dimmed (opacity-70) aur unclickable dikhta hai, saath mein "Requires X access" message aata hai.' },
        ],
      },
      {
        headingEn: 'Section 2 - Sales Trend Report',
        headingHi: 'Section 2 - Sales Trend Report',
        items: [
          { en: 'Shows daily revenue and order count for a chosen date range of 1 to 90 days, with a line chart and CSV export.', hi: 'Chosen date range (1 se 90 din) ka daily revenue aur order count line chart ke saath dikhata hai, CSV export bhi available hai.' },
          { en: 'Steps: enter "Days (1-90)", choose a branch or All, the table/chart auto-loads, then click "Export CSV" to download.', hi: 'Steps: "Days (1-90)" enter karo, branch ya All choose karo, table/chart auto-load hoga, phir "Export CSV" click karke download karo.' },
          { en: 'Daily Prime Cost trend is not available yet because labor cost is not period-allocated/connected - a note about this always shows in the report.', hi: 'Daily Prime Cost trend abhi available nahi hai kyunki labor cost period-allocated/connected nahi hai - report mein iske baare mein hamesha note dikhta hai.' },
        ],
        example: null,
      },
      {
        headingEn: 'Section 3 - MIS Scorecard Report',
        headingHi: 'Section 3 - MIS Scorecard Report',
        items: [
          { en: 'This is a historical view of already-saved MIS scores - it does not compute fresh scores; the compute button lives on the Performance page, not here.', hi: 'Yeh already-saved MIS scores ka historical view hai - yeh fresh compute nahi karta; compute button Performance page par hai, yahan nahi.' },
          { en: 'Steps: choose From/To date (max 31-day window), choose a branch, then the table shows Branch, PeriodStart, PeriodEnd, Rank, OnTime, Delay, NotDone, Score, and ComponentsUsed.', hi: 'Steps: From/To date choose karo (max 31-din ka window), branch choose karo, table mein Branch, PeriodStart, PeriodEnd, Rank, OnTime, Delay, NotDone, Score, aur ComponentsUsed dikhega.' },
          { en: 'One branch\'s multiple saved periods can overlap and show in this range - Rank only compares the currently-shown rows against each other, not the whole company.', hi: 'Ek branch ke multiple saved periods overlap karke isi range mein dikh sakte hain - Rank sirf currently-shown rows ko ek doosre se compare karta hai, puri company se nahi.' },
          { en: 'The ComponentsUsed field shows which of the 4 components (task/delegation/variance/cashier) were actually measured in that period.', hi: 'ComponentsUsed field dikhata hai ki us period mein 4 components (task/delegation/variance/cashier) mein se kaunse actually measured hue.' },
        ],
      },
      {
        headingEn: 'Section 4 - Food Cost & Menu Margin Report',
        headingHi: 'Section 4 - Food Cost & Menu Margin Report',
        items: [
          { en: 'Shows every sold menu item\'s estimated food cost %, based on the current vendor rate - not historical posted cost.', hi: 'Har sold menu item ka estimated food cost % dikhata hai, current vendor rate ke basis par - historical posted cost nahi.' },
          { en: 'Steps: choose Month (YYYY-MM) and branch; two tables appear - the per-branch food cost summary and an item-wise breakdown.', hi: 'Steps: Month (YYYY-MM) aur branch choose karo; do tables aati hain - per-branch food cost summary aur item-wise breakdown.' },
          { en: 'The first table "Per-branch food cost summary" shows Revenue, Estimated COGS, Estimated Food Cost %, and Actual Posted COGS/% if available.', hi: 'Pehli table "Per-branch food cost summary" mein Revenue, Estimated COGS, Estimated Food Cost %, aur agar available ho toh Actual Posted COGS/% dikhta hai.' },
          { en: 'The second item-wise breakdown table shows MenuItem, QtySold, RevenueInr, BomCostPerUnit, CogsInr, FoodCostPercent, and an exclusion Reason column if an item was excluded.', hi: 'Doosri item-wise breakdown table mein MenuItem, QtySold, RevenueInr, BomCostPerUnit, CogsInr, FoodCostPercent, aur item exclude hone par Reason column dikhta hai.' },
          { en: 'Any excluded order or item always shows its exact exclusion reason in notes - it is never a silent skip.', hi: 'Koi bhi excluded order ya item hamesha apna exact exclusion reason notes mein dikhata hai - yeh kabhi silent skip nahi hota.' },
          { en: 'Both tables export separately to CSV, with the branch-summary saved as its own separate file.', hi: 'Dono tables alag-alag CSV mein export hoti hain, branch-summary apni separate file mein save hoti hai.' },
        ],
        example: { en: '"Butter Chicken" has a BomCostPerUnit of TSh450 with 1200 units sold, so FoodCostPercent calculates for its line; if "Paneer Tikka" has no recipe built, its row shows "recipe missing" as the Reason.', hi: '"Butter Chicken" ka BomCostPerUnit TSh450 hai aur 1200 units sold hue, toh FoodCostPercent us line ke liye calculate hota hai; agar "Paneer Tikka" ki recipe build nahi hui, toh uski row mein Reason "recipe missing" dikhta hai.' },
      },
      {
        headingEn: 'Section 5 - Inventory Variance Report',
        headingHi: 'Section 5 - Inventory Variance Report',
        items: [
          { en: 'Shows the night-count\'s theoretical vs physical stock mismatch, material-wise, along with a pilferage flag.', hi: 'Night-count ka theoretical vs physical stock mismatch, material-wise, pilferage flag ke saath dikhata hai.' },
          { en: 'Steps: choose From/To date range; the table shows Material, Date, TheoreticalQty, PhysicalQty, VarianceInr, and PilferageFlag (true/false).', hi: 'Steps: From/To date range choose karo; table mein Material, Date, TheoreticalQty, PhysicalQty, VarianceInr, aur PilferageFlag (true/false) dikhta hai.' },
          { en: 'A row gets flagged when the variance is explicitly marked as pilferage OR the variance is more than 5% of the theoretical qty - that is the exact threshold, no other number applies.', hi: 'Row flag hoti hai jab variance explicitly pilferage marked ho YA variance theoretical qty ke 5% se zyada ho - yahi exact threshold hai, koi doosra number nahi.' },
        ],
      },
      {
        headingEn: 'Section 6 - Cash Reconciliation Report',
        headingHi: 'Section 6 - Cash Reconciliation Report',
        items: [
          { en: 'Shows the blind cash-drop\'s shortage/excess, cashier-wise and branch-wise.', hi: 'Blind cash-drop ka shortage/excess, cashier-wise aur branch-wise dikhata hai.' },
          { en: 'Steps: choose From/To date (filtered by shift closing date, EAT day); the table shows Branch, Cashier, ShiftStart, ClosedAt, ExpectedInr, CountedInr, and VarianceInr.', hi: 'Steps: From/To date choose karo (shift closing date ke basis par filter hota hai, EAT day); table mein Branch, Cashier, ShiftStart, ClosedAt, ExpectedInr, CountedInr, aur VarianceInr dikhta hai.' },
          { en: 'This is the actual stored closing variance, which also includes Owner-only sales - meaning this is the full physical cash picture with nothing hidden.', hi: 'Yeh actual stored closing variance hai, jisme Owner-only sales bhi include hain - matlab yeh full physical cash picture hai, kuch bhi hidden nahi.' },
        ],
      },
      {
        headingEn: 'Section 7 - Swiggy/Zomato (Aggregator) Reconciliation Report',
        headingHi: 'Section 7 - Swiggy/Zomato (Aggregator) Reconciliation Report',
        items: [
          { en: 'Compares order value vs net payout, commission, and ads spend per aggregator order.', hi: 'Har aggregator order ka order value vs net payout, commission, aur ads spend compare karta hai.' },
          { en: 'Steps: choose Month; the table shows Date, Channel, OrderValueInr, CommissionInr, AdsInr, RefundPenaltyInr, and NetPayoutInr.', hi: 'Steps: Month choose karo; table mein Date, Channel, OrderValueInr, CommissionInr, AdsInr, RefundPenaltyInr, aur NetPayoutInr dikhta hai.' },
          { en: 'This report needs a separate AGGREGATOR_RECON grant to view (different from the plain REPORTS grant), because it is sensitive commission/payout data.', hi: 'Yeh report dekhne ke liye alag AGGREGATOR_RECON grant chahiye (plain REPORTS grant se different), kyunki yeh sensitive commission/payout data hai.' },
        ],
      },
      {
        headingEn: 'Section 8 (Bonus 7th Report) - End-of-Day Stock & Reorder Report (EOD-STOCK)',
        headingHi: 'Section 8 (Bonus 7th Report) - End-of-Day Stock & Reorder Report (EOD-STOCK)',
        items: [
          { en: 'This is different from the other reports - it is a single (branch + date) "snapshot" that must be generated or regenerated, and can then be formally submitted to HO.', hi: 'Yeh doosre reports se different hai - yeh ek single (branch + date) "snapshot" hai jo generate/regenerate karna padta hai, aur phir HO ko formally submit kiya ja sakta hai.' },
          { en: 'Steps: choose one branch - "All-branches" does not work here and shows "Select one branch"; choose the report date; click "Generate report" if not already generated, or "Regenerate report" to create a new revision; click "Submit this revision to HO" to send it to the HO Stock Review queue.', hi: 'Steps: ek branch choose karo - "All-branches" yahan kaam nahi karta aur "Select one branch" dikhta hai; report date choose karo; agar generate nahi hua toh "Generate report" click karo, ya "Regenerate report" se nayi revision banao; "Submit this revision to HO" click karke HO Stock Review queue mein bhejo.' },
          { en: 'Each regenerate increases the revision number (r1, r2...) - this is "latest-wins" versioning where the old revision gets overwritten but stays in the audit log.', hi: 'Har regenerate par revision number badhta hai (r1, r2...) - yeh "latest-wins" versioning hai jahan purani revision overwrite ho jaati hai lekin audit log mein rehti hai.' },
          { en: 'The snapshot shows raw-material-wise Opening/Receipts/Issued/Wastage/Adjust/Closing qty, Min/Max levels, and StockStatus (LOW/HIGH/OK).', hi: 'Snapshot raw-material-wise Opening/Receipts/Issued/Wastage/Adjust/Closing qty, Min/Max levels, aur StockStatus (LOW/HIGH/OK) dikhata hai.' },
          { en: 'The snapshot also shows Prepared items\' status/count-only summary (Low/High/Unconfigured/Unavailable counts) plus expired/expiring-soon/unknown-expiry batch counts.', hi: 'Snapshot Prepared items ka status/count-only summary (Low/High/Unconfigured/Unavailable counts) aur expired/expiring-soon/unknown-expiry batch counts bhi dikhata hai.' },
          { en: 'If any raw material is "Reconciled=false" (tie-out failed), a red alert "Reconciliation required" shows.', hi: 'Agar koi raw material "Reconciled=false" (tie-out fail) hai, toh red alert "Reconciliation required" dikhta hai.' },
          { en: 'Submitting to HO is idempotent - submitting the exact same revision again shows "This exact revision was already submitted to HO" with no duplicate queue entry created.', hi: 'HO ko submit karna idempotent hai - same revision dobara submit karne par "This exact revision was already submitted to HO" dikhta hai, koi duplicate queue entry nahi banti.' },
        ],
        example: { en: 'A 5-Nov report is generated with 3 raw materials in LOW status and 1 expired batch - the summary bar shows "Expired batches: 1", and Submit-to-HO sends it to the HO Stock Review queue with "exception = true".', hi: '5-Nov ki report generate hoti hai jisme 3 raw materials LOW status mein hain aur 1 expired batch hai - summary bar mein "Expired batches: 1" dikhta hai, aur Submit-to-HO isse HO Stock Review queue mein "exception = true" ke saath bhejta hai.' },
      },
      {
        headingEn: 'CSV Export (Common Across All Reports)',
        headingHi: 'CSV Export (Common Across All Reports)',
        items: [
          { en: 'An "Export" button sits above every report\'s table and exports exactly the currently-shown (filtered, loaded) rows - no extra fetch happens.', hi: 'Har report ki table ke upar "Export" button hota hai jo exactly currently-shown (filtered, loaded) rows export karta hai - koi extra fetch nahi hota.' },
          { en: 'In loading or error state, the export button is disabled/empty, so half-loaded data is never exported.', hi: 'Loading ya error state mein export button disabled/empty rehta hai, isliye half-loaded data kabhi export nahi hota.' },
        ],
      },
    ],
    example: null,
  },

  {
    id: 'mis-leaderboard',
    titleEn: 'MIS Leaderboard / Team Performance',
    titleHi: 'MIS Leaderboard / Team Performance',
    icon: 'trophy',
    summaryEn: 'A branch-wise 100-point weighted performance score made of 4 real components, dynamically re-normalized when data is partial - never a sample/fake number.',
    summaryHi: 'Yeh ek branch-wise 100-point weighted performance score hai jo 4 real components se banta hai, partial data hone par dynamically re-normalize hota hai - kabhi sample/fake number nahi.',
    sections: [
      {
        headingEn: 'Section 1 - Period & Compute Panel',
        headingHi: 'Section 1 - Period & Compute Panel',
        items: [
          { en: 'Steps: choose Period start/end date (max 31 days, inclusive), then choose branch - Owner/SUPER_ADMIN can pick All or specific, while a Branch Manager only sees their own branch with no dropdown.', hi: 'Steps: Period start/end date choose karo (max 31 din, inclusive), phir branch choose karo - Owner/SUPER_ADMIN All ya specific choose kar sakte hain, jabki Branch Manager ko sirf apni branch dikhti hai, dropdown nahi.' },
          { en: 'Only Owner/SUPER_ADMIN and CENTRAL_STORE_MGR roles see and can click the "Compute MIS" button, which (re)calculates the score for every target branch and saves it to the database.', hi: 'Sirf Owner/SUPER_ADMIN aur CENTRAL_STORE_MGR roles ko "Compute MIS" button dikhta hai aur yeh click kar sakte hain, jo har target branch ka score (re)calculate karke database mein save karta hai.' },
          { en: 'Everyone else can only view already-saved scores and cannot trigger a compute.', hi: 'Baki sab log sirf already-saved scores dekh sakte hain, compute trigger nahi kar sakte.' },
          { en: 'A branch with ZERO real rows in any component (task/delegation/variance/cashier) in that window gets SKIPPED entirely - it never gets a false 0% or 100% score.', hi: 'Agar kisi branch ke kisi component (task/delegation/variance/cashier) mein us window ke ZERO real rows hain, toh woh branch poori tarah SKIP ho jaati hai - usse kabhi false 0% ya 100% score nahi milta.' },
        ],
      },
      {
        headingEn: 'Sections 2 & 3 - Score Chart & Leaderboard Table',
        headingHi: 'Sections 2 & 3 - Score Chart & Leaderboard Table',
        items: [
          { en: 'A bar chart and a table below it show Rank, Branch, On Time count, Delay count, Not Done count, Components used (how many of 4 were measured), and the final MIS Score badge.', hi: 'Bar chart aur uske neeche ek table mein Rank, Branch, On Time count, Delay count, Not Done count, Components used (4 mein se kitne measured hue), aur final MIS Score badge dikhta hai.' },
          { en: 'Task Score carries a 40% weight, based on recurring (checklist-type) tasks\' on-time completion % for tasks due in the period.', hi: 'Task Score ka weight 40% hai, yeh us period mein due hue recurring (checklist-type) tasks ki on-time completion % par based hai.' },
          { en: 'Delegation Score carries a 30% weight, based on the same on-time completion % but for ONE_TIME type delegated tasks.', hi: 'Delegation Score ka weight 30% hai, yeh same on-time completion % par based hai lekin ONE_TIME type delegated tasks ke liye.' },
          { en: 'Variance Score carries a 20% weight: formula = 100 - (flagged / total x 100), based on what % of night inventory variance entries were "clean" (no pilferage flag and variance within the 5% threshold).', hi: 'Variance Score ka weight 20% hai: formula = 100 - (flagged / total x 100), yeh batata hai ki night inventory variance entries mein se kitni % "clean" thi (koi pilferage flag nahi aur variance 5% threshold ke andar).' },
          { en: 'Cashier Score carries a 10% weight: formula = 100 - (nonzero-variance shifts / total shifts x 100), based on the % of shift-closing cash-drops where shortage/excess was exactly zero.', hi: 'Cashier Score ka weight 10% hai: formula = 100 - (nonzero-variance shifts / total shifts x 100), yeh us % par based hai jahan shift-closing cash-drop ka shortage/excess exactly zero tha.' },
          { en: 'Re-normalize rule: if a component is null because that branch has no real data in that category, its weight is removed and the remaining weights are rescaled to 100% - e.g. if only Task(40) and Delegation(30) were measured, their weights become 40/70 and 30/70, not 40/100 and 30/100.', hi: 'Re-normalize rule: agar branch ke us category mein real data nahi hai toh woh component null hota hai, uska weight remove hokar baaki weights 100% tak rescale hote hain - jaise sirf Task(40) aur Delegation(30) measured hue toh unke weights 40/70 aur 30/70 banenge, 40/100 aur 30/100 nahin.' },
          { en: 'This re-normalize rule ensures a partial-data period never falsely looks like "everything was measured".', hi: 'Yeh re-normalize rule ensure karta hai ki partial-data period kabhi false tarike se "everything was measured" na lage.' },
          { en: 'Color badge rule: Score >= 85% shows green (success); 70-84% shows amber (warning); below 70% shows red (destructive).', hi: 'Color badge rule: Score >= 85% par green (success); 70-84% par amber (warning); 70% se neeche par red (destructive) badge dikhta hai.' },
          { en: 'Export CSV button on the Leaderboard gives all columns in one CSV: Rank, Branch, OnTime, Delay, NotDone, all 4 component scores, ComponentsUsed, and MisScore.', hi: 'Leaderboard ke Export CSV button se ek hi CSV mein sab columns milte hain: Rank, Branch, OnTime, Delay, NotDone, 4 component scores, ComponentsUsed, aur MisScore.' },
        ],
      },
    ],
    example: { en: 'A branch this month only has task and variance data (no delegation or cashier record): task score 90%, variance score 95%. Total = (40x90 + 20x95)/(40+20) = (3600+1900)/60 = ~91.7%. The ComponentsUsed column shows only "Task, Variance" - no "All 4" badge appears.', hi: 'Ek branch ke paas is month sirf task aur variance data hai (delegation ya cashier record nahi): task score 90%, variance score 95%. Total = (40x90 + 20x95)/(40+20) = (3600+1900)/60 = ~91.7%. ComponentsUsed column sirf "Task, Variance" dikhata hai - "All 4" badge nahi aata.' },
  },

  {
    id: 'tasks-recurring',
    titleEn: 'Tasks & Checklists - Recurring/Checklist',
    titleHi: 'Tasks & Checklists - Recurring/Checklist',
    icon: 'list-checks',
    summaryEn: 'Create repeating checklist-type task templates that auto-generate occurrences on a schedule, with catch-up logic and auto-escalation for overdue items.',
    summaryHi: 'Repeating checklist-type task templates banate hain jo schedule ke hisaab se auto occurrences generate karte hain, catch-up logic aur overdue items ke liye auto-escalation ke saath.',
    sections: [
      {
        headingEn: 'Creating a Recurring Template',
        headingHi: 'Creating a Recurring Template',
        items: [
          { en: 'Steps: click "New Recurring/Checklist"; choose a branch if access to multiple branches; fill Title and description.', hi: 'Steps: "New Recurring/Checklist" click karo; agar multiple branches ka access hai toh branch choose karo; Title aur description fill karo.' },
          { en: 'The "Assigned to (Doer)" dropdown picks a staff member of that branch.', hi: '"Assigned to (Doer)" dropdown us branch ke staff member ko pick karta hai.' },
          { en: 'Choose Frequency: Daily, Weekly, Fortnightly (15 days), Monthly, Quarterly, Half-Yearly, or Yearly.', hi: 'Frequency choose karo: Daily, Weekly, Fortnightly (15 din), Monthly, Quarterly, Half-Yearly, ya Yearly.' },
          { en: 'Fill Shift time (HH:MM) to set what time of day the task is due.', hi: 'Shift time (HH:MM) fill karo, yeh batata hai ki din ke kis time task due hai.' },
          { en: 'Fill the "Anchor assign date" - the first date from which the cycle count starts.', hi: '"Anchor assign date" fill karo - yeh woh pehli date hai jahan se cycle count start hota hai.' },
          { en: 'The "Nudge doer to attach evidence" checkbox is optional - a hint, not mandatory.', hi: '"Nudge doer to attach evidence" checkbox optional hai - yeh ek hint hai, mandatory nahi.' },
          { en: 'Click "Create" to finish.', hi: '"Create" click karke finish karo.' },
        ],
      },
      {
        headingEn: 'Cron / Catch-up Logic',
        headingHi: 'Cron / Catch-up Logic',
        items: [
          { en: 'The system counts cycles from the anchor date for each definition: Daily=1 day, Weekly=7 days, Fortnightly=15 days, and Monthly/Quarterly/Half-Yearly/Yearly=calendar months 1/3/6/12.', hi: 'System har definition ke liye anchor date se cycles count karta hai: Daily=1 din, Weekly=7 din, Fortnightly=15 din, aur Monthly/Quarterly/Half-Yearly/Yearly=calendar months 1/3/6/12.' },
          { en: 'Month-based cycles clamp on the 31st to the next month\'s last valid day - e.g. 31 Jan + 1 month becomes 28/29 Feb.', hi: 'Month-based cycles 31st ko next month ke last valid day par clamp ho jaate hain - jaise 31 Jan + 1 month = 28/29 Feb.' },
          { en: 'A background cron job generates "pending cycles"; if the server was down for some days (missed runs), the next cron run backfills all missed occurrences.', hi: 'Background cron job "pending cycles" generate karta hai; agar server kuch din down raha (missed runs), toh next cron run sabhi missed occurrences backfill kar deta hai.' },
          { en: 'maxCatchUp = 60 cycles limit - very old missed cycles beyond that are not backfilled, so a very long outage never creates an infinite backlog.', hi: 'maxCatchUp = 60 cycles ki limit hai - usse purane missed cycles backfill nahi hote, isliye lambi outage se infinite backlog kabhi nahi banta.' },
          { en: 'A holiday-calendar-marked day is deliberately skipped - it is not treated as missed and never carries forward.', hi: 'Holiday-calendar-marked din deliberately skip hota hai - isse missed nahi mana jaata aur yeh kabhi carry forward nahi hota.' },
          { en: 'A definition can be "Paused" to stop new occurrences from generating, and later "Resumed".', hi: 'Ek definition "Paused" ki ja sakti hai jisse naye occurrences generate hona band ho jaate hain, aur baad mein "Resumed" ki ja sakti hai.' },
        ],
      },
      {
        headingEn: 'Escalation',
        headingHi: 'Escalation',
        items: [
          { en: 'When an occurrence stays PENDING/IN_PROGRESS 30 minutes past its due time, it auto-changes to "OVERDUE" status and sends an escalation notice.', hi: 'Jab koi occurrence apne due time se 30 minute aage tak PENDING/IN_PROGRESS rehta hai, toh woh automatically "OVERDUE" status mein badal jaata hai aur escalation notice bhejta hai.' },
          { en: 'This escalation happens only once per occurrence - it never re-escalates a second time.', hi: 'Yeh escalation har occurrence ke liye sirf ek baar hota hai - yeh dobara kabhi escalate nahi hota.' },
        ],
      },
    ],
    example: { en: 'A "Walk-in fridge temp log" Daily task has anchor date 1-Nov and shift time 09:00. If the server was down 3-Nov to 5-Nov, when cron runs again on 6-Nov, all 4 occurrences (3,4,5,6-Nov) generate together at once, since fewer than 60 cycles were missed.', hi: 'Ek "Walk-in fridge temp log" Daily task ka anchor date 1-Nov hai aur shift time 09:00. Agar server 3-Nov se 5-Nov tak down raha, toh 6-Nov ko jab cron dobara chalta hai, 4 occurrences (3,4,5,6-Nov) ek saath generate hote hain, kyunki 60 se kam cycles miss hue the.' },
  },

  {
    id: 'tasks-delegation',
    titleEn: 'Tasks & Checklists - Delegation (One-Time)',
    titleHi: 'Tasks & Checklists - Delegation (One-Time)',
    icon: 'user-check',
    summaryEn: 'Assigning a specific non-repeating task directly to someone with a priority, mandatory photo evidence, and best-effort GPS geofence check.',
    summaryHi: 'Ek specific, non-repeating task kisi ko directly assign karna, priority ke saath, mandatory photo evidence, aur best-effort GPS geofence check ke saath.',
    sections: [
      {
        headingEn: 'Creating a Delegated Task',
        headingHi: 'Creating a Delegated Task',
        items: [
          { en: 'Steps: click "Delegate Task"; fill Branch, Title, Description, "Assign to" doer, Priority (HIGH/MEDIUM/LOW), and Due date-time; click "Delegate".', hi: 'Steps: "Delegate Task" click karo; Branch, Title, Description, "Assign to" doer, Priority (HIGH/MEDIUM/LOW), aur Due date-time fill karo; "Delegate" click karo.' },
        ],
      },
      {
        headingEn: 'Mandatory Evidence & Geofence',
        headingHi: 'Mandatory Evidence & Geofence',
        items: [
          { en: 'When the doer clicks "Mark Done", a real camera photo upload is REQUIRED - the task cannot be marked Done without a photo, and the button stays disabled until a photo is chosen.', hi: 'Jab doer "Mark Done" click karta hai, toh real camera photo upload REQUIRED hai - photo ke bina task Done mark nahi ho sakta, aur photo choose hone tak button disabled rehta hai.' },
          { en: 'Location (GPS) is captured best-effort for geofence checking, but denying location access never blocks completion - if GPS fails, it is simply recorded as "not available".', hi: 'Location (GPS) geofence checking ke liye best-effort capture hota hai, lekin location access deny karne se completion kabhi block nahi hota - GPS fail hone par isse simply "not available" record kar diya jaata hai.' },
          { en: 'A completed task\'s row has a "View evidence" button that opens the stored photo in a secure URL - but this only applies to real uploaded evidence; old records that were just text/URL are shown as inert text, not sent to the upload-viewer.', hi: 'Completed task ki row mein "View evidence" button hota hai jo stored photo ko secure URL mein kholta hai - lekin yeh sirf real uploaded evidence ke liye hota hai; purane records jo sirf text/URL the, woh inert text ki tarah dikhte hain, upload-viewer mein nahi jaate.' },
        ],
      },
    ],
    example: { en: '"Repair exhaust fan" is delegated as HIGH priority, due today 6 PM. When the doer marks it Done, they must take a photo; if they allowed location, the system records whether they were inside the branch premises\' geofence radius or not.', hi: '"Repair exhaust fan" HIGH priority ke saath delegate kiya jaata hai, aaj 6 PM due. Jab doer isse Done mark karta hai, use photo lena zaroori hai; agar usne location allow ki thi, toh system record karta hai ki woh branch premises ke geofence radius ke andar tha ya nahi.' },
  },

  {
    id: 'admin-users',
    titleEn: 'Admin - Users & Access',
    titleHi: 'Admin - Users & Access',
    icon: 'users',
    summaryEn: 'Create and edit staff accounts and give them module-wise access grants, with strict role-based limits on who can create whom and what grants can be passed on.',
    summaryHi: 'Staff accounts create/edit karna aur unhe module-wise access grants dena, saath mein strict role-based limits ki kaun kise bana sakta hai aur kaunse grants pass kiye ja sakte hain.',
    sections: [
      {
        headingEn: 'Creating / Editing a User',
        headingHi: 'Creating / Editing a User',
        items: [
          { en: 'Only Owner or Branch Manager see the "New User" button.', hi: '"New User" button sirf Owner ya Branch Manager ko dikhta hai.' },
          { en: 'Steps: fill Name, Email (used for login), optional mobile (used only for WhatsApp reminders - does not work for login), and Password.', hi: 'Steps: Name, Email (login ke liye), optional mobile (sirf WhatsApp reminders ke liye - login ke liye kaam nahi karta), aur Password fill karo.' },
          { en: 'Password rule: a new user needs a password of minimum 12 characters; when editing an existing user, leave the password field blank to keep the old password.', hi: 'Password rule: naye user ke liye minimum 12 characters ka password chahiye; existing user edit karte waqt password field blank chhodne se purana password hi rehta hai.' },
          { en: 'The Role field shows SUPER_ADMIN/CENTRAL_STORE_MGR options only to the Owner.', hi: 'Role field mein SUPER_ADMIN/CENTRAL_STORE_MGR options sirf Owner ko dikhte hain.' },
          { en: 'Choose a Branch for the user - HQ roles have no branch.', hi: 'User ke liye Branch choose karo - HQ roles ke liye branch nahi hoti.' },
          { en: 'Tick the module grants checklist, set Status (Active/Inactive), then Save.', hi: 'Module grants checklist tick karo, Status (Active/Inactive) set karo, phir Save karo.' },
        ],
      },
      {
        headingEn: 'Permission Boundaries',
        headingHi: 'Permission Boundaries',
        items: [
          { en: 'Owner can edit all users across all branches.', hi: 'Owner sabhi branches ke sabhi users edit kar sakta hai.' },
          { en: 'Branch Manager can only edit CASHIER/KITCHEN_STAFF/ACCOUNTANT/BRANCH_MANAGER users of their OWN branch.', hi: 'Branch Manager sirf apni OWN branch ke CASHIER/KITCHEN_STAFF/ACCOUNTANT/BRANCH_MANAGER users ko edit kar sakta hai.' },
          { en: 'A Branch Manager can only give grants that they themselves already hold - they can never give someone more access than they have.', hi: 'Branch Manager sirf wahi grants de sakta hai jo woh khud rakhta hai - woh kisi ko apne se zyada access kabhi nahi de sakta.' },
          { en: 'The edit button on one\'s own account is disabled - a user cannot edit themselves.', hi: 'Apne khud ke account ka edit button disabled hota hai - user khud ko edit nahi kar sakta.' },
          { en: 'On Save, that user\'s all previous login sessions get revoked for security - if password or role changed, old sessions are force-logged-out.', hi: 'Save karne par us user ki sabhi previous login sessions revoke ho jaati hain security ke liye - agar password ya role change hua ho, toh purani sessions force-logged-out ho jaati hain.' },
        ],
      },
    ],
    example: { en: 'A Branch Manager holds only TASKS_RECURRING and INVENTORY grants; they can give a new Cashier only these 2 grants, never the REPORTS grant, since they don\'t hold it themselves.', hi: 'Ek Branch Manager ke paas sirf TASKS_RECURRING aur INVENTORY grants hain; woh naye Cashier ko sirf yeh 2 grants de sakta hai, REPORTS grant kabhi nahi, kyunki woh khud yeh nahi rakhta.' },
  },

  {
    id: 'admin-branches',
    titleEn: 'Admin - Branches',
    titleHi: 'Admin - Branches',
    icon: 'building-2',
    summaryEn: 'Manage branch records, create new branches from scratch or by cloning an existing branch\'s setup, and check deletion readiness before removing one.',
    summaryHi: 'Branch records manage karo, naye branches scratch se ya existing branch ke setup ko clone karke banao, aur delete karne se pehle deletion readiness check karo.',
    sections: [
      {
        headingEn: 'Section 1 - Branch List & Edit',
        headingHi: 'Section 1 - Branch List & Edit',
        items: [
          { en: 'Each branch record shows its code, name, operating concept (Fast Food = payment-first, Conventional = dine-in production-first), address, GPS coordinates, geofence radius, and VAT rate override.', hi: 'Har branch record ka code, name, operating concept (Fast Food = payment-first, Conventional = dine-in production-first), address, GPS coordinates, geofence radius, aur VAT rate override dikhta hai.' },
          { en: 'Steps: click "Edit" to change fields, then Save.', hi: 'Steps: fields change karne ke liye "Edit" click karo, phir Save karo.' },
          { en: 'Code and Operating Concept can only be changed by the Owner; a Branch Admin can change the rest (address/geofence/coordinates/VAT) for their own branch.', hi: 'Code aur Operating Concept sirf Owner change kar sakta hai; Branch Admin baaki (address/geofence/coordinates/VAT) apni branch ke liye change kar sakta hai.' },
          { en: 'Leaving VAT rate blank applies the default 18%.', hi: 'VAT rate blank chhodne par default 18% apply hota hai.' },
        ],
      },
      {
        headingEn: 'Section 2 - New Branch',
        headingHi: 'Section 2 - New Branch',
        items: [
          { en: 'Only the Owner sees the "New Branch" button.', hi: '"New Branch" button sirf Owner ko dikhta hai.' },
          { en: 'Steps: fill Code, Name, Address, Lat/Lng, Geofence radius, and Operating Concept, then Save.', hi: 'Steps: Code, Name, Address, Lat/Lng, Geofence radius, aur Operating Concept fill karo, phir Save karo.' },
          { en: 'A new branch starts completely empty - no menu, recipe, or stock, nothing.', hi: 'Naya branch bilkul empty se start hota hai - koi menu, recipe, ya stock, kuch nahi.' },
        ],
      },
      {
        headingEn: 'Section 3 - Clone Branch Wizard',
        headingHi: 'Section 3 - Clone Branch Wizard',
        items: [
          { en: 'This is a shortcut for creating a new branch by copying menu/recipes/checklists from an existing branch, so every new outlet does not need menu setup from scratch.', hi: 'Yeh naya branch banane ka shortcut hai jo existing branch se menu/recipes/checklists copy kar leta hai, isliye har naye outlet ko menu scratch se setup nahi karna padta.' },
          { en: 'Only the Owner sees the "Clone Branch" button.', hi: '"Clone Branch" button sirf Owner ko dikhta hai.' },
          { en: 'Steps: choose a "Source branch" to copy from; fill the new branch\'s own Code, Name, Address, Lat/Lng, Geofence radius, Operating Concept (these are all new, not copied); click "Clone Branch".', hi: 'Steps: copy karne ke liye "Source branch" choose karo; naye branch ka apna Code, Name, Address, Lat/Lng, Geofence radius, Operating Concept fill karo (yeh sab naye hain, copy nahi hote); "Clone Branch" click karo.' },
          { en: 'What COPIES: Menu items (name/price/output unit/active flag same, but with new branch\'s own row IDs).', hi: 'Kya COPY hota hai: Menu items (name/price/output unit/active flag same, lekin naye branch ki apni row IDs ke saath).' },
          { en: 'What COPIES: BOM Recipes (full recipe tree), with the HQ-lock state (lockedByHq) exactly preserved - if the source was HQ-locked, the clone is too.', hi: 'Kya COPY hota hai: BOM Recipes (full recipe tree), HQ-lock state (lockedByHq) exactly preserved rehta hai - agar source HQ-locked tha, toh clone bhi HQ-locked hoga.' },
          { en: 'What COPIES: that source branch\'s own branch-scoped checklist templates (full step-chain/outcome options/geofence requirement preserved).', hi: 'Kya COPY hota hai: source branch ke apne branch-scoped checklist templates (full step-chain/outcome options/geofence requirement preserved).' },
          { en: 'What DOES NOT COPY: Inventory stock/levels, vendor rates, users, recurring task definitions/instances, POS orders, or any historical/transactional data.', hi: 'Kya COPY NAHI hota: Inventory stock/levels, vendor rates, users, recurring task definitions/instances, POS orders, ya koi historical/transactional data.' },
          { en: 'Global (shared-across-all-branches) checklists are already available everywhere, so they are not duplicated during cloning.', hi: 'Global (sabhi branches mein shared) checklists already har jagah available hoti hain, isliye cloning ke time duplicate nahi hoti.' },
          { en: 'If an error happens at any step (e.g. duplicate branch code), the WHOLE operation rolls back in one transaction - a half-cloned branch never gets created.', hi: 'Agar kisi bhi step mein error aata hai (jaise duplicate branch code), toh poora operation ek transaction mein rollback ho jaata hai - half-cloned branch kabhi nahi banta.' },
        ],
        example: { en: '"Branch A" has 40 menu items and 35 BOM recipes, one of which "Butter Naan" is HQ-locked. Cloning "Branch B" from Branch A shows the result message "Copied: 40 menu items, 35 recipes, 12 checklist steps" - Butter Naan\'s recipe stays HQ-locked in Branch B too, but Branch B\'s stock starts at 0 and it must set its own vendor rates.', hi: '"Branch A" mein 40 menu items aur 35 BOM recipes hain, jinmein se ek "Butter Naan" HQ-locked hai. Branch A se "Branch B" clone karne par result message "Copied: 40 menu items, 35 recipes, 12 checklist steps" dikhta hai - Butter Naan ki recipe Branch B mein bhi HQ-locked rehti hai, lekin Branch B ka stock 0 se start hota hai aur usko apne vendor rates set karne padte hain.' },
      },
      {
        headingEn: 'Section 4 - Branch Deletion Readiness Check',
        headingHi: 'Section 4 - Branch Deletion Readiness Check',
        items: [
          { en: 'Steps: click "Check deletion readiness" inside the Edit Branch dialog to see how much linked data a branch has before deleting it.', hi: 'Steps: delete karne se pehle branch ka linked data check karne ke liye Edit Branch dialog ke andar "Check deletion readiness" click karo.' },
          { en: 'This is a READ-ONLY snapshot only - no automatic delete/cleanup/reassignment happens from here.', hi: 'Yeh sirf READ-ONLY snapshot hai - yahan se koi automatic delete/cleanup/reassignment nahi hota.' },
          { en: 'If linked records exist (orders, users, stock, etc.), a group-wise count shows and "canDelete: false" stays.', hi: 'Agar linked records exist karte hain (orders, users, stock, etc.), toh group-wise count dikhta hai aur "canDelete: false" rehta hai.' },
          { en: 'The server re-checks fresh on every actual deletion request - this readiness snapshot is purely informational.', hi: 'Server har actual deletion request par fresh re-check karta hai - yeh readiness snapshot sirf informational hai.' },
        ],
      },
    ],
    example: null,
  },

  {
    id: 'admin-settings',
    titleEn: 'Admin Settings',
    titleHi: 'Admin Settings',
    icon: 'settings',
    summaryEn: 'Owner-level settings covering branding, WhatsApp integration, shift windows, and 3 business policy thresholds - none guessed, all left blank until set.',
    summaryHi: 'Owner-level settings jo branding, WhatsApp integration, shift windows, aur 3 business policy thresholds cover karti hain - koi bhi guess nahi hota, sab blank rehta hai jab tak set na kiya jaaye.',
    sections: [
      {
        headingEn: 'Restaurant Branding',
        headingHi: 'Restaurant Branding',
        items: [
          { en: 'Restaurant name and logo can be set - this setting is Owner-only.', hi: 'Restaurant name aur logo set kiya ja sakta hai - yeh setting sirf Owner kar sakta hai.' },
        ],
      },
      {
        headingEn: 'WhatsApp / ChatXFlow',
        headingHi: 'WhatsApp / ChatXFlow',
        items: [
          { en: 'Settings include API Token (shown masked after save), phone, a fixed base URL, and optional Community link + opt-out App URL.', hi: 'Settings mein API Token (save ke baad masked dikhta hai), phone, fixed base URL, aur optional Community link + opt-out App URL hota hai.' },
          { en: 'Leaving any field blank does not overwrite the existing saved value.', hi: 'Koi field blank chhodne par existing saved value overwrite nahi hoti.' },
        ],
      },
      {
        headingEn: 'Shift Management',
        headingHi: 'Shift Management',
        items: [
          { en: 'Shift windows must cover the full 24 hours gap-free in a cyclic manner.', hi: 'Shift windows ko poore 24 ghante cyclic tarike se gap-free cover karna zaroori hai.' },
          { en: 'A time change only affects future shifts - an already-run shift\'s real record never changes.', hi: 'Time change sirf future shifts ko affect karta hai - jo shift already chal gayi uska real record kabhi change nahi hota.' },
          { en: 'A shift never auto-closes - manual "End Shift" action is always required.', hi: 'Shift kabhi auto-close nahi hoti - manual "End Shift" action hamesha zaroori hota hai.' },
        ],
      },
      {
        headingEn: 'Business Policy',
        headingHi: 'Business Policy',
        items: [
          { en: 'There are 3 Owner-set thresholds, all default blank with no guessed default: Indent HO-approval value threshold.', hi: '3 Owner-set thresholds hain, sab default blank hote hain, koi guessed default nahi: Indent HO-approval value threshold.' },
          { en: 'Second threshold: Cost/yield variance tolerance % - currently this is only stored, not yet enforced anywhere.', hi: 'Doosra threshold: Cost/yield variance tolerance % - abhi sirf stored hota hai, kahin bhi enforced nahi hota.' },
          { en: 'Third threshold: Near-expiry warning days - but expired or unknown-expiry items always block regardless of this setting.', hi: 'Teesra threshold: Near-expiry warning days - lekin expired ya unknown-expiry items hamesha block hote hain, isse setting se farak nahi padta.' },
        ],
      },
    ],
    example: null,
  },

  {
    id: 'ho-stock-review',
    titleEn: 'HO Stock Review',
    titleHi: 'HO Stock Review',
    icon: 'clipboard-check',
    summaryEn: 'A central queue where finalized shortage/quality-fail GRNs and submitted EOD Stock revisions land for HO to acknowledge or escalate.',
    summaryHi: 'Ek central queue jahan finalized shortage/quality-fail GRNs aur submitted EOD Stock revisions aati hain, jisse HO acknowledge ya escalate kar sake.',
    sections: [
      {
        headingEn: 'Queue Behaviour',
        headingHi: 'Queue Behaviour',
        items: [
          { en: 'Finalized GRNs with shortage/quality-fail issues, and submitted EOD Stock revisions, both land in this queue.', hi: 'Shortage/quality-fail issues wale finalized GRNs, aur submitted EOD Stock revisions, dono isi queue mein aate hain.' },
          { en: 'Each subject carries an "Exception: Yes/No" flag.', hi: 'Har subject ke saath "Exception: Yes/No" flag hota hai.' },
          { en: 'A reviewer clicks "Acknowledge", or writes a mandatory reason and clicks "Escalate".', hi: 'Reviewer "Acknowledge" click karta hai, ya mandatory reason likh kar "Escalate" click karta hai.' },
          { en: 'An actionKey makes the process idempotent - a duplicate retry does not create a duplicate event, it just confirms the replayed result.', hi: 'actionKey process ko idempotent banata hai - duplicate retry se duplicate event nahi banta, yeh sirf replayed result confirm karta hai.' },
          { en: 'Once a subject is Acknowledged, no further action can be taken on it - it shows "already acknowledged".', hi: 'Ek baar subject Acknowledged ho jaaye, toh usme koi further action nahi liya ja sakta - "already acknowledged" dikhta hai.' },
          { en: 'A maximum of 300 latest subjects load at once in the queue.', hi: 'Queue mein ek baar mein max 300 latest subjects hi load hote hain.' },
        ],
      },
    ],
    example: null,
  },

  {
    id: 'backend-ready-crm',
    titleEn: 'Backend-Ready (Not Yet in UI): Customer Membership & Loyalty',
    titleHi: 'Backend-Ready (Not Yet in UI): Customer Membership & Loyalty',
    icon: 'gift',
    summaryEn: 'These CRM/loyalty features are already fully built on the backend (API-only) but have no frontend UI yet - functionality exists, just not clickable yet.',
    summaryHi: 'Yeh CRM/loyalty features backend par poori tarah ban chuke hain (API-only) lekin abhi koi frontend UI nahi hai - functionality exist karti hai, sirf clickable nahi hai abhi.',
    sections: [
      {
        headingEn: 'Backend-Ready Features',
        headingHi: 'Backend-Ready Features',
        items: [
          { en: 'Customer Membership: phone-based idempotent register/merge, where only the registering Branch Manager/Owner can edit the record.', hi: 'Customer Membership: phone-based idempotent register/merge hai, jisme sirf registering Branch Manager/Owner us record ko edit kar sakta hai.' },
          { en: 'Customer QR Membership Card: issuing a new QR auto-revokes the old one, and the raw token shows only once - only its hash is stored thereafter.', hi: 'Customer QR Membership Card: naya QR issue karne se purana automatically revoke ho jaata hai, aur raw token sirf ek baar dikhta hai - uske baad sirf hash store hota hai.' },
          { en: 'Reward Points: TSh1000 spent earns 1 point, and 1 point redeems for TSh50, with a 12-month FIFO expiry on points.', hi: 'Reward Points: TSh1000 kharch karne par 1 point milta hai, aur 1 point TSh50 ke liye redeem hota hai, points ki 12-month FIFO expiry hoti hai.' },
          { en: 'A void/reverse claw-back function is already built but is not yet wired into the POS flow.', hi: 'Void/reverse ka claw-back function already built hai lekin abhi POS flow mein wired nahi hai.' },
        ],
      },
      {
        headingEn: 'Note',
        headingHi: 'Note',
        items: [
          { en: 'The App Downloads page (/app-downloads) is already a separate, approved, documented page and is not re-documented as part of this set.', hi: 'App Downloads page (/app-downloads) already ek separate, approved, documented page hai aur isko is set ke part mein dobara document nahi kiya gaya.' },
        ],
      },
    ],
    example: null,
  },
];

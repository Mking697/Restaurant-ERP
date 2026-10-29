export interface GuideExample {
  scenario: string;
  steps: readonly string[];
  result: string;
}
// Practice instructions, never business records or automatically submitted forms.
export const GUIDE_EXAMPLES: Record<string, { en: GuideExample; hinglish: GuideExample }> = {
  "/dashboard": {
  "en": {
    "scenario": "Compare real database sales and stock KPIs for permitted branches without changing records.",
    "steps": [
      "Open Owner Dashboard and select All branches (compiled) as Owner.",
      "Read Sales — Today, Inventory Value and overdue tasks; inspect missing vendor-rate notes.",
      "Choose an existing branch and compare its real detail, latest saved MIS and 14-day revenue trend.",
      "Review food-cost availability: current recipe/rate estimates only, with Prime Cost N/A. Return to the compiled view."
    ],
    "result": "Database-backed KPIs follow the selected scope. Missing rates are excluded; missing MIS/cash shows —. Avg. Food Cost is a mean of measured branch estimates, not historical COGS or Accounts P&L profit."
  },
  "hinglish": {
    "scenario": "Permitted branches ke real DB sales aur stock KPIs compare karo, records badle bina.",
    "steps": [
      "Owner se Owner Dashboard kholo aur All branches (compiled) chuno.",
      "Sales — Today, Inventory Value aur overdue tasks dekho; missing vendor-rate notes padho.",
      "Existing branch chuno aur real detail, latest saved MIS aur 14-day revenue trend compare karo.",
      "Food-cost availability dekho: sirf current recipe/rate estimate, Prime Cost N/A. Compiled view par laut aao."
    ],
    "result": "DB-backed KPIs selected scope ke hain. Missing rates exclude aur missing MIS/cash — hai. Avg. Food Cost measured branch estimates ka mean hai, historical COGS ya Accounts P&L profit nahi."
  }
},
  "/reports": {
  "en": {
    "scenario": "Inspect real sold-item food-cost estimates and export rows without assuming historical cost accuracy.",
    "steps": [
      "Open Reports, then Food Cost & Menu Margin; select a permitted branch.",
      "Choose Month (IST) containing actual sales and inspect sold qty, revenue and BOM cost per unit.",
      "Read missing recipe/rate and excluded-order reasons; incomplete totals must remain unavailable rather than zero.",
      "Export CSV and branch-summary CSV; compare them with the displayed rows."
    ],
    "result": "CSV exports database-backed report rows. Cost uses current recipes/vendor rates, not historical posted COGS; Reports does not connect Accounts P&L revenue/COGS. Empty periods show no invented rows."
  },
  "hinglish": {
    "scenario": "Real sold-item food-cost estimate dekho aur export karo; historical accuracy assume mat karo.",
    "steps": [
      "Reports ka Food Cost & Menu Margin kholo aur permitted branch chuno.",
      "Actual sales wala Month (IST) chuno; sold qty, revenue aur BOM cost per unit dekho.",
      "Missing recipe/rate aur excluded-order reasons padho; incomplete totals unavailable hain, zero nahi.",
      "Export CSV aur branch-summary CSV download karke displayed rows se milao."
    ],
    "result": "CSV real DB report rows deta hai. Cost current recipes/vendor rates ka hai, historical posted COGS nahi; Reports se Accounts P&L revenue/COGS connect nahi hote. Empty period mein invented rows nahi aate."
  }
},
  "/performance": {
  "en": {
    "scenario": "Compute a branch-level MIS snapshot only in QA; Compute MIS is a real database write, not an employee payroll action.",
    "steps": [
      "Open MIS Leaderboard for a QA branch with real task/variance/closed-shift data.",
      "Set Period start and Period end with end after start and a window no longer than 31 days.",
      "As Owner or CENTRAL_STORE_MGR, click Compute MIS; otherwise ask an authorized operator and view the saved snapshot.",
      "Compare On Time, Delay, Not Done and Components used, then Export CSV. Repeat computation updates the same branch/period snapshot."
    ],
    "result": "Saved branch scores persist after reload. Base weights 40/30/20/10 are re-normalized over measured components; missing data is not zero and empty branches are skipped. These are branch snapshots, not individual employee scores or cron-updated payroll."
  },
  "hinglish": {
    "scenario": "Sirf QA mein branch-level MIS snapshot compute karo; Compute MIS real DB write hai, employee payroll action nahi.",
    "steps": [
      "Real task/variance/closed-shift data wali QA branch ka MIS Leaderboard kholo.",
      "Period start/end set karo: end start ke baad aur window maximum 31 days ho.",
      "Owner ya CENTRAL_STORE_MGR se Compute MIS dabao; warna authorized operator se compute karwa kar saved snapshot dekho.",
      "On Time, Delay, Not Done aur Components used compare karke Export CSV lo. Repeat compute same branch/period snapshot update karta hai."
    ],
    "result": "Saved branch scores reload ke baad rehte hain. Base weights 40/30/20/10 measured components par re-normalize; missing data zero nahi, empty branch skip hai. Yeh branch snapshots hain, employee scores ya cron-updated payroll nahi."
  }
},
  "/tasks": {
  "en": {
    "scenario": "Delegate Clean fridge in a QA branch only: creation and completion write real database records.",
    "steps": [
      "With TASKS_DELEGATION, click Delegate Task; enter Clean fridge and select the QA branch if offered.",
      "Ask an authorized administrator for an existing same-branch user ID; type it in Assign to — user ID, choose HIGH and a future due time, then Create.",
      "Find the task and open Mark Done; submission is blocked without a non-empty Evidence attachment reference.",
      "Enter a non-sensitive evidence reference such as fridge-check.jpg and Mark Done; reload to verify saved DONE. This is text, not an uploaded file."
    ],
    "result": "Real task completion persists after page reload, not a page-local demo. No file bytes are uploaded and no reminders/cron run. Recurring definitions can be saved/paused, but do not automatically generate occurrences; recurring instance evidence is optional."
  },
  "hinglish": {
    "scenario": "Clean fridge sirf QA branch mein delegate karo: create aur completion real DB writes hain.",
    "steps": [
      "TASKS_DELEGATION se Delegate Task dabao; Clean fridge aur offered ho to QA branch chuno.",
      "Authorized admin se existing same-branch user ID lo; Assign to — user ID mein manually daalo, HIGH aur future due time chuno, phir Create.",
      "Task ka Mark Done kholo; non-empty Evidence attachment reference ke bina submission blocked hai.",
      "fridge-check.jpg jaisa non-sensitive reference daal kar Mark Done karo; reload par saved DONE dekho. Yeh text hai, uploaded file nahi."
    ],
    "result": "Real completion page reload ke baad persist hai, page-local demo nahi. File bytes upload aur reminders/cron nahi. Recurring definition save/pause hoti hai par automatic occurrences nahi bante; recurring instance evidence optional hai."
  }
},
  "/inventory": {
    en: {
      scenario: "Add a new practice ingredient with low opening stock in a permitted branch.",
      steps: ["Choose your permitted branch and click Add Item.", "Name: Practice Ingredient (use a new name); Unit: kg; Opening quantity: 9; Minimum: 20; Maximum: 60.", "Select the intended branch and save. Do this only in a test branch: this screen writes real database records.", "Check that the row shows 9 kg and Low stock. Reload the page to confirm it remains saved."],
      result: "This branch has a persisted stock row and a low-stock alert because 9 is below 20. Another branch's stock is unchanged. This is a real write, not a disposable page-only demo."
    },
    hinglish: {
      scenario: "Permitted branch mein kam opening stock wala naya practice ingredient add karo.",
      steps: ["Apni permitted branch chuno aur Add Item dabao.", "Name: Practice Ingredient (naya naam lo); Unit: kg; Opening quantity: 9; Minimum: 20; Maximum: 60.", "Sahi branch select karke save karo. Sirf test branch mein try karo: yeh screen real DB record likhti hai.", "Row mein 9 kg aur Low stock dekho. Reload karke confirm karo ki record save hai."],
      result: "Is branch ka stock save hoga aur 9, minimum 20 se kam hone ke kaaran alert aayega. Doosri branch ka stock nahi badlega. Yeh real DB write hai, page-only demo nahi."
    }
  },
  "/purchase": {
  "en": {
    "scenario": "Create a real general-purchase PO and saved GRN quality decision only in QA; do not practice on a business branch.",
    "steps": [
      "Click New Purchase and select General purchase in a QA branch.",
      "Select an existing vendor; enter Office chair repair and Amount ₹500, then Create (Step 1: Buy). A vendor must already exist; this form does not create one.",
      "In Purchase Orders, Upload Bill (optional) only marks the step, not an upload. Click Mark Material Received once and inspect the saved GRN.",
      "On this general GRN, open Quality Check, choose PASS and Save quality. Reload: PASS and all accepted/failed quantities remain saved, with no inventory posting. A store GRN needs PURCHASE_ORDER plus INVENTORY; PARTIAL takes a failed quantity per line and a failure note."
    ],
    "result": "PO, GRN, all-line quality decision and audit receipt persist after reload. Accepted store material stock posts atomically once; an exact replay cannot add it again. For an unknown outcome use Check saved quality or explicitly Replay exact request without changing the frozen inputs. Legacy GRNs without trusted origin/receipt require reconciliation. No vendor return/refund receivable, money receipt or journal is posted; bill/reference text is not a file upload."
  },
  "hinglish": {
    "scenario": "Sirf QA mein real general-purchase PO aur saved GRN quality decision banao; business branch par practice mat karo.",
    "steps": [
      "New Purchase dabao aur QA branch mein General purchase chuno.",
      "Existing vendor chuno; Office chair repair aur Amount ₹500 daal kar Create (Step 1: Buy) karo. Vendor pehle se hona chahiye; form vendor nahi banata.",
      "Purchase Orders mein Upload Bill (optional) sirf step mark hai, upload nahi. Mark Material Received ek baar dabao aur saved GRN dekho.",
      "Is general GRN ka Quality Check kholo, PASS chuno aur Save quality karo. Reload par PASS aur har line ki accepted/failed qty saved hai; inventory posting nahi. Store GRN ke liye PURCHASE_ORDER aur INVENTORY chahiye; PARTIAL mein har line ka failed qty aur failure note bharo."
    ],
    "result": "PO, GRN, har line ki quality aur audit receipt reload ke baad persist hain. Accepted store stock atomic tareeke se sirf ek baar post; exact replay stock dobara nahi badhata. Unknown outcome par frozen inputs badle bina Check saved quality ya explicitly Replay exact request karo. Trusted origin/receipt ke bina legacy GRN par reconciliation required hai. Vendor return/refund receivable, money receipt aur journal nahi bante; bill/reference text file upload nahi hai."
  }
},
  "/pos": {
    en: {
      scenario: "Use a QA test branch/account with POS_CASHIER to place a real UPI order after checking shift acceptance. This writes real orders and deducts stock; do not practice on a business branch.",
      steps: ["Open POS in the QA test branch. If shifts are configured and none is open, click Start Shift; if Accept Shift Handover appears, inspect amounts and Accept Handover. PENDING acceptance blocks sale.", "Click New Order: DINE_IN, Counter 1, Qty 2 of a sellable BOM-configured dish, Tender UPI. Leave customer WhatsApp blank to avoid a practice message.", "Confirm Order. A direct raw or produced Semi-FG shortage rejects the whole order with 409; stock the direct raw materials and produce required Semi-FG before trying again.", "Reload POS and inspect the order/receipt; verify direct raw and produced Semi-FG stock decreased by recipe quantity × 2, without deducting embedded raw again. In a separate Owner session, set this order to Owner-only with a 3-500 character reason and inspect audit history. Reload a staff session (including an accountant with official-report access): filtered orders and visible totals exclude it. Owner sees actual, visible and private totals. Restore visibility as Owner with a reason and verify staff can see it again."],
      result: "A real database order, KOT and receipt persist after reload. For a configured branch it belongs to the open accepted run and UPI is this run's receipt, not a payment transfer. Unconfigured branches retain legacy POS, but cannot real-close until shifts are configured. Owner-only is operational privacy, not sale deletion: stock, cash reconciliation and actual official records remain unchanged. Authorized OFFICIAL_SALES_REPORTS exports include it. Existing printouts/downloads cannot be revoked; Dashboard/Reports now use database-backed permission-scoped data, not mock demos; official exports remain separate actual-record disclosure."
    },
    hinglish: {
      scenario: "POS_CASHIER wale QA test branch/account mein shift acceptance check karke real UPI order lagao. Real orders save aur stock deduct hota hai; business branch par practice mat karo.",
      steps: ["QA test branch ka POS kholo. Shifts configured hon aur run open na ho to Start Shift karo; Accept Shift Handover dikhe to amounts check karke Accept Handover karo. PENDING acceptance par sale blocked hai.", "New Order: DINE_IN, Counter 1, BOM-configured sellable dish ki Qty 2, Tender UPI chuno. Practice message se bachne ke liye customer WhatsApp blank rakho.", "Confirm Order karo. Direct raw ya produced Semi-FG kam ho to poora order 409 se reject; direct raw stock bharo aur required Semi-FG pehle produce karo.", "POS reload karke order/receipt aur stock verify karo: direct raw aur produced Semi-FG recipe qty × 2 kam, embedded raw dobara deduct nahi. Alag Owner session se order Owner-only karo, 3-500 character reason do aur audit history dekho. Staff session (official-report access wala accountant bhi) reload kare: filtered orders aur visible totals se order exclude ho. Owner actual, visible aur private totals dekhega. Owner reason dekar visibility restore kare aur staff mein dobara order verify karo."],
      result: "Real database order, KOT aur receipt reload ke baad rehte hain. Configured branch mein order open accepted run ka hai aur UPI sirf is run ki receipt hai, payment transfer nahi. Unconfigured branch ka legacy POS chalta hai, par config ke bina real-close nahi. Owner-only operational privacy hai, sale delete nahi: stock, cash reconciliation aur actual official records nahi badalte. Authorized OFFICIAL_SALES_REPORTS export mein order rehta hai. Existing printouts/downloads revoke nahi hote; Dashboard/Reports ab DB-backed permission-scoped data hain, mock demo nahi; official exports alag actual-record disclosure hain."
    }
  },
  "/cash-drop": {
    en: {
      scenario: "Blind-close a configured QA test branch using a QA account with CASH_DROP. Real-write warning: End Shift & Handover persists the count and advances the run, not a disposable demo. Use an accepted incoming physical cash balance of ₹6,000 and only ₹550 completed CASH sales in this run; no float or safe withdrawal is modeled.",
      steps: ["Open Cash Drop for the QA branch. Configure windows first via an authorized Owner/Branch Admin; Start Shift if needed and accept any PENDING incoming handover before counting. Expected cash stays hidden until submission.", "For actual physical cash ₹6,550, enter 10 notes of ₹500, 5 of ₹200, 5 of ₹100, and Coins (₹) 50; all other note counts zero. Coins means total rupee value, not coin count.", "Click End Shift & Handover once. Check the submitted result: expected ₹6,550 equals accepted incoming ₹6,000 plus this run's CASH sales ₹550; counted ₹6,550 gives zero shortage/excess. Card/UPI/Other show only this run's completed receipts, never incoming electronic amounts.", "Reload saved shift status. The next run is open but PENDING acceptance: its cashier reviews the physical cash and receipt summary on POS or Cash Drop, then clicks Accept Handover before sale or closing. If the write outcome is unknown, ask an administrator to verify saved records instead of resubmitting."],
      result: "A real database cash-drop and handover preserve counted ₹6,550, expected ₹6,550 and zero variance; the ended run remains saved after reload. Accepted counted physical cash carries forward, including any actual shortage/excess. Card/UPI/Other are per-run receipts only, not money transfers. This is locally implemented, not a production-live claim. Owner-only orders remain in actual CASH sales and all tender receipts: reconciliation is unaffected. Closing/handover indirect totals can disclose true cash custody; this is intentional, not a guarantee that private sales cannot be inferred."
    },
    hinglish: {
      scenario: "CASH_DROP wale QA account se configured QA test branch blind-close karo. Real-write warning: End Shift & Handover count save karke run aage badhata hai, disposable demo nahi. Accepted incoming physical cash ₹6,000 aur is run mein sirf ₹550 completed CASH sales rakho; float ya safe withdrawal modeled nahi.",
      steps: ["QA branch ka Cash Drop kholo. Authorized Owner/Branch Admin se windows configure karwao; zarurat par Start Shift aur counting se pehle PENDING incoming handover accept karo. Submit tak expected cash hidden hai.", "Actual physical cash ₹6,550 ke liye ₹500 ke 10, ₹200 ke 5, ₹100 ke 5 notes aur Coins (₹) 50 bharo; baaki note counts zero. Coins ka matlab total rupee value hai, coin count nahi.", "End Shift & Handover ek baar dabao. Submitted result mein expected ₹6,550 = accepted incoming ₹6,000 + is run ki CASH sales ₹550; counted ₹6,550 par zero shortage/excess. Card/UPI/Other sirf is run ki completed receipts hain, incoming electronic amounts nahi.", "Saved shift status reload karo. Next run open hai par PENDING acceptance: cashier POS ya Cash Drop par physical cash aur receipt summary check karke Accept Handover kare, phir sale/close chalega. Write outcome unknown ho to admin se saved records verify karwao, resubmit mat karo."],
      result: "Real database cash-drop aur handover mein counted ₹6,550, expected ₹6,550 aur zero variance save rehte hain; ended run reload ke baad bhi rehta hai. Accepted counted physical cash, actual shortage/excess samet, aage carry hota hai. Card/UPI/Other per-run receipts hain, money transfer nahi. Yeh locally implemented hai, production-live claim nahi. Owner-only orders actual CASH sales aur har tender receipt mein rehte hain; reconciliation nahi badalti. Closing/handover ke indirect totals true cash custody disclose kar sakte hain; yeh intentional hai, private sale infer na hone ki guarantee nahi."
    }
  },
  "/accounts": {
  "en": {
    "scenario": "Enter a real ₹5,000 branch rent expense and inspect its month total. Practice only in a test branch.",
    "steps": [
      "Open Accounts, select a test branch and the intended month, then choose Expenses.",
      "Add expense: category RENT, date within that month, amount ₹5,000, description Test branch rent, and your bill/reference.",
      "Save, reload and find the posted record. Open P&L for the same branch/month and check Rent.",
      "If this was a practice mistake, Void the expense with a reason; retain its history rather than entering an offsetting duplicate."
    ],
    "result": "A real database expense increases Rent by ₹5,000 and a void excludes it from totals. Finalized payroll contributes Labor Cost separately. P&L Revenue/COGS and gross/net profit remain disconnected despite Reports current-recipe/rate cost estimates; no sample profit is mixed in. Petty Cash and manual Aggregator settlements now persist with server-computed balances/payouts; they do not auto-post journals. Balance Sheet reads shared HQ accounts plus branch journals; chart seeding is Owner-only, not automatic on read."
  },
  "hinglish": {
    "scenario": "Real ₹5,000 branch rent daalo aur month total dekho. Practice sirf test branch mein karo.",
    "steps": [
      "Accounts kholo, test branch aur sahi month chuno, phir Expenses kholo.",
      "Expense add karo: category RENT, us month ki date, amount ₹5,000, description Test branch rent aur bill/reference.",
      "Save, reload aur posted record dekho. Same branch/month ka P&L kholkar Rent check karo.",
      "Practice mein galti hui ho to reason dekar Void karo; duplicate offset entry mat daalo, history rakho."
    ],
    "result": "Real DB expense se Rent ₹5,000 badhta hai; Void par total se exclude hota hai. Finalized payroll ki Labor Cost alag aati hai. Reports ke current recipe/rate estimates ke bawajood P&L Revenue/COGS aur gross/net profit disconnected hain; sample profit mix nahi hota. Petty Cash aur manual Aggregator settlements ab server-computed balance/payout ke saath persist hain, auto-journal nahi. Balance Sheet shared HQ accounts aur branch journals padhta hai; chart seeding Owner-only hai, read par auto nahi."
  }
},
  "/workforce": {
  "en": {
    "scenario": "Calculate September salary for one monthly employee and one daily-wage employee in a test branch. Prerequisites: link employee A to a same-branch login with LEAVE_SELF; the attendance marker needs ATTENDANCE, and a DIFFERENT reviewer needs LEAVE_APPROVAL. Neither the linked employee nor the request submitter may review, including Owner.",
    "steps": [
      "With PAYROLL access, create ON_ROLL employee A at ₹30,000 per month and OFF_ROLL employee B at ₹800 per day, joined on September 1. Use a completed September, not a future month.",
      "Mark A Present for 29 days; A applies one day leave and a different authorized manager approves it as PAID. No Weekly Off is assumed.",
      "For B, mark 20 full Present days and one Half Day; mark the other eligible days Absent or cover them with approved unpaid leave. Resolve every missing date.",
      "Preview September: A ₹30,000 and B ₹16,400. Finalize the test branch only after checking amounts; repeated finalization must not duplicate salary."
    ],
    "result": "The finalized database snapshots total ₹46,400 and supply P&L Labor Cost once. They do not send bank payments. Final attendance/leave cannot be rewritten; rate changes require a future month effective date. Pending/rejected leave gives no pay credit."
  },
  "hinglish": {
    "scenario": "Test branch mein ek monthly aur ek daily-wage employee ki September salary nikalo. Pehle A ko same-branch login se link karo aur LEAVE_SELF do; attendance mark karne wale ke paas ATTENDANCE aur ALAG reviewer ke paas LEAVE_APPROVAL ho. Linked employee ya request submitter khud review nahi kar sakte, Owner bhi nahi.",
    "steps": [
      "PAYROLL access se A ko ON_ROLL ₹30,000 monthly aur B ko OFF_ROLL ₹800 daily par September 1 se banao. Completed September use karo, future month nahi.",
      "A ke 29 Present mark karo; A ek din leave apply kare aur doosra authorized manager PAID approve kare. Weekly Off assume nahi hoga.",
      "B ke 20 full Present aur ek Half Day mark karo; baaki eligible din Absent ya approved unpaid leave se cover karo. Har missing date resolve karo.",
      "September preview mein A ₹30,000 aur B ₹16,400 check karo. Amounts dekhkar sirf test branch finalize karo; repeat finalization salary duplicate nahi karegi."
    ],
    "result": "Real finalized snapshots ka total ₹46,400 hai aur P&L Labor Cost mein ek baar aata hai. Bank payment send nahi hoti. Final attendance/leave rewrite nahi hoti; rate change future month se hota hai. Pending/rejected leave se pay credit nahi milta."
  }
},
  "/admin/users": {
    en: {
      scenario: "Give a new cashier access only to POS and Cash Drop in a test branch.",
      steps: ["As Owner or an authorized Branch Admin, click New User. Use a test employee's name and an unused 10-digit mobile number you control.", "Set a new private password of at least 12 characters, Role: CASHIER, and the intended branch. Never copy a password from a guide or chat.", "Select only POS_CASHIER and CASH_DROP, then save. A Branch Admin can grant only permissions they already hold.", "Sign in separately as the test user. The sidebar and Guide Book should show only permitted modules; direct forbidden URLs remain denied."],
      result: "A real account is saved with branch/module restrictions. This is not a page-only demo; remove or disable the practice account after testing."
    },
    hinglish: {
      scenario: "Test branch ke naye cashier ko sirf POS aur Cash Drop access do.",
      steps: ["Owner ya authorized Branch Admin se New User dabao. Test employee ka naam aur apne control wala unused 10-digit mobile number do.", "Kam se kam 12-character ka naya private password set karo, Role: CASHIER aur sahi branch chuno. Guide/chat se password copy mat karo.", "Sirf POS_CASHIER aur CASH_DROP tick karke save karo. Branch Admin wahi grants de sakta hai jo khud uske paas hain.", "Alag session mein test user login karo. Sidebar aur Guide Book mein sirf permitted modules dikhne chahiye; forbidden direct URLs denied rahengi."],
      result: "Branch/module restrictions wala real account save hota hai. Yeh page-only demo nahi; testing ke baad practice account disable/remove karo."
    }
  },
  "/admin/branches": {
    en: {
      scenario: "Owner adds a new practice branch without copying another branch's data.",
      steps: ["As Owner, open Branches and click New Branch.", "Code: PRACTICE7; Name: Practice Vasant Kunj; Address: Test address. Use a unique code.", "Enter the branch's actual latitude/longitude and a geofence radius of 50 metres, then Save. Use a test branch rather than altering a real one.", "Reload and find the new branch. Check the branch dropdown in Users & Access."],
      result: "A real empty branch is saved and becomes selectable. Menus, recipes, users and stock are not cloned. Branch Admin can edit only their own branch and cannot create this new branch."
    },
    hinglish: {
      scenario: "Owner doosri branch ka data copy kiye bina nayi practice branch banaye.",
      steps: ["Owner se Branches kholo aur New Branch dabao.", "Code: PRACTICE7; Name: Practice Vasant Kunj; Address: Test address. Unique code lo.", "Branch ke actual latitude/longitude aur 50 metre geofence radius bharo, phir Save karo. Real branch badalne ke bajaye test branch use karo.", "Reload par nayi branch dekho aur Users & Access ke branch dropdown mein check karo."],
      result: "Real, khali branch save hogi aur selectable banegi. Menu, recipes, users ya stock clone nahi hote. Branch Admin sirf apni branch edit kar sakta hai; yeh nayi branch create nahi kar sakta."
    }
  },
  "/admin/settings/shifts": {
    en: {
      scenario: "Configure and cycle shifts only in an isolated QA test branch/account. Owner selects the QA branch, or a Branch Admin (BRANCH_MANAGER) with SHIFT_MANAGEMENT configures their own QA branch. The QA cashier needs CASH_DROP and POS_CASHIER. Real-write warning: configuration, starts, closes and acceptance persist; these are not production-live verification steps.",
      steps: ["Open /admin/settings/shifts, select the QA branch, and use English (default) or optionally Hinglish. Set Shift A 00:00-12:00 and Add Shift for Shift B 12:00-00:00, then Save Shifts. The 1-12 windows must tile all 24h in IST, with no gaps or overlaps.", "When no run is open, click Start Shift and Reload saved status. The server chooses the current window. Scheduled end is a reminder only: neither start nor close happens automatically at the clock time.", "Using the QA cashier with CASH_DROP, open Cash Drop, accept any pending incoming handover, count physical cash and manually click End Shift & Handover once. The ended run is preserved and the next run opens with a PENDING handover.", "Open POS as the next QA cashier: sale is blocked until amounts are reviewed and Accept Handover is clicked. For a single-shift cycle, save one 00:00-00:00 window; closing still opens a fresh run requiring acceptance. Reload status; changed windows never rewrite historical run times or delete old definition rows."],
      result: "Real PostgreSQL definitions, runs and handovers persist. Only Owner or a granted Branch Admin can configure, and Branch Admin is own-branch only. Unconfigured branches retain legacy POS but cannot real-close. Accepted incoming physical cash plus current CASH sales determines expected closing; Card/UPI/Other are per-run receipts, not transfers. Initial cash float and safe withdrawals are not modeled."
    },
    hinglish: {
      scenario: "Shifts sirf isolated QA test branch/account mein configure aur cycle karo. Owner QA branch chune, ya SHIFT_MANAGEMENT wala Branch Admin (BRANCH_MANAGER) apni QA branch configure kare. QA cashier ko CASH_DROP aur POS_CASHIER chahiye. Real-write warning: config, start, close aur acceptance persist hote hain; yeh production-live verification steps nahi.",
      steps: ["/admin/settings/shifts kholo, QA branch chuno aur English (default) ya optional Hinglish use karo. Shift A 00:00-12:00 aur Add Shift se Shift B 12:00-00:00 set karke Save Shifts karo. 1-12 windows IST mein pura 24h cover karein, gap/overlap nahi.", "Run open na ho to Start Shift aur Reload saved status dabao. Server current window chunta hai. Scheduled end sirf reminder hai: clock time par start ya close automatic nahi hota.", "CASH_DROP wale QA cashier se Cash Drop kholo, pending incoming handover accept karo, physical cash gino aur manually End Shift & Handover ek baar dabao. Ended run preserve hota hai aur next run PENDING handover ke saath khulta hai.", "Next QA cashier se POS kholo: amounts review aur Accept Handover tak sale blocked hai. Single-shift cycle ke liye ek 00:00-00:00 window save karo; close par phir naya run acceptance maangega. Status reload karo; windows change se historical run times rewrite ya old definition rows delete nahi hote."],
      result: "Real PostgreSQL definitions, runs aur handovers persist hain. Sirf Owner ya granted Branch Admin configure karega; Branch Admin apni branch tak limited hai. Unconfigured branch ka legacy POS chalta hai par real-close nahi. Accepted incoming physical cash + current CASH sales expected closing hai; Card/UPI/Other per-run receipts hain, transfers nahi. Initial cash float aur safe withdrawals modeled nahi hain."
    }
  },
  "/admin/settings/whatsapp": {
    en: {
      scenario: "Owner connects provider configuration for a WhatsApp number they control.",
      steps: ["In your own ChatXFlow account, connect your WhatsApp number through its QR flow.", "As Owner, open WhatsApp Settings and paste the actual Developer API Token privately into the token field. Never paste it into chat or this guide.", "Set your WhatsApp phone number, leave the approved base URL as https://chatxflow.online and click Save Settings.", "Reload to confirm the saved configuration. When editing later, leave the token blank to retain the existing token."],
      result: "Provider configuration is saved in the real database and token display is masked. Saving alone does not send a message or enable reminders, approvals, webhooks or the 8AM summary."
    },
    hinglish: {
      scenario: "Owner apne control wale WhatsApp number ki provider settings connect kare.",
      steps: ["Apne ChatXFlow account mein QR flow se WhatsApp number connect karo.", "Owner se WhatsApp Settings kholo aur actual Developer API Token privately token field mein paste karo. Chat ya guide mein kabhi paste mat karo.", "Apna WhatsApp phone set karo, approved Base URL https://chatxflow.online hi rakho aur Save Settings dabao.", "Reload karke saved configuration confirm karo. Baad mein token blank chhodne par existing token retain hota hai."],
      result: "Provider settings real DB mein save hoti hain aur token masked dikhta hai. Sirf Save se message send, reminders, approvals, webhooks ya 8AM summary enable nahi hote."
    }
  },
  "/menu": {
    en: {
      scenario: "Build a 2-level recipe: a Semi-FG gravy made from raw materials, a dish that uses that gravy, then produce real Semi-FG stock before selling it.",
      steps: ["Recipe Builder: name Practice Gravy, mark it Semi-FG, set branch, output unit kg, add one raw-material ingredient row (e.g. Tomato, batch quantity 0.3) and Save — this is one atomic save of the dish + its whole recipe.", "Recipe Builder again: name Practice Curry (sellable dish), add a raw-material row plus a Semi-FG row picking Practice Gravy, and Save.", "Open Practice Curry, click Preview stock & cost — confirm it shows the theoretical raw-cost rollup AND separately flags Practice Gravy as required-but-unavailable (shortage), since no Semi-FG stock has been produced yet.", "In the Semi-FG production & stock panel, pick Practice Gravy, enter an output quantity and Record production — confirm Practice Gravy's stock on hand increases; Preview stock & cost on Practice Curry now shows it available, not a shortage."],
      result: "A real recipe tree is saved in Postgres, with explicit output units and one atomic save per recipe. A Semi-FG only becomes real sellable stock after it is actually produced — production consumes its own raw ingredients once; selling the dish that references it then consumes the produced Semi-FG stock directly, never that raw ingredient again."
    },
    hinglish: {
      scenario: "2-level recipe banao: raw material se Semi-FG gravy, us gravy ko use karne wali dish, phir bechne se pehle real Semi-FG stock produce karo.",
      steps: ["Recipe Builder: naam Practice Gravy, Semi-FG mark karo, branch aur output unit kg set karo, ek raw-material ingredient row add karo (jaise Tomato, batch quantity 0.3) aur Save karo — yeh dish + poori recipe ka ek atomic save hai.", "Recipe Builder dobara: naam Practice Curry (sellable dish), ek raw-material row aur ek Semi-FG row (Practice Gravy chun kar) add karo, Save karo.", "Practice Curry kholo, Preview stock & cost dabao — confirm karo theoretical raw-cost rollup ke saath Practice Gravy ko required-but-unavailable (shortage) flag kiya gaya hai, kyunki abhi koi Semi-FG stock produce nahi hua.", "Semi-FG production & stock panel mein Practice Gravy chuno, output quantity daalo aur Record production dabao — confirm karo Practice Gravy ka stock badh gaya; ab Practice Curry par Preview stock & cost usey available dikhayega, shortage nahi."],
      result: "Real recipe tree Postgres mein save hota hai, explicit output units aur har recipe ka ek atomic save ke saath. Semi-FG tabhi real sellable stock banta hai jab usey actually produce kiya jaaye — production uska apna raw ingredient ek baar consume karta hai; us Semi-FG ko reference karne wali dish bechne par phir produced Semi-FG stock directly consume hota hai, woh raw ingredient dobara kabhi nahi."
    }
  },
  "/warehouse": {
    en: {
      scenario: "Dispatch stock from Central to a branch, then confirm receipt with a deliberate shortfall.",
      steps: ["As Owner, open Warehouse & Transfers and create a CENTRAL warehouse (if none exists) and a BRANCH warehouse for your test branch.", "Click Dispatch Transfer: From Central, To your test branch, pick a raw material, Qty dispatched: 10.", "Check Inventory for that branch — stock has NOT changed yet (dispatch is a paper record only).", "Click Receive on the DISPATCHED row and enter Qty received: 9. Confirm the branch's Inventory now shows +9, and the transfer shows a 1-unit shortfall."],
      result: "A real stock_transfers row moves DISPATCHED → RECEIVED, and branch inventory_stock only changes at the Receive step — proving dispatch alone never touches live stock, and variance is tracked, not silently dropped."
    },
    hinglish: {
      scenario: "Central se branch ko stock dispatch karo, phir jaan-boojh kar shortfall ke saath receive confirm karo.",
      steps: ["Owner se Warehouse & Transfers kholo aur CENTRAL warehouse (agar na ho) + apni test branch ka BRANCH warehouse banao.", "Dispatch Transfer dabao: From Central, To apni test branch, koi raw material chuno, Qty dispatched: 10.", "Us branch ka Inventory check karo — stock abhi NAHI badla (dispatch sirf paper record hai).", "DISPATCHED row par Receive dabao aur Qty received: 9 bharo. Confirm karo branch ki Inventory ab +9 dikhti hai, aur transfer mein 1-unit shortfall dikhta hai."],
      result: "Real stock_transfers row DISPATCHED → RECEIVED move hoti hai, aur branch inventory_stock sirf Receive step par badalti hai — proof ki dispatch akela kabhi live stock nahi chhuta, aur variance track hoti hai, silently drop nahi hoti."
    }
  },
  "/accounts-gstr": {
    en: {
      scenario: "In an isolated QA test branch, compare actual GSTR-1 HSN records with filtered staff POS totals. Use Owner or an explicit OFFICIAL_SALES_REPORTS grant; POS_CASHIER alone is insufficient and existing users receive no automatic grant.",
      steps: ["With POS_CASHIER, place 1-2 real POS orders only in the QA branch with branch/company GST state codes configured. As Owner, mark one Owner-only with a reason; the sale and its official record still exist.", "As Owner or with explicit OFFICIAL_SALES_REPORTS, open Accounts and GSTR Export, set From/To to the QA order date and select that branch. A POS_CASHIER-only session must not receive official-report access.", "Click Generate and review actual HSN-wise rate, qty, taxable value, CGST/SGST/IGST and total, including the Owner-only order. Do not substitute filtered staff POS totals.", "Click Export CSV and open the downloaded file; confirm its numbers match the on-screen table."],
      result: "The real CSV matches actual completed orders in the selected date/branch scope, including Owner-only orders, not filtered staff totals or mock numbers. Missing GST configuration is counted as excluded, not presented as compliant. Visibility does not remove official records or revoke existing printouts/downloads; Dashboard/Reports now use database-backed permission-scoped data, not mock demos; official exports remain separate actual-record disclosure."
    },
    hinglish: {
      scenario: "Isolated QA test branch mein actual GSTR-1 HSN records aur filtered staff POS totals compare karo. Owner ya explicit OFFICIAL_SALES_REPORTS grant chahiye; sirf POS_CASHIER kaafi nahi aur existing users ko auto-grant nahi milta.",
      steps: ["POS_CASHIER se sirf QA branch mein branch/company GST state codes set karke 1-2 real POS orders lagao. Owner se ek order reason dekar Owner-only karo; sale aur official record rehte hain.", "Owner ya explicit OFFICIAL_SALES_REPORTS se Accounts ka GSTR Export kholo, From/To QA order ki date aur wahi branch chuno. Sirf POS_CASHIER wale session ko official-report access nahi milna chahiye.", "Generate dabao aur actual HSN-wise rate, qty, taxable value, CGST/SGST/IGST aur total dekho, Owner-only order samet. Filtered staff POS totals ko official figures mat maano.", "Export CSV dabao aur downloaded file kholo; confirm numbers on-screen table se milte hain."],
      result: "Real CSV selected date/branch ke actual completed orders se banta hai, Owner-only orders samet; filtered staff totals ya mock numbers se nahi. Missing GST configuration wale orders excluded count mein hain, compliant nahi. Visibility se official records remove ya existing printouts/downloads revoke nahi hote; Dashboard/Reports ab DB-backed permission-scoped data hain, mock demo nahi; official exports alag actual-record disclosure hain."
    }
  }
};

export function getGuideExample(route: string, language: "en" | "hinglish"): GuideExample | undefined {
  return GUIDE_EXAMPLES[route]?.[language];
}

export interface GuideExample {
  scenario: string;
  steps: readonly string[];
  result: string;
}
// Practice instructions, never business records or automatically submitted forms.
export const GUIDE_EXAMPLES: Record<string, { en: GuideExample; hinglish: GuideExample }> = {
  "/dashboard": {
    en: {
      scenario: "You own six branches and want to compare today's sample performance.",
      steps: ["Open Owner Dashboard and select All branches (compiled).", "Read Total Sales and Total Inventory Value, then scroll to the branch comparison table.", "Select Connaught Place in the branch selector and compare its displayed KPIs with the compiled view.", "Return to All branches. No sales or inventory records are changed by viewing these charts."],
      result: "The displayed sample KPIs change with the branch selection. They do not become live accounting figures: this dashboard is a demo, even though Inventory uses the database."
    },
    hinglish: {
      scenario: "Aapki chhe branches hain aur aaj ki sample performance compare karni hai.",
      steps: ["Owner Dashboard kholo aur All branches (compiled) chuno.", "Total Sales aur Total Inventory Value dekho, phir neeche branch comparison table padho.", "Branch selector mein Connaught Place chuno aur uske KPIs ko compiled view se compare karo.", "Wapas All branches chuno. Charts dekhne se sales ya inventory records nahi badalte."],
      result: "Branch selection ke saath sample KPIs badlenge. Yeh live accounting numbers nahi hain: Inventory DB-backed hone par bhi dashboard abhi demo hai."
    }
  },
  "/reports": {
    en: {
      scenario: "You want to review sample dish costs and share the report in a spreadsheet.",
      steps: ["Open Reports, then the Food Cost & Menu Margin report card.", "Pick a sample dish row and compare its selling price with ingredient cost and margin.", "Click Export CSV and open the downloaded file in Excel or another spreadsheet app.", "Compare the exported rows with the report table. Do not use this sample report to change actual menu prices."],
      result: "A CSV containing the report's sample rows is downloaded. Exporting does not create or change a real purchase, recipe or financial record."
    },
    hinglish: {
      scenario: "Sample dish cost dekhni hai aur report spreadsheet mein share karni hai.",
      steps: ["Reports kholo, phir Food Cost & Menu Margin card kholo.", "Kisi sample dish ka selling price, ingredient cost aur margin compare karo.", "Export CSV dabao aur downloaded file Excel ya kisi spreadsheet app mein kholo.", "Exported rows ko report table se milao. Sample report se asli menu prices mat badlo."],
      result: "Report ki sample rows wali CSV download hogi. Export se real purchase, recipe ya financial record create/change nahi hota."
    }
  },
  "/performance": {
    en: {
      scenario: "You want to understand why one sample employee ranks above another.",
      steps: ["Open MIS Leaderboard and find Rahul Sharma's sample row.", "Read On Time, Delay and Not Done counts together, not just the rank.", "Compare his score with another employee and the chart. The shown task/delegation/variance/cashier weights are 40/30/20/10.", "Use Export CSV to review the sample ranking outside the app."],
      result: "You can explain the displayed ranking and counts. These are illustrative scores, not a live performance assessment or an automatically calculated payroll result."
    },
    hinglish: {
      scenario: "Samajhna hai ki ek sample employee ki ranking doosre se upar kyun hai.",
      steps: ["MIS Leaderboard kholo aur Rahul Sharma ki sample row dekho.", "Sirf rank nahi, On Time, Delay aur Not Done counts saath mein padho.", "Doosre employee aur chart se score compare karo. Task/delegation/variance/cashier weights 40/30/20/10 dikhaye gaye hain.", "App ke bahar ranking dekhne ke liye Export CSV use karo."],
      result: "Displayed ranking aur counts samajh aayenge. Yeh sample scores hain, live employee assessment ya automatic payroll result nahi."
    }
  },
  "/tasks": {
    en: {
      scenario: "Assign a one-time fridge-cleaning task and demonstrate the evidence requirement.",
      steps: ["Click Delegate Task. Title: Clean fridge; Branch: Connaught Place; Assign to: Rahul Sharma.", "Choose HIGH priority and a future due date/time, then create the task.", "Find the new row and click Mark Done. Without selecting an attachment, submission stays blocked.", "Select a non-sensitive sample image and click Mark Done. For a recurring/checklist task, evidence selection is optional instead."],
      result: "The demo row changes to Done. Only the selected file name is kept in page state; no file is uploaded, no reminder is scheduled, and reloading resets the demo changes."
    },
    hinglish: {
      scenario: "Fridge saaf karne ka one-time task do aur evidence rule samjho.",
      steps: ["Delegate Task dabao. Title: Clean fridge; Branch: Connaught Place; Assign to: Rahul Sharma.", "HIGH priority aur future due date/time chuno, phir task banao.", "Nayi row ka Mark Done dabao. Attachment select kiye bina submit blocked rahega.", "Koi non-sensitive sample image select karo aur Mark Done dabao. Recurring/checklist task mein evidence optional hai."],
      result: "Demo row Done ho jaayegi. Sirf file ka naam page state mein rehta hai; file upload, reminder schedule ya DB save nahi hota. Reload par demo changes reset hote hain."
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
    en: {
      scenario: "Try buying a general item without a store indent, then inspect the quality-check flow.",
      steps: ["Click New Purchase and select General purchase.", "Branch: Connaught Place; Vendor: Practice Repairs; Item description: Office chair repair; Amount: ₹500. Click Create (Step 1: Buy).", "In Purchase Orders, try the optional bill step and then Mark Material Received. Inspect the resulting demo GRN.", "Open a pending GRN's Quality Check. Try Pass, or Partial/Fail with a failure quantity in the displayed unit."],
      result: "The local PO/GRN progress and quality result change. No live inventory, vendor return, refund or Accounts entry is posted. Reloading restores the sample data."
    },
    hinglish: {
      scenario: "Store indent ke bina general item purchase try karo, phir quality check dekho.",
      steps: ["New Purchase dabao aur General purchase chuno.", "Branch: Connaught Place; Vendor: Practice Repairs; Item description: Office chair repair; Amount: ₹500. Create (Step 1: Buy) dabao.", "Purchase Orders mein optional bill step aur phir Mark Material Received try karo. Bani hui demo GRN dekho.", "Pending GRN ka Quality Check kholo. Pass try karo, ya displayed unit mein fail quantity bharke Partial/Fail chuno."],
      result: "Local PO/GRN progress aur quality result badlega. Live stock, vendor return, refund ya Accounts posting nahi hogi. Reload par sample data wapas aayega."
    }
  },
  "/pos": {
    en: {
      scenario: "Place a real dine-in order for a dish with a configured BOM, paid by UPI, in a test branch.",
      steps: ["Open POS / Cashier, select a test branch and click New Order.", "Channel: DINE_IN; Counter: Counter 1; pick a sellable dish that has at least one BOM line; Qty: 2; Tender: UPI.", "Click Confirm Order. If branch raw material stock is below what the BOM needs, the whole order is rejected with a 409 — top up Inventory first.", "Open Inventory for that branch and confirm the raw material quantity actually decreased by the BOM's recipe amount × 2."],
      result: "A real pos_orders row is saved with a KOT (item+qty, no price) and a receipt (price+GST if configured). Branch inventory_stock is really deducted — this is not a page-only demo. Reloading does not undo it."
    },
    hinglish: {
      scenario: "Test branch mein BOM-configured dish ka real dine-in order UPI se lagao.",
      steps: ["POS / Cashier kholo, test branch chuno aur New Order dabao.", "Channel: DINE_IN; Counter: Counter 1; koi sellable dish chuno jiska kam se kam ek BOM line ho; Qty: 2; Tender: UPI.", "Confirm Order dabao. Agar branch ka raw material BOM ki zarurat se kam hai, poora order 409 ke saath reject hoga — pehle Inventory top up karo.", "Us branch ka Inventory kholo aur confirm karo raw material qty BOM ke recipe amount × 2 jitni kam hui."],
      result: "Real pos_orders row save hoti hai KOT (item+qty, price nahi) aur receipt (price+GST agar configured) ke saath. Branch inventory_stock real mein minus hoti hai — yeh page-only demo nahi. Reload isse undo nahi karta."
    }
  },
  "/cash-drop": {
    en: {
      scenario: "Count an illustrative shift-closing cash total of ₹6,550.",
      steps: ["Enter 10 notes in the ₹500 field: ₹5,000.", "Enter 5 notes in ₹200 and 5 notes in ₹100: another ₹1,500. Leave other denominations at zero.", "Enter ₹50 as the total value of coins, not the number of coins.", "Confirm the total is ₹6,550 and click Submit Cash Drop."],
      result: "The page displays the counted ₹6,550. This demo does not fetch expected cash, calculate shortage/excess or save a real shift-closing entry."
    },
    hinglish: {
      scenario: "Shift closing ka sample cash ₹6,550 gino.",
      steps: ["₹500 field mein 10 notes bharo: ₹5,000.", "₹200 mein 5 aur ₹100 mein 5 notes bharo: aur ₹1,500. Baaki denominations zero rakho.", "Coins mein ₹50 total value bharo, coins ki ginti nahi.", "Total ₹6,550 confirm karke Submit Cash Drop dabao."],
      result: "Page par counted ₹6,550 dikhega. Demo expected cash fetch, shortage/excess calculation ya real shift-closing entry save nahi karta."
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
    "result": "A real database expense increases Rent by ₹5,000 and a void excludes it from totals. Finalized payroll contributes Labor Cost separately. Revenue/COGS and gross/net profit remain unavailable until sales/stock posting are connected; no sample profit is mixed in."
  },
  "hinglish": {
    "scenario": "Real ₹5,000 branch rent daalo aur month total dekho. Practice sirf test branch mein karo.",
    "steps": [
      "Accounts kholo, test branch aur sahi month chuno, phir Expenses kholo.",
      "Expense add karo: category RENT, us month ki date, amount ₹5,000, description Test branch rent aur bill/reference.",
      "Save, reload aur posted record dekho. Same branch/month ka P&L kholkar Rent check karo.",
      "Practice mein galti hui ho to reason dekar Void karo; duplicate offset entry mat daalo, history rakho."
    ],
    "result": "Real DB expense se Rent ₹5,000 badhta hai; Void par total se exclude hota hai. Finalized payroll ki Labor Cost alag aati hai. Sales/stock posting connect hone tak Revenue/COGS aur gross/net profit unavailable hain; sample profit mix nahi hota."
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
  "/gst-export": {
    en: {
      scenario: "Pull a GSTR-1 HSN summary for today covering orders you just placed via POS.",
      steps: ["Place 1-2 real POS orders in a GST-configured branch (branch and company GST state codes both set).", "Open GSTR-1 HSN Summary Export, set From/To to today, and optionally scope to that branch.", "Click Generate — review the HSN-wise table: rate, qty, taxable value, CGST/SGST/IGST and total.", "Click Export CSV and open the downloaded file; confirm its numbers match the on-screen table."],
      result: "A real CSV is generated purely from the orders you just placed — no mock numbers. Orders from a branch without GST configured would show up in 'excluded' count instead of silently appearing as compliant."
    },
    hinglish: {
      scenario: "Aaj POS se lagaye orders ka GSTR-1 HSN summary nikaalo.",
      steps: ["GST-configured branch mein (branch aur company dono ke GST state code set) 1-2 real POS orders lagao.", "GSTR-1 HSN Summary Export kholo, From/To aaj ki date set karo, optional us branch tak scope karo.", "Generate dabao — HSN-wise table dekho: rate, qty, taxable value, CGST/SGST/IGST aur total.", "Export CSV dabao aur downloaded file kholo; confirm numbers on-screen table se milte hain."],
      result: "Real CSV sirf abhi lagaye orders se banta hai — koi mock numbers nahi. GST-unconfigured branch ke orders 'excluded' count mein dikhenge, compliant jaisa silently nahi."
    }
  }
};

export function getGuideExample(route: string, language: "en" | "hinglish"): GuideExample | undefined {
  return GUIDE_EXAMPLES[route]?.[language];
}

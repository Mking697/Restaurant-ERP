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
      scenario: "Create an illustrative dine-in order paid by UPI.",
      steps: ["Open POS / Cashier and click New Order.", "Branch: Connaught Place; Channel: DINE_IN; Table: T-12.", "Amount: ₹1,840; Tender: UPI. Click Create Order.", "Find the newly added order row and compare its branch, table, amount and tender."],
      result: "A demo order row appears on this page. It is not a bill, tax invoice or payment receipt; no money is collected and reloading resets the row."
    },
    hinglish: {
      scenario: "UPI tender wala sample dine-in order banao.",
      steps: ["POS / Cashier kholo aur New Order dabao.", "Branch: Connaught Place; Channel: DINE_IN; Table: T-12.", "Amount: ₹1,840; Tender: UPI. Create Order dabao.", "Nayi row mein branch, table, amount aur tender milao."],
      result: "Page par demo order row aayegi. Yeh bill, tax invoice ya payment receipt nahi hai; paisa collect nahi hota aur reload par row reset ho jaati hai."
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
    en: {
      scenario: "Record a sample ₹500 cleaning-supplies expense in the petty cash book.",
      steps: ["Open Accounts → Petty Cash Book and note the displayed balance for the branch.", "Click Petty Cash Entry. Choose OUT, Branch: Connaught Place, Amount: ₹500, Description: Cleaning supplies.", "Click Log Entry and inspect the new OUT row and updated page balance.", "Open Profit & Loss and Balance Sheet to understand their sample layout; this demo expense does not post into those reports."],
      result: "The page-local petty cash balance decreases by ₹500 for the example. No real ledger, payment, P&L or balance-sheet posting is saved; reload restores the demo."
    },
    hinglish: {
      scenario: "Petty cash book mein safai ke samaan ka sample ₹500 expense daalo.",
      steps: ["Accounts → Petty Cash Book kholo aur branch ka displayed balance note karo.", "Petty Cash Entry dabao. OUT, Branch: Connaught Place, Amount: ₹500, Description: Cleaning supplies chuno/bharo.", "Log Entry dabakar nayi OUT row aur updated page balance dekho.", "Profit & Loss aur Balance Sheet tabs ka sample layout dekho; yeh demo expense un reports mein post nahi hota."],
      result: "Example mein page-local petty cash balance ₹500 kam hota hai. Real ledger, payment, P&L ya balance-sheet posting save nahi hoti; reload par demo wapas aata hai."
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
  }
};

export function getGuideExample(route: string, language: "en" | "hinglish"): GuideExample | undefined {
  return GUIDE_EXAMPLES[route]?.[language];
}

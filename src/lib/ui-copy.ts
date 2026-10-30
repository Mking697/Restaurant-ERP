"use client";
import { useTranslation } from "@/lib/i18n";
// Source-owned copy catalog. Never translates DOM nodes, submitted values or identifiers.
const COPY: Record<string, readonly [string, string]> = {
  "Enter a valid Tanzanian mobile number": ["Enter a valid Tanzanian mobile number", "Sahi Tanzania mobile number bharein"],
  "Invalid mobile number": ["Invalid mobile number", "Mobile number sahi nahi hai"],
  "Petty cash book, aggregator reconciliation, Profit & Loss, Balance Sheet — ek hi jagah.": [
    "Petty cash, aggregator reconciliation, Profit & Loss and Balance Sheet in one place.",
    "Petty cash, aggregator recon, Profit & Loss aur Balance Sheet — sab ek jagah."
  ],
  "IN = HQ top-up ya refund credit. OUT = branch expense. Running balance auto-update hoga.": [
    "IN = HQ top-up or refund credit. OUT = branch expense. This demo updates the running balance only on this page.",
    "IN = HQ top-up ya refund credit. OUT = branch expense. Is demo mein running balance sirf is page par update hota hai."
  ],
  "ChatXFlow par apna WhatsApp QR scan se connect karein, phir yahan Developer API Token paste karein.": [
    "Connect your WhatsApp number on ChatXFlow using its QR code, then paste the Developer API Token here.",
    "ChatXFlow par apna WhatsApp QR scan se connect karein, phir yahan Developer API Token paste karein."
  ],
  "Base URL sirf https://chatxflow.online ho sakta hai — custom hosts allowed nahi hain (security pin, matches Pro ERP's same restriction).": [
    "The base URL is restricted to https://chatxflow.online for security. Custom hosts are not allowed.",
    "Security ke liye Base URL sirf https://chatxflow.online ho sakta hai. Custom hosts allowed nahi hain."
  ],
  "Save failed — DB not connected yet?": [
    "Could not save settings. Check the connection and try again.",
    "Settings save nahi hui. Connection check karke dobara try karein."
  ],
  "Expected cash CHHUPA hai — denominations count karo aur submit karo, system khud match karega.": [
    "Count each denomination and submit a demo cash drop. Expected cash and server reconciliation are not connected yet.",
    "Har denomination gino aur demo cash drop submit karo. Expected cash aur server reconciliation abhi connected nahi hain."
  ],
  "Note ki ginti bharo. Expected amount submit ke baad hi dikhega.": [
    "Enter the number of notes. Expected cash is revealed only after submission.",
    "Notes ki ginti bharo. Expected cash sirf submit ke baad dikhega."
  ],
  "Submit karne ke baad yahan shortage/excess dikhega. Expected cash backend se tabhi aata hai — frontend mein kabhi pre-load nahi hota (API-layer rule, Phase 3 mein wire hoga).": [
    "The demo records your counted total in page state only. Expected cash, shortage/excess calculation and saving to the database are not implemented.",
    "Demo mein counted total sirf page state mein rehta hai. Expected cash, shortage/excess calculation aur database save abhi implement nahi hain."
  ],
  "Shortage/excess calculation Phase 3 backend se aayega (expectedCashInr abhi DB mein hai, API se hidden rakha gaya hai jab tak submit na ho).": [
    "Demo submission only. No database record or shortage/excess calculation was created.",
    "Sirf demo submission hai. Database record ya shortage/excess calculation nahi bana."
  ],
  "Live sales, prime cost, total inventory, MIS compliance aur pilferage alerts — ek hi screen par. Branch selector (top-left) se kisi ek branch par bhi drill-down kar sakte ho.": [
    "Illustrative sales, costs, inventory and MIS metrics. The branch selector filters demo rows; these are not live business totals.",
    "Sales, costs, inventory aur MIS ke sample metrics. Branch selector demo rows filter karta hai; yeh live business totals nahi hain."
  ],
  "Naya ho yahan? Guide Book kholo — har module kya karta hai, kaise use hota hai, example ke saath samjho.": [
    "New here? Open the Guide Book for module explanations, steps and illustrative examples.",
    "Naya ho yahan? Guide Book kholo — har module kya karta hai, kaise use hota hai, example ke saath samjho."
  ],
  "Koi pilferage flag nahi — sab clean hai 🎉": [
    "No pilferage flags in this demo selection.",
    "Is demo selection mein koi pilferage flag nahi hai."
  ],
  "Yeh branch sirf apna data dekh rahi hai — doosri 5 branches ki rows yahan bilkul nahi aa rahin.": [
    "Only the selected branch’s demo rows are shown. This filter is not proof of database isolation.",
    "Sirf selected branch ki demo rows dikh rahi hain. Yeh filter database isolation ka proof nahi hai."
  ],
  "Branch selector (top-left) se kisi ek branch par filter karo — sirf uska data dikhega.": [
    "Use the branch selector to filter this database-backed table.",
    "Branch selector se is real database table ko filter karo."
  ],
  "Aapke role mein abhi koi module access nahi hai. Admin se Users & Access mein apna Module Access set karwao.": [
    "Your role has no module access yet. Ask an administrator to update your grants in Users & Access.",
    "Aapke role mein abhi module access nahi hai. Admin se Users & Access mein apne grants update karwao."
  ],
  "Click karo pura samajhne ke liye": [
    "Open the full guide",
    "Click karo pura samajhne ke liye"
  ],
  "aur module hain jo aapke role ke access mein nahi hain, isliye yahan nahi dikhaye gaye.": [
    "other modules are hidden because your role does not have access.",
    "aur module hain jo aapke role ke access mein nahi hain, isliye yahan nahi dikhaye gaye."
  ],
  "Yeh kya hai?": [
    "What is it?",
    "Yeh kya hai?"
  ],
  "Kaise use hota hai?": [
    "How to use it?",
    "Kaise use hota hai?"
  ],
  "Real Example": [
    "Illustrative example",
    "Samajhne ke liye example"
  ],
  "MIS score timestamps se calculate hota hai. 100% sabse achha — late aur chhoote hue tasks penalty banate hain.": [
    "Illustrative MIS scores: higher is better. Late and missed tasks reduce the sample score. Live score calculation is pending.",
    "Sample MIS score mein zyada score behtar hai. Late aur missed tasks score kam karte hain. Live calculation abhi pending hai."
  ],
  "Billing line-item builder Phase 3 mein — abhi order header level entry.": [
    "Demo order-header entry only. Line-item billing and database saving are not implemented.",
    "Sirf demo order-header entry hai. Line-item billing aur database save abhi implement nahi hain."
  ],
  "Live orders across channels — dine-in, takeaway, Swiggy, Zomato.": [
    "Demo orders across dine-in, takeaway, Swiggy and Zomato. Changes reset when the page reloads.",
    "Dine-in, takeaway, Swiggy aur Zomato ke demo orders. Page reload par changes reset ho jaate hain."
  ],
  "Store-related material ya general (non-store) item — dono same 3-step flow follow karte hain.": [
    "Purchases are saved to PostgreSQL. Store materials require an approved indent with locked quantities; general purchases do not need an indent.",
    "Purchase PostgreSQL mein save hoti hai. Store materials ke liye approved indent aur locked quantities zaroori hain; general purchase ko indent nahi chahiye."
  ],
  "General purchase (store/raw-material se related nahi — no Indent needed)": [
    "General purchase (not a store/raw-material item; no indent needed)",
    "General purchase (store/raw-material se related nahi — no Indent needed)"
  ],
  "Draft indent create hota hai — manager approval ke baad hi Purchase mein show hota hai.": [
    "Create a demo draft indent, then submit it for manager approval. Changes remain on this page only.",
    "Demo draft indent banao, phir manager approval ke liye submit karo. Changes sirf is page par rehte hain."
  ],
  "Pass → material Inventory Stock mein chala jaata hai. Fail/Partial → fail qty return hoti hai aur uska amount Accounts mein refund entry ban jaata hai.": [
    "Demo quality decision only. Passing does not update live inventory; failures do not create vendor returns or Accounts refunds.",
    "Sirf demo quality decision hai. Pass se live inventory update nahi hoti; fail se vendor return ya Accounts refund nahi banta."
  ],
  "Har report ke apne charts hain — click karke kholo. Excel export button Phase 3 mein wire hoga.": [
    "Open a report to view real database charts and tables. Export CSV downloads the displayed rows.",
    "Report kholkar real database charts aur tables dekho. Export CSV se displayed rows download hoti hain."
  ],
  "Checklist hi recurring task hai — ek baar assign karo, frequency ke hisaab se auto-assign hota rahega. Delegation one-time, priority-based hai. Doer apne dashboard se Done karega.": [
    "Try recurring checklists and one-time delegation in this demo. Tasks are page-local; automatic scheduling, reminders and database saving are not connected.",
    "Is demo mein recurring checklist aur one-time delegation try karo. Tasks sirf page par rehte hain; auto scheduling, reminders aur database save connected nahi hain."
  ],
  "Ek baar assign karne ke baad frequency ke hisaab se automatic naye occurrence ban te rahenge. Attachment doer ke liye optional hai.": [
    "Choose a frequency for this demo checklist. Recurring generation is not connected; evidence is optional.",
    "Is demo checklist ki frequency chuno. Recurring generation connected nahi hai; evidence optional hai."
  ],
  "Priority-based one-time task. Doer ko Done karte waqt evidence attachment REQUIRED hoga.": [
    "One-time task with a priority. Select evidence before marking it Done in this demo. Only the file name is retained.",
    "Priority wala one-time task. Demo mein Done se pehle evidence select karo. Sirf file ka naam rehta hai."
  ],
  "Evidence attachment REQUIRED — delegation task bina attachment ke Done nahi ho sakta.": [
    "Evidence is required before this delegated task can be marked Done.",
    "Evidence attachment REQUIRED — delegation task bina attachment ke Done nahi ho sakta."
  ],
  "Evidence attachment optional hai is recurring/checklist task ke liye.": [
    "Evidence is optional for this recurring/checklist task.",
    "Evidence attachment optional hai is recurring/checklist task ke liye."
  ],
  "Attachment zaroori hai is delegation task ko Done marking se pehle.": [
    "Select evidence before marking this delegated task Done.",
    "Attachment zaroori hai is delegation task ko Done marking se pehle."
  ],
  "Koi task nahi hai.": [
    "No tasks found.",
    "Koi task nahi hai."
  ],
  "Fresh local installation: choose your own password. Setup closes after the first account is created.": [
    "Choose your own owner password. Setup closes after the first Owner account is created.",
    "Apna Owner password khud chuno. Pehla Owner account banne ke baad setup band ho jaata hai."
  ],
  "Cancel": [
    "Cancel",
    "Radd karein"
  ],
  "Save": [
    "Save",
    "Save karein"
  ],
  "Saving…": [
    "Saving…",
    "Save ho raha hai…"
  ],
  "Submit": [
    "Submit",
    "Submit karein"
  ],
  "Create": [
    "Create",
    "Banayein"
  ],
  "Edit": [
    "Edit",
    "Badlein"
  ],
  "Add Item": [
    "Add Item",
    "Item jodein"
  ],
  "New User": [
    "New User",
    "Naya user"
  ],
  "New Branch": [
    "New Branch",
    "Nayi branch"
  ],
  "New Order": [
    "New Order",
    "Naya order"
  ],
  "New Purchase": [
    "New Purchase",
    "Nayi purchase"
  ],
  "Raise Indent": [
    "Raise Indent",
    "Indent banayein"
  ],
  "Submit for Approval": [
    "Submit for Approval",
    "Approval ke liye bhejein"
  ],
  "Approve": [
    "Approve",
    "Manzoor karein"
  ],
  "Reject": [
    "Reject",
    "Reject karein"
  ],
  "Mark Done": [
    "Mark Done",
    "Done karein"
  ],
  "Loading branches…": [
    "Loading branches…",
    "Branches load ho rahi hain…"
  ],
  "Loading users…": [
    "Loading users…",
    "Users load ho rahe hain…"
  ],
  "Loading inventory…": [
    "Loading inventory…",
    "Inventory load ho rahi hai…"
  ],
  "No branches yet.": [
    "No branches yet.",
    "Abhi koi branch nahi hai."
  ],
  "No users in this scope.": [
    "No users in this scope.",
    "Is scope mein koi user nahi hai."
  ],
  "No inventory in this scope.": [
    "No inventory in this scope.",
    "Is scope mein stock nahi hai."
  ],
  "Sign in": [
    "Sign in",
    "Login karein"
  ],
  "Create the first owner": [
    "Create the first owner",
    "Pehla Owner banayein"
  ],
  "Create owner & sign in": [
    "Create owner & sign in",
    "Owner banayein aur login karein"
  ],
  "Owner name": [
    "Owner name",
    "Owner ka naam"
  ],
  "Confirm password": [
    "Confirm password",
    "Password dobara bharein"
  ],
  "Please wait…": [
    "Please wait…",
    "Thoda intezaar karein…"
  ],
  "Setup is already complete.": [
    "Setup is already complete.",
    "Setup pehle hi poora ho chuka hai."
  ],
  "Fresh installation?": [
    "Fresh installation?",
    "Naya installation hai?"
  ],
  "Use the phone number and password assigned to your account.": [
    "Use the phone number and password assigned to your account.",
    "Apne account ka phone number aur password use karein."
  ],
  "Passwords do not match": [
    "Passwords do not match",
    "Dono passwords match nahi karte"
  ],
  "Cannot check setup": [
    "Cannot check setup",
    "Setup check nahi ho paaya"
  ],
  "Request failed": [
    "Request failed",
    "Request fail hui"
  ],
  "Save failed": [
    "Save failed",
    "Save nahi ho paaya"
  ],
  "Save Settings": [
    "Save Settings",
    "Settings save karein"
  ],
  "Saved": [
    "Saved",
    "Save ho gaya"
  ],
  "Name": [
    "Name",
    "Naam"
  ],
  "Description": [
    "Description",
    "Vivaran"
  ],
  "Date": [
    "Date",
    "Tareekh"
  ],
  "Amount": [
    "Amount",
    "Rakam"
  ],
  "Amount (TSh)": [
    "Amount (TSh)",
    "Rakam (TSh)"
  ],
  "Logged By": [
    "Logged By",
    "Entry karne wala"
  ],
  "Balance After": [
    "Balance After",
    "Entry ke baad balance"
  ],
  "Qty on hand": [
    "Qty on hand",
    "Maujooda quantity"
  ],
  "Low stock": [
    "Low stock",
    "Stock kam hai"
  ],
  "Overstock": [
    "Overstock",
    "Stock zyada hai"
  ],
  "High value": [
    "High value",
    "Keemti item"
  ],
  "Opening quantity": [
    "Opening quantity",
    "Shuru ki quantity"
  ],
  "Minimum stock": [
    "Minimum stock",
    "Minimum stock"
  ],
  "Maximum stock (0 = no upper alert)": [
    "Maximum stock (0 = no upper alert)",
    "Maximum stock (0 = upper alert nahi)"
  ],
  "Item name": [
    "Item name",
    "Item ka naam"
  ],
  "Own branch": [
    "Own branch",
    "Apni branch"
  ],
  "Select branch": [
    "Select branch",
    "Branch chunein"
  ],
  "Select branch (required)": [
    "Select branch (required)",
    "Branch chunein (zaroori)"
  ],
  "New password (blank keeps existing)": [
    "New password (blank keeps existing)",
    "Naya password (khali chhodein to purana rahega)"
  ],
  "Password (at least 12 characters)": [
    "Password (at least 12 characters)",
    "Password (kam se kam 12 characters)"
  ],
  "Phone (with country code)": [
    "Phone (with country code)",
    "Phone (country code ke saath)"
  ],
  "Phone (international E.164 format)": [
    "Phone (international E.164 format)",
    "Phone (international E.164 format mein)"
  ],
  "No tasks found.": [
    "No tasks found.",
    "Koi task nahi mila."
  ],
  "What is it?": [
    "What is it?",
    "Yeh kya hai?"
  ],
  "How to use it?": [
    "How to use it?",
    "Kaise use karein?"
  ],
  "Illustrative example": [
    "Illustrative example",
    "Samajhne ke liye example"
  ],
  "Open the full guide": [
    "Open the full guide",
    "Puri guide kholein"
  ],
  "Export CSV": [
    "Export CSV",
    "CSV download karein"
  ],
  "New Recurring / Checklist": [
    "New Recurring / Checklist",
    "Nayi recurring task / checklist"
  ],
  "New Recurring Task / Checklist": [
    "New Recurring Task / Checklist",
    "Nayi recurring task / checklist"
  ],
  "Delegate Task": [
    "Delegate Task",
    "Task saunpein"
  ],
  "Delegate Task (One-Time)": [
    "Delegate Task (One-Time)",
    "One-time task saunpein"
  ],
  "Task / checklist title": [
    "Task / checklist title",
    "Task / checklist ka naam"
  ],
  "Task title": [
    "Task title",
    "Task ka naam"
  ],
  "Assigned to (Doer)": [
    "Assigned to (Doer)",
    "Kisko saunpein (Doer)"
  ],
  "Assign to": [
    "Assign to",
    "Kisko saunpein"
  ],
  "Due": [
    "Due",
    "Deadline"
  ],
  "Choose a photo/PDF…": [
    "Choose a photo/PDF…",
    "Photo/PDF chunein…"
  ],
  "(required)": [
    "(required)",
    "(zaroori)"
  ],
  "(optional)": [
    "(optional)",
    "(optional)"
  ],
  "Create Order": [
    "Create Order",
    "Order banayein"
  ],
  "Log Entry": [
    "Log Entry",
    "Entry karein"
  ],
  "Submit Cash Drop": [
    "Submit Cash Drop",
    "Cash drop submit karein"
  ],
  "Counted total": [
    "Counted total",
    "Gina hua total"
  ],
  "Denomination count — shift closing": [
    "Denomination count — shift closing",
    "Shift closing — notes ki ginti"
  ],
  "Branch saved and read back from database.": [
    "Branch saved and read back from database.",
    "Branch database mein save hui aur dobara load hui."
  ],
  "User saved and reloaded from database.": [
    "User saved and reloaded from database.",
    "User database mein save hua aur dobara load hua."
  ],
  "Inventory item saved and reloaded from database.": [
    "Inventory item saved and reloaded from database.",
    "Inventory item database mein save hua aur dobara load hua."
  ],
  "Owner: all branches. Branch Admin: own branch, only grants they hold.": [
    "Owner: all branches. Branch Admin: own branch, only grants they hold.",
    "Owner: sabhi branches. Branch Admin: apni branch, sirf apne grants de sakta hai."
  ],
  "User administration requires Owner or Branch Admin access.": [
    "User administration requires Owner or Branch Admin access.",
    "User management ke liye Owner ya Branch Admin access chahiye."
  ],
  "Inventory permission is required.": [
    "Inventory permission is required.",
    "Inventory permission chahiye."
  ],
  "Changes are saved to PostgreSQL. New branches start empty.": [
    "Changes are saved to PostgreSQL. New branches start empty.",
    "Changes PostgreSQL mein save hote hain. Nayi branch khali shuru hoti hai."
  ],
  "Saved changes revoke this user’s existing sessions. Password is never stored in browser storage.": [
    "Saved changes revoke this user’s existing sessions. Password is never stored in browser storage.",
    "Changes save hone par user ke purane sessions revoke ho jaate hain. Password browser storage mein nahi rehta."
  ],
  "Creates stock for one branch. Existing catalog names reuse the same material and unit; this does not create a purchase indent.": [
    "Creates stock for one branch. Existing catalog names reuse the same material and unit; this does not create a purchase indent.",
    "Ek branch ka stock banata hai. Existing catalog naam par wahi material aur unit use hoti hai; purchase indent nahi banti."
  ],
  "Owner creates branches; Branch Admin maintains own branch details. Cloning is not implemented — menus, BOM and checklists are not copied.": [
    "Owner creates branches; Branch Admin maintains own branch details. Cloning is not implemented — menus, BOM and checklists are not copied.",
    "Owner branch banata hai; Branch Admin apni branch ki details badalta hai. Cloning implement nahi hai — menus, BOM aur checklists copy nahi hote."
  ],
  "Inventory Value": [
    "Inventory Value",
    "Stock ki value"
  ],
  "Total Inventory Value": [
    "Total Inventory Value",
    "Kul stock value"
  ],
  "Across all branches": [
    "Across all branches",
    "Sabhi branches mein"
  ],
  "Total Sales — Today (all branches)": [
    "Total Sales — Today (all branches)",
    "Aaj ki total sales (sabhi branches)"
  ],
  "Sales — Today": [
    "Sales — Today",
    "Aaj ki sales"
  ],
  "Overdue Tasks": [
    "Overdue Tasks",
    "Late tasks"
  ],
  "Top MIS Branch": [
    "Top MIS Branch",
    "Top MIS branch"
  ],
  "Revenue trend — last 14 days": [
    "Revenue trend — last 14 days",
    "Pichhle 14 din ka revenue trend"
  ],
  "Revenue — last 14 days": [
    "Revenue — last 14 days",
    "Pichhle 14 din ka revenue"
  ],
  "Compiled across all branches": [
    "Compiled across all branches",
    "Sabhi branches ka compiled view"
  ],
  "Revenue today": [
    "Revenue today",
    "Aaj ka revenue"
  ],
  "Revenue today by branch": [
    "Revenue today by branch",
    "Branch ke hisaab se aaj ka revenue"
  ],
  "Revenue Today": [
    "Revenue Today",
    "Aaj ka revenue"
  ],
  "Night variance flags this week": [
    "Night variance flags this week",
    "Is hafte ke night variance flags"
  ],
  "Cash variance:": [
    "Cash variance:",
    "Cash ka antar:"
  ],
  "Branch detail": [
    "Branch detail",
    "Branch ki detail"
  ],
  "Branch drill-down": [
    "Branch drill-down",
    "Branch ki detail"
  ],
  "Owner Dashboard — All 6 Branches Compiled": [
    "Owner Dashboard — All 6 Branches Compiled",
    "Owner Dashboard — sabhi 6 branches compiled"
  ],
  "Target: < 60%": [
    "Target: < 60%",
    "Lakshya: < 60%"
  ],
  "Leave blank to keep existing token": [
    "Leave blank to keep existing token",
    "Purana token rakhne ke liye blank chhodein"
  ],
  "Paste ChatXFlow Developer API Token": [
    "Paste ChatXFlow Developer API Token",
    "ChatXFlow Developer API Token paste karein"
  ],
  "Configured:": [
    "Configured:",
    "Configured hai:"
  ],
  "WhatsApp Phone Number": [
    "WhatsApp Phone Number",
    "WhatsApp phone number"
  ],
  "Clone unavailable": [
    "Clone unavailable",
    "Clone abhi available nahi"
  ],
  "Geofence radius (metres)": [
    "Geofence radius (metres)",
    "Geofence radius (metres mein)"
  ],
  "Geofence": [
    "Geofence",
    "Geofence"
  ],
  "Address": [
    "Address",
    "Pata"
  ],
  "Coordinates": [
    "Coordinates",
    "Coordinates"
  ],
  "Action": [
    "Action",
    "Action"
  ],
  "Edit Branch": [
    "Edit Branch",
    "Branch badlein"
  ],
  "Edit User": [
    "Edit User",
    "User badlein"
  ],
  "Module grants": [
    "Module grants",
    "Module permissions"
  ],
  "Status": [
    "Status",
    "Status"
  ],
  "Active": [
    "Active",
    "Active"
  ],
  "Inactive": [
    "Inactive",
    "Inactive"
  ],
  "HQ — no branch": [
    "HQ — no branch",
    "HQ — branch nahi"
  ],
  "Add Inventory Item": [
    "Add Inventory Item",
    "Inventory item jodein"
  ],
  "Unit": [
    "Unit",
    "Unit"
  ],
  "Min / Max": [
    "Min / Max",
    "Min / Max"
  ],
  "Flags": [
    "Flags",
    "Alerts"
  ],
  "Password": [
    "Password",
    "Password"
  ],
  "(at least 12 characters)": [
    "(at least 12 characters)",
    "(kam se kam 12 characters)"
  ],
  "notes": [
    "notes",
    "notes"
  ],
  "Coins (TSh)": [
    "Coins (TSh)",
    "Coins (TSh)"
  ],
  "Result": [
    "Result",
    "Natija"
  ],
  "Submitted —": [
    "Submitted —",
    "Demo submit hua —"
  ],
  "Order channel split": [
    "Order channel split",
    "Channel ke hisaab se orders"
  ],
  "Pilferage watch": [
    "Pilferage watch",
    "Pilferage par nazar"
  ],
  "flag(s)": [
    "flag(s)",
    "flag(s)"
  ],
  "Cash Variance": [
    "Cash Variance",
    "Cash ka antar"
  ],
  "Team Performance — MIS Leaderboard": [
    "Team Performance — MIS Leaderboard",
    "Team Performance — MIS ranking"
  ],
  "Score by person": [
    "Score by person",
    "Har vyakti ka score"
  ],
  "40% task / 30% delegation / 20% variance / 10% cashier weighted score": [
    "40% task / 30% delegation / 20% variance / 10% cashier weighted score",
    "40% task / 30% delegation / 20% variance / 10% cashier ka weighted sample score"
  ],
  "On Time": [
    "On Time",
    "Samay par"
  ],
  "Delay": [
    "Delay",
    "Der se"
  ],
  "Not Done": [
    "Not Done",
    "Nahi hua"
  ],
  "Rank": [
    "Rank",
    "Rank"
  ],
  "Role": [
    "Role",
    "Role"
  ],
  "Branch": [
    "Branch",
    "Branch"
  ],
  "Phone": [
    "Phone",
    "Phone"
  ],
  "Grants": [
    "Grants",
    "Permissions"
  ],
  "Task": [
    "Task",
    "Task"
  ],
  "Doer": [
    "Doer",
    "Karne wala"
  ],
  "Evidence": [
    "Evidence",
    "Saboot"
  ],
  "Shift time": [
    "Shift time",
    "Shift ka samay"
  ],
  "Frequency": [
    "Frequency",
    "Kitni baar"
  ],
  "Priority": [
    "Priority",
    "Priority"
  ],
  "Raised by": [
    "Raised by",
    "Kisne banaya"
  ],
  "Raised By": [
    "Raised By",
    "Kisne banaya"
  ],
  "Number of line items": [
    "Number of line items",
    "Line items ki ginti"
  ],
  "Raw material / Indent reference": [
    "Raw material / Indent reference",
    "Raw material / Indent reference"
  ],
  "Item description": [
    "Item description",
    "Item ka vivaran"
  ],
  "Office chair repair": [
    "Office chair repair",
    "Office chair repair"
  ],
  "Create (Step 1: Buy)": [
    "Create (Step 1: Buy)",
    "Banayein (Step 1: Buy)"
  ],
  "Raise": [
    "Raise",
    "Banayein"
  ],
  "Manager Action": [
    "Manager Action",
    "Manager action"
  ],
  "Spike vs Avg": [
    "Spike vs Avg",
    "Average se kitna zyada"
  ],
  "Step Progress": [
    "Step Progress",
    "Step progress"
  ],
  "1. Bought": [
    "1. Bought",
    "1. Kharida"
  ],
  "2. Bill ✓": [
    "2. Bill ✓",
    "2. Bill ✓"
  ],
  "3. Received ✓": [
    "3. Received ✓",
    "3. Mila ✓"
  ],
  "Upload Bill (optional)": [
    "Upload Bill (optional)",
    "Bill upload (optional)"
  ],
  "Mark Material Received": [
    "Mark Material Received",
    "Material mila mark karein"
  ],
  "Received By": [
    "Received By",
    "Kisko mila"
  ],
  "Quality Result": [
    "Quality Result",
    "Quality ka natija"
  ],
  "Fail Qty": [
    "Fail Qty",
    "Fail quantity"
  ],
  "Quality Check": [
    "Quality Check",
    "Quality check"
  ],
  "Quality Check —": [
    "Quality Check —",
    "Quality check —"
  ],
  "Table no.": [
    "Table no.",
    "Table number"
  ],
  "Table": [
    "Table",
    "Table"
  ],
  "Time": [
    "Time",
    "Samay"
  ],
  "Tender": [
    "Tender",
    "Payment mode"
  ],
  "Cash": [
    "Cash",
    "Cash"
  ],
  "Card": [
    "Card",
    "Card"
  ],
  "Order #": [
    "Order #",
    "Order #"
  ],
  "Type": [
    "Type",
    "Type"
  ],
  "OUT (expense)": [
    "OUT (expense)",
    "OUT (kharcha)"
  ],
  "IN (top-up / refund)": [
    "IN (top-up / refund)",
    "IN (top-up / refund)"
  ],
  "Milk, cleaning supplies, refund...": [
    "Milk, cleaning supplies, refund...",
    "Doodh, safai ka samaan, refund..."
  ],
  "Assets": [
    "Assets",
    "Assets"
  ],
  "Liabilities": [
    "Liabilities",
    "Liabilities"
  ],
  "Equity": [
    "Equity",
    "Equity"
  ],
  "Total": [
    "Total",
    "Kul"
  ],
  "Petty Cash Entry": [
    "Petty Cash Entry",
    "Petty cash entry"
  ],
  "Profit & Loss — all branches compiled": [
    "Profit & Loss — all branches compiled",
    "Profit & Loss — sabhi branches compiled"
  ],
  "Check: Assets (": [
    "Check: Assets (",
    "Check: Assets ("
  ],
  "Revenue + prime cost % over time, compiled or per branch.": [
    "Revenue + prime cost % over time, compiled or per branch.",
    "Samay ke saath revenue aur prime cost %, compiled ya branch ke hisaab se sample data."
  ],
  "On-time / delay / not-done breakdown + weighted score per employee.": [
    "On-time / delay / not-done breakdown + weighted score per employee.",
    "Har employee ka on-time / delay / not-done breakdown aur weighted sample score."
  ],
  "BOM-cost-driven food cost % per menu item, margin ranking.": [
    "BOM-cost-driven food cost % per menu item, margin ranking.",
    "Har menu item ka sample BOM-based food cost % aur margin ranking."
  ],
  "Night variance (theoretical vs physical), pilferage flags.": [
    "Night variance (theoretical vs physical), pilferage flags.",
    "Night variance (expected aur physical stock ka antar) aur sample pilferage flags."
  ],
  "Blind cash drop shortage/excess by cashier and branch.": [
    "Blind cash drop shortage/excess by cashier and branch.",
    "Cashier aur branch ke hisaab se sample cash shortage/excess."
  ],
  "Order value vs net payout, commission & ads spend.": [
    "Order value vs net payout, commission & ads spend.",
    "Sample order value aur net payout ka comparison, commission aur ads kharcha."
  ],
  "Prime cost % trend": [
    "Prime cost % trend",
    "Prime cost % ka trend"
  ],
  "MIS score by person": [
    "MIS score by person",
    "Har vyakti ka MIS score"
  ],
  "Breakdown": [
    "Breakdown",
    "Detail"
  ],
  "Food cost % + margin per menu item": [
    "Food cost % + margin per menu item",
    "Har menu item ka food cost % aur margin"
  ],
  "Menu Item": [
    "Menu Item",
    "Menu item"
  ],
  "Selling Price": [
    "Selling Price",
    "Bechne ki keemat"
  ],
  "BOM Cost": [
    "BOM Cost",
    "BOM cost"
  ],
  "Margin": [
    "Margin",
    "Margin"
  ],
  "Night variance — theoretical vs physical": [
    "Night variance — theoretical vs physical",
    "Night variance — expected aur physical stock"
  ],
  "Raw Material": [
    "Raw Material",
    "Raw material"
  ],
  "Theoretical Qty": [
    "Theoretical Qty",
    "Expected quantity"
  ],
  "Physical Qty": [
    "Physical Qty",
    "Gini hui quantity"
  ],
  "Variance Value": [
    "Variance Value",
    "Antar ki value"
  ],
  "Flag": [
    "Flag",
    "Flag"
  ],
  "Pilferage?": [
    "Pilferage?",
    "Pilferage ka shak?"
  ],
  "Blind cash drop — shortage / excess": [
    "Blind cash drop — shortage / excess",
    "Blind cash drop — kami / zyada"
  ],
  "Shift": [
    "Shift",
    "Shift"
  ],
  "Expected": [
    "Expected",
    "Expected"
  ],
  "Counted": [
    "Counted",
    "Gina hua"
  ],
  "Shortage/Excess": [
    "Shortage/Excess",
    "Kami/Zyada"
  ],
  "Swiggy/Zomato — order value vs net payout": [
    "Swiggy/Zomato — order value vs net payout",
    "Swiggy/Zomato — order value aur net payout"
  ],
  "Order Value": [
    "Order Value",
    "Order ki value"
  ],
  "Commission": [
    "Commission",
    "Commission"
  ],
  "Ads": [
    "Ads",
    "Ads"
  ],
  "Refund Penalty": [
    "Refund Penalty",
    "Refund / penalty"
  ],
  "Net Payout": [
    "Net Payout",
    "Net payout"
  ],
  "Daily Operations": [
    "Daily Operations",
    "Roz ka kaam"
  ],
  "Finance": [
    "Finance",
    "Finance"
  ],
  "Purchase / Stock": [
    "Purchase / Stock",
    "Purchase / Stock"
  ],
  "other modules are hidden because your role does not have access.": [
    "other modules are hidden because your role does not have access.",
    "aur modules role access na hone ki wajah se hidden hain."
  ],
  "Daily": [
    "Daily",
    "Roz"
  ],
  "Weekly": [
    "Weekly",
    "Har hafte"
  ],
  "Every 15 Days": [
    "Every 15 Days",
    "Har 15 din"
  ],
  "Every 15 days": [
    "Every 15 days",
    "Har 15 din"
  ],
  "Monthly": [
    "Monthly",
    "Har mahine"
  ],
  "Quarterly": [
    "Quarterly",
    "Har teen mahine"
  ],
  "Half-Yearly": [
    "Half-Yearly",
    "Har chhe mahine"
  ],
  "Yearly": [
    "Yearly",
    "Har saal"
  ],
  "No deadline set": [
    "No deadline set",
    "Deadline set nahi hai"
  ],
  "Evidence attachment": [
    "Evidence attachment",
    "Evidence attachment"
  ],
  "Task delegated": [
    "Task delegated",
    "Task saunpa gaya"
  ],
  "Milk & cleaning supplies": [
    "Milk & cleaning supplies",
    "Doodh aur safai ka samaan"
  ],
  "Invalid phone or password": [
    "Invalid phone or password",
    "Phone ya password galat hai"
  ],
  "Invalid credentials": [
    "Invalid credentials",
    "Login details galat hain"
  ],
  "Forbidden": [
    "Forbidden",
    "Access allowed nahi hai"
  ],
  "Unauthorized": [
    "Unauthorized",
    "Pehle login karein"
  ],
  "Not found": [
    "Not found",
    "Record nahi mila"
  ],
  "Setup already completed": [
    "Setup already completed",
    "Setup pehle hi poora ho chuka hai"
  ],
  "Invalid phone number": [
    "Invalid phone number",
    "Phone number sahi nahi hai"
  ],
  "Internal server error": [
    "Internal server error",
    "Server mein error aayi. Dobara try karein."
  ],
  "Invalid password": [
    "Invalid password",
    "Password sahi nahi hai"
  ],
  "Login temporarily limited": [
    "Login temporarily limited",
    "Login abhi temporarily limited hai"
  ],
  "Too many attempts; try later": [
    "Too many attempts; try later",
    "Bahut attempts ho gaye; thodi der baad try karein"
  ],
  "Branch not found": [
    "Branch not found",
    "Branch nahi mili"
  ],
  "Branch administration required": [
    "Branch administration required",
    "Branch administration access chahiye"
  ],
  "Only owner may change branch code": [
    "Only owner may change branch code",
    "Sirf Owner branch code badal sakta hai"
  ],
  "Select a branch": [
    "Select a branch",
    "Branch chunein"
  ],
  "Max stock must be at least minimum stock": [
    "Max stock must be at least minimum stock",
    "Maximum stock minimum stock se kam nahi ho sakta"
  ],
  "Material not found": [
    "Material not found",
    "Material nahi mila"
  ],
  "Invalid unit": [
    "Invalid unit",
    "Unit sahi nahi hai"
  ],
  "Material name already uses another unit": [
    "Material name already uses another unit",
    "Is material naam ke saath pehle se doosri unit hai"
  ],
  "Item already exists in this branch": [
    "Item already exists in this branch",
    "Is branch mein item pehle se hai"
  ],
  "Password must have at least 12 characters and at most 256 UTF-8 bytes": [
    "Password must have at least 12 characters and at most 256 UTF-8 bytes",
    "Password mein kam se kam 12 characters aur maximum 256 UTF-8 bytes hone chahiye"
  ],
  "User not found": [
    "User not found",
    "User nahi mila"
  ],
  "Authentication required": [
    "Authentication required",
    "Pehle login karein"
  ],
  "Session expired or revoked": [
    "Session expired or revoked",
    "Session expire ya revoke ho gaya; dobara login karein"
  ],
  "Invalid branch code": [
    "Invalid branch code",
    "Branch code sahi nahi hai"
  ],
  "Invalid address": [
    "Invalid address",
    "Address sahi nahi hai"
  ],
  "Invalid branch coordinates or geofence": [
    "Invalid branch coordinates or geofence",
    "Branch coordinates ya geofence sahi nahi hai"
  ],
  "Same-origin request required": [
    "Same-origin request required",
    "Request isi app se bhejni hogi"
  ],
  "JSON required": [
    "JSON required",
    "JSON format chahiye"
  ],
  "Request too large": [
    "Request too large",
    "Request bahut badi hai"
  ],
  "Invalid JSON": [
    "Invalid JSON",
    "JSON sahi nahi hai"
  ],
  "JSON object required": [
    "JSON object required",
    "JSON object chahiye"
  ],
  "Use E.164 phone, e.g. +919****3210": [
    "Use E.164 phone, e.g. +919****3210",
    "E.164 format mein phone bharein, jaise +919****3210"
  ],
  "Password must be 12–256 UTF-8 bytes (at least 12 characters)": [
    "Password must be 12–256 UTF-8 bytes (at least 12 characters)",
    "Password 12–256 UTF-8 bytes aur kam se kam 12 characters ka hona chahiye"
  ],
  "Owner access required": [
    "Owner access required",
    "Owner access chahiye"
  ],
  "Module access required": [
    "Module access required",
    "Module access chahiye"
  ],
  "User administration required": [
    "User administration required",
    "User administration access chahiye"
  ],
  "Branch membership required": [
    "Branch membership required",
    "Branch membership chahiye"
  ],
  "Branch access denied": [
    "Branch access denied",
    "Is branch ka access nahi hai"
  ],
  "Invalid moduleAccess": [
    "Invalid moduleAccess",
    "Module access sahi nahi hai"
  ],
  "Branch admins cannot edit themselves": [
    "Branch admins cannot edit themselves",
    "Branch Admin khud ko edit nahi kar sakta"
  ],
  "Cannot manage HQ roles": [
    "Cannot manage HQ roles",
    "HQ roles manage nahi kar sakte"
  ],
  "Cannot delegate unheld grants": [
    "Cannot delegate unheld grants",
    "Jo grants khud ke paas nahi hain woh nahi de sakte"
  ],
  "Invalid role": [
    "Invalid role",
    "Role sahi nahi hai"
  ],
  "Invalid status": [
    "Invalid status",
    "Status sahi nahi hai"
  ],
  "HQ users must not have a branch": [
    "HQ users must not have a branch",
    "HQ user ko branch assign nahi honi chahiye"
  ],
  "Invalid reporting manager": [
    "Invalid reporting manager",
    "Reporting manager sahi nahi hai"
  ],
  "Cannot remove the last active owner": [
    "Cannot remove the last active owner",
    "Aakhri active Owner ko remove nahi kar sakte"
  ],
  "Save quality": ["Save quality", "Quality save karo"],
  "Cancel quality": ["Cancel quality", "Quality cancel karo"],
  "All received lines": ["All received lines", "Saari received lines"],
  "Check saved quality": ["Check saved quality", "Saved quality check karo"],
  "Replay exact request": ["Replay exact request", "Wahi exact request replay karo"],
  "Photo/reference (not an upload)": ["Photo/reference (not an upload)", "Photo/reference (upload nahi)"],
  "Quality note (required for FAIL/PARTIAL)": ["Quality note (required for FAIL/PARTIAL)", "Quality note (FAIL/PARTIAL ke liye zaruri)"],
  "Quality note": ["Quality note", "Quality note"],
  "Failed quantity": ["Failed quantity", "Failed quantity"],
  "Not posted": ["Not posted", "Post nahi hua"],
  "Reference": ["Reference", "Reference"],
  "Accepted": ["Accepted", "Accepted"],
  "Failed": ["Failed", "Failed"],
  "Received": ["Received", "Received"],
  "Reconciliation required — prior inventory posting cannot be verified. Do not repost.": ["Reconciliation required — prior inventory posting cannot be verified. Do not repost.", "Reconciliation required — purani inventory posting verify nahi ho rahi. Dobara post mat karo."],
  "Store quality requires PURCHASE_ORDER and INVENTORY access. Ask an administrator; no grants are changed here.": ["Store quality requires PURCHASE_ORDER and INVENTORY access. Ask an administrator; no grants are changed here.", "Store quality ke liye PURCHASE_ORDER aur INVENTORY access chahiye. Administrator se poochho; yahan grants nahi badalte."],
  "General purchase: quality is saved, but no inventory is posted.": ["General purchase: quality is saved, but no inventory is posted.", "General purchase: quality save hoti hai, inventory post nahi hoti."],
  "Accepted material quantities post atomically with the saved quality decision. Store quality checks require PURCHASE_ORDER and INVENTORY access.": ["Accepted material quantities post atomically with the saved quality decision. Store quality checks require PURCHASE_ORDER and INVENTORY access.", "Accepted material qty aur saved quality decision ek atomic transaction mein post hote hain. Store quality check ko PURCHASE_ORDER aur INVENTORY access chahiye."],
  "Vendor returns and refund/credit receivables are not created yet (GRN-2). No money receipt or journal is posted.": ["Vendor returns and refund/credit receivables are not created yet (GRN-2). No money receipt or journal is posted.", "Vendor return aur refund/credit receivables abhi nahi bante (GRN-2). Koi money receipt ya journal post nahi hota."],
  "Enter valid line quantities and a failure note (3–1000 characters) for FAIL/PARTIAL.": ["Enter valid line quantities and a failure note (3–1000 characters) for FAIL/PARTIAL.", "Sahi line quantities aur FAIL/PARTIAL ke liye 3–1000 character ka failure note bharo."],
  "Original decision is still unconfirmed or needs reconciliation. Editing remains locked; check again or replay the exact request.": ["Original decision is still unconfirmed or needs reconciliation. Editing remains locked; check again or replay the exact request.", "Original decision abhi unconfirmed hai ya reconciliation chahiye. Editing locked rahegi; dobara check ya wahi exact request replay karo."],
  "Could not load GRNs.": ["Could not load GRNs.", "GRNs load nahi hue."]
};
export function useUiCopy() {
  const { t } = useTranslation();
  return (text: string, hinglish?: string): string => {
    if (hinglish !== undefined) return t(text, hinglish);
    const pair = COPY[text.trim().replace(/\s+/g, " ")];
    return pair ? (text.startsWith(" ") ? " " : "") + t(pair[0], pair[1]) + (text.endsWith(" ") ? " " : "") : t(text);
  };
}

const DATA_INVENTORY = [
  {
    id: 'inventory-branch-list',
    titleEn: 'Branch Inventory List + Add Item',
    titleHi: 'Branch Inventory List + Add Item',
    icon: 'boxes',
    summaryEn: 'Branch-wise raw-material stock list with low-stock/overstock flags, plus a gated form to add new items safely.',
    summaryHi: 'Branch-wise raw-material stock list, jisme low-stock/overstock flags dikhte hain, aur naya item add karne ka permission-gated form.',
    sections: [
      {
        headingEn: 'Steps',
        headingHi: 'Steps',
        items: [
          { en: 'Top-right branch selector lets the user pick a branch; Owner sees "all" branches combined, read-only.', hi: 'Top-right branch selector se branch choose karte hain; Owner ko "all" branches combined, read-only dikhti hain.' },
          { en: 'Click "Add Item" (permission-gated) to open the add-item form.', hi: '"Add Item" click karo (permission-gated) add-item form kholne ke liye.' },
          { en: 'Fill item name, branch, unit (kg/g/ltr/ml/pcs/box/pack), opening quantity, min stock level, max stock level (0 = no upper alert).', hi: 'Item name, branch, unit (kg/g/ltr/ml/pcs/box/pack), opening quantity, min stock level, max stock level (0 = upar ka alert nahi) fill karo.' },
          { en: 'Batch reference (supplier label) and expiry date are optional but recommended.', hi: 'Batch reference (supplier label) aur expiry date optional hain lekin recommend kiya jaata hai.' },
          { en: 'Click "Add Item" again — it saves directly and the list reloads.', hi: 'Dobara "Add Item" click karo — directly save ho jaata hai aur list reload hoti hai.' },
        ],
      },
      {
        headingEn: 'Conditions',
        headingHi: 'Conditions',
        items: [
          { en: 'A branch user can only add items to their own branch — the branchId dropdown is disabled for them.', hi: 'Branch user sirf apni branch mein item add kar sakta hai — unke liye branchId dropdown disabled rehta hai.' },
          { en: 'If no expiry date is given and "nonExpiring" is not checked, opening stock stays HELD automatically until Owner verifies — it cannot be used.', hi: 'Agar expiry date nahi di aur "nonExpiring" bhi check nahi kiya, to opening stock automatically HELD rehta hai jab tak Owner verify na kare — use nahi kiya ja sakta.' },
          { en: '"No expiry" entered never means "infinite shelf life".', hi: '"No expiry" dalne ka matlab kabhi "infinite shelf life" nahi hota.' },
          { en: 'The "Owner verified non-expiring" checkbox is SUPER_ADMIN-only and requires written verification evidence.', hi: '"Owner verified non-expiring" checkbox sirf SUPER_ADMIN ke liye hai aur written verification evidence zaroori hai.' },
          { en: 'Low-stock badge shows when qtyOnHand is less than minStockLevel.', hi: 'Low-stock badge tab dikhta hai jab qtyOnHand minStockLevel se kam ho jaaye.' },
          { en: 'Overstock badge shows when maxStockLevel > 0 and qtyOnHand exceeds maxStockLevel.', hi: 'Overstock badge tab dikhta hai jab maxStockLevel > 0 ho aur qtyOnHand usse zyada ho jaaye.' },
        ],
      },
    ],
    example: {
      en: 'Branch "Andheri" Paneer min 5kg, max 20kg — if qtyOnHand drops to 3kg, red "Low stock" badge shows; if a bulk delivery makes it 25kg, "Overstock" warning shows.',
      hi: 'Andheri branch ka Paneer min 5kg, max 20kg hai — agar qty 3kg ho jaaye to red "Low stock" badge dikhega; agar bulk delivery se 25kg ho jaaye to "Overstock" warning dikhega.',
    },
  },
  {
    id: 'inventory-expiry-batches',
    titleEn: 'Expiry Batches & Exceptions',
    titleHi: 'Expiry Batches & Exceptions',
    icon: 'calendar-clock',
    summaryEn: 'Per-material lot/batch FEFO tracking — verifying unknown-expiry lots and reconciling unbatched stock.',
    summaryHi: 'Per-material lot/batch ka FEFO tracking — unknown-expiry lots verify karna aur unbatched stock reconcile karna.',
    sections: [
      {
        headingEn: 'Verify Lot',
        headingHi: 'Verify Lot',
        items: [
          { en: 'Per-raw-material lot/batch tracking shows which lot expires when and which is HELD (unknown expiry or already expired).', hi: 'Har raw-material ka lot/batch tracking dikhata hai kaunsa lot kab expire hoga aur kaunsa HELD hai (unknown expiry ya already expired).' },
          { en: 'Click "Verify lot" on a batch showing "Unknown reference" (Owner-only).', hi: 'Jo batch "Unknown reference" dikhaye usme "Verify lot" click karo (Owner-only).' },
          { en: 'Enter the verified expiry date OR check "Owner verified non-expiring".', hi: 'Verified expiry date enter karo YA "Owner verified non-expiring" check karo.' },
          { en: 'Verification evidence (non-empty text) is mandatory.', hi: 'Verification evidence (non-empty text) dena mandatory hai.' },
          { en: 'Click "Save verification" to finalize.', hi: 'Finalize karne ke liye "Save verification" click karo.' },
        ],
      },
      {
        headingEn: 'Reconcile Unbatched Stock',
        headingHi: 'Reconcile Unbatched Stock',
        items: [
          { en: 'When "On hand" qty and "Batched" qty differ, the "Reconcile exact lots" button appears.', hi: 'Jab "On hand" qty aur "Batched" qty alag ho, "Reconcile exact lots" button dikhta hai.' },
          { en: 'For each real lot enter batch reference, exact quantity, and expiry date (or non-expiring).', hi: 'Har real lot ke liye batch reference, exact quantity, aur expiry date (ya non-expiring) enter karo.' },
          { en: 'Lot quantities must SUM exactly to the unbatched difference — exact bigint match, no floating-point tolerance.', hi: 'Lot quantities ka SUM unbatched difference ke exactly equal hona chahiye — exact bigint match, floating-point tolerance nahi.' },
          { en: 'Enter verification evidence then click "Save exact reconciliation".', hi: 'Verification evidence daalkar "Save exact reconciliation" click karo.' },
        ],
      },
      {
        headingEn: 'Conditions',
        headingHi: 'Conditions',
        items: [
          { en: 'HELD (unknown expiry) or EXPIRED stock can never be consumed or dispatched, ever — not for production, not for branch-to-branch transfer.', hi: 'HELD (unknown expiry) ya EXPIRED stock kabhi consume ya dispatch nahi ho sakta — na production ke liye, na branch-to-branch transfer ke liye.' },
          { en: 'Dispatch always happens in FEFO order (earliest-expiring lot first), and the original lot identity (batchNo, expiry) is preserved.', hi: 'Dispatch hamesha FEFO order mein hota hai (sabse pehle expire hone wala lot pehle), aur original lot identity (batchNo, expiry) preserve rehti hai.' },
          { en: 'A fabricated "unknown origin" batch is never created when the real lot is known.', hi: 'Jab real lot pata ho to fabricated "unknown origin" batch kabhi nahi banaya jaata.' },
          { en: 'Reconciliation never changes the balance — it only explains which real lots an already-existing unbatched quantity came from.', hi: 'Reconciliation se balance kabhi change nahi hota — yeh sirf batata hai ki existing unbatched quantity kaunse real lots se aayi.' },
        ],
      },
    ],
    example: {
      en: '"Tamatar" on-hand is 50kg but batches only track 42kg (8kg unbatched/HELD legacy stock). Owner enters Lot A 5kg (expiry 2026-11-10) and Lot B 3kg (non-expiring, evidence "Owner physically checked, not a dry spice"); 5+3=8, exact match, reconciliation saves.',
      hi: '"Tamatar" ka on-hand 50kg hai lekin batches sirf 42kg track karte hain (8kg unbatched/HELD legacy stock). Owner Lot A 5kg (expiry 2026-11-10) aur Lot B 3kg (non-expiring, evidence "Owner physically checked, not a dry spice") enter karta hai; 5+3=8, exact match, reconciliation save ho jaata hai.',
    },
  },
  {
    id: 'inventory-stock-count',
    titleEn: 'Physical Stock Counts (Blind Count)',
    titleHi: 'Physical Stock Counts (Blind Count)',
    icon: 'clipboard-check',
    summaryEn: 'Staff count stock blind (without seeing the expected number), and a separate manager approves or rejects the count.',
    summaryHi: 'Staff stock ko blind count karta hai (expected number dikhaye bina), aur ek alag manager approve ya reject karta hai.',
    sections: [
      {
        headingEn: 'Steps',
        headingHi: 'Steps',
        items: [
          { en: 'Click "Start Count", select which raw materials to count via checkbox, submit "Start Count".', hi: '"Start Count" click karo, checkbox se kaunse raw materials count karna hai select karo, "Start Count" submit karo.' },
          { en: 'Count is now "DRAFT" — counting staff enters physical quantity for each material without seeing the expected qty (blind).', hi: 'Count ab "DRAFT" status mein hai — counting staff har material ki physical quantity bina expected qty dekhe (blind) enter karta hai.' },
          { en: '"Submit Count" sets the status to "SUBMITTED".', hi: '"Submit Count" se status "SUBMITTED" ho jaata hai.' },
          { en: 'A different Branch Manager or Owner opens it — now both expected and physical quantities show.', hi: 'Ek alag Branch Manager ya Owner isko kholta hai — ab expected aur physical dono dikhte hain.' },
          { en: 'Reviewer clicks "Approve" or "Reject" (reject needs at least a 3-character reason).', hi: 'Reviewer "Approve" ya "Reject" click karta hai (reject ke liye kam se kam 3-character ka reason zaroori hai).' },
        ],
      },
      {
        headingEn: 'Conditions',
        headingHi: 'Conditions',
        items: [
          { en: 'The submitter can never approve/reject their own count — system explicitly checks submittedById !== actor.id.', hi: 'Submitter apna count khud approve/reject nahi kar sakta — system check karta hai submittedById !== actor.id.' },
          { en: 'Only BRANCH_MANAGER or SUPER_ADMIN can review, never the counting staff themselves.', hi: 'Sirf BRANCH_MANAGER ya SUPER_ADMIN review kar sakte hain, counting staff khud kabhi nahi.' },
          { en: 'On approval, the delta (physicalQty minus expectedQty frozen at the cutoff snapshot) is applied to the CURRENT live balance — never overwritten.', hi: 'Approval par delta (physicalQty minus cutoff-snapshot ka expectedQty) current live balance par apply hota hai — overwrite nahi hota.' },
          { en: 'So if a GRN arrived mid-count, that receipt is not erased.', hi: 'Isliye agar count ke beech mein GRN aa gaya ho, to wo receipt mitta nahi.' },
          { en: 'Shortfall is drawn FEFO from all batches, even expired ones.', hi: 'Shortfall FEFO order mein sabhi batches se liya jaata hai, expired bhi.' },
          { en: 'Surplus creates a new UNKNOWN-expiry batch since the count doesn\'t know which lot it is.', hi: 'Surplus se naya UNKNOWN-expiry batch banta hai kyunki count ko pata nahi kaunsa lot hai.' },
          { en: 'If approval would make stock negative, the system rejects with a 409 error — must reconcile first.', hi: 'Agar approval se stock negative ho jaaye, to system 409 error deta hai — pehle reconcile karna zaroori hai.' },
        ],
      },
    ],
    example: {
      en: 'Cutoff snapshot expected balance was 5kg. Physical count found 0kg (shortage). Before approval, a 3kg GRN receipt arrived — live balance is now 8kg. Approval delta is -5kg (0-5), so final balance = 8-5 = 3kg, not 0kg, because delta applies to current balance, not an overwrite.',
      hi: 'Cutoff snapshot ka expected balance 5kg tha. Physical count mein 0kg mila (shortage). Approval se pehle 3kg ka GRN receipt aa gaya — live balance ab 8kg hai. Approval delta -5kg hai (0-5), to final balance = 8-5 = 3kg, 0kg nahi, kyunki delta current balance par apply hota hai, overwrite nahi.',
    },
  },
  {
    id: 'inventory-reorder',
    titleEn: 'Reorder Suggestions',
    titleHi: 'Reorder Suggestions',
    icon: 'repeat',
    summaryEn: 'System auto-flags materials below min-level and splits the top-up between internal transfer and external purchase.',
    summaryHi: 'System automatically unhi materials ko flag karta hai jo min-level se neeche hain, aur top-up ko internal transfer aur external purchase mein split karta hai.',
    sections: [
      {
        headingEn: 'Steps',
        headingHi: 'Steps',
        items: [
          { en: 'Click "Preview fresh suggestions" — list shows item, current position/max, suggested qty, "Internal first" (from central warehouse), and "External draft" (remainder as indent).', hi: '"Preview fresh suggestions" click karo — list mein item, current position/max, suggested qty, "Internal first" (central warehouse se) aur "External draft" (baki indent ke roop mein) dikhta hai.' },
          { en: 'Click "Create reviewed requests" — creates an internal requisition if internal qty > 0 and/or a DRAFT purchase indent if external qty > 0.', hi: '"Create reviewed requests" click karo — internal qty > 0 ho to internal requisition banta hai, aur external qty > 0 ho to DRAFT purchase indent banta hai.' },
          { en: 'Both still go through normal approval steps — nothing is auto-approved, auto-ordered, or auto-paid.', hi: 'Dono normal approval steps se guzarte hain — kuch bhi auto-approved, auto-ordered ya auto-paid nahi hota.' },
        ],
      },
      {
        headingEn: 'Conditions',
        headingHi: 'Conditions',
        items: [
          { en: 'A suggestion only triggers when position is below minimum; the top-up always targets the max level.', hi: 'Suggestion sirf tab trigger hota hai jab position minimum se neeche ho; top-up hamesha max level tak target karta hai.' },
          { en: '"Usable stock" plus non-duplicate inbound supply plus pending request reservations are counted exactly once — no double counting.', hi: '"Usable stock" plus non-duplicate inbound supply plus pending request reservations exactly ek baar count hote hain — double counting nahi hoti.' },
          { en: 'Internal availability is based on "proven" central stock (batch balance and flat warehouse balance must match).', hi: 'Internal availability "proven" central stock par based hai (batch balance aur flat warehouse balance match hone chahiye).' },
          { en: 'If there\'s a reconciliation mismatch, internal availability becomes null and everything routes "external" (fail-safe).', hi: 'Agar reconciliation mismatch ho, to internal availability null ho jaata hai aur sab kuch "external" route hota hai (fail-safe).' },
          { en: 'Converting checks a "position fingerprint" — if the position changed meanwhile (new GRN, new transfer), system says "stale, refresh" and won\'t use the old suggestion.', hi: 'Convert karte waqt "position fingerprint" check hota hai — agar position beech mein change ho gayi (naya GRN, naya transfer), to system "stale, refresh" kehta hai aur purana suggestion use nahi karta.' },
          { en: 'An idempotent requestKey prevents duplicate requisition/indent creation on a repeated request.', hi: 'Idempotent requestKey repeated request par duplicate requisition/indent banne se rokta hai.' },
        ],
      },
    ],
    example: {
      en: '"Chicken" max 30kg, current position (usable+inbound) 10kg, min 15kg — so it suggests a 20kg top-up. Central warehouse has 12kg proven stock -> 12kg internal requisition + 8kg external draft indent created.',
      hi: '"Chicken" ka max 30kg hai, current position (usable+inbound) 10kg, min 15kg — isliye 20kg top-up suggest hota hai. Central warehouse mein 12kg proven stock hai -> 12kg internal requisition + 8kg external draft indent banta hai.',
    },
  },
  {
    id: 'inventory-requisition',
    titleEn: 'Internal Requisition (Raw + Prepared)',
    titleHi: 'Internal Requisition (Raw + Prepared)',
    icon: 'clipboard-list',
    summaryEn: 'A branch requests raw or prepared items from base kitchen; actual fulfillment happens via separate transfer/dispatch forms.',
    summaryHi: 'Branch base kitchen se raw ya prepared items request karta hai; actual fulfillment alag transfer/dispatch forms se hota hai.',
    sections: [
      {
        headingEn: 'Steps',
        headingHi: 'Steps',
        items: [
          { en: 'Add a line — Type (Raw/Prepared), select item, enter quantity; click "Submit requisition".', hi: 'Line add karo — Type (Raw/Prepared), item select karo, quantity enter karo; "Submit requisition" click karo.' },
          { en: 'Owner (SUPER_ADMIN) opens it, enters approve qty for each line (equal or less than requested), clicks "Approve requisition".', hi: 'Owner (SUPER_ADMIN) isko kholta hai, har line ke liye approve qty enter karta hai (requested ke equal ya kam), "Approve requisition" click karta hai.' },
          { en: 'Fulfillment happens separately — via Warehouse module\'s "Dispatch Transfer" (for RAW) or Semi-FG dispatch form (for PREPARED), linking to this requisition line.', hi: 'Fulfillment alag se hota hai — Warehouse module ke "Dispatch Transfer" (RAW ke liye) ya Semi-FG dispatch form (PREPARED ke liye) se, jo isi requisition line se link hota hai.' },
          { en: 'If some quantity is still pending and no longer needed, click "Cancel remaining".', hi: 'Agar kuch quantity abhi pending hai aur zaroorat nahi, to "Cancel remaining" click karo.' },
        ],
      },
      {
        headingEn: 'Conditions',
        headingHi: 'Conditions',
        items: [
          { en: 'Only Owner can approve a requisition.', hi: 'Sirf Owner requisition approve kar sakta hai.' },
          { en: 'Approved qty can never exceed requested qty.', hi: 'Approved qty requested qty se kabhi zyada nahi ho sakti.' },
          { en: '"Cancel remaining" only cancels the remaining (approved minus already-issued) quantity — already-dispatched real stock is never touched.', hi: '"Cancel remaining" sirf remaining (approved minus already-issued) quantity cancel karta hai — already-dispatched real stock kabhi touch nahi hota.' },
          { en: 'When a dispatch fulfills this requisition line, the system checks that total dispatched never exceeds approved qty, even across multiple dispatches.', hi: 'Jab koi dispatch requisition line fulfill karta hai, system check karta hai ki total dispatched approved qty se zyada na ho, multiple dispatches mein bhi.' },
        ],
      },
    ],
    example: {
      en: 'Branch "Andheri" requested 10kg "Gravy Base" (Prepared). Owner approved 7kg. Base kitchen dispatched 4kg first, then 3kg (total 7kg = fully fulfilled). If now 1kg more is attempted, system rejects ("would exceed approved quantity").',
      hi: 'Andheri branch ne 10kg "Gravy Base" (Prepared) request kiya. Owner ne 7kg approve kiya. Base kitchen ne pehle 4kg, phir 3kg dispatch kiya (total 7kg = fully fulfilled). Agar ab 1kg aur try kiya jaaye, system reject karta hai ("would exceed approved quantity").',
    },
  },
  {
    id: 'inventory-wastage-variance',
    titleEn: 'Wastage Write-off & Night Variance (Backend-Only)',
    titleHi: 'Wastage Write-off & Night Variance (Backend-Only)',
    icon: 'alert-triangle',
    summaryEn: 'Backend logic exists for loss-tracking and shift variance; the UI panel is not yet built, but the rules are ready.',
    summaryHi: 'Loss-tracking aur shift variance ke liye backend logic ready hai; UI panel abhi nahi bana, lekin rules ready hain.',
    sections: [
      {
        headingEn: 'Planned Rules (server logic in inventory-adjustments.ts)',
        headingHi: 'Planned Rules (server logic inventory-adjustments.ts mein hai)',
        items: [
          { en: 'The backend-only logic exists in inventory-adjustments.ts; the UI panel is not yet built.', hi: 'Backend-only logic inventory-adjustments.ts mein maujood hai; UI panel abhi nahi banaya gaya.' },
          { en: 'Wastage Write-off will log expired/dropped/burnt stock, with mandatory photo proof.', hi: 'Wastage Write-off expired/dropped/burnt stock ko log karega, mandatory photo proof ke saath.' },
          { en: 'Night Variance will compare end-of-shift physical count vs theoretical, with a pilferage flag.', hi: 'Night Variance end-of-shift physical count vs theoretical compare karega, pilferage flag ke saath.' },
          { en: 'Expired write-off will only draw stock from expired batches.', hi: 'Expired write-off sirf expired batches se stock lega.' },
          { en: 'Dropped/burnt write-off will draw stock FEFO.', hi: 'Dropped/burnt write-off FEFO order mein stock lega.' },
          { en: 'Variance valuation requires a locked vendor rate — it fails if missing, and never fakes a value.', hi: 'Variance valuation ke liye locked vendor rate zaroori hai — na ho to fail hota hai, kabhi fake value nahi banata.' },
        ],
      },
    ],
    example: {
      en: 'No worked example is provided in the source — this feature is backend-only and pending a UI.',
      hi: 'Source mein koi worked example nahi diya gaya — yeh feature sirf backend mein hai, UI abhi pending hai.',
    },
  },
  {
    id: 'warehouse-tab',
    titleEn: 'Warehouses Tab — Create Central/Branch Warehouse',
    titleHi: 'Warehouses Tab — Central/Branch Warehouse Banana',
    icon: 'warehouse',
    summaryEn: 'Two-level warehouse system: one CENTRAL (HQ bulk stock) and each branch\'s own BRANCH warehouse.',
    summaryHi: 'Two-level warehouse system: ek CENTRAL (HQ bulk stock) aur har branch ka apna BRANCH warehouse.',
    sections: [
      {
        headingEn: 'Steps & Conditions',
        headingHi: 'Steps & Conditions',
        items: [
          { en: 'Click "New Warehouse" (Owner-only).', hi: '"New Warehouse" click karo (Owner-only).' },
          { en: 'Choose type Central or Branch.', hi: 'Type Central ya Branch choose karo.' },
          { en: 'Enter name, and select the branch if Branch type is chosen.', hi: 'Name enter karo, aur Branch type chuna ho to branch select karo.' },
          { en: 'Click "Create" to finalize.', hi: 'Finalize karne ke liye "Create" click karo.' },
          { en: 'Only SUPER_ADMIN can create a new warehouse.', hi: 'Sirf SUPER_ADMIN naya warehouse create kar sakta hai.' },
        ],
      },
    ],
    example: {
      en: 'No worked example is provided in the source for this section.',
      hi: 'Is section ke liye source mein koi worked example nahi diya gaya.',
    },
  },
  {
    id: 'warehouse-stock-in',
    titleEn: 'Central Stock-In and Balances',
    titleHi: 'Central Stock-In and Balances',
    icon: 'package-plus',
    summaryEn: 'Recording stock-in directly at the central warehouse, updating both the flat balance and the real expiry-batch lots.',
    summaryHi: 'Central warehouse par directly stock-in record karna, flat balance aur real expiry-batch lots dono update hote hain.',
    sections: [
      {
        headingEn: 'Steps & Conditions',
        headingHi: 'Steps & Conditions',
        items: [
          { en: 'Go to Warehouses tab, select the central warehouse.', hi: 'Warehouses tab par jao, central warehouse select karo.' },
          { en: 'Enter raw material, quantity, batch reference, expiry date.', hi: 'Raw material, quantity, batch reference, expiry date enter karo.' },
          { en: 'Click "Record central stock-in".', hi: '"Record central stock-in" click karo.' },
          { en: 'Unknown expiry (no date, not "non-expiring" either) stays HELD — not eligible for consumption/FEFO dispatch until Owner verifies.', hi: 'Unknown expiry (na date, na "non-expiring") HELD rehta hai — Owner verify kiye bina consumption/FEFO dispatch ke liye eligible nahi.' },
          { en: '"Owner verified non-expiring" is SUPER_ADMIN-only and requires evidence.', hi: '"Owner verified non-expiring" sirf SUPER_ADMIN ke liye hai aur evidence zaroori hai.' },
          { en: 'Central warehouse\'s flat balance (warehouseStock) and its real batch-lots total must always reconcile — if mismatched, internal availability becomes "unknown" (also affects reorder suggestions).', hi: 'Central warehouse ka flat balance (warehouseStock) aur real batch-lots total hamesha reconcile hona chahiye — mismatch hone par internal availability "unknown" ho jaati hai (reorder suggestions bhi affect hoti hain).' },
        ],
      },
    ],
    example: {
      en: 'No worked example is provided in the source for this section.',
      hi: 'Is section ke liye source mein koi worked example nahi diya gaya.',
    },
  },
  {
    id: 'warehouse-dispatch',
    titleEn: 'Dispatch Stock Transfer (Central → Branch)',
    titleHi: 'Dispatch Stock Transfer (Central → Branch)',
    icon: 'truck',
    summaryEn: 'Sending raw material from central warehouse to a branch warehouse — only Central-to-Branch is supported.',
    summaryHi: 'Central warehouse se branch warehouse ko raw material bhejna — sirf Central-to-Branch supported hai.',
    sections: [
      {
        headingEn: 'Steps & Conditions',
        headingHi: 'Steps & Conditions',
        items: [
          { en: 'Click "Dispatch Transfer".', hi: '"Dispatch Transfer" click karo.' },
          { en: 'Choose "From (Central)" and "To (Branch)" warehouse — branch user can only select their own branch\'s warehouse; Owner can dispatch to any branch.', hi: '"From (Central)" aur "To (Branch)" warehouse choose karo — branch user sirf apni branch ka warehouse select kar sakta hai; Owner kisi bhi branch ko dispatch kar sakta hai.' },
          { en: 'Enter raw material and qty dispatched, click "Dispatch".', hi: 'Raw material aur qty dispatched enter karo, "Dispatch" click karo.' },
          { en: 'Only Central-to-Branch transfer is supported; branch-to-branch is not yet available.', hi: 'Sirf Central-to-Branch transfer supported hai; branch-to-branch abhi available nahi.' },
          { en: 'Dispatch selects eligible lots via FEFO — expired/HELD/unknown-expiry stock is automatically blocked, never used.', hi: 'Dispatch FEFO se eligible lots select karta hai — expired/HELD/unknown-expiry stock automatically block ho jaata hai, kabhi use nahi hota.' },
          { en: 'Central warehouse\'s flat balance is atomically debited at dispatch time — if insufficient stock, the whole transaction rolls back (no partial transfer is ever created).', hi: 'Central warehouse ka flat balance dispatch ke time atomically debit hota hai — stock kam ho to poora transaction rollback hota hai (partial transfer kabhi nahi banta).' },
          { en: 'Branch\'s inventory only updates when receipt is confirmed, not at dispatch.', hi: 'Branch ki inventory sirf receipt confirm hone par update hoti hai, dispatch ke time nahi.' },
          { en: 'Optionally it can link to an internal requisition line (requisitionLineId) — then the system checks total dispatch never exceeds the approved qty.', hi: 'Optionally isko internal requisition line se link kiya ja sakta hai (requisitionLineId) — tab system check karta hai ki total dispatch approved qty se zyada na ho.' },
        ],
      },
    ],
    example: {
      en: 'No separate worked example is given for dispatch alone — see the Confirm Receipt example which covers a full dispatch-and-receive cycle.',
      hi: 'Sirf dispatch ke liye alag example nahi diya gaya — Confirm Receipt ka example dekho jo poora dispatch-and-receive cycle cover karta hai.',
    },
  },
  {
    id: 'warehouse-receipt',
    titleEn: 'Confirm Receipt (Branch Side)',
    titleHi: 'Confirm Receipt (Branch Side)',
    icon: 'package-check',
    summaryEn: 'A DISPATCHED transfer gets its actual received quantity confirmed by the branch — partial receive is possible, even per-lot.',
    summaryHi: 'DISPATCHED transfer ki actual received quantity branch confirm karta hai — partial receive possible hai, per-lot bhi.',
    sections: [
      {
        headingEn: 'Steps',
        headingHi: 'Steps',
        items: [
          { en: 'In "Stock Transfers" tab, click "Receive" on a DISPATCHED transfer.', hi: '"Stock Transfers" tab mein, DISPATCHED transfer par "Receive" click karo.' },
          { en: 'If the dispatch came from multiple lots (batches), each lot\'s received quantity can be entered separately — full dispatched is prefilled, change for shortfall.', hi: 'Agar dispatch multiple lots (batches) se hua hai, to har lot ki received quantity alag se enter ki ja sakti hai — full dispatched prefilled hota hai, shortfall ke liye change karo.' },
          { en: 'Click "Confirm Receipt" — the system shows variance (dispatched minus received).', hi: '"Confirm Receipt" click karo — system variance dikhata hai (dispatched minus received).' },
        ],
      },
      {
        headingEn: 'Conditions',
        headingHi: 'Conditions',
        items: [
          { en: 'Received quantity can never exceed dispatched quantity.', hi: 'Received quantity dispatched quantity se kabhi zyada nahi ho sakti.' },
          { en: 'If dispatch came from multiple lots and received total is less than dispatched total (real shortfall), a per-lot breakdown is mandatory — a single aggregate number is not allowed (ambiguous which lot came short).', hi: 'Agar dispatch multiple lots se hua aur received total dispatched total se kam ho (real shortfall), to per-lot breakdown mandatory hai — sirf ek aggregate number allow nahi hai (pata nahi chalta kaunsa lot kam aaya).' },
          { en: 'A single-lot dispatch, or full-qty multi-lot receive, makes the per-lot breakdown optional.', hi: 'Single-lot dispatch, ya full-qty multi-lot receive, par per-lot breakdown optional ho jaata hai.' },
          { en: 'The original dispatched lot\'s identity (batchNo, expiry) is preserved when the branch gets credited — a fabricated "unknown origin" batch is never created when the real lot is known.', hi: 'Branch ko credit karte waqt original dispatched lot ki identity (batchNo, expiry) preserve rehti hai — real lot pata ho to fabricated "unknown origin" batch kabhi nahi banta.' },
          { en: 'Receive is idempotent: the exact same repeated request doesn\'t double-credit, it just returns the stored result again.', hi: 'Receive idempotent hai: exact same repeated request double-credit nahi karta, sirf stored result dobara return karta hai.' },
          { en: 'A different request trying to receive an already-received transfer gets a 409 error.', hi: 'Already-received transfer ko dobara receive karne ki alag request par 409 error aata hai.' },
        ],
      },
    ],
    example: {
      en: 'Central dispatched 10kg "Chawal" — 2 lots: Lot A 6kg (expiry 2026-12-01), Lot B 4kg (expiry 2026-12-15). Branch only received 9kg (1kg spilled/damaged in transit). Staff confirms Lot A 6kg, Lot B 3kg. Total received = 9kg, variance = 1kg (shortfall flagged). Branch stock gets credited with those same 2 original lots (6kg of expiry 12/01, 3kg of expiry 12/15) — no "unknown" lot created.',
      hi: 'Central ne 10kg "Chawal" dispatch kiya — 2 lots: Lot A 6kg (expiry 2026-12-01), Lot B 4kg (expiry 2026-12-15). Branch ko sirf 9kg mila (1kg transit mein spill/damage hua). Staff Lot A 6kg, Lot B 3kg confirm karta hai. Total received = 9kg, variance = 1kg (shortfall flag hota hai). Branch stock ko wahi 2 original lots credit hote hain (6kg of expiry 12/01, 3kg of expiry 12/15) — koi "unknown" lot nahi banta.',
    },
  },
  {
    id: 'purchase-indent',
    titleEn: 'Raise Indent',
    titleHi: 'Raise Indent',
    icon: 'file-plus',
    summaryEn: 'A branch raises an internal demand for raw materials — no vendor or PO involved yet.',
    summaryHi: 'Branch raw materials ke liye internal demand raise karta hai — abhi vendor ya PO involve nahi hota.',
    sections: [
      {
        headingEn: 'Steps & Conditions',
        headingHi: 'Steps & Conditions',
        items: [
          { en: 'Click "Raise Indent".', hi: '"Raise Indent" click karo.' },
          { en: 'Select branch, enter 1-50 line items (material + quantity).', hi: 'Branch select karo, 1-50 line items (material + quantity) enter karo.' },
          { en: 'Click "Raise" — the indent saves in DRAFT status.', hi: '"Raise" click karo — indent DRAFT status mein save hota hai.' },
          { en: 'A DRAFT indent is just a draft, not yet in the approval queue.', hi: 'DRAFT indent sirf ek draft hai, abhi approval queue mein nahi hai.' },
        ],
      },
    ],
    example: {
      en: 'No worked example is provided in the source for this section.',
      hi: 'Is section ke liye source mein koi worked example nahi diya gaya.',
    },
  },
  {
    id: 'purchase-submit-approval',
    titleEn: 'Submit Indent for Approval (Spike + Value Gate)',
    titleHi: 'Submit Indent for Approval (Spike + Value Gate)',
    icon: 'shield-alert',
    summaryEn: 'Submitting a DRAFT indent runs two independent checks — quantity spike and value threshold — before auto-approving or sending it to Owner.',
    summaryHi: 'DRAFT indent submit karne par do independent checks chalte hain — quantity spike aur value threshold — fir auto-approve hota hai ya Owner ko jaata hai.',
    sections: [
      {
        headingEn: 'Steps',
        headingHi: 'Steps',
        items: [
          { en: 'Click "Submit for Approval" on a DRAFT row.', hi: 'DRAFT row par "Submit for Approval" click karo.' },
          { en: 'The system automatically decides APPROVED (free path) or PENDING_APPROVAL (needs Owner review).', hi: 'System automatically decide karta hai APPROVED (free path) ya PENDING_APPROVAL (Owner review zaroori).' },
        ],
      },
      {
        headingEn: 'Check 1 — Quantity Spike',
        headingHi: 'Check 1 — Quantity Spike',
        items: [
          { en: 'Computes a rolling average of the last 30 days\' actually-posted GRNs (status APPROVED, meaning real quality-passed receipts) per material.', hi: 'Har material ke liye last 30 din ke actually-posted GRNs (status APPROVED, yaani real quality-passed receipts) ka rolling average compute hota hai.' },
          { en: 'Needs at least 3 samples, or there\'s "no real baseline" — in that state the indent automatically goes PENDING_APPROVAL, never fabricating an average.', hi: 'Kam se kam 3 samples zaroori hain, warna "no real baseline" hota hai — tab indent automatically PENDING_APPROVAL ho jaata hai, average kabhi fabricate nahi hota.' },
          { en: 'If the requested qty is more than 25% above the average, a spike flag triggers -> PENDING_APPROVAL, and the exact spike% (e.g. +40.5%) is saved.', hi: 'Agar requested qty average se 25% zyada ho, to spike flag trigger hota hai -> PENDING_APPROVAL, aur exact spike% (jaise +40.5%) save hota hai.' },
        ],
      },
      {
        headingEn: 'Check 2 — Value Threshold (Owner-Configurable)',
        headingHi: 'Check 2 — Value Threshold (Owner-Configurable)',
        items: [
          { en: 'If Owner set a TSh value threshold in Business Policy, the indent\'s estimated value (latest locked vendor rate x requested qty) is calculated.', hi: 'Agar Owner ne Business Policy mein TSh value threshold set kiya ho, indent ki estimated value (latest locked vendor rate x requested qty) calculate hoti hai.' },
          { en: 'If any material\'s locked rate is missing, the estimate is treated as "unknown" and fails closed — meaning PENDING_APPROVAL is forced, never silently auto-approved on unknown cost.', hi: 'Agar kisi material ka locked rate missing ho, estimate "unknown" treat hoti hai aur fail-closed hoti hai — matlab PENDING_APPROVAL force hota hai, unknown cost par silently auto-approve kabhi nahi hota.' },
          { en: 'If the estimated value is at or above the threshold, it goes PENDING_APPROVAL.', hi: 'Agar estimated value threshold ke equal ya zyada ho, to PENDING_APPROVAL ho jaata hai.' },
          { en: 'Whichever check triggers, it goes PENDING_APPROVAL — only when both checks are clear does it get auto-APPROVED.', hi: 'Jo bhi check trigger ho, PENDING_APPROVAL ho jaata hai — sirf jab dono checks clear hon tab auto-APPROVED hota hai.' },
        ],
      },
    ],
    example: {
      en: '"Paneer" 30-day average is 20kg/order (5 samples). The indent requests 30kg — 30 > 20x1.25=25, spike detected (+50% over average) -> PENDING_APPROVAL, regardless of whether the value threshold is enabled.',
      hi: '"Paneer" ka 30-day average 20kg/order hai (5 samples). Indent 30kg request karta hai — 30 > 20x1.25=25, spike detect hota hai (+50% average se zyada) -> PENDING_APPROVAL, value threshold enabled ho ya na ho.',
    },
  },
  {
    id: 'purchase-approve-indent',
    titleEn: 'Approve/Reject Indent (Owner)',
    titleHi: 'Approve/Reject Indent (Owner)',
    icon: 'check-circle',
    summaryEn: 'A PENDING_APPROVAL indent is reviewed only by the Owner — never the branch manager or requester.',
    summaryHi: 'PENDING_APPROVAL indent sirf Owner review karta hai — branch manager ya requester kabhi nahi.',
    sections: [
      {
        headingEn: 'Steps & Conditions',
        headingHi: 'Steps & Conditions',
        items: [
          { en: '"Approve" or "Reject" button is visible only to SUPER_ADMIN on PENDING_APPROVAL rows.', hi: '"Approve" ya "Reject" button sirf SUPER_ADMIN ko PENDING_APPROVAL rows par dikhta hai.' },
          { en: 'Only Owner can approve/reject — never the branch manager or requester themselves (GAP-016 mandatory HO approval rule).', hi: 'Sirf Owner approve/reject kar sakta hai — branch manager ya requester khud kabhi nahi (GAP-016 mandatory HO approval rule).' },
          { en: 'An approved indent moves to "APPROVED" status, and a PO can now be raised against it.', hi: 'Approved indent "APPROVED" status mein chala jaata hai, aur ab usi par PO raise ho sakta hai.' },
        ],
      },
    ],
    example: {
      en: 'No worked example is provided in the source for this section.',
      hi: 'Is section ke liye source mein koi worked example nahi diya gaya.',
    },
  },
  {
    id: 'purchase-po-create',
    titleEn: 'New Purchase Order (Step 1: Buy)',
    titleHi: 'New Purchase Order (Step 1: Buy)',
    icon: 'shopping-cart',
    summaryEn: 'Creating a PO against an approved indent (Store purchase) or as a free-standing General purchase.',
    summaryHi: 'Approved indent ke against PO banana (Store purchase) ya free-standing General purchase ke roop mein.',
    sections: [
      {
        headingEn: 'Steps — Store Purchase',
        headingHi: 'Steps — Store Purchase',
        items: [
          { en: 'Click "New Purchase", leave the "General purchase" checkbox unchecked.', hi: '"New Purchase" click karo, "General purchase" checkbox unchecked rakho.' },
          { en: 'Select Branch, Vendor; enter the "Full indent ID" and "Look up approved indent" (latest 200 approved indents already show in a dropdown; older ones need the full-ID lookup).', hi: 'Branch, Vendor select karo; "Full indent ID" enter karo aur "Look up approved indent" karo (latest 200 approved indents dropdown mein pehle se dikhte hain; purane ke liye full-ID lookup chahiye).' },
          { en: 'Selecting the approved indent shows all materials/quantities locked (must exactly match the indent) — enter a rate (TSh/unit) for each line.', hi: 'Approved indent select karne par sab materials/quantities locked dikhte hain (indent se exactly match hona chahiye) — har line ke liye rate (TSh/unit) enter karo.' },
          { en: 'Click "Create (Step 1: Buy)".', hi: '"Create (Step 1: Buy)" click karo.' },
        ],
      },
      {
        headingEn: 'Steps — General Purchase',
        headingHi: 'Steps — General Purchase',
        items: [
          { en: 'Check the "General purchase" checkbox.', hi: '"General purchase" checkbox check karo.' },
          { en: 'Enter Branch, Vendor, Item description, Amount (TSh).', hi: 'Branch, Vendor, Item description, Amount (TSh) enter karo.' },
          { en: 'Click "Create (Step 1: Buy)".', hi: '"Create (Step 1: Buy)" click karo.' },
        ],
      },
      {
        headingEn: 'Conditions',
        headingHi: 'Conditions',
        items: [
          { en: 'Store purchase requires an APPROVED indent; General purchase is not allowed to have an indent.', hi: 'Store purchase ke liye APPROVED indent zaroori hai; General purchase ke saath indent allowed nahi hai.' },
          { en: "The PO's materials and quantities must exactly match the approved indent, compared in aggregate including duplicate lines.", hi: "PO ke materials aur quantities approved indent se exactly match hona chahiye, aggregate mein compare hota hai duplicate lines sahit." },
          { en: 'The vendor must be in APPROVED status — a DRAFT or SUSPENDED vendor cannot have a PO created at all (server-side hard enforce, cannot be bypassed from UI).', hi: 'Vendor APPROVED status mein hona chahiye — DRAFT ya SUSPENDED vendor ke liye PO bilkul nahi ban sakta (server-side hard enforce, UI se bypass nahi ho sakta).' },
          { en: 'If a vendor is restricted to a specific branch/category, a PO outside that scope is rejected.', hi: 'Agar vendor kisi specific branch/category tak restricted hai, to scope ke bahar PO reject ho jaata hai.' },
          { en: 'General Purchase value gate (GAP-016): if Owner set a threshold and the general purchase value is at/above it, a separate "General Purchase HO Approvals" request must be APPROVED first (its generalPurchaseRequestId must be passed) — the general-purchase flag alone cannot skip this review.', hi: 'General Purchase value gate (GAP-016): agar Owner ne threshold set kiya hai aur general purchase value usse equal/zyada ho, to pehle alag "General Purchase HO Approvals" request APPROVED honi chahiye (uska generalPurchaseRequestId pass karna hoga) — general-purchase flag se yeh review skip nahi ho sakta.' },
          { en: 'PO creation sets status "CREATED" and the linked indent (if any) becomes "PO_RAISED".', hi: 'PO creation se status "CREATED" set hota hai aur linked indent (agar ho) "PO_RAISED" ho jaata hai.' },
        ],
      },
    ],
    example: {
      en: 'Indent had "Aata" 50kg + "Namak" 5kg approved. While creating the PO, rate entered was Aata TSh45/kg, Namak TSh20/kg. PO Amount = 50x45 + 5x20 = TSh2350.',
      hi: 'Indent mein "Aata" 50kg + "Namak" 5kg approved tha. PO banate waqt rate Aata TSh45/kg, Namak TSh20/kg daala gaya. PO Amount = 50x45 + 5x20 = TSh2350.',
    },
  },
  {
    id: 'purchase-upload-bill',
    titleEn: 'Step 2 — Upload Bill (Optional)',
    titleHi: 'Step 2 — Upload Bill (Optional)',
    icon: 'upload',
    summaryEn: "Attaching the vendor's physical bill as an optional record — the actual 3-way-match invoice step is separate.",
    summaryHi: 'Vendor ka physical bill optional record ke roop mein attach karna — actual 3-way-match invoice step alag hai.',
    sections: [
      {
        headingEn: 'Steps & Conditions',
        headingHi: 'Steps & Conditions',
        items: [
          { en: 'In the PO row, choose a file (PDF/PNG/JPEG/WEBP) under "Upload Bill (optional)" — it uploads automatically.', hi: 'PO row mein, "Upload Bill (optional)" ke under file (PDF/PNG/JPEG/WEBP) choose karo — automatically upload ho jaata hai.' },
          { en: 'Once a bill is uploaded, re-upload is not allowed (assertPoNotBilled).', hi: 'Bill ek baar upload ho gaya to re-upload allow nahi hai (assertPoNotBilled).' },
        ],
      },
    ],
    example: {
      en: 'No worked example is provided in the source for this section.',
      hi: 'Is section ke liye source mein koi worked example nahi diya gaya.',
    },
  },
  {
    id: 'purchase-material-received',
    titleEn: 'Step 3 — Mark Material Received / Receive Remaining (Multi-Delivery GRN)',
    titleHi: 'Step 3 — Mark Material Received / Receive Remaining (Multi-Delivery GRN)',
    icon: 'inbox',
    summaryEn: 'When vendor goods arrive, a GRN is created ready for Quality Check — a PO can split across multiple deliveries.',
    summaryHi: 'Vendor ka saaman aane par GRN banta hai jo Quality Check ke liye ready hota hai — ek PO multiple deliveries mein split ho sakta hai.',
    sections: [
      {
        headingEn: 'Steps & Conditions',
        headingHi: 'Steps & Conditions',
        items: [
          { en: 'Click "Mark Material Received" (or "Receive Remaining" if already PARTIALLY_RECEIVED).', hi: '"Mark Material Received" click karo (ya "Receive Remaining" agar already PARTIALLY_RECEIVED hai).' },
          { en: "The system computes each PO line's outstanding quantity (ordered minus already-received in all prior GRNs), and creates a PENDING GRN.", hi: 'System har PO line ki outstanding quantity compute karta hai (ordered minus already-received sabhi prior GRNs mein), aur ek PENDING GRN banta hai.' },
          { en: 'The GRN now shows in the "GRN/Quality" tab for quality check.', hi: 'GRN ab "GRN/Quality" tab mein quality check ke liye dikhta hai.' },
          { en: 'Any PO line that is fully received is no longer available for another receive attempt.', hi: 'Jo PO line fully received ho gayi, usko dobara receive karne ki koshish nahi ho sakti.' },
          { en: 'If a line was received with a real shortage (e.g. 100kg ordered, 80kg arrived), the PO status becomes "PARTIALLY_RECEIVED"; once all lines are fully received, the status becomes "RECEIVED".', hi: 'Agar kisi line mein real shortage ho (jaise 100kg order, 80kg aaya), to PO status "PARTIALLY_RECEIVED" ho jaata hai; sab lines fully receive hone par status "RECEIVED" ho jaata hai.' },
          { en: 'A re-receive attempt on a fully-received PO gives a 409 error.', hi: 'Fully-received PO par dobara receive karne ki koshish 409 error deti hai.' },
          { en: 'This step only creates a GRN — stock is never posted here, stock only posts at Quality Check.', hi: 'Yeh step sirf GRN banata hai — stock yahan kabhi post nahi hota, stock sirf Quality Check par post hota hai.' },
        ],
      },
    ],
    example: {
      en: 'PO had 100kg "Dal" ordered. First receive got only 70kg (vendor shortage) — GRN1 created with qtyReceived=70, PO status "PARTIALLY_RECEIVED". Days later the remaining 30kg arrives — "Receive Remaining" creates GRN2 with qtyReceived=30 (outstanding = 100-70=30), PO status "RECEIVED".',
      hi: 'PO mein 100kg "Dal" order kiya gaya. Pehli receive mein sirf 70kg mila (vendor shortage) — GRN1 bana qtyReceived=70, PO status "PARTIALLY_RECEIVED". Kuch din baad baaki 30kg aata hai — "Receive Remaining" se GRN2 banta hai qtyReceived=30 (outstanding = 100-70=30), PO status "RECEIVED".',
    },
  },
  {
    id: 'purchase-grn-quality',
    titleEn: 'GRN/Quality Check',
    titleHi: 'GRN/Quality Check',
    icon: 'badge-check',
    summaryEn: 'Giving a PASS/PARTIAL/FAIL verdict on received material and posting the correct accepted quantity to inventory.',
    summaryHi: 'Received material par PASS/PARTIAL/FAIL verdict dena aur correct accepted quantity inventory mein post karna.',
    sections: [
      {
        headingEn: 'Steps',
        headingHi: 'Steps',
        items: [
          { en: 'In the "GRN/Quality" tab, click "Quality Check" on a pending GRN.', hi: '"GRN/Quality" tab mein, pending GRN par "Quality Check" click karo.' },
          { en: 'Choose a result: PASS / PARTIAL / FAIL.', hi: 'Result choose karo: PASS / PARTIAL / FAIL.' },
          { en: 'In PARTIAL, enter each line\'s "Failed quantity" (less than received, more than 0).', hi: 'PARTIAL mein har line ki "Failed quantity" enter karo (received se kam, 0 se zyada).' },
          { en: "For a store purchase (raw material) and a result other than FAIL, enter batch reference and original expiry date (or non-expiring + evidence, Owner-only) for each accepted line.", hi: 'Store purchase (raw material) aur FAIL ke alawa result ke liye, har accepted line ke liye batch reference aur original expiry date enter karo (ya non-expiring + evidence, Owner-only).' },
          { en: 'Write a quality note — at least 3 characters required for FAIL/PARTIAL.', hi: 'Quality note likho — FAIL/PARTIAL ke liye kam se kam 3 characters zaroori hain.' },
          { en: 'Click "Save quality" to finalize.', hi: 'Finalize karne ke liye "Save quality" click karo.' },
        ],
      },
      {
        headingEn: 'Conditions',
        headingHi: 'Conditions',
        items: [
          { en: "PASS -> no line's failed qty can be greater than 0.", hi: 'PASS -> kisi bhi line ki failed qty 0 se zyada nahi ho sakti.' },
          { en: 'FAIL -> all lines are fully failed (accepted=0).', hi: 'FAIL -> saari lines fully failed hoti hain (accepted=0).' },
          { en: "PARTIAL -> at least one line must be part-failed, and at least one line must be part-accepted (can't mark PARTIAL on a full-pass or full-fail).", hi: 'PARTIAL -> kam se kam ek line part-failed honi chahiye, aur kam se kam ek line part-accepted honi chahiye (full-pass ya full-fail par PARTIAL mark nahi kiya ja sakta).' },
          { en: 'Quality check requires the PURCHASE_ORDER module; for a store purchase, the INVENTORY module is also required (general purchase only needs PURCHASE_ORDER).', hi: 'Quality check ke liye PURCHASE_ORDER module zaroori hai; store purchase ke liye INVENTORY module bhi zaroori hai (general purchase ko sirf PURCHASE_ORDER chahiye).' },
          { en: 'The quality decision is atomic — accepted stock (qtyReceived minus qtyFailed) posts to inventory + stock-ledger + expiry batches in the same transaction, all-or-nothing.', hi: 'Quality decision atomic hai — accepted stock (qtyReceived minus qtyFailed) inventory + stock-ledger + expiry batches mein same transaction mein post hota hai, all-or-nothing.' },
          { en: 'General purchase saves the quality decision but never posts to inventory (it isn\'t stock at all).', hi: 'General purchase quality decision save karta hai lekin inventory mein kabhi post nahi karta (yeh stock bilkul nahi hai).' },
          { en: 'Once a quality decision is saved, it can never be edited — the exact same request repeated is a safe "replay" no-op, but a different decision on the same GRN is rejected ("already finalized with a different decision").', hi: 'Ek baar quality decision save hone ke baad edit nahi ho sakta — exact same request repeat karna safe "replay" no-op hai, lekin same GRN par alag decision reject ho jaata hai ("already finalized with a different decision").' },
          { en: 'FAIL/PARTIAL automatically queues a Vendor Return claim — this triggers itself, no manual action needed.', hi: 'FAIL/PARTIAL automatically Vendor Return claim queue karta hai — yeh khud trigger hota hai, manual action ki zaroorat nahi.' },
        ],
      },
    ],
    example: {
      en: 'GRN had 50kg "Tamatar" received. Quality check found 5kg spoiled -> result "PARTIAL", failed qty = 5kg. Accepted = 45kg posted to inventory, batch created (batchNo and expiry entered). A 5kg vendor claim is auto-queued.',
      hi: 'GRN mein 50kg "Tamatar" received hua. Quality check mein 5kg spoiled nikla -> result "PARTIAL", failed qty = 5kg. Accepted = 45kg inventory mein post hota hai, batch banta hai (batchNo aur expiry enter kiya gaya). 5kg ka vendor claim auto-queue hota hai.',
    },
  },
  {
    id: 'purchase-vendor-returns',
    titleEn: 'Vendor Returns (Expected Refund/Credit Claims)',
    titleHi: 'Vendor Returns (Expected Refund/Credit Claims)',
    icon: 'rotate-ccw',
    summaryEn: "Whenever quality is FAIL/PARTIAL, an expected refund claim is automatically created — no cash has moved yet.",
    summaryHi: 'Jab bhi quality FAIL/PARTIAL ho, ek expected refund claim automatically banta hai — abhi tak koi cash move nahi hua.',
    sections: [
      {
        headingEn: 'Steps',
        headingHi: 'Steps',
        items: [
          { en: 'Auto: a new FAIL/PARTIAL quality decision auto-queues the claim, nothing to do manually.', hi: 'Auto: naya FAIL/PARTIAL quality decision claim auto-queue karta hai, manually kuch nahi karna.' },
          { en: 'Manual register (for an old historical FAIL/PARTIAL GRN): in the "Vendor returns" tab, enter the full GRN ID and "Look up finalized GRN".', hi: 'Manual register (purane historical FAIL/PARTIAL GRN ke liye): "Vendor returns" tab mein full GRN ID enter karo aur "Look up finalized GRN" karo.' },
          { en: 'Select it from the dropdown, click "Register failed-quantity claim".', hi: 'Dropdown se select karo, "Register failed-quantity claim" click karo.' },
        ],
      },
      {
        headingEn: 'Conditions',
        headingHi: 'Conditions',
        items: [
          { en: "Refund amount = qtyFailed x rateOrdered (the PO's locked rate, not the invoice's rate), with exact paisa rounding.", hi: 'Refund amount = qtyFailed x rateOrdered (PO ka locked rate, invoice ka rate nahi), exact paisa rounding ke saath.' },
          { en: 'A claim can only be registered on a trusted finalized FAIL/PARTIAL GRN whose quality decision is already properly recorded and reconciled.', hi: 'Claim sirf ek trusted finalized FAIL/PARTIAL GRN par register ho sakta hai jiska quality decision pehle se properly recorded aur reconciled hai.' },
          { en: 'This claim is only "expected" — no cash, journal entry, or physical dispatch confirmation is posted here.', hi: 'Yeh claim sirf "expected" hai — yahan koi cash, journal entry ya physical dispatch confirmation post nahi hota.' },
        ],
      },
    ],
    example: {
      en: 'GRN had 5kg Tamatar failed, rate was TSh30/kg. Claim amount = 5 x 30 = TSh150 (expected credit/refund).',
      hi: 'GRN mein 5kg Tamatar failed tha, rate TSh30/kg tha. Claim amount = 5 x 30 = TSh150 (expected credit/refund).',
    },
  },
  {
    id: 'purchase-vendor-settled',
    titleEn: "Vendor Claim — Mark as Settled (Accounts)",
    titleHi: "Vendor Claim — Mark as Settled (Accounts)",
    icon: 'check-square',
    summaryEn: 'When the vendor actually sends money or a credit note, Accounts marks the claim as Settled, once only.',
    summaryHi: 'Jab vendor actually money ya credit note bhejta hai, Accounts claim ko ek baar Settled mark karta hai.',
    sections: [
      {
        headingEn: 'Steps & Conditions',
        headingHi: 'Steps & Conditions',
        items: [
          { en: 'Accounts/Owner enters the settled amount and an optional note on the claim, then clicks "Mark as Settled".', hi: 'Accounts/Owner claim par settled amount aur optional note enter karta hai, phir "Mark as Settled" click karta hai.' },
          { en: 'Only the ACCOUNTS_EXPENSES module holder or Owner can do this.', hi: 'Sirf ACCOUNTS_EXPENSES module holder ya Owner yeh kar sakta hai.' },
          { en: 'It is once-only — a claim cannot be settled twice.', hi: 'Yeh once-only hai — claim do baar settle nahi ho sakta.' },
        ],
      },
    ],
    example: {
      en: 'No worked example is provided in the source for this section.',
      hi: 'Is section ke liye source mein koi worked example nahi diya gaya.',
    },
  },
  {
    id: 'purchase-return-dispatch',
    titleEn: 'Physical Return Dispatch (Sending Rejected Stock Back to Vendor)',
    titleHi: 'Physical Return Dispatch (Rejected Stock Vendor Ko Wapas Bhejna)',
    icon: 'send',
    summaryEn: 'Physically sending the failed/rejected goods back to the vendor with evidence — this never touches stock.',
    summaryHi: 'Failed/rejected goods ko physically evidence ke saath vendor ko wapas bhejna — yeh stock ko kabhi touch nahi karta.',
    sections: [
      {
        headingEn: 'Steps',
        headingHi: 'Steps',
        items: [
          { en: 'Enter qty, reason, evidence photo URL (optional) against the claim, click "Record dispatch" — partial dispatch is possible (multiple trips).', hi: 'Claim ke against qty, reason, evidence photo URL (optional) enter karo, "Record dispatch" click karo — partial dispatch possible hai (multiple trips).' },
          { en: 'When the vendor confirms/signs the receipt, click "Mark vendor-acknowledged".', hi: 'Jab vendor receipt confirm/sign kare, "Mark vendor-acknowledged" click karo.' },
          { en: "If some quantity won't be dispatched at all (e.g. vendor destroyed it on the spot), Owner clicks \"Cancel remaining\".", hi: 'Agar kuch quantity bilkul dispatch nahi hogi (jaise vendor ne wahin destroy kar diya), Owner "Cancel remaining" click karta hai.' },
        ],
      },
      {
        headingEn: 'Conditions',
        headingHi: 'Conditions',
        items: [
          { en: 'This never touches stock — the failed qty never entered usable inventory in the first place.', hi: 'Yeh stock ko kabhi touch nahi karta — failed qty pehle se usable inventory mein kabhi gayi hi nahi thi.' },
          { en: "Total dispatched can never exceed the claim's qtyReturned (the sum of multiple partial dispatches is checked).", hi: "Total dispatched claim ke qtyReturned se kabhi zyada nahi ho sakta (multiple partial dispatches ka sum check hota hai)." },
          { en: '"Cancel remaining" is Owner-only, and only works when something is still pending (a fully-dispatched claim can\'t be cancelled).', hi: '"Cancel remaining" sirf Owner ke liye hai, aur sirf tab kaam karta hai jab kuch pending ho (fully-dispatched claim cancel nahi ho sakta).' },
          { en: 'Vendor-acknowledge is once-only per dispatch.', hi: 'Vendor-acknowledge har dispatch ke liye ek baar hi ho sakta hai.' },
        ],
      },
    ],
    example: {
      en: 'Claim is for 5kg. First trip dispatched 3kg, second trip 2kg — total 5kg, remaining = 0, "Cancel remaining" button becomes inactive.',
      hi: 'Claim 5kg ke liye hai. Pehli trip mein 3kg dispatch hua, dusri trip mein 2kg — total 5kg, remaining = 0, "Cancel remaining" button inactive ho jaata hai.',
    },
  },
  {
    id: 'purchase-debit-notes',
    titleEn: 'Debit Notes (Accounts)',
    titleHi: 'Debit Notes (Accounts)',
    icon: 'file-minus',
    summaryEn: 'Issuing a formal numbered debit-note document against a vendor claim, exactly equal to the claim amount.',
    summaryHi: 'Vendor claim ke against formal numbered debit-note document issue karna, exactly claim amount ke equal.',
    sections: [
      {
        headingEn: 'Steps & Conditions',
        headingHi: 'Steps & Conditions',
        items: [
          { en: '"Issue debit note" (with a reason) — the number auto-generates (e.g. DN-000012).', hi: '"Issue debit note" (reason ke saath) — number auto-generate hota hai (jaise DN-000012).' },
          { en: 'It can also be cancelled; the number is never reused.', hi: 'Yeh cancel bhi ho sakta hai; number kabhi reuse nahi hota.' },
          { en: 'Only ACCOUNTS_EXPENSES/Owner can issue or cancel a debit note.', hi: 'Sirf ACCOUNTS_EXPENSES/Owner debit note issue ya cancel kar sakte hain.' },
          { en: 'Only one active (non-cancelled) debit note per claim at a time — the old one must be cancelled before issuing a new one.', hi: 'Ek claim par ek time par sirf ek active (non-cancelled) debit note ho sakta hai — naya issue karne se pehle purana cancel karna hoga.' },
          { en: "Amount always exactly equals the claim's refundAmountInr — it cannot be manually changed.", hi: "Amount hamesha claim ke refundAmountInr ke exactly equal hota hai — manually change nahi ho sakta." },
        ],
      },
    ],
    example: {
      en: 'No worked example is provided in the source for this section.',
      hi: 'Is section ke liye source mein koi worked example nahi diya gaya.',
    },
  },
  {
    id: 'purchase-invoice-match',
    titleEn: 'Invoice & 3-Way Match (Step 4)',
    titleHi: 'Invoice & 3-Way Match (Step 4)',
    icon: 'scale',
    summaryEn: "Recording the vendor's invoice and automatically comparing it to PO total, GRN accepted value, and the adjusted invoice amount.",
    summaryHi: 'Vendor ka invoice record karna aur automatically PO total, GRN accepted value, aur adjusted invoice amount se compare karna.',
    sections: [
      {
        headingEn: 'Steps',
        headingHi: 'Steps',
        items: [
          { en: 'Once the PO is fully "RECEIVED" (every GRN quality-checked), click "4. Invoice & Payment".', hi: 'Jab PO fully "RECEIVED" ho jaaye (har GRN quality-checked ho), "4. Invoice & Payment" click karo.' },
          { en: 'Enter invoice number, amount; optional tax adjustment (+/-), and if entered a reason must also be written.', hi: 'Invoice number, amount enter karo; optional tax adjustment (+/-), agar diya ho to reason bhi likhna zaroori hai.' },
          { en: 'Attach the invoice document (optional upload), click "Record invoice" — the system auto-matches.', hi: 'Invoice document attach karo (optional upload), "Record invoice" click karo — system auto-match karta hai.' },
        ],
      },
      {
        headingEn: 'Conditions',
        headingHi: 'Conditions',
        items: [
          { en: 'An invoice can only be recorded once per PO.', hi: 'Ek PO par invoice sirf ek baar record ho sakta hai.' },
          { en: "All of the PO's GRNs must already have quality recorded (no PENDING GRN left), or it's treated as \"incomplete accepted value\".", hi: 'PO ke saare GRNs ka quality pehle se recorded hona chahiye (koi PENDING GRN na bache), warna "incomplete accepted value" treat hota hai.' },
          { en: '3-way match formula: GRN accepted value (sum of (qtyReceived-qtyFailed) x rateOrdered) vs Invoice (adjusted) (invoice.amount + taxAdjustmentInr).', hi: '3-way match formula: GRN accepted value (sum of (qtyReceived-qtyFailed) x rateOrdered) vs Invoice (adjusted) (invoice.amount + taxAdjustmentInr).' },
          { en: 'PO total is shown separately but is only informational — a genuine difference between PO total and GRN accepted value is normal when quality has failed some qty.', hi: 'PO total alag se dikhaya jaata hai lekin sirf informational hai — PO total aur GRN accepted value mein genuine difference normal hai jab quality mein kuch qty fail hui ho.' },
          { en: 'Tolerance is TSh1.00 — a bigger difference is a "Mismatch" and payment becomes THREE_WAY_LOCKED (cannot be approved/paid until reconciled).', hi: 'Tolerance TSh1.00 hai — usse zyada difference "Mismatch" hai aur payment THREE_WAY_LOCKED ho jaata hai (reconcile hone tak approve/paid nahi ho sakta).' },
          { en: 'On a match, payment status starts at "PENDING".', hi: 'Match hone par payment status "PENDING" se start hota hai.' },
        ],
      },
    ],
    example: {
      en: 'PO total was TSh2350. GRN had 5kg fail (Tamatar @ TSh30), so GRN accepted value is lower than PO total — this is normal. Vendor invoice was TSh2200. If GRN accepted value is also TSh2200 (±TSh1), it shows "Matched".',
      hi: 'PO total TSh2350 tha. GRN mein 5kg fail hua (Tamatar @ TSh30), isliye GRN accepted value PO total se kam hai — yeh normal hai. Vendor invoice TSh2200 tha. Agar GRN accepted value bhi TSh2200 (±TSh1) ho, to "Matched" dikhata hai.',
    },
  },
  {
    id: 'purchase-payment',
    titleEn: 'Approve Payment & Mark Paid (Accounts)',
    titleHi: 'Approve Payment & Mark Paid (Accounts)',
    icon: 'credit-card',
    summaryEn: 'Accounts approves a matched invoice, then records actual payment evidence — exact amount only, once per match.',
    summaryHi: 'Accounts matched invoice approve karta hai, phir actual payment evidence record karta hai — exact amount, ek baar hi per match.',
    sections: [
      {
        headingEn: 'Steps',
        headingHi: 'Steps',
        items: [
          { en: 'If the match is "Matched" and status "PENDING", click "Approve payment" (Accounts-only).', hi: 'Agar match "Matched" hai aur status "PENDING" hai, "Approve payment" click karo (Accounts-only).' },
          { en: 'Once status is "APPROVED", fill Payment Method (Bank Transfer/Cash/Cheque/Mobile Money), Reference number, Paid date; click "Mark paid".', hi: 'Status "APPROVED" hone par, Payment Method (Bank Transfer/Cash/Cheque/Mobile Money), Reference number, Paid date fill karo; "Mark paid" click karo.' },
        ],
      },
      {
        headingEn: 'Conditions',
        headingHi: 'Conditions',
        items: [
          { en: 'A mismatched (unmatched/THREE_WAY_LOCKED) invoice can never have payment approved.', hi: 'Mismatched (unmatched/THREE_WAY_LOCKED) invoice ka payment kabhi approve nahi ho sakta.' },
          { en: 'Payment can only be for the full outstanding amount exactly (invoiceAdjustedTotalInr) — partial payment is not yet approved, exact amount match is required.', hi: 'Payment sirf full outstanding amount ke liye exactly hota hai (invoiceAdjustedTotalInr) — partial payment approve nahi hota, exact amount match zaroori hai.' },
          { en: 'Only one payment record is ever possible per match — re-allocation is rejected.', hi: 'Ek match par sirf ek hi payment record possible hai — re-allocation reject ho jaata hai.' },
          { en: 'An idempotency key is used — same key + same payload is a safe replay retry; same key + different payload is rejected.', hi: 'Idempotency key use hoti hai — same key + same payload safe replay retry hai; same key + different payload reject ho jaata hai.' },
        ],
      },
    ],
    example: {
      en: 'No worked example is provided in the source for this section.',
      hi: 'Is section ke liye source mein koi worked example nahi diya gaya.',
    },
  },
  {
    id: 'purchase-reconciliation-lock',
    titleEn: 'GRN/Quality — Reconciliation Lock (Safety)',
    titleHi: 'GRN/Quality — Reconciliation Lock (Safety)',
    icon: 'lock',
    summaryEn: "A corrupt/inconsistent GRN quality state halts everything and must be Owner-reconciled — the system never silently fixes itself.",
    summaryHi: 'Corrupt/inconsistent GRN quality state sab kuch rok deta hai aur Owner ko manually reconcile karna hota hai — system kabhi silently fix nahi karta.',
    sections: [
      {
        headingEn: 'Conditions',
        headingHi: 'Conditions',
        items: [
          { en: "If a GRN's saved quality state is found corrupt/inconsistent (legacy data, or an audit trail mismatch), the system shows \"Reconciliation required\" and blocks any further quality action.", hi: 'Agar GRN ka saved quality state corrupt/inconsistent paya jaaye (legacy data, ya audit trail mismatch), system "Reconciliation required" dikhata hai aur aage koi quality action block kar deta hai.' },
          { en: 'It never re-posts stock until the Owner manually reconciles it.', hi: 'Owner manually reconcile kiye bina stock kabhi dobara post nahi hota.' },
          { en: 'The whole system follows a "never repost/never silently fix" principle — any uncertain state halts before auto-rewriting.', hi: 'Poora system "never repost/never silently fix" principle follow karta hai — koi bhi uncertain state auto-rewrite se pehle halt ho jaata hai.' },
        ],
      },
    ],
    example: {
      en: 'No worked example is provided in the source for this section.',
      hi: 'Is section ke liye source mein koi worked example nahi diya gaya.',
    },
  },
  {
    id: 'purchase-vendor-approval',
    titleEn: 'Vendor Approval (Vendors Tab)',
    titleHi: 'Vendor Approval (Vendors Tab)',
    icon: 'user-check',
    summaryEn: 'New vendors start in DRAFT status and cannot be purchased from until the Owner approves them, optionally scoped.',
    summaryHi: 'Naye vendors DRAFT status mein start hote hain aur Owner approve kiye bina unse purchase nahi ho sakta, scope optional hai.',
    sections: [
      {
        headingEn: 'Steps',
        headingHi: 'Steps',
        items: [
          { en: "New vendors start in 'DRAFT' status and cannot be purchased from until Owner approves.", hi: "Naye vendors 'DRAFT' status mein start hote hain aur Owner approve kiye bina unse purchase nahi ho sakta." },
          { en: 'In the "Vendors" tab, enter scope (branch optional, category optional, reason optional) against each vendor.', hi: '"Vendors" tab mein, har vendor ke against scope enter karo (branch optional, category optional, reason optional).' },
          { en: 'Click "Approve" or "Suspend" (both Owner-only).', hi: '"Approve" ya "Suspend" click karo (dono Owner-only hain).' },
        ],
      },
      {
        headingEn: 'Conditions',
        headingHi: 'Conditions',
        items: [
          { en: 'A DRAFT or SUSPENDED vendor can never have a new PO created — server-side enforced in the same transaction that creates the PO, cannot be bypassed from UI.', hi: 'DRAFT ya SUSPENDED vendor ke liye naya PO kabhi nahi ban sakta — server-side enforced same transaction mein jo PO banata hai, UI se bypass nahi ho sakta.' },
          { en: 'If branch-restricted, a PO can only be raised for that branch.', hi: 'Agar branch-restricted hai, to PO sirf wahi branch ke liye raise ho sakta hai.' },
          { en: "If category-restricted, a PO can only be raised for that category's raw materials.", hi: "Agar category-restricted hai, to PO sirf us category ke raw materials ke liye raise ho sakta hai." },
          { en: "Existing (old) vendors were already APPROVED in a one-time cutover (so purchasing wasn't suddenly interrupted) — only newly created vendors now start as DRAFT.", hi: 'Existing (purane) vendors ek baar ke cutover mein already APPROVED kar diye gaye the (taaki purchasing suddenly ruk na jaaye) — ab sirf newly created vendors DRAFT se start hote hain.' },
        ],
      },
    ],
    example: {
      en: 'No worked example is provided in the source for this section.',
      hi: 'Is section ke liye source mein koi worked example nahi diya gaya.',
    },
  },
  {
    id: 'purchase-ho-approvals',
    titleEn: 'HO Approvals — General Purchase Value Gate',
    titleHi: 'HO Approvals — General Purchase Value Gate',
    icon: 'shield-check',
    summaryEn: 'A general purchase above the Owner-set threshold needs a separate HO approval request before a PO can be created.',
    summaryHi: 'Owner-set threshold se zyada general purchase ke liye PO banane se pehle alag HO approval request zaroori hai.',
    sections: [
      {
        headingEn: 'Steps',
        headingHi: 'Steps',
        items: [
          { en: "A general purchase (skipping the indent) must also go through mandatory HO review if it's at/above an Owner-set value threshold — the 'general purchase' flag alone cannot skip this review.", hi: "General purchase (indent skip karne wala) ko bhi mandatory HO review se guzarna padta hai agar woh Owner-set value threshold ke equal/zyada ho — sirf 'general purchase' flag se yeh review skip nahi hoti." },
          { en: 'In the "HO Approvals" tab, enter branch, vendor, line items (description, qty, rate), click "Submit for review".', hi: '"HO Approvals" tab mein, branch, vendor, line items (description, qty, rate) enter karo, "Submit for review" click karo.' },
          { en: 'If below threshold, it\'s instantly APPROVED — use that request id on the Purchase Orders tab.', hi: 'Threshold se neeche ho to instantly APPROVED ho jaata hai — Purchase Orders tab par usi request id ka use karo.' },
          { en: "If at/above threshold, it goes 'PENDING_APPROVAL' — Owner will Approve/Reject.", hi: "Threshold ke equal/zyada ho to 'PENDING_APPROVAL' ho jaata hai — Owner Approve/Reject karega." },
          { en: "An approved request's id must be passed when creating the Purchase Order.", hi: "Purchase Order banate waqt approved request ka id pass karna zaroori hai." },
        ],
      },
      {
        headingEn: 'Conditions',
        headingHi: 'Conditions',
        items: [
          { en: 'Value calculation is exact: sum(qty x rate), with round-half-up only on the final total, not per-line rounding.', hi: 'Value calculation exact hai: sum(qty x rate), round-half-up sirf final total par hota hai, per-line rounding nahi.' },
          { en: 'An approved request can only be consumed once (status APPROVED -> CONSUMED when a PO is actually created) — the same approval cannot create two separate purchases.', hi: 'Approved request sirf ek baar consume ho sakta hai (status APPROVED -> CONSUMED jab PO actually banta hai) — same approval se do alag purchases nahi ban sakte.' },
          { en: "If the PO's lines/value don't match the approved request (someone edited in between), a 'no longer matches' error occurs — a new request must be submitted.", hi: "Agar PO ki lines/value approved request se match na ho (beech mein kisi ne edit kiya), 'no longer matches' error aata hai — naya request submit karna hoga." },
        ],
      },
    ],
    example: {
      en: "Owner set threshold TSh50,000. 'AC repair' general purchase value is TSh60,000 -> PENDING_APPROVAL. Owner approves. Now creating the PO must pass this same request's id, or PO creation fails.",
      hi: "Owner ne threshold TSh50,000 set kiya. 'AC repair' general purchase value TSh60,000 hai -> PENDING_APPROVAL. Owner approve karta hai. Ab PO banate waqt isi request ki id pass karni hogi, warna PO creation fail ho jaata hai.",
    },
  },
  {
    id: 'cross-cutting-rules',
    titleEn: 'Cross-Cutting Rules (Common Across All Modules)',
    titleHi: 'Cross-Cutting Rules (Sabhi Modules Mein Common)',
    icon: 'layers',
    summaryEn: 'Six system-wide principles — FEFO, HELD/expired hard-blocks, exact math, idempotency, self-approval block, and Owner-only gates.',
    summaryHi: 'Chhe system-wide principles — FEFO, HELD/expired hard-blocks, exact math, idempotency, self-approval block, aur Owner-only gates.',
    sections: [
      {
        headingEn: 'The Six Rules',
        headingHi: 'Chhe Rules',
        items: [
          { en: 'FEFO everywhere — wherever raw material consumption/dispatch happens (production, transfer, wastage), it always draws expiry-wise (earliest expiring first), whether branch stock or central warehouse.', hi: 'FEFO sab jagah — jahan bhi raw material consumption/dispatch ho (production, transfer, wastage), hamesha expiry-wise liya jaata hai (sabse pehle expire hone wala pehle), branch stock ho ya central warehouse.' },
          { en: "HELD/Expired hard-block — an unknown-expiry or expired lot is never used in normal consumption/dispatch, unless explicitly an 'allowExpired' flow (like wastage or a stock-count shortfall where a real loss is already being recorded).", hi: "HELD/Expired hard-block — unknown-expiry ya expired lot normal consumption/dispatch mein kabhi use nahi hota, jab tak koi explicit 'allowExpired' flow na ho (jaise wastage ya stock-count shortfall jahan real loss already record ho rahi hai)." },
          { en: 'Exact decimal math — every quantity/money calculation uses bigint/fixed-point, never JavaScript floating point, so money or 3-decimal quantities never drift.', hi: 'Exact decimal math — har quantity/money calculation bigint/fixed-point use karti hai, kabhi JavaScript floating point nahi, isliye money ya 3-decimal quantities kabhi drift nahi hoti.' },
          { en: 'Idempotency — every critical write (receive, quality, payment, conversion) has a replay-safe mechanism; the exact same retry is safe, a different payload is rejected.', hi: 'Idempotency — har critical write (receive, quality, payment, conversion) ka replay-safe mechanism hai; exact same retry safe hai, different payload reject ho jaata hai.' },
          { en: "Self-approval block — wherever review/approval exists (stock count, indent), whoever submitted can never approve it themselves.", hi: "Self-approval block — jahan bhi review/approval hoti hai (stock count, indent), jisne submit kiya woh khud kabhi approve nahi kar sakta." },
          { en: "Owner-only mandatory gates — indent spike/value threshold, general purchase value threshold, vendor approval, and requisition approval are all Owner-level decisions; branch staff can never bypass them.", hi: "Owner-only mandatory gates — indent spike/value threshold, general purchase value threshold, vendor approval, aur requisition approval sab Owner-level decisions hain; branch staff kabhi bypass nahi kar sakta." },
        ],
      },
    ],
    example: {
      en: 'No single worked example applies here — these six rules are enforced consistently across every example already given in the Inventory, Warehouse, and Purchase modules above.',
      hi: 'Yahan ek single worked example apply nahi hota — yeh chhe rules upar diye gaye Inventory, Warehouse, aur Purchase modules ke har example mein consistently enforce hote hain.',
    },
  },
];

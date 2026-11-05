const modules = [
  {
    id: 'pos-new-order',
    titleEn: 'POS New Order Dialog',
    titleHi: 'POS Naya Order Dialog',
    icon: 'credit-card',
    summaryEn: 'Create a new order with channel, table, counter, tender and items — flow depends on branch concept and channel.',
    summaryHi: 'Channel, table, counter, tender aur items ke saath naya order banao — flow branch concept aur channel par depend karta hai.',
    sections: [
      {
        headingEn: 'Core Concepts',
        headingHi: 'Core Concepts',
        items: [
          { en: 'Branch Operating Concept is either FAST_FOOD or CONVENTIONAL.', hi: 'Branch Operating Concept ya FAST_FOOD hota hai ya CONVENTIONAL.' },
          { en: 'If branch is CONVENTIONAL and channel is DINE_IN, order flow is PRODUCTION_FIRST — kitchen prepares first, payment happens later.', hi: 'Agar branch CONVENTIONAL hai aur channel DINE_IN hai, to order flow PRODUCTION_FIRST hota hai — pehle kitchen prepare karegi, payment baad mein.' },
          { en: 'Every other case (Fast Food branch, or Takeaway/Swiggy/Zomato on any branch) is PAYMENT_FIRST.', hi: 'Baaki har case (Fast Food branch, ya kisi bhi branch par Takeaway/Swiggy/Zomato) PAYMENT_FIRST hota hai.' },
        ],
      },
      {
        headingEn: 'Fields & Validation',
        headingHi: 'Fields & Validation',
        items: [
          { en: 'Channel field offers Dine-in, Takeaway, Swiggy, or Zomato.', hi: 'Channel field mein Dine-in, Takeaway, Swiggy, ya Zomato choose kar sakte ho.' },
          { en: 'Table no. is required only for Conventional+Dine-in; server returns 400 error "Table number is required for conventional dine-in" if left blank, otherwise it is optional.', hi: 'Table no. sirf Conventional+Dine-in ke liye required hai; blank chhodne par server 400 error "Table number is required for conventional dine-in" deta hai, warna optional hai.' },
          { en: 'Counter field offers Counter 1 or Counter 2.', hi: 'Counter field mein Counter 1 ya Counter 2 choose karte hain.' },
          { en: 'Tender field is only used for PAYMENT_FIRST orders.', hi: 'Tender field sirf PAYMENT_FIRST orders ke liye use hoti hai.' },
          { en: 'Payment currency defaults to TZS or a configured foreign currency; if no exchange rate is configured for that currency, server rejects with "No exchange rate configured for XXX".', hi: 'Payment currency default TZS hoti hai ya configured foreign currency; agar us currency ka exchange rate configure nahi hai, server "No exchange rate configured for XXX" error deta hai.' },
          { en: 'Customer name is optional, max 80 characters.', hi: 'Customer name optional hai, max 80 characters.' },
          { en: 'Customer WhatsApp number is optional but must be a valid format if entered.', hi: 'Customer WhatsApp number optional hai lekin agar daalo to valid format hona chahiye.' },
          { en: 'Items are added via the Menu Tile Picker or List view.', hi: 'Items Menu Tile Picker ya List view se add kiye jaate hain.' },
        ],
      },
      {
        headingEn: 'Hard Rules',
        headingHi: 'Hard Rules',
        items: [
          { en: 'Only menu items marked isActive and isSellable can be ordered.', hi: 'Sirf wo menu items order ho sakte hain jo isActive aur isSellable marked hain.' },
          { en: 'A Semi-FG base item (production-only) cannot be ordered directly — server throws "X is a Semi-FG base and cannot be ordered directly".', hi: 'Semi-FG base item (sirf production ke liye) directly order nahi ho sakta — server "X is a Semi-FG base and cannot be ordered directly" error deta hai.' },
          { en: 'If the branch has a shift system configured, an active and accepted shift is required, else the order is rejected.', hi: 'Agar branch mein shift system configured hai, to active+accepted shift zaroori hai, warna order reject ho jaata hai.' },
          { en: 'A waiter-only actor (has POS_WAITER but not POS_CASHIER) can only create PRODUCTION_FIRST orders and cannot collect payment.', hi: 'Waiter-only actor (POS_WAITER hai but POS_CASHIER nahi) sirf PRODUCTION_FIRST orders bana sakta hai aur payment collect nahi kar sakta.' },
          { en: '"Confirm Order" generates an idempotencyKey; on network failure with unknown outcome, a "Replay exact request" button appears and re-clicking it never creates a duplicate order.', hi: '"Confirm Order" ek idempotencyKey generate karta hai; network fail hone par aur outcome unknown hone par "Replay exact request" button aata hai, dobara click karne se duplicate order kabhi nahi banta.' },
        ],
      },
      {
        headingEn: 'What Happens On Submit',
        headingHi: 'Submit Par Kya Hota Hai',
        items: [
          { en: 'PAYMENT_FIRST: stock is deducted immediately, KOT/BOT tickets are created, receipt + FINAL document is issued immediately, payment is captured immediately, and status becomes PAID.', hi: 'PAYMENT_FIRST: stock turant deduct hota hai, KOT/BOT tickets banate hain, receipt + FINAL document turant issue hota hai, payment turant capture hoti hai, status PAID ban jaata hai.' },
          { en: 'PRODUCTION_FIRST: stock is deducted immediately and KOT/BOT created, but no receipt or payment yet — status is OPEN and the table stays open until settled.', hi: 'PRODUCTION_FIRST: stock turant deduct hota hai aur KOT/BOT banta hai, lekin receipt ya payment abhi nahi — status OPEN rehta hai aur table settle hone tak khula rehta hai.' },
        ],
      },
    ],
    example: {
      en: 'Fast Food branch Takeaway order with 2x Burger (TSh150 each) + 1x Coke (TSh40): on Confirm, stock is deducted, KOT is created, receipt is made — Subtotal TSh340, VAT 18% = TSh61.20, Total TSh401.20, status PAID, pickup token issued (e.g. T-5).',
      hi: 'Fast Food branch ka Takeaway order — 2x Burger (TSh150 each) + 1x Coke (TSh40): Confirm karte hi stock deduct, KOT create, receipt ban jaati hai — Subtotal TSh340, VAT 18% = TSh61.20, Total TSh401.20, status PAID, pickup token milta hai (e.g. T-5).',
    },
  },

  {
    id: 'menu-tile-picker',
    titleEn: 'Menu Tile Picker',
    titleHi: 'Menu Tile Picker',
    icon: 'grid',
    summaryEn: 'Shared component across New Order, Waiter screen and Lifecycle draft editor for picking menu items with image, search and category filters.',
    summaryHi: 'New Order, Waiter screen aur Lifecycle draft editor mein shared component — image, search aur category filters ke saath menu items pick karne ke liye.',
    sections: [
      {
        headingEn: 'Layout & Interaction',
        headingHi: 'Layout & Interaction',
        items: [
          { en: 'Tiles show image, name and price for each menu item.', hi: 'Har tile mein item ka image, name aur price dikhta hai.' },
          { en: 'A search box and category filter buttons ("All" plus each distinct category) help locate items.', hi: 'Search box aur category filter buttons ("All" + har distinct category) items dhoondhne mein help karte hain.' },
          { en: 'Tapping "+" sets quantity to 1; after that, "-"/"+" adjust quantity; reducing quantity to 0 removes the line entirely.', hi: '"+" tap karne se quantity 1 ho jaati hai; uske baad "-"/"+" se quantity adjust hoti hai; quantity 0 karne par line poori remove ho jaati hai.' },
          { en: '"Switch to list view" gives a dropdown + quantity-input style with Add/Remove Item Line buttons.', hi: '"Switch to list view" ek dropdown + quantity-input style deta hai jisme Add/Remove Item Line buttons hote hain.' },
          { en: 'Inactive or unsellable items show "Unavailable" and cannot be added.', hi: 'Inactive ya unsellable items par "Unavailable" dikhta hai aur unhe add nahi kiya ja sakta.' },
        ],
      },
      {
        headingEn: 'Hard Limits',
        headingHi: 'Hard Limits',
        items: [
          { en: 'Maximum quantity per line is 500.', hi: 'Ek line mein max quantity 500 ho sakti hai.' },
          { en: 'Maximum number of lines per order is 50.', hi: 'Ek order mein max 50 lines ho sakti hain.' },
        ],
      },
    ],
    example: {
      en: 'This component itself has no standalone worked example — it is used inside New Order, Waiter, and Draft flows (see their examples).',
      hi: 'Is component ka apna alag example nahi hai — ye New Order, Waiter aur Draft flows ke andar use hota hai (unke examples dekhen).',
    },
  },

  {
    id: 'currency-rates',
    titleEn: 'Currency Rates Dialog (Owner-only)',
    titleHi: 'Currency Rates Dialog (Owner-only)',
    icon: 'dollar-sign',
    summaryEn: 'Owner sets exchange rates for accepting foreign currency; each order locks the rate at creation time, never changed retroactively.',
    summaryHi: 'Owner foreign currency accept karne ke liye exchange rate set karta hai; har order apna rate creation time par lock kar leta hai, baad mein kabhi badalta nahi.',
    sections: [
      {
        headingEn: 'Steps',
        headingHi: 'Steps',
        items: [
          { en: 'Owner clicks the "Currency Rates" button, visible only to SUPER_ADMIN.', hi: 'Owner "Currency Rates" button click karta hai, jo sirf SUPER_ADMIN ko dikhta hai.' },
          { en: 'A table shows all existing rates: currency code and how much TSh equals 1 unit.', hi: 'Table mein sabhi existing rates dikhte hain: currency code aur 1 unit kitni TSh ke barabar hai.' },
          { en: 'Owner enters a 3-letter Code and a Rate, then clicks "Save Rate".', hi: 'Owner 3-letter Code aur Rate enter karta hai, phir "Save Rate" click karta hai.' },
        ],
      },
      {
        headingEn: 'Hard Rule',
        headingHi: 'Hard Rule',
        items: [
          { en: 'Changing a rate never changes past orders — each order locks its own fxRateToInr at order creation time.', hi: 'Rate badalne se purane orders kabhi nahi badalte — har order apna fxRateToInr creation time par lock kar leta hai.' },
        ],
      },
    ],
    example: {
      en: 'Today USD rate is set to TSh 2500. Tomorrow it is changed to TSh 2600. An order made in USD yesterday still shows TSh 2500/USD on its receipt — never retroactively changed.',
      hi: 'Aaj USD rate TSh 2500 set hua. Kal rate TSh 2600 ho gaya. Lekin kal se pehle USD mein bana order apni receipt par abhi bhi TSh 2500/USD dikhayega — kabhi retroactively nahi badalta.',
    },
  },

  {
    id: 'whatsapp-offer-alert',
    titleEn: 'WhatsApp Offer Alert (Broadcast)',
    titleHi: 'WhatsApp Offer Alert (Broadcast)',
    icon: 'message-circle',
    summaryEn: 'Broadcast an offer/discount via WhatsApp to real past customers only, with Sent X/Y result and red-highlighted failures.',
    summaryHi: 'Offer/discount ko WhatsApp par sirf real past customers ko broadcast karna, result Sent X/Y aur failures red mein dikhte hain.',
    sections: [
      {
        headingEn: 'Steps',
        headingHi: 'Steps',
        items: [
          { en: 'Click "Offer Alert" — a dialog opens and the target customer count auto-loads.', hi: '"Offer Alert" click karo — dialog khulta hai aur target customer count auto-load hota hai.' },
          { en: 'Write the offer text and optionally set a valid-until date.', hi: 'Offer text likho aur optional valid-until date set karo.' },
          { en: 'Click "Send Offer Alert" to broadcast.', hi: 'Broadcast karne ke liye "Send Offer Alert" click karo.' },
        ],
      },
      {
        headingEn: 'Hard Rule & Result',
        headingHi: 'Hard Rule & Result',
        items: [
          { en: 'The target list is only numbers captured in the customer WhatsApp field of real past orders — never a fake or invented list.', hi: 'Target list mein sirf wahi numbers hote hain jo real past orders ke customer WhatsApp field mein capture hue hain — kabhi fake ya invented list nahi.' },
          { en: 'Result shows "Sent: X / Y", with failures shown in red.', hi: 'Result mein "Sent: X / Y" dikhta hai, failures red colour mein dikhti hain.' },
        ],
      },
    ],
    example: {
      en: 'No specific numeric example given in source; behaviour is defined by the Sent X/Y result pattern above.',
      hi: 'Source mein koi specific numeric example nahi diya gaya; behaviour upar diye gaye Sent X/Y result pattern se define hota hai.',
    },
  },

  {
    id: 'add-items-settle',
    titleEn: 'Orders Table — Add Items / Settle Order',
    titleHi: 'Orders Table — Add Items / Settle Order',
    icon: 'plus-circle',
    summaryEn: 'For Conventional+Dine-in OPEN orders: add more items mid-service, then settle at the end without double-deducting stock.',
    summaryHi: 'Conventional+Dine-in OPEN orders ke liye: service ke beech mein items add karo, phir end mein settle karo bina stock dobara deduct kiye.',
    sections: [
      {
        headingEn: 'Add Items',
        headingHi: 'Add Items',
        items: [
          { en: 'This feature is used only for Conventional+Dine-in OPEN orders where the table has a seated customer and the order is still open.', hi: 'Ye feature sirf Conventional+Dine-in OPEN orders ke liye hai jab table par customer baitha hai aur order abhi khula hai.' },
          { en: '"Add items" opens a new menu tile picker; selecting new items and confirming "Add items" deducts stock immediately (same as initial dispatch), creates new KOT/BOT tickets, increments the order subtotal/tax/total, and bumps the revision by 1.', hi: '"Add items" se naya menu tile picker khulta hai; naye items select karke "Add items" confirm karne par stock turant deduct hota hai (initial dispatch jaisa), naye KOT/BOT tickets banate hain, order ka subtotal/tax/total increment hota hai, aur revision +1 ho jaata hai.' },
          { en: 'Adding items is only allowed when order serviceStatus is ACTIVE and status is OPEN — items cannot be added to CLOSED/CANCELLED orders.', hi: 'Items add karna sirf tab allowed hai jab order serviceStatus ACTIVE ho aur status OPEN ho — CLOSED/CANCELLED orders mein items add nahi ho sakte.' },
        ],
      },
      {
        headingEn: 'Settle Order',
        headingHi: 'Settle Order',
        items: [
          { en: '"Settle order" lets the user select tender + currency and confirm.', hi: '"Settle order" mein tender + currency select karke confirm karte hain.' },
          { en: 'Since stock was already deducted at dispatch time, settlement does not deduct stock again — it only creates the receipt, issues the FINAL document, captures payment, and sets order status to PAID.', hi: 'Kyunki stock dispatch time par hi deduct ho gaya tha, settlement stock dobara deduct nahi karta — ye sirf receipt banata hai, FINAL document issue karta hai, payment capture karta hai, aur order status PAID set karta hai.' },
          { en: 'Rule: stockDeductedAt must be set, else the settle action is rejected with "Order stock has not been posted".', hi: 'Rule: stockDeductedAt set hona zaroori hai, warna settle action "Order stock has not been posted" error ke saath reject hota hai.' },
        ],
      },
    ],
    example: {
      en: 'Table T-5 had an open conventional order — 2x Thali (TSh250 each) = TSh500. Waiter added 1 more Thali via "Add items" — total became TSh750 and a new KOT was created. When the customer finished, the Cashier clicked "Settle order", entered Cash tender, and confirmed — receipt RCP-xxxx was created, FINAL document issued, and stock was not deducted again.',
      hi: 'Table T-5 ka open conventional order tha — 2x Thali (TSh250 each) = TSh500. Waiter ne "Add items" se 1 Thali aur add ki — total TSh750 ho gaya aur naya KOT bana. Customer ke jaane par Cashier ne "Settle order" click karke Cash tender daal ke confirm kiya — receipt RCP-xxxx bani, FINAL document issue hua, stock dobara deduct nahi hua.',
    },
  },

  {
    id: 'owner-only-visibility',
    titleEn: 'Owner-only Order Visibility',
    titleHi: 'Owner-only Order Visibility',
    icon: 'eye-off',
    summaryEn: 'Owner can hide a specific order from staff for privacy; this only changes visibility, never sales/tax/inventory/cash figures.',
    summaryHi: 'Owner ek specific order ko privacy ke liye staff se hide kar sakta hai; isse sirf visibility badalti hai, sales/tax/inventory/cash kabhi nahi badalte.',
    sections: [
      {
        headingEn: 'Steps',
        headingHi: 'Steps',
        items: [
          { en: 'On the order row, the Owner-only button is "Make Owner-only" or "Restore Staff Visibility".', hi: 'Order row par Owner-only button "Make Owner-only" ya "Restore Staff Visibility" hota hai.' },
          { en: 'A reason is mandatory, 3-500 characters, before confirming.', hi: 'Confirm karne se pehle reason mandatory hai, 3-500 characters ka.' },
        ],
      },
      {
        headingEn: 'Hard Rules & Dashboard Impact',
        headingHi: 'Hard Rules & Dashboard Impact',
        items: [
          { en: 'This action only changes visibility — actual sales, tax, inventory and cash never change.', hi: 'Ye action sirf visibility badalta hai — actual sales, tax, inventory aur cash kabhi nahi badalte.' },
          { en: 'A receipt already downloaded by staff before the change cannot be revoked retroactively.', hi: 'Change se pehle staff dwara already download ki gayi receipt retroactively revoke nahi ho sakti.' },
          { en: 'Owner dashboard shows 3 cards: "Actual sales" (everything), "Staff-visible sales" (owner-only orders excluded), and "Private sales" (total of owner-only orders).', hi: 'Owner dashboard par 3 cards dikhte hain: "Actual sales" (sab kuch), "Staff-visible sales" (owner-only orders exclude karke), aur "Private sales" (owner-only orders ka total).' },
          { en: 'Normal staff only sees "Visible sales".', hi: 'Normal staff ko sirf "Visible sales" dikhti hai.' },
        ],
      },
    ],
    example: {
      en: 'No separate numeric example in source beyond the dashboard card description above.',
      hi: 'Upar diye gaye dashboard card description ke alawa source mein koi alag numeric example nahi hai.',
    },
  },

  {
    id: 'lifecycle-panel',
    titleEn: 'Drafts/Tables/Service — Lifecycle Panel',
    titleHi: 'Drafts/Tables/Service — Lifecycle Panel',
    icon: 'layers',
    summaryEn: 'Manages drafts (scratchpad orders), dispatching them into real orders, cancelling drafts, serving tickets, closing service and cancelling unpaid orders.',
    summaryHi: 'Drafts (scratchpad orders) manage karta hai, unhe real orders mein dispatch karta hai, drafts cancel karta hai, tickets serve karta hai, service close karta hai aur unpaid orders cancel karta hai.',
    sections: [
      {
        headingEn: 'A7.1 — Draft (New/Edit/Save)',
        headingHi: 'A7.1 — Draft (New/Edit/Save)',
        items: [
          { en: 'A draft is used when not ready to confirm an order yet — a scratchpad, e.g. a waiter takes an order but does not send it to kitchen yet, or wants to print a proforma without committing.', hi: 'Draft use hota hai jab order confirm karne ko ready nahi ho — ek scratchpad, jaise waiter order le leta hai lekin kitchen nahi bhejta, ya bina commit kiye proforma print karna chahta hai.' },
          { en: 'Hard rule: a draft never deducts stock, has no COGS, no revenue, and no ticket/receipt — it is purely an intention on paper.', hi: 'Hard rule: draft kabhi stock deduct nahi karta, koi COGS nahi, koi revenue nahi, aur koi ticket/receipt nahi — ye sirf kaagaz par intention hai.' },
          { en: 'Steps: click "New draft"; fill Channel, Table, Counter, Tender (optional at this stage), Tender currency and items; click "Save draft" to get status DRAFT.', hi: 'Steps: "New draft" click karo; Channel, Table, Counter, Tender (is stage par optional), Tender currency aur items fill karo; "Save draft" click karke status DRAFT milta hai.' },
          { en: 'An existing draft can be reopened via "Edit draft", which checks expectedRevision — if someone else changed it meanwhile, a stale-revision error occurs and must be reloaded.', hi: 'Existing draft "Edit draft" se reopen hota hai, jo expectedRevision check karta hai — agar beech mein kisi aur ne change kiya hai to stale-revision error aata hai aur reload karna padta hai.' },
        ],
      },
      {
        headingEn: 'A7.2 — Dispatch Draft',
        headingHi: 'A7.2 — Dispatch Draft',
        items: [
          { en: 'Dispatch is used when a draft becomes a real order — stock now locks and the kitchen gets a ticket.', hi: 'Dispatch use hota hai jab draft real order ban jaata hai — stock lock ho jaata hai aur kitchen ko ticket milta hai.' },
          { en: 'Hard rule: dispatch validates current stock and sellability; if branch/channel is PAYMENT_FIRST and tender is absent, the server rejects the dispatch.', hi: 'Hard rule: dispatch current stock aur sellability validate karta hai; agar branch/channel PAYMENT_FIRST hai aur tender absent hai, server dispatch reject karta hai.' },
          { en: 'Dispatch posts stock only once.', hi: 'Dispatch stock sirf ek baar post karta hai.' },
          { en: 'After dispatch, extra items need "Add items" (Section A5), not draft edit — the draft becomes immutable once dispatched.', hi: 'Dispatch ke baad extra items ke liye "Add items" (Section A5) use karna hota hai, draft edit nahi — dispatch hone ke baad draft immutable ho jaata hai.' },
        ],
      },
      {
        headingEn: 'A7.3 — Cancel Draft',
        headingHi: 'A7.3 — Cancel Draft',
        items: [
          { en: 'Steps: click "Cancel draft", enter a reason (3-500 characters), click "Confirm cancellation".', hi: 'Steps: "Cancel draft" click karo, reason enter karo (3-500 characters), "Confirm cancellation" click karo.' },
          { en: 'Hard rule: only a persisted draft that has not been dispatched yet can be cancelled — since no stock/COGS/revenue/tickets were ever posted, cancelling just sets status to CANCELLED.', hi: 'Hard rule: sirf wo persisted draft cancel ho sakta hai jo abhi dispatch nahi hua — kyunki stock/COGS/revenue/tickets kabhi posted nahi hue, cancel karne se status sirf CANCELLED ho jaata hai.' },
        ],
      },
      {
        headingEn: 'A7.4 — Service Ticket "Mark Served"',
        headingHi: 'A7.4 — Service Ticket "Mark Served"',
        items: [
          { en: 'Used when a KOT/BOT ticket is READY from kitchen and the waiter/cashier has served it at the table.', hi: 'Use hota hai jab KOT/BOT ticket kitchen se READY ho aur waiter/cashier ne table par serve kar diya ho.' },
          { en: 'Hard rule: the button is only enabled when ticket status is READY and the actor has POS_CASHIER module; transition is READY -> SERVED, one direction only, cannot go back.', hi: 'Hard rule: button sirf tab enabled hota hai jab ticket status READY ho aur actor ke paas POS_CASHIER module ho; transition READY -> SERVED hai, ek direction mein hi, wapas nahi ja sakta.' },
        ],
      },
      {
        headingEn: 'A7.5 — Close Service',
        headingHi: 'A7.5 — Close Service',
        items: [
          { en: 'Used to end a table\'s entire service — enabled only when the order is financially PAID and every non-cancelled ticket is SERVED.', hi: 'Table ki poori service khatam karne ke liye use hota hai — sirf tab enabled hota hai jab order financially PAID ho aur har non-cancelled ticket SERVED ho.' },
          { en: 'Hard rule: being paid does not mean served — the panel shows a warning if canClose is false: "Close only after full payment and every noncancelled ticket is SERVED."', hi: 'Hard rule: paid hona matlab served hona nahi hota — panel warning dikhata hai agar canClose false hai: "Close only after full payment and every noncancelled ticket is SERVED."' },
        ],
      },
      {
        headingEn: 'A7.6 — Cancel Unpaid Order',
        headingHi: 'A7.6 — Cancel Unpaid Order',
        items: [
          { en: 'Used only for an order that is still OPEN (unpaid) and serviceStatus ACTIVE, by an actor with canCancel capability (Owner, or Branch Manager with POS_CASHIER).', hi: 'Sirf us order ke liye use hota hai jo abhi OPEN (unpaid) hai aur serviceStatus ACTIVE hai, aur actor ke paas canCancel capability ho (Owner, ya POS_CASHIER wala Branch Manager).' },
          { en: 'Hard rule: cancellation preserves original lines/amounts/costs/history — no automatic restock happens, no auto-refund happens (because payment never happened), and order status becomes VOIDED/CANCELLED.', hi: 'Hard rule: cancellation original lines/amounts/costs/history preserve karta hai — koi automatic restock nahi hota, koi auto-refund nahi hota (kyunki payment kabhi hui nahi), order status VOIDED/CANCELLED ban jaata hai.' },
          { en: 'Note: this button is not for PAID orders — a PAID order cancel/refund is a different flow (Void Panel, Section A10).', hi: 'Note: ye button PAID orders ke liye nahi hai — PAID order cancel/refund alag flow hai (Void Panel, Section A10).' },
        ],
      },
    ],
    example: {
      en: 'Table T-8 had an order (OPEN, TSh600), customer left at the last moment without eating. Manager clicked "Cancel unpaid order" with reason "Customer left without ordering" — order became VOIDED, payment never happened so no refund question arose.',
      hi: 'Table T-8 ka order (OPEN, TSh600) tha, customer last moment par bina khaye chala gaya. Manager ne reason "Customer left without ordering" ke saath "Cancel unpaid order" click kiya — order VOIDED ho gaya, payment kabhi hui nahi isliye refund ka sawaal hi nahi aaya.',
    },
  },

  {
    id: 'proforma-final-documents',
    titleEn: 'Proforma/Final Document History Panel',
    titleHi: 'Proforma/Final Document History Panel',
    icon: 'file-text',
    summaryEn: 'Internal, non-fiscal document trail for proforma estimates and auto-generated FINAL documents, plus view/print.',
    summaryHi: 'Proforma estimates aur auto-generated FINAL documents ka internal, non-fiscal document trail, saath mein view/print.',
    sections: [
      {
        headingEn: 'Disclaimer',
        headingHi: 'Disclaimer',
        items: [
          { en: 'The panel shows the disclaimer "INTERNAL SALES DOCUMENT — NOT A FISCAL RECEIPT", with no TRA/EFD (tax authority) integration and Seller TIN/VRN unconfigured.', hi: 'Panel par disclaimer "INTERNAL SALES DOCUMENT — NOT A FISCAL RECEIPT" dikhta hai, koi TRA/EFD (tax authority) integration nahi hai aur Seller TIN/VRN unconfigured hai.' },
        ],
      },
      {
        headingEn: 'A8.1 — Issue Proforma',
        headingHi: 'A8.1 — Issue Proforma',
        items: [
          { en: 'Used when showing the customer an estimate/quotation before confirming the order — e.g. a large order, or an advance billing discussion.', hi: 'Order confirm karne se pehle customer ko estimate/quotation dikhane ke liye use hota hai — jaise bada order, ya advance billing discussion.' },
          { en: 'Eligible sources are a persisted DRAFT (status DRAFT) or an ACTIVE/OPEN order (still unpaid).', hi: 'Eligible sources hain: persisted DRAFT (status DRAFT) ya ACTIVE/OPEN order (abhi unpaid).' },
          { en: 'Steps: select source from the "Persisted source/expected revision" dropdown, then click "Issue proforma".', hi: 'Steps: "Persisted source/expected revision" dropdown se source select karo, phir "Issue proforma" click karo.' },
          { en: 'Hard rule: issuing never touches stock/COGS/revenue/tickets/payment — it is purely a paper trail; the expected revision must match or it is rejected as stale.', hi: 'Hard rule: issue karne se stock/COGS/revenue/tickets/payment kabhi nahi chhuta — ye sirf paper trail hai; expected revision match hona chahiye warna stale maan ke reject hota hai.' },
        ],
      },
      {
        headingEn: 'A8.2 — FINAL Document (Automatic)',
        headingHi: 'A8.2 — FINAL Document (Automatic)',
        items: [
          { en: 'Hard rule: a FINAL document is never created by a manual "Issue" action — it auto-creates only when an order becomes fully paid, in both the CREATE flow and the SETTLE flow; that is why the panel has no button for FINAL, it only appears in history.', hi: 'Hard rule: FINAL document kabhi manual "Issue" action se nahi banta — ye sirf tab auto-create hota hai jab order fully paid ho jaata hai, CREATE flow aur SETTLE flow dono mein; isiliye panel mein FINAL ke liye button nahi hai, ye sirf history mein dikhta hai.' },
          { en: 'Proforma -> FINAL link: if a matching PROFORMA was issued earlier (same source/revision/evidence), the FINAL document saves its proformaId as the "applicable proforma".', hi: 'Proforma -> FINAL link: agar pehle matching PROFORMA issue hua tha (same source/revision/evidence), FINAL document uska proformaId "applicable proforma" ke roop mein save karta hai.' },
        ],
      },
      {
        headingEn: 'A8.3 — View/Print Document',
        headingHi: 'A8.3 — View/Print Document',
        items: [
          { en: 'Every document card has a "View/print document" button — a full snapshot (lines, VAT, totals, seller info) opens in a modal and can be printed.', hi: 'Har document card par "View/print document" button hai — full snapshot (lines, VAT, totals, seller info) modal mein khulta hai aur print ho sakta hai.' },
        ],
      },
    ],
    example: {
      en: 'Customer asked for a proforma for 3x Pizza earlier — proforma PRF-001 was created, Total TZS 4500. The order later settled on the same lines — FINAL FNL-002 was created, showing "applicable proforma: PRF-001" link.',
      hi: 'Customer ne pehle 3x Pizza ka proforma maanga — proforma PRF-001 bana, Total TZS 4500. Order baad mein wahi lines par settle hua — FINAL FNL-002 bana, "applicable proforma: PRF-001" link dikha.',
    },
  },

  {
    id: 'payment-history',
    titleEn: 'Payment/Order History Panel (Read-only)',
    titleHi: 'Payment/Order History Panel (Read-only)',
    icon: 'clock',
    summaryEn: 'Read-only view of who collected how much when, with each order\'s coverage status — this panel never mutates anything.',
    summaryHi: 'Kaun kitna aur kab collect kiya iska read-only view, har order ka coverage status dikhta hai — ye panel kabhi kuch mutate nahi karta.',
    sections: [
      {
        headingEn: 'Coverage Statuses',
        headingHi: 'Coverage Statuses',
        items: [
          { en: 'OPEN: still unpaid, collected amount is 0.', hi: 'OPEN: abhi bhi unpaid, collected amount 0 hai.' },
          { en: 'CAPTURED: payment verified — collector name, shift run, collected time, tender type, FX rate all shown, and original FINAL document link available.', hi: 'CAPTURED: payment verified hai — collector name, shift run, collected time, tender type, FX rate sab dikhte hain, original FINAL document link bhi available hai.' },
          { en: 'LEGACY: an old record where collection evidence isn\'t saved — only the recorded total is shown, no collector/evidence available.', hi: 'LEGACY: purana record jisme collection evidence save nahi hai — sirf recorded total dikhta hai, collector/evidence available nahi hai.' },
          { en: 'UNAVAILABLE: evidence is corrupt or missing — no assumption is made, it is neither treated as PAID nor as zero balance.', hi: 'UNAVAILABLE: evidence corrupt ya missing hai — koi assumption nahi liya jaata, na PAID treat hota hai na zero balance.' },
        ],
      },
      {
        headingEn: 'Hard Rule',
        headingHi: 'Hard Rule',
        items: [
          { en: 'This panel performs no mutation — use the existing order controls (Section A5) to actually settle.', hi: 'Ye panel koi mutation nahi karta — actual settle karne ke liye existing order controls (Section A5) use karo.' },
        ],
      },
    ],
    example: {
      en: 'No separate numeric worked example given beyond the four coverage statuses above.',
      hi: 'Upar diye gaye chaar coverage statuses ke alawa koi alag numeric example nahi diya gaya.',
    },
  },

  {
    id: 'void-paid-order',
    titleEn: 'Void a Paid Order Panel',
    titleHi: 'Void a Paid Order Panel',
    icon: 'rotate-ccw',
    summaryEn: 'Owner/Branch Manager can reverse an already PAID/COMPLETED order via an append-only reversal record, with automatic restock-vs-waste logic.',
    summaryHi: 'Owner/Branch Manager already PAID/COMPLETED order ko append-only reversal record ke zariye reverse kar sakte hain, automatic restock-vs-waste logic ke saath.',
    sections: [
      {
        headingEn: 'Who Can Do It & Steps',
        headingHi: 'Who Can Do It & Steps',
        items: [
          { en: 'Used when an order is already PAID or COMPLETED and now needs cancelling/reversing (wrong order, wrong item, etc.).', hi: 'Use hota hai jab order already PAID ya COMPLETED hai aur ab cancel/reverse karna hai (galat order, galat item, etc.).' },
          { en: 'Only the Owner (SUPER_ADMIN) or a Branch Manager (own branch only, with POS_CASHIER module) can do it — a normal cashier cannot.', hi: 'Sirf Owner (SUPER_ADMIN) ya Branch Manager (apna branch, POS_CASHIER module ke saath) ye kar sakte hain — normal cashier nahi kar sakta.' },
          { en: 'Steps: click "Void order" on the eligible order list, enter a reason (3-500 characters), click "Confirm void".', hi: 'Steps: eligible order list par "Void order" click karo, reason enter karo (3-500 characters), "Confirm void" click karo.' },
        ],
      },
      {
        headingEn: 'Hard Rules — Records',
        headingHi: 'Hard Rules — Records',
        items: [
          { en: 'Original payment/receipt/FINAL/COGS rows are never edited — a new append-only "reversal" record is created instead, nothing is deleted or overwritten, so the audit trail stays safe.', hi: 'Original payment/receipt/FINAL/COGS rows kabhi edit nahi hoti — iske jagah naya append-only "reversal" record banta hai, kuch bhi delete ya overwrite nahi hota, audit trail safe rehta hai.' },
          { en: 'Idempotent: voiding the same order with the same reason again is treated as a safe "replay"; a different reason on a repeat void gives a 409 error.', hi: 'Idempotent: same order ko same reason se dobara void karna safe "replay" maana jaata hai; repeat void par alag reason dene par 409 error aata hai.' },
        ],
      },
      {
        headingEn: 'Hard Rules — Restock vs Waste (Automatic, Line-by-Line)',
        headingHi: 'Hard Rules — Restock vs Waste (Automatic, Line-by-Line)',
        items: [
          { en: 'A line whose ticket hasn\'t reached SERVED status yet (or was never tracked) is restocked — stock returns, not treated as waste.', hi: 'Jis line ka ticket abhi SERVED status tak nahi pahuncha (ya kabhi track nahi hua) wo restock hoti hai — stock wapas aata hai, waste nahi mana jaata.' },
          { en: 'A line whose ticket was already SERVED is treated as waste — assumed given to the customer, cannot return, no stock returns and no new wastage-ledger entry is created in this pass.', hi: 'Jis line ka ticket already SERVED tha wo waste treat hoti hai — maana jaata hai customer ko de diya gaya, wapas nahi aa sakta, stock wapas nahi aata aur is pass mein nayi wastage-ledger entry bhi nahi banti.' },
          { en: 'If the BOM recipe has since been edited or is missing (restock cannot be calculated), the system becomes conservative — puts ALL lines into waste, but does not block the void authorization.', hi: 'Agar BOM recipe baad mein edit ho gaya ya missing hai (restock calculate nahi ho sakta), system conservative ho jaata hai — ALL lines ko waste mein daal deta hai, lekin void authorization block nahi karta.' },
        ],
      },
      {
        headingEn: 'Hard Rules — Refund & Review',
        headingHi: 'Hard Rules — Refund & Review',
        items: [
          { en: 'Refund liability: if payment was already captured, its amount is recorded as "refund liability" — but this is only a record, no actual bank refund is executed.', hi: 'Refund liability: agar payment already capture hui thi, uska amount "refund liability" ke roop mein record hota hai — lekin ye sirf record hai, actual bank refund execute nahi hota.' },
          { en: 'The system makes a conservative decision rather than guessing, and keeps a full record for review; the restock/waste/refund breakdown shows in the "Recent void reversals" section of the panel.', hi: 'System guess karne ke bajaye conservative decision leta hai, aur review ke liye poora record rakhta hai; restock/waste/refund breakdown panel ke "Recent void reversals" section mein dikhta hai.' },
        ],
      },
    ],
    example: {
      en: 'Order ORD-2234 was PAID with 3 lines: Soup — ticket still SENT, not served -> restocked. Burger — ticket already SERVED -> wasted (no restock). Cold Drink — no ticket existed at all (packaged item, no kitchen station) -> conservative rule treats it as wasted (no evidence it wasn\'t given to customer). Manager wrote reason "Customer complained about wrong order" and voided — result: "1 line restocked; 2 line(s) wasted; refund liability TZS 850".',
      hi: 'Order ORD-2234 PAID tha, 3 lines: Soup — ticket abhi SENT tha, served nahi hua -> restocked. Burger — ticket already SERVED tha -> wasted (restock nahi hua). Cold Drink — koi ticket hi nahi tha (packaged item, kitchen station nahi) -> conservative rule use wasted maanta hai (evidence nahi hai ki customer ko nahi diya gaya). Manager ne reason "Customer complained about wrong order" likh ke void kiya — result: "1 line restocked; 2 line(s) wasted; refund liability TZS 850".',
    },
  },

  {
    id: 'kitchen-bar',
    titleEn: 'Kitchen/Bar Preparation Module',
    titleHi: 'Kitchen/Bar Preparation Module',
    icon: 'chef-hat',
    summaryEn: 'Preparation queue with station/history filters and strict linear ticket status transitions, with no prices ever shown to kitchen.',
    summaryHi: 'Station/history filters wali preparation queue, strict linear ticket status transitions, kitchen ko price kabhi nahi dikhti.',
    sections: [
      {
        headingEn: 'Access',
        headingHi: 'Access',
        items: [
          { en: 'Anyone with POS_KITCHEN or POS_CASHIER module can access this screen.', hi: 'POS_KITCHEN ya POS_CASHIER module wala koi bhi ye screen access kar sakta hai.' },
        ],
      },
      {
        headingEn: 'B1 — Preparation Queue',
        headingHi: 'B1 — Preparation Queue',
        items: [
          { en: 'Filters include Station (All stations/Kitchen/Bar) and an "Include served/cancelled history" checkbox — off shows only active tickets.', hi: 'Filters mein Station (All stations/Kitchen/Bar) aur "Include served/cancelled history" checkbox hai — off hone par sirf active tickets dikhte hain.' },
          { en: 'Branch scope is the currently selected branch, or "All authorized branches".', hi: 'Branch scope currently selected branch hai, ya "All authorized branches".' },
          { en: 'Each ticket card shows: ticket number, station, status (SENT/PREPARING/READY/SERVED), revision, order number, table no., created time, and snapshot lines (qty + item name — no price shown, kitchen should never see price).', hi: 'Har ticket card dikhata hai: ticket number, station, status (SENT/PREPARING/READY/SERVED), revision, order number, table no., created time, aur snapshot lines (qty + item name — price kabhi nahi dikhti, kitchen ko price nahi dikhni chahiye).' },
          { en: 'A very old ticket without a saved snapshot shows the legacy warning "Legacy ticket: saved snapshot unavailable".', hi: 'Bina saved snapshot wala bahut purana ticket legacy warning "Legacy ticket: saved snapshot unavailable" dikhata hai.' },
        ],
      },
      {
        headingEn: 'B2 — Ticket Actions: Start/Ready/Serve',
        headingHi: 'B2 — Ticket Actions: Start/Ready/Serve',
        items: [
          { en: '"Start preparation" moves SENT -> PREPARING and requires POS_KITCHEN module + canPrepare capability.', hi: '"Start preparation" SENT -> PREPARING karta hai, iske liye POS_KITCHEN module + canPrepare capability chahiye.' },
          { en: '"Mark ready" moves PREPARING -> READY, with the same POS_KITCHEN requirement.', hi: '"Mark ready" PREPARING -> READY karta hai, usi POS_KITCHEN requirement ke saath.' },
          { en: '"Serve" moves READY -> SERVED and needs POS_CASHIER module, not POS_KITCHEN, because the person serving is the waiter/cashier, not the cook.', hi: '"Serve" READY -> SERVED karta hai aur isme POS_CASHIER module chahiye, POS_KITCHEN nahi, kyunki serve karne wala waiter/cashier hota hai, cook nahi.' },
          { en: 'Hard rule: any action can only move from the exact current status to the exact next status — it cannot skip statuses (e.g. cannot jump straight from SENT to SERVED).', hi: 'Hard rule: koi bhi action exact current status se exact next status tak hi move kar sakta hai — statuses skip nahi ho sakte (jaise SENT se seedha SERVED mein jump nahi ho sakta).' },
          { en: 'Replay safety: every button press freezes a requestKey + expectedRevision; if the network fails with unknown outcome, the screen shows "Action outcome unknown" and locks all filters/actions until "Replay exact request" is clicked, preventing a duplicate action (e.g. Start happening twice).', hi: 'Replay safety: har button press requestKey + expectedRevision freeze karta hai; network fail ho aur outcome unknown ho to screen "Action outcome unknown" dikhati hai aur "Replay exact request" click hone tak sab filters/actions lock rehte hain, taaki duplicate action (jaise Start do baar) na ho.' },
        ],
      },
      {
        headingEn: 'B3 — Snapshot/History/Print',
        headingHi: 'B3 — Snapshot/History/Print',
        items: [
          { en: 'Every ticket has a button that opens a full snapshot in a modal, which can also be printed.', hi: 'Har ticket par button hai jo modal mein full snapshot kholta hai, jo print bhi ho sakta hai.' },
        ],
      },
    ],
    example: {
      en: 'Ticket KOT-1234 (station KITCHEN) status SENT — cook clicks "Start preparation", status becomes PREPARING. When food is ready, clicks "Mark ready", status READY. Waiter takes it to the table and clicks "Serve" (using POS_CASHIER access) — status SERVED, now the order is eligible for "Close service" (Section A7.5).',
      hi: 'Ticket KOT-1234 (station KITCHEN) status SENT hai — cook "Start preparation" click karta hai, status PREPARING ho jaata hai. Khaana ready hone par "Mark ready" click karta hai, status READY. Waiter table tak le jaake "Serve" click karta hai (POS_CASHIER access se) — status SERVED, ab order "Close service" (Section A7.5) ke eligible ho jaata hai.',
    },
  },

  {
    id: 'waiter-module',
    titleEn: 'Waiter/Take Order Module',
    titleHi: 'Waiter/Take Order Module',
    icon: 'user',
    summaryEn: 'Table-side order taking for Conventional branches only — sends straight to kitchen, no payment collection here at all.',
    summaryHi: 'Sirf Conventional branches ke liye table-side order taking — seedha kitchen mein jaata hai, yahan payment collection bilkul nahi hoti.',
    sections: [
      {
        headingEn: 'Access & Restriction',
        headingHi: 'Access & Restriction',
        items: [
          { en: 'Anyone with POS_WAITER or POS_CASHIER module can access this screen.', hi: 'POS_WAITER ya POS_CASHIER module wala koi bhi ye screen access kar sakta hai.' },
          { en: 'This entire screen only works for CONVENTIONAL branches; if the branch is Fast Food (counter service), it shows: "This branch is set up as Fast Food (counter service). Orders are taken directly at POS / Cashier."', hi: 'Ye poori screen sirf CONVENTIONAL branches ke liye kaam karti hai; agar branch Fast Food (counter service) hai, to ye dikhata hai: "This branch is set up as Fast Food (counter service). Orders are taken directly at POS / Cashier."' },
        ],
      },
      {
        headingEn: 'C1 — Table Selection',
        headingHi: 'C1 — Table Selection',
        items: [
          { en: 'Two options: "— New table —" (type a new table no., e.g. T-12), or an existing-open-table dropdown listing any currently-running OPEN+DINE_IN orders in "Add items" mode.', hi: 'Do options: "— New table —" (naya table no. type karo, jaise T-12), ya existing-open-table dropdown jisme currently-running OPEN+DINE_IN orders "Add items" mode mein list hote hain.' },
        ],
      },
      {
        headingEn: 'C2 — Item Selection and Send',
        headingHi: 'C2 — Item Selection and Send',
        items: [
          { en: 'Items are chosen using the Menu Tile Picker (Section A2); the running total shown below is only "to tell the customer" — it is not a payment.', hi: 'Items Menu Tile Picker (Section A2) se choose hote hain; neeche dikhta running total sirf "customer ko batane" ke liye hai — ye payment nahi hai.' },
          { en: 'Hard rule: a waiter never collects payment — there is no tender field here at all; the description explicitly says "No payment here — the Cashier settles at POS."', hi: 'Hard rule: waiter kabhi payment collect nahi karta — yahan tender field bilkul nahi hai; description explicitly kehta hai "No payment here — the Cashier settles at POS."' },
          { en: 'Both a brand-new table order and an add-to-existing-table case deduct stock immediately and send a KOT/BOT ticket to kitchen, using the same backend as POS New Order/Add items.', hi: 'Ek bilkul naye table order aur ek existing-table mein add karne ka case, dono stock turant deduct karte hain aur KOT/BOT ticket kitchen ko bhejte hain, POS New Order/Add items jaisa hi same backend use karke.' },
          { en: 'The shift must be active and accepted (same as POS), else the send is rejected.', hi: 'Shift active aur accepted hona chahiye (POS jaisa hi), warna send reject ho jaata hai.' },
          { en: 'Replay safety: the same idempotencyKey mechanism applies here too — if network fails, a "Replay exact request" button appears, and re-clicking it never creates a duplicate order.', hi: 'Replay safety: yahan bhi same idempotencyKey mechanism lagta hai — network fail hone par "Replay exact request" button aata hai, dobara click karne se duplicate order kabhi nahi banta.' },
        ],
      },
    ],
    example: {
      en: 'Waiter takes an order for 2x Chicken Biryani at table T-9 and clicks "Send to Kitchen" — KOT is created, running total TSh500 was shown earlier purely for info. Later the customer wants 1 more Raita — waiter selects the same T-9 from the dropdown and uses "Add items" to send the Raita, creating a new mini-KOT.',
      hi: 'Waiter table T-9 par 2x Chicken Biryani ka order leta hai aur "Send to Kitchen" click karta hai — KOT ban jaata hai, running total TSh500 pehle sirf info ke liye dikhaya gaya tha. Baad mein customer 1 Raita aur maangta hai — waiter dropdown se wahi T-9 select karke "Add items" se Raita bhejta hai, jisse naya mini-KOT banta hai.',
    },
  },

  {
    id: 'cash-drop',
    titleEn: 'Cash-Drop Module (Shift Cash Custody + HO Dispatch)',
    titleHi: 'Cash-Drop Module (Shift Cash Custody + HO Dispatch)',
    icon: 'banknote',
    summaryEn: 'Manages shift start, blind denomination counts, shift-end reconciliation, Head Office cash dispatch/acceptance, and live shift summary.',
    summaryHi: 'Shift start, blind denomination counts, shift-end reconciliation, Head Office cash dispatch/acceptance aur live shift summary manage karta hai.',
    sections: [
      {
        headingEn: 'Access',
        headingHi: 'Access',
        items: [
          { en: 'Requires the CASH_DROP module; opening float and HO dispatch (sensitive items) are limited to Branch Manager/Owner.', hi: 'CASH_DROP module chahiye; opening float aur HO dispatch (sensitive items) sirf Branch Manager/Owner tak limited hain.' },
        ],
      },
      {
        headingEn: 'D1 — Start Shift',
        headingHi: 'D1 — Start Shift',
        items: [
          { en: 'Used when no shift is open at the branch — first shift of the day, or manually starting the next shift after the previous one ended.', hi: 'Use hota hai jab branch par koi shift open nahi hai — din ki pehli shift, ya pichli khatam hone ke baad manually next shift start karna.' },
          { en: 'For a normal cashier, "Start Shift" is one click, no field needed.', hi: 'Normal cashier ke liye "Start Shift" ek click hai, koi field nahi chahiye.' },
          { en: 'Opening Cash Float is optional and only for Branch Manager/Owner, with Amount (TSh) and Source/reference (e.g. "Owner cash box"); it should only be filled for the branch\'s very-first-ever shift so the drawer\'s starting cash doesn\'t wrongly show as "unexplained excess" at shift-end.', hi: 'Opening Cash Float optional hai aur sirf Branch Manager/Owner ke liye hai, Amount (TSh) aur Source/reference (jaise "Owner cash box") ke saath; ye sirf branch ki bilkul pehli shift ke liye fill karna chahiye taaki drawer ka starting cash shift-end par "unexplained excess" na dikhe.' },
          { en: 'Hard rule: shift-definitions must be configured (covering 24h with no gaps/overlap), else start is rejected; if an OPEN shift already exists, a new one won\'t start (409).', hi: 'Hard rule: shift-definitions configured hone chahiye (24h cover karte hue bina gaps/overlap ke), warna start reject hota hai; agar ek OPEN shift already exist karti hai, nayi start nahi hogi (409).' },
        ],
      },
      {
        headingEn: 'D2 — Denomination Count (Blind Cash Drop)',
        headingHi: 'D2 — Denomination Count (Blind Cash Drop)',
        items: [
          { en: 'Used at shift-end — the cashier does not see the expected amount beforehand (a blind count), so the cashier cannot "adjust" the count to match.', hi: 'Shift-end par use hota hai — cashier ko expected amount pehle se nahi dikhta (blind count), isliye cashier count ko match karne ke liye "adjust" nahi kar sakta.' },
          { en: 'Denominations covered: TSh 10000, 5000, 2000, 1000, 500 notes (count each), plus Coins (TSh, decimal allowed).', hi: 'Denominations: TSh 10000, 5000, 2000, 1000, 500 notes (har ek count karo), aur Coins (TSh, decimal allowed).' },
          { en: 'Steps: fill each denomination\'s count (whole non-negative numbers), fill coins amount; "Counted total" shows live as you count; then choose either "End Shift & Handover" (D3) or "Dispatch to Head Office" (D4, only for the final shift of the day).', hi: 'Steps: har denomination ka count fill karo (whole non-negative numbers), coins amount fill karo; "Counted total" counting ke saath live dikhta hai; phir "End Shift & Handover" (D3) ya "Dispatch to Head Office" (D4, sirf din ki final shift ke liye) choose karo.' },
          { en: 'Hard rule: all counts must be whole non-negative integers, coins non-negative; invalid input gives "Enter whole non-negative note counts and a valid coin amount" error.', hi: 'Hard rule: sabhi counts whole non-negative integers hone chahiye, coins non-negative; invalid input par "Enter whole non-negative note counts and a valid coin amount" error aata hai.' },
        ],
      },
      {
        headingEn: 'D3 — End Shift & Handover',
        headingHi: 'D3 — End Shift & Handover',
        items: [
          { en: 'Used for the normal case — one shift ends and the next one opens immediately (same day, next slot in the cycle).', hi: 'Normal case ke liye use hota hai — ek shift khatam hoti hai aur next turant open ho jaati hai (same day, cycle ka next slot).' },
          { en: 'Server-side Expected Cash = (Opening float OR accepted handover cash from previous shift) + this shift\'s total CASH-tender POS payments − any POSTED cash drawer expense linked to this shift; Card/UPI/Other tenders are tracked separately for info only.', hi: 'Server-side Expected Cash = (Opening float YA previous shift se accepted handover cash) + is shift ka total CASH-tender POS payments − is shift se linked koi POSTED cash drawer expense; Card/UPI/Other tenders alag se track hote hain sirf info ke liye.' },
          { en: 'Shortage/Excess = Counted Cash (from denominations) − Expected Cash.', hi: 'Shortage/Excess = Counted Cash (denominations se) − Expected Cash.' },
          { en: 'Hard rule: a shift with a currently pending handover (not yet accepted by the next shift) cannot end — it must be accepted first.', hi: 'Hard rule: jis shift ka handover abhi pending hai (next shift se accept nahi hua), wo end nahi ho sakti — pehle accept hona zaroori hai.' },
          { en: 'Result shown (expected cash is revealed only now): "Shift ended — handed over to [next shift label]", Shortage/Excess amount with what Expected cash was, and Cash/Card/UPI/Other amounts in a grid; the next shift automatically becomes OPEN with no gap.', hi: 'Result dikhta hai (expected cash sirf ab reveal hota hai): "Shift ended — handed over to [next shift label]", Shortage/Excess amount aur Expected cash kya tha, aur Cash/Card/UPI/Other amounts grid mein; next shift automatically OPEN ho jaati hai bina gap ke.' },
        ],
      },
      {
        headingEn: 'D4 — Dispatch to Head Office (Final Shift of the Day)',
        headingHi: 'D4 — Dispatch to Head Office (Final Shift of the Day)',
        items: [
          { en: 'Used when this is the branch\'s last shift of the day — cash does not go to the next shift, instead it goes to Head Office (Owner).', hi: 'Use hota hai jab ye branch ki din ki last shift ho — cash next shift ko nahi jaata, Head Office (Owner) ko jaata hai.' },
          { en: 'Field: Retained float (optional, TSh) — how much cash to keep at the branch for tomorrow, the rest gets dispatched.', hi: 'Field: Retained float (optional, TSh) — kal ke liye branch par kitna cash rakhna hai, baaki dispatch ho jaata hai.' },
          { en: 'Hard rules: Retained float must be between 0 and Counted Cash (cannot exceed it); Dispatched Amount = Counted Cash − Retained Float.', hi: 'Hard rules: Retained float 0 se Counted Cash ke beech hona chahiye (usse zyada nahi); Dispatched Amount = Counted Cash − Retained Float.' },
          { en: 'A new shift does NOT open — the next shift must be manually started tomorrow, using the retained float as that new shift\'s "Opening float".', hi: 'Nayi shift open NAHI hoti — kal next shift manually start karni padti hai, retained float ko us nayi shift ka "Opening float" bana ke.' },
          { en: 'The same shift cannot be dispatched twice — it is already ENDED, so a second attempt gives 404.', hi: 'Ek hi shift dobara dispatch nahi ho sakti — wo already ENDED hai, isliye second attempt par 404 aata hai.' },
        ],
      },
      {
        headingEn: 'D5 — Head Office: Incoming Cash Dispatches (Owner/SUPER_ADMIN only)',
        headingHi: 'D5 — Head Office: Incoming Cash Dispatches (Owner/SUPER_ADMIN only)',
        items: [
          { en: 'Used when the Owner is at Head Office checking which branch is sending cash, to accept it.', hi: 'Use hota hai jab Owner Head Office par check kar raha ho ki kaunsi branch cash bhej rahi hai, usse accept karne ke liye.' },
          { en: 'Steps: the pending dispatch list shows branch, dispatched amount and dispatch time; an optional "Amount actually received" field can be left blank for an exact match; click "Accept".', hi: 'Steps: pending dispatch list mein branch, dispatched amount aur dispatch time dikhte hain; optional "Amount actually received" field exact match ke liye blank chhod sakte hain; "Accept" click karo.' },
          { en: 'Hard rule: whoever dispatched (the branch actor) cannot accept their own dispatch — self-acceptance is blocked, a separate authority is required.', hi: 'Hard rule: jisne dispatch kiya (branch actor) wo apna dispatch accept nahi kar sakta — self-acceptance block hai, alag authority zaroori hai.' },
          { en: 'Discrepancy is automatically calculated as Accepted Amount − Dispatched Amount, a signed number where positive means received more and negative means received less.', hi: 'Discrepancy automatically Accepted Amount − Dispatched Amount se calculate hoti hai, ek signed number jisme positive matlab zyada mila aur negative matlab kam mila.' },
        ],
      },
      {
        headingEn: 'D6 — Live Shift Summary Panel (Read-only)',
        headingHi: 'D6 — Live Shift Summary Panel (Read-only)',
        items: [
          { en: 'Used while a current shift is running, without ending it, to see how much has been collected so far and what is pending.', hi: 'Current shift chalte waqt, use end kiye bina, abhi tak kitna collect hua aur kya pending hai dekhne ke liye use hota hai.' },
          { en: 'Shows: current run label and start time; Cash/Card/UPI/Other collected live so far; completed/paid orders count and total in this run; and pending (unpaid) orders still OPEN, not counted in cash yet (can carry over from an earlier run too, flagged as "carried over from an earlier run").', hi: 'Dikhata hai: current run label aur start time; Cash/Card/UPI/Other abhi tak live collected; is run mein completed/paid orders count aur total; aur pending (unpaid) orders jo abhi OPEN hain, cash mein count nahi hue (pehle run se carry over bhi ho sakte hain, "carried over from an earlier run" flag ke saath).' },
          { en: 'Hard rule: this is only a preview — if it ever mismatches the real shift-close figure (Section D3), the shift-close figure is authoritative; this panel is just a live estimate, not a second source of totals.', hi: 'Hard rule: ye sirf preview hai — agar kabhi real shift-close figure (Section D3) se mismatch ho, to shift-close figure hi authoritative hota hai; ye panel sirf live estimate hai, totals ka second source nahi.' },
        ],
      },
    ],
    example: {
      en: 'Opening float was TSh 50,000. This shift\'s CASH payments totaled TSh 180,000. One POSTED cash expense (vegetable purchase) TSh 15,000 was linked to this shift. Expected Cash = 50,000 + 180,000 − 15,000 = TSh 215,000. Cashier counted notes/coins totaling TSh 212,500. Shortage = 212,500 − 215,000 = −TSh 2,500 (shortage shown). Separately: Counted cash TSh 90,000 at the final shift — Branch Manager entered TSh 10,000 as "Retained float for tomorrow", clicked Dispatch — Dispatched Amount = 90,000 − 10,000 = TSh 80,000 shown to Head Office as "in transit". At HO, actual count was TSh 79,500 — Owner entered 79500 in "Amount actually received" and clicked Accept — discrepancy = 79,500 − 80,000 = −TSh 500 recorded permanently, with no re-adjustment or re-dispatch.',
      hi: 'Opening float TSh 50,000 tha. Is shift ka CASH payments total TSh 180,000 tha. Ek POSTED cash expense (sabzi purchase) TSh 15,000 is shift se linked tha. Expected Cash = 50,000 + 180,000 − 15,000 = TSh 215,000. Cashier ne notes/coins count kiye jo total TSh 212,500 nikle. Shortage = 212,500 − 215,000 = −TSh 2,500 (shortage dikhi). Alag se: final shift mein Counted cash TSh 90,000 tha — Branch Manager ne TSh 10,000 "Retained float for tomorrow" daala, Dispatch click kiya — Dispatched Amount = 90,000 − 10,000 = TSh 80,000 Head Office ko "in transit" dikha. HO par actual count TSh 79,500 nikla — Owner ne "Amount actually received" mein 79500 daal ke Accept kiya — discrepancy = 79,500 − 80,000 = −TSh 500 permanently record hua, koi re-adjustment ya re-dispatch nahi hua.',
    },
  },
];

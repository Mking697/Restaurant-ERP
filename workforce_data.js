const DATA_WORKFORCE = [
  {
    id: 'employee-master',
    titleEn: 'Employee Master (Create / Edit)',
    titleHi: 'Employee Master (Create / Edit)',
    icon: 'user-plus',
    summaryEn: 'Create and maintain the core employee record — separate from app login — with locked rules once leave history exists.',
    summaryHi: 'Employee ka core record banao aur maintain karo — login se alag hota hai — aur leave history aane ke baad kuch cheezen lock ho jaati hain.',
    sections: [
      {
        headingEn: 'What an Employee Record Is',
        headingHi: 'Employee Record Kya Hota Hai',
        items: [
          { en: 'An employee record is a "master record" — name, employment type, current rate, joining date, and an optional link to an app login.', hi: 'Employee record ek "master record" hota hai — naam, employment type, current rate, joining date, aur optional app-login link.' },
          { en: 'The employee record is separate from login — an employee can exist with no login at all.', hi: 'Employee record login se bilkul alag hota hai — employee bina kisi login ke bhi exist kar sakta hai.' },
          { en: 'Without a linked login, that employee cannot self-apply leave; only a manager (with PAYROLL or LEAVE_APPROVAL) can apply leave on their behalf.', hi: 'Agar login link nahi hai to wo employee khud leave apply nahi kar sakta; sirf manager (PAYROLL ya LEAVE_APPROVAL permission wala) uske liye leave apply kar sakta hai.' },
        ],
      },
      {
        headingEn: 'Create Steps',
        headingHi: 'Create Karne Ke Steps',
        items: [
          { en: 'Fill "Employee name" (this requires PAYROLL permission).', hi: '"Employee name" fill karo (iske liye PAYROLL permission chahiye).' },
          { en: '"Linked user (optional)" dropdown picks an existing branch login not already linked to another employee, or choose "No login link".', hi: '"Linked user (optional)" dropdown se ek existing branch login choose karo jo kisi aur employee se already linked na ho, ya "No login link" choose karo.' },
          { en: 'Choose "Employment type": ON_ROLL (monthly salary) or OFF_ROLL (daily wage).', hi: '"Employment type" choose karo: ON_ROLL (monthly salary) ya OFF_ROLL (daily wage).' },
          { en: 'Rate field label changes based on type — "Monthly salary" for ON_ROLL, "Daily wage" for OFF_ROLL — must be a positive decimal with max 2 decimals; zero or negative is not allowed.', hi: 'Rate field ka label type ke hisaab se change hota hai — ON_ROLL ke liye "Monthly salary", OFF_ROLL ke liye "Daily wage" — positive decimal hona chahiye, max 2 decimal, zero ya negative allowed nahi.' },
          { en: 'Pick "Joined on" date — the first valid employment date, inclusive.', hi: '"Joined on" date pick karo — employment ki pehli valid date, inclusive.' },
          { en: 'Click "Create employee" to save.', hi: 'Save karne ke liye "Create employee" click karo.' },
        ],
      },
      {
        headingEn: 'Create Conditions (Server-Side)',
        headingHi: 'Create Conditions (Server-Side)',
        items: [
          { en: 'Server checks that from the join date onward there is no already-finalized payroll month for that branch (openInterval check).', hi: 'Server check karta hai ki join date se aage us branch ka koi already-finalized payroll month na ho (openInterval check).' },
          { en: 'You cannot create a new employee whose join date would affect an already-closed payroll month.', hi: 'Aap naya employee create nahi kar sakte agar uski join date kisi already-closed payroll month ko affect karegi.' },
        ],
      },
      {
        headingEn: 'Edit Steps',
        headingHi: 'Edit Karne Ke Steps',
        items: [
          { en: 'Click "Edit / future rate" on an employee row.', hi: 'Employee row par "Edit / future rate" click karo.' },
          { en: 'You can change the name, or set "Left on" (exit date, inclusive; blank means still active).', hi: 'Naam change kar sakte ho, ya "Left on" (exit date, inclusive; blank matlab abhi bhi active) set kar sakte ho.' },
          { en: 'You can also change "Linked user" — but with a big restriction (see login-link lock rule below).', hi: '"Linked user" bhi change kar sakte ho — par ek badi restriction ke saath (neeche login-link lock rule dekho).' },
          { en: 'Click "Save details" to save changes.', hi: 'Changes save karne ke liye "Save details" click karo.' },
        ],
      },
      {
        headingEn: 'Login-Link Lock Rule (Important)',
        headingHi: 'Login-Link Lock Rule (Important)',
        items: [
          { en: 'If an employee EVER has any leave history record — PENDING, APPROVED, or REJECTED, any status — their userId login link gets locked permanently.', hi: 'Agar employee ke paas EVER koi bhi leave history record hai — PENDING, APPROVED, ya REJECTED, koi bhi status — uska userId login link permanently lock ho jaata hai.' },
          { en: 'Once locked, nobody — not even the Owner — can assign, replace, or clear that login link.', hi: 'Ek baar lock hone ke baad, koi bhi — Owner bhi nahi — us login link ko assign, replace, ya clear nahi kar sakta.' },
          { en: 'Other safe edits like name and exit date still work fine; only the login-link change is blocked.', hi: 'Doosre safe edits jaise naam aur exit date abhi bhi kaam karte hain; sirf login-link change block hota hai.' },
          { en: 'Reason: the system keeps no separate "snapshot" of the leave beneficiary — the original login on old leave history must stay the same for the audit trail.', hi: 'Reason: system leave ke beneficiary ka alag "snapshot" nahi rakhta — purani leave history ka original login audit trail ke liye same hi rehna chahiye.' },
        ],
      },
      {
        headingEn: 'Exit Date (leftOn) Rule',
        headingHi: 'Exit Date (leftOn) Rule',
        items: [
          { en: 'Any attendance or non-rejected leave that falls after the chosen exit date blocks setting that exit date — error "Exit would invalidate attendance or leave".', hi: 'Agar chosen exit date ke baad koi attendance ya non-rejected leave hai, to exit date set nahi hone diya jaata — error "Exit would invalidate attendance or leave".' },
          { en: 'Future-dated attendance/leave entries must be cleared first, then the exit date can be set.', hi: 'Future-dated attendance/leave entries pehle clear karne honge, uske baad exit date set ho sakti hai.' },
        ],
      },
    ],
    example: {
      en: 'An employee can exist with no login — only a manager with PAYROLL/LEAVE_APPROVAL can apply leave for them. Once that employee has any leave record (even rejected), their login link is locked forever, even for the Owner.',
      hi: 'Employee bina login ke exist kar sakta hai — sirf PAYROLL/LEAVE_APPROVAL wala manager unke liye leave apply kar sakta hai. Ek baar us employee ka koi leave record ban jaaye (rejected bhi), to uska login link forever lock ho jaata hai, Owner ke liye bhi.',
    },
  },
  {
    id: 'schedule-future-rate',
    titleEn: 'Schedule a Future Rate',
    titleHi: 'Future Rate Schedule Karna',
    icon: 'calendar-clock',
    summaryEn: 'Salary or wage is never directly overwritten — every change creates a new dated compensation row so past payroll stays untouched.',
    summaryHi: 'Salary ya wage kabhi directly overwrite nahi hoti — har change ek nayi dated compensation row banata hai, taaki past payroll untouched rahe.',
    sections: [
      {
        headingEn: 'Why Rates Are Scheduled, Not Overwritten',
        headingHi: 'Rate Ko Overwrite Kyun Nahi Kiya Jaata',
        items: [
          { en: 'An employee\'s rate (salary/wage) is never directly overwritten — every rate change creates a NEW "compensation history" row effective from a future date.', hi: 'Employee ki rate (salary/wage) kabhi directly overwrite nahi hoti — har rate change ek NAYI "compensation history" row banata hai jo future date se effective hoti hai.' },
          { en: 'This way, a past finalized payroll never retroactively changes.', hi: 'Isse past finalized payroll kabhi retroactively change nahi hota.' },
        ],
      },
      {
        headingEn: 'Steps',
        headingHi: 'Steps',
        items: [
          { en: 'In the employee editor, fill "New rate" and "Effective month (future)".', hi: 'Employee editor mein "New rate" aur "Effective month (future)" fill karo.' },
          { en: 'Click "Schedule rate" — this button only enables when the chosen month\'s -01 date is strictly future from today (business date).', hi: '"Schedule rate" click karo — yeh button sirf tab enable hota hai jab chosen month ki -01 date business date se strictly future ho.' },
        ],
      },
      {
        headingEn: 'Exact Rule (rateEffectiveDate)',
        headingHi: 'Exact Rule (rateEffectiveDate)',
        items: [
          { en: 'Condition 1: the new effective date must be strictly future from today\'s business date.', hi: 'Condition 1: naya effective date aaj ki business date se strictly future hona chahiye.' },
          { en: 'Condition 2: it must be the first day of a month — must end in -01; mid-month rate changes are not allowed.', hi: 'Condition 2: wo month ka first day hona chahiye — -01 mein end hona chahiye; mid-month rate change allowed nahi.' },
          { en: 'Condition 3: it must be strictly after the previous compensation row\'s effective date — cannot schedule a rate on or before the previous one.', hi: 'Condition 3: wo previous compensation row ki effective date se strictly baad hona chahiye — rate ko previous date par ya usse pehle schedule nahi kar sakte.' },
          { en: 'After passing those, the server also checks that no attendance or non-rejected leave already exists on/after the new effective date — if it does, reject "Rate change touches attendance or leave".', hi: 'Yeh pass hone ke baad, server yeh bhi check karta hai ki naye effective date se aage koi attendance ya non-rejected leave na ho — agar hai to "Rate change touches attendance or leave" reject ho jaata hai.' },
          { en: 'It also rejects the change if any finalized payroll month falls in that interval.', hi: 'Agar us interval mein koi finalized payroll month aata hai, to bhi change reject ho jaata hai.' },
        ],
      },
    ],
    example: {
      en: 'Employee\'s current rate is TSh 500,000/month, effective 2026-01-01. Today is November 2026. Owner schedules TSh 550,000, effective 2027-01. This passes because 2027-01-01 is future, is a month-boundary, and is after 2026-01-01. If any attendance/leave already existed on/after 2027-01 (normally impossible since future dates are blocked), it would reject.',
      hi: 'Employee ki current rate TSh 500,000/month hai, effective 2026-01-01. Aaj November 2026 hai. Owner TSh 550,000 schedule karta hai, effective 2027-01. Yeh pass hota hai kyunki 2027-01-01 future hai, month-boundary hai, aur 2026-01-01 ke baad hai. Agar 2027-01 par/baad koi attendance/leave already exist karta (normally impossible, kyunki future dates block hain), to yeh reject ho jaata.',
    },
  },
  {
    id: 'daily-attendance',
    titleEn: 'Daily Attendance',
    titleHi: 'Daily Attendance',
    icon: 'calendar-check',
    summaryEn: 'Every day each employee is marked PRESENT/HALF_DAY/ABSENT — this is the base data payroll calculates from.',
    summaryHi: 'Har din har employee ko PRESENT/HALF_DAY/ABSENT mark kiya jaata hai — yeh payroll calculation ka base data hai.',
    sections: [
      {
        headingEn: 'Steps',
        headingHi: 'Steps',
        items: [
          { en: 'Choose "Attendance date" — today or past only, future date not allowed (max = today).', hi: '"Attendance date" choose karo — sirf today ya past, future date allowed nahi (max = today).' },
          { en: 'For each employee row, choose a status from the dropdown and click "Save" — one employee at a time.', hi: 'Har employee row ke liye dropdown se status choose karo aur "Save" click karo — ek baar mein ek employee.' },
        ],
      },
      {
        headingEn: 'Real Conditions',
        headingHi: 'Real Conditions',
        items: [
          { en: 'Future attendance (date > business date) is blocked outright.', hi: 'Future attendance (date > business date) seedha block hota hai.' },
          { en: 'If that employee already has an APPROVED leave on that date, attendance cannot be marked — error "Approved leave conflicts with attendance".', hi: 'Agar employee ki us date par already APPROVED leave hai, to attendance mark nahi ho sakta — error "Approved leave conflicts with attendance".' },
          { en: 'The UI shows such a row as read-only with an "Approved leave - read-only" label, and no mark-form appears.', hi: 'UI aisi row ko read-only dikhati hai "Approved leave - read-only" label ke saath, aur koi mark-form nahi aata.' },
          { en: 'Attendance cannot be marked or edited on a date inside a finalized payroll month (openInterval check) — error "Payroll month is finalized".', hi: 'Attendance ko finalized payroll month ke andar wali date par mark ya edit nahi kiya ja sakta (openInterval check) — error "Payroll month is finalized".' },
          { en: 'Marking the same employee+date again is an update (upsert), not a new row — it overwrites the previous status, as long as that date\'s payroll isn\'t finalized yet.', hi: 'Same employee+date ko dobara mark karna ek update (upsert) hai, nayi row nahi — pehla status overwrite ho jaata hai, jab tak us date ka payroll finalized nahi hua.' },
          { en: 'A missing date (no status given at all) is NEVER automatically assumed present or absent — it stays "missing" until explicitly marked.', hi: 'Missing date (koi status hi nahi diya gaya) kabhi automatically present ya absent nahi maana jaata — explicitly mark hone tak "missing" rehta hai.' },
        ],
      },
    ],
    example: {
      en: 'On 5 November 2026, a branch has 3 employees. Ravi already has an approved paid leave for 5 Nov — his row shows "Approved leave - read-only - Paid", no mark-form appears. Suresh is marked PRESENT. Amit is still unmarked — payroll preview will show his 5 Nov date as "missing" until a status is given.',
      hi: '5 November 2026 ko, ek branch mein 3 employees hain. Ravi ki 5 Nov ko already approved paid leave hai — uski row mein "Approved leave - read-only - Paid" dikhta hai, koi mark-form nahi aata. Suresh PRESENT mark hota hai. Amit abhi tak unmarked hai — status diye jaane tak payroll preview mein uski 5 Nov date "missing" dikhegi.',
    },
  },
  {
    id: 'leave-apply-review',
    titleEn: 'Leave — Apply & Review',
    titleHi: 'Leave — Apply & Review',
    icon: 'calendar-x',
    summaryEn: 'An employee (or their manager) submits a leave request, and a different authorized reviewer approves or rejects it, deciding paid or unpaid.',
    summaryHi: 'Employee (ya unka manager) leave request submit karta hai, aur ek alag authorized reviewer use approve ya reject karta hai, paid ya unpaid decide karte hue.',
    sections: [
      {
        headingEn: 'Apply Steps',
        headingHi: 'Apply Karne Ke Steps',
        items: [
          { en: '"Employee" dropdown shows all branch employees if the actor has LEAVE_APPROVAL or PAYROLL (canSubmitOthers); otherwise only the employee linked to their own login shows.', hi: 'Agar actor ke paas LEAVE_APPROVAL ya PAYROLL hai (canSubmitOthers), to "Employee" dropdown mein saare branch employees dikhte hain; warna sirf unke apne login se linked employee dikhta hai.' },
          { en: 'Choose "Start date" and "End date" (inclusive).', hi: '"Start date" aur "End date" (inclusive) choose karo.' },
          { en: 'Write "Reason" — required, max 1000 characters.', hi: '"Reason" likho — required hai, max 1000 characters.' },
          { en: 'Click "Submit leave request" — this saves it as PENDING.', hi: '"Submit leave request" click karo — yeh PENDING status mein save hota hai.' },
        ],
      },
      {
        headingEn: 'Apply Conditions',
        headingHi: 'Apply Conditions',
        items: [
          { en: 'The date range must be within the employee\'s joining-to-exit window.', hi: 'Date range employee ki joining-to-exit window ke andar hona chahiye.' },
          { en: 'If any overlapping leave (not REJECTED) already exists in that range, it is blocked — error "Overlapping leave".', hi: 'Agar us range mein koi overlapping leave (REJECTED nahi) already exist karti hai, to block ho jaata hai — error "Overlapping leave".' },
          { en: 'If any attendance is already marked in that range, it is blocked — error "Attendance already marked" (attendance must be unmarked first, then leave applied).', hi: 'Agar us range mein attendance already marked hai, to block ho jaata hai — error "Attendance already marked" (pehle attendance unmark karo, phir leave apply karo).' },
          { en: 'Without manage-permission, an employee can only pick their own linked employee — cannot apply leave for someone else.', hi: 'Manage-permission ke bina, employee sirf apna hi linked employee pick kar sakta hai — kisi aur ke liye leave apply nahi kar sakta.' },
        ],
      },
      {
        headingEn: 'Review Steps (LEAVE_APPROVAL)',
        headingHi: 'Review Karne Ke Steps (LEAVE_APPROVAL)',
        items: [
          { en: 'Click "Review request" on a PENDING request.', hi: 'PENDING request par "Review request" click karo.' },
          { en: 'Choose "Decision": Approve or Reject.', hi: '"Decision" choose karo: Approve ya Reject.' },
          { en: 'If Approved, must explicitly choose "Leave pay treatment": Paid (only if allowed) or Unpaid — there is no default, it must be explicitly chosen.', hi: 'Agar Approved hai, to explicitly "Leave pay treatment" choose karna hi hoga: Paid (sirf agar allowed ho) ya Unpaid — koi default nahi hai, explicitly choose karna padega.' },
          { en: 'Optional "Review note" can be added.', hi: 'Optional "Review note" add kar sakte ho.' },
          { en: 'Click "Confirm decision" to finalize.', hi: 'Finalize karne ke liye "Confirm decision" click karo.' },
        ],
      },
      {
        headingEn: 'Self-Approval Block (assertReviewActor)',
        headingHi: 'Self-Approval Block (assertReviewActor)',
        items: [
          { en: 'The review is rejected with 403 "Cannot review own leave request" if the reviewer is the same employee whose leave this is (employeeUserId === actor.id).', hi: 'Review 403 "Cannot review own leave request" ke saath reject hota hai agar reviewer wahi employee hai jiski leave hai (employeeUserId === actor.id).' },
          { en: 'It is also rejected if the reviewer is the same person who originally submitted the request (requestedById === actor.id).', hi: 'Yeh bhi reject hota hai agar reviewer wahi person hai jisne originally request submit ki thi (requestedById === actor.id).' },
          { en: 'This applies to the Owner too — if the Owner applied for their own leave (or is themselves the linked employee), the Owner cannot approve/reject their own request; some other authorized reviewer must do it.', hi: 'Yeh Owner par bhi apply hota hai — agar Owner ne apni hi leave apply ki (ya khud hi linked employee hain), to Owner apni hi request approve/reject nahi kar sakte; kisi aur authorized reviewer ko karna padega.' },
          { en: 'The UI shows "Cannot review own leave" and the "Review request" button doesn\'t even appear in these cases.', hi: 'In cases mein UI "Cannot review own leave" dikhati hai aur "Review request" button hi nahi aata.' },
        ],
      },
      {
        headingEn: 'Paid Leave Eligibility Rule (leaveReviewMetadata)',
        headingHi: 'Paid Leave Eligibility Rule (leaveReviewMetadata)',
        items: [
          { en: 'The "Paid" option only shows/is allowed when the employee was ON_ROLL for the ENTIRE start-to-end date range of the leave (no OFF_ROLL rate-segment overlapping anywhere in between).', hi: '"Paid" option sirf tab dikhta hai/allowed hota hai jab employee leave ki ENTIRE start-to-end date range ke liye ON_ROLL tha (beech mein koi OFF_ROLL rate-segment overlap na ho).' },
          { en: 'If any overlapping compensation segment is OFF_ROLL, the Paid option is removed — OFF_ROLL leave can only ever be Unpaid; the server also re-enforces this with "Off-roll leave must be unpaid".', hi: 'Agar koi overlapping compensation segment OFF_ROLL hai, to Paid option hata diya jaata hai — OFF_ROLL leave hamesha sirf Unpaid ho sakti hai; server bhi isko "Off-roll leave must be unpaid" se enforce karta hai.' },
          { en: 'Before approving, the system also checks that no attendance is already marked in that date range — error "Attendance conflicts with approval" — otherwise it would conflict in payroll calculation.', hi: 'Approve karne se pehle, system yeh bhi check karta hai ki us date range mein koi attendance already marked na ho — error "Attendance conflicts with approval" — warna payroll calculation mein conflict hoga.' },
        ],
      },
    ],
    example: {
      en: 'Priya (ON_ROLL cook) applies for 3 days leave 10-12 Nov 2026 through her manager Raj (who has LEAVE_APPROVAL) — Raj submits it for her. At review time, Raj CANNOT review it himself (because requestedById === Raj.id); some other LEAVE_APPROVAL holder (like Owner) must review. Owner selects "Approved" + "Paid" (because Priya was fully ON_ROLL for all of 10-12 Nov) — now these 3 days become paid-leave-days in payroll.',
      hi: 'Priya (ON_ROLL cook) apne manager Raj (jiske paas LEAVE_APPROVAL hai) ke through 10-12 Nov 2026 ke 3 din ki leave apply karti hai — Raj uske liye submit karta hai. Review time par, Raj khud review NAHI kar sakta (kyunki requestedById === Raj.id); koi aur LEAVE_APPROVAL wala (jaise Owner) review karega. Owner "Approved" + "Paid" select karta hai (kyunki Priya 10-12 Nov ke poore time fully ON_ROLL thi) — ab yeh 3 din payroll mein paid-leave-days ban jaate hain.',
    },
  },
  {
    id: 'payroll-preview-finalize',
    titleEn: 'Payroll — Preview & Finalize',
    titleHi: 'Payroll — Preview & Finalize',
    icon: 'banknote',
    summaryEn: 'Each month\'s salary/wage is calculated first as an editable DRAFT, then locked forever once FINALized.',
    summaryHi: 'Har mahine ki salary/wage pehle editable DRAFT ke roop mein calculate hoti hai, phir FINAL hone par forever lock ho jaati hai.',
    sections: [
      {
        headingEn: 'Calculation Formula (calculatePayroll)',
        headingHi: 'Calculation Formula (calculatePayroll)',
        items: [
          { en: 'Each day earns "half-units": PRESENT = 2 units (1 full day), HALF_DAY = 1 unit (0.5 day), paid-leave-on-ON_ROLL = 2 units, ABSENT/unpaid-leave = 0 units.', hi: 'Har din "half-units" earn karta hai: PRESENT = 2 units (1 full day), HALF_DAY = 1 unit (0.5 day), paid-leave-on-ON_ROLL = 2 units, ABSENT/unpaid-leave = 0 units.' },
          { en: 'A day before the employee\'s joining, after exit, or a future date is simply skipped — not counted at all.', hi: 'Employee ki joining se pehle, exit ke baad, ya future date wala din simply skip ho jaata hai — count hi nahi hota.' },
          { en: 'ON_ROLL formula: amount = monthly_rate x (total_units / 2) / calendarDaysInMonth — i.e. "monthly salary / month\'s actual calendar days x payable days".', hi: 'ON_ROLL formula: amount = monthly_rate x (total_units / 2) / calendarDaysInMonth — matlab "monthly salary / month ke actual calendar days x payable days".' },
          { en: 'OFF_ROLL formula: amount = daily_wage x (total_units / 2) — i.e. "daily wage x worked units" (calendar-days factor cancels out of this formula).', hi: 'OFF_ROLL formula: amount = daily_wage x (total_units / 2) — matlab "daily wage x worked units" (calendar-days factor is formula mein cancel ho jaata hai).' },
          { en: 'If a rate change (compensation history) happened mid-month, each segment calculates at its own effective rate and sums into the total — a rateSegments array shows the breakdown.', hi: 'Agar mid-month rate change (compensation history) hua ho, to har segment apne hi effective rate par calculate hota hai aur total mein sum hota hai — rateSegments array breakdown dikhata hai.' },
          { en: 'Rounding happens at paisa-level precision (bigint paise), with a final round-half-up to 2 decimals.', hi: 'Rounding paisa-level precision (bigint paise) par hoti hai, aur final round-half-up 2 decimals tak hota hai.' },
        ],
      },
      {
        headingEn: 'Missing Dates & Finalize Button',
        headingHi: 'Missing Dates & Finalize Button',
        items: [
          { en: 'If any employee-date combo was never marked at all (no attendance, no approved leave), it appears in that row\'s missingDates list.', hi: 'Agar koi employee-date combo bilkul mark nahi hua (no attendance, no approved leave), to wo us row ki missingDates list mein aata hai.' },
          { en: 'The Finalize button stays disabled until every employee\'s every date is complete — missing list empty for all.', hi: 'Finalize button disabled rehta hai jab tak har employee ki har date complete na ho — sabke liye missing list empty ho.' },
        ],
      },
      {
        headingEn: 'Finalize Conditions (canFinalize) — ALL Must Be True',
        headingHi: 'Finalize Conditions (canFinalize) — Saare True Hone Chahiye',
        items: [
          { en: '1. Data has loaded — no error, not loading.', hi: '1. Data load ho gaya ho — no error, not loading.' },
          { en: '2. At least one employee row exists.', hi: '2. Kam se kam ek employee row exist karti ho.' },
          { en: '3. Every row\'s missingDates is empty — all dates complete.', hi: '3. Har row ki missingDates empty ho — saari dates complete.' },
          { en: '4. The month is past — the current or future month can never be finalized (compared against the business date).', hi: '4. Month past ho — current ya future month kabhi finalize nahi ho sakta (business date ke against compare hota hai).' },
          { en: '5. Not already finalized — cannot finalize twice.', hi: '5. Already finalized na ho — do baar finalize nahi kar sakte.' },
          { en: 'Even after the button becomes enabled, the UI has a confirmation checkbox ("I checked this branch, month and all amounts...") that must be manually ticked.', hi: 'Button enable hone ke baad bhi, UI mein ek confirmation checkbox hai ("I checked this branch, month and all amounts...") jo manually tick karni padti hai.' },
        ],
      },
      {
        headingEn: 'Immutability After Finalize',
        headingHi: 'Finalize Ke Baad Immutability',
        items: [
          { en: 'Once FINAL, a permanent snapshot saves in the payrollRuns and payrollSnapshots tables (status: "FINAL").', hi: 'Ek baar FINAL hone par, permanent snapshot payrollRuns aur payrollSnapshots tables mein save hota hai (status: "FINAL").' },
          { en: 'Calling payroll again for the same branch+month just returns the already-saved snapshot — it never recalculates.', hi: 'Same branch+month ke liye payroll dobara call karne par wo already-saved snapshot hi return hota hai — kabhi recalculate nahi hota.' },
          { en: 'Any attendance, leave, or employee rate change touching that closed period is rejected server-side (openInterval check everywhere).', hi: 'Us closed period ko touch karne wala koi bhi attendance, leave, ya employee rate change server-side reject ho jaata hai (openInterval check hamesha).' },
          { en: 'No bank transfer or actual payment happens — this is purely an accounting record/expense snapshot; the UI explicitly states "No money was transferred."', hi: 'Koi bank transfer ya actual payment nahi hoti — yeh sirf ek accounting record/expense snapshot hai; UI explicitly kehti hai "No money was transferred."' },
        ],
      },
      {
        headingEn: 'Double-Entry on Finalize',
        headingHi: 'Finalize Par Double-Entry',
        items: [
          { en: 'A journal entry posts immediately: Debit Salary Expense, Credit Accounts Payable, for the full total.', hi: 'Ek journal entry immediately post hoti hai: Debit Salary Expense, Credit Accounts Payable, full total ke liye.' },
          { en: 'This means payroll becomes a liability (not yet paid), recorded as an expense.', hi: 'Matlab payroll ek liability ban jaata hai (abhi pay nahi hua), expense ke roop mein record hota hai.' },
        ],
      },
    ],
    example: {
      en: 'ON_ROLL example: November 2026, calendar days=30. Ramesh (ON_ROLL, monthly rate TSh500,000): 20 days PRESENT, 4 HALF_DAY, 2 PAID-approved-leave, 2 UNPAID-leave, 2 ABSENT = 30 days, all marked. Units: 40+4+4+0+0=48, payable days=24, amount = 500,000 x 24/30 = TSh400,000. OFF_ROLL example: same month, Fatima (OFF_ROLL, daily wage TSh15,000): 22 PRESENT, 3 HALF_DAY, 5 ABSENT = 30 days. Units=44+3=47, payable days=23.5, amount = 15,000x23.5 = TSh352,500. On Finalize, branch November total = 400,000 + 352,500 + other employees, posted as a single journal entry.',
      hi: 'ON_ROLL example: November 2026, calendar days=30. Ramesh (ON_ROLL, monthly rate TSh500,000): 20 din PRESENT, 4 HALF_DAY, 2 PAID-approved-leave, 2 UNPAID-leave, 2 ABSENT = 30 din, sab marked. Units: 40+4+4+0+0=48, payable days=24, amount = 500,000 x 24/30 = TSh400,000. OFF_ROLL example: same month, Fatima (OFF_ROLL, daily wage TSh15,000): 22 PRESENT, 3 HALF_DAY, 5 ABSENT = 30 din. Units=44+3=47, payable days=23.5, amount = 15,000x23.5 = TSh352,500. Finalize par, branch ka November total = 400,000 + 352,500 + aur employees, ek single journal entry ke roop mein post hota hai.',
    },
  },
  {
    id: 'post-expense',
    titleEn: 'Post Expense',
    titleHi: 'Expense Post Karna',
    icon: 'receipt',
    summaryEn: 'Record a branch\'s specific expense by category and date, with idempotency protection and a void-only correction flow.',
    summaryHi: 'Branch ka specific expense category aur date ke saath record karo, idempotency protection ke saath aur sirf void se correction hota hai.',
    sections: [
      {
        headingEn: 'Steps (ACCOUNTS_EXPENSES)',
        headingHi: 'Steps (ACCOUNTS_EXPENSES)',
        items: [
          { en: 'Choose "Date" — must be within that month, bound to the month\'s 1st and last day (min/max).', hi: '"Date" choose karo — us month ke andar hona chahiye, month ke 1st aur last day se bound (min/max).' },
          { en: 'Choose "Category": RENT / UTILITIES / MARKETING / OTHER.', hi: '"Category" choose karo: RENT / UTILITIES / MARKETING / OTHER.' },
          { en: '"Subcategory" is optional free text, max 80 characters.', hi: '"Subcategory" optional free text hai, max 80 characters.' },
          { en: '"Amount" must be between 0.01 and 999,999,999.99, with 2 decimals.', hi: '"Amount" 0.01 se 999,999,999.99 ke beech hona chahiye, 2 decimals ke saath.' },
          { en: '"Description" is required, min 3 characters, and must contain at least one letter or number — symbols alone are not allowed.', hi: '"Description" required hai, min 3 characters, aur kam se kam ek letter ya number hona chahiye — sirf symbols allowed nahi.' },
          { en: '"Reference" is required, min 2 characters — like an invoice number.', hi: '"Reference" required hai, min 2 characters — jaise invoice number.' },
          { en: '"Payment method" can be blank/"Not specified", "Cash from today\'s shift drawer" (CASH), or "Bank/Card/Other" (NON_CASH).', hi: '"Payment method" blank/"Not specified", "Cash from today\'s shift drawer" (CASH), ya "Bank/Card/Other" (NON_CASH) ho sakta hai.' },
          { en: 'Click "Save expense" to post.', hi: 'Post karne ke liye "Save expense" click karo.' },
        ],
      },
      {
        headingEn: 'CASH Payment-Method Special Rule',
        headingHi: 'CASH Payment-Method Ka Special Rule',
        items: [
          { en: 'If CASH is chosen, this amount reduces the branch\'s CURRENT open shift\'s expected-cash-at-close.', hi: 'Agar CASH choose kiya ho, to yeh amount branch ke CURRENT open shift ke expected-cash-at-close ko kam karta hai.' },
          { en: 'This needs an active shift to use — the shiftRunId is resolved server-side; the client never sends it directly.', hi: 'Iske liye active shift zaroori hai — shiftRunId server-side resolve hota hai; client isko kabhi directly nahi bhejta.' },
        ],
      },
      {
        headingEn: 'Idempotency / "Unresolved Outcome" Safety',
        headingHi: 'Idempotency / "Unresolved Outcome" Safety',
        items: [
          { en: 'When "Save expense" is clicked, the browser generates a unique idempotencyKey and saves it to session-storage FIRST (attempt journal), before sending the request.', hi: '"Save expense" click karte hi, browser ek unique idempotencyKey generate karta hai aur request bhejne se PEHLE isko session-storage mein save karta hai (attempt journal).' },
          { en: 'If the request fails or connection drops (outcome unknown), the UI shows "Outcome unresolved" and the form goes read-only.', hi: 'Agar request fail ho jaaye ya connection drop ho jaaye (outcome unknown), to UI "Outcome unresolved" dikhati hai aur form read-only ho jaata hai.' },
          { en: 'The exact same entry can be retried (with the same idempotencyKey), never a new entry, until the old one resolves.', hi: 'Wahi exact entry retry ki ja sakti hai (same idempotencyKey ke saath), kabhi nayi entry nahi, jab tak purani resolve na ho jaaye.' },
          { en: 'Server-side requestFingerprint (SHA-256 hash of all fields) with the same idempotencyKey — if fields match it\'s a safe no-op, if fields mismatch it\'s rejected ("Idempotency key already used with a different payload").', hi: 'Server-side requestFingerprint (saare fields ka SHA-256 hash) same idempotencyKey ke saath check hota hai — fields match karein to safe no-op, mismatch karein to reject ho jaata hai ("Idempotency key already used with a different payload").' },
          { en: 'This ensures a network retry never creates a duplicate expense, and a crash/refresh can confidently retry.', hi: 'Isse network retry se kabhi duplicate expense nahi banta, aur crash/refresh ke baad confidently retry kiya ja sakta hai.' },
        ],
      },
      {
        headingEn: 'Void (Not Edit)',
        headingHi: 'Void (Edit Nahi)',
        items: [
          { en: 'A posted expense is never edited — a wrong entry must be "Void"ed instead.', hi: 'Posted expense kabhi edit nahi hota — galat entry ko "Void" karna padta hai.' },
          { en: 'Click "Void" on the expense row, write a reason (required, min 3 characters), then click "Confirm void".', hi: 'Expense row par "Void" click karo, reason likho (required, min 3 characters), phir "Confirm void" click karo.' },
          { en: 'Void only works on POSTED status expenses — cannot void twice ("Expense already voided").', hi: 'Void sirf POSTED status wali expenses par kaam karta hai — do baar void nahi ho sakta ("Expense already voided").' },
          { en: 'The original record is never deleted or edited — status becomes VOID with voidReason saved, and the full audit trail remains.', hi: 'Original record kabhi delete ya edit nahi hota — status VOID ho jaata hai voidReason save hone ke saath, aur full audit trail rehta hai.' },
        ],
      },
      {
        headingEn: 'Double-Entry on Post/Void',
        headingHi: 'Post/Void Par Double-Entry',
        items: [
          { en: 'Post: Debit [Category Expense Account], Credit Accounts Payable — meaning this is an "expense recognize", not a cash disbursement (cash-outflow has a separate Petty Cash path).', hi: 'Post: Debit [Category Expense Account], Credit Accounts Payable — matlab yeh "expense recognize" hai, cash disbursement nahi (cash-outflow ke liye alag Petty Cash path hai).' },
          { en: 'Void: an exact reversal (debit/credit swapped) with a separate EXPENSE_VOID reference type — the original journal row is never touched.', hi: 'Void: exact reversal (debit/credit swap) hota hai, alag EXPENSE_VOID reference type ke saath — original journal row kabhi touch nahi hota.' },
        ],
      },
    ],
    example: {
      en: '15 Nov 2026, branch "Masaki" posted Rent expense TSh2,000,000, reference "NOV-RENT-INV-004", payment method NON_CASH. Journal: Debit "Rent Expense (5100)" TSh2,000,000, Credit "Accounts Payable (2000)" TSh2,000,000. If this was accidentally double-posted, the duplicate entry gets Voided with reason "Duplicate entry, same invoice" — journal gets a reversal entry, but the original record still shows as "VOID - Duplicate entry, same invoice".',
      hi: '15 Nov 2026, branch "Masaki" ne Rent expense TSh2,000,000 post kiya, reference "NOV-RENT-INV-004", payment method NON_CASH. Journal: Debit "Rent Expense (5100)" TSh2,000,000, Credit "Accounts Payable (2000)" TSh2,000,000. Agar yeh accidentally double-post ho jaaye, to duplicate entry ko reason "Duplicate entry, same invoice" ke saath Void kiya jaata hai — journal mein reversal entry aati hai, par original record abhi bhi "VOID - Duplicate entry, same invoice" dikhata hai.',
    },
  },
  {
    id: 'profit-loss',
    titleEn: 'Profit & Loss',
    titleHi: 'Profit & Loss',
    icon: 'trending-up',
    summaryEn: 'An operating-costs view (not a full P&L) showing expenses, finalized labor, revenue, and a pre-COGS net profit.',
    summaryHi: 'Yeh operating-costs ka view hai (full P&L nahi), jisme expenses, finalized labor, revenue, aur pre-COGS net profit dikhta hai.',
    sections: [
      {
        headingEn: 'Structure (ACCOUNTS_EXPENSES or PAYROLL)',
        headingHi: 'Structure (ACCOUNTS_EXPENSES ya PAYROLL)',
        items: [
          { en: 'This is an "operating costs" view — not a full P&L, because COGS/Gross Profit are normally unavailable until every order\'s cost is fully tracked.', hi: 'Yeh "operating costs" view hai — full P&L nahi, kyunki COGS/Gross Profit normally unavailable rehta hai jab tak har order ki cost fully track na ho.' },
          { en: 'Expenses by category (RENT/UTILITIES/MARKETING/OTHER) — only POSTED expenses are summed, VOID is excluded.', hi: 'Category-wise expenses (RENT/UTILITIES/MARKETING/OTHER) — sirf POSTED expenses sum hoti hain, VOID exclude hoti hain.' },
          { en: 'Labor — only finalized (FINAL) payroll snapshots are summed; DRAFT payroll is never included.', hi: 'Labor — sirf finalized (FINAL) payroll snapshots sum hoti hain; DRAFT payroll kabhi include nahi hota.' },
          { en: 'Total Operating Expenses = sum of Expenses by category + Labor.', hi: 'Total Operating Expenses = Expenses by category + Labor ka sum.' },
          { en: 'Revenue — real completed POS sales summed (same Owner-only privacy filter as the POS order list).', hi: 'Revenue — real completed POS sales ka sum (same Owner-only privacy filter jo POS order list mein hoti hai).' },
          { en: 'COGS/Gross Profit stays "Unavailable" until every completed order in the period has its cost fully priced — if any raw material\'s vendor rate was never locked, COGS is withheld, never estimated or guessed.', hi: 'COGS/Gross Profit "Unavailable" rehta hai jab tak period ke har completed order ki cost fully priced na ho — agar kisi raw material ka vendor rate kabhi lock nahi hua, to COGS withheld rehta hai, kabhi estimate ya guess nahi hota.' },
          { en: 'Net Profit = Revenue minus Total Operating Expenses (or Revenue minus COGS minus Operating Expenses once COGS is available).', hi: 'Net Profit = Revenue minus Total Operating Expenses (ya Revenue minus COGS minus Operating Expenses jab COGS available ho jaaye).' },
        ],
      },
    ],
    example: {
      en: 'November 2026, branch Revenue = TSh50,000,000. Expenses: Rent 2,000,000 + Utilities 800,000 + Marketing 500,000 + Other 300,000 = 3,600,000. Labor (finalized payroll) = 12,000,000. Total Operating Expenses = 15,600,000. If COGS is unavailable, Net Profit = 50,000,000 - 15,600,000 = TSh34,400,000 (pre-COGS figure, label makes clear it\'s "before COGS").',
      hi: 'November 2026, branch ka Revenue = TSh50,000,000. Expenses: Rent 2,000,000 + Utilities 800,000 + Marketing 500,000 + Other 300,000 = 3,600,000. Labor (finalized payroll) = 12,000,000. Total Operating Expenses = 15,600,000. Agar COGS unavailable hai, Net Profit = 50,000,000 - 15,600,000 = TSh34,400,000 (pre-COGS figure, label clearly batata hai yeh "before COGS" hai).',
    },
  },
  {
    id: 'vat-summary',
    titleEn: 'VAT Summary',
    titleHi: 'VAT Summary',
    icon: 'file-text',
    summaryEn: 'A simple rate-wise VAT breakdown across all eligible completed orders, exportable as CSV.',
    summaryHi: 'Saare eligible completed orders ka ek simple rate-wise VAT breakdown, CSV mein export ho sakta hai.',
    sections: [
      {
        headingEn: 'Overview (OFFICIAL_SALES_REPORTS)',
        headingHi: 'Overview (OFFICIAL_SALES_REPORTS)',
        items: [
          { en: 'This is an unfiltered rate-wise VAT breakdown across all eligible completed orders, including Owner-only orders.', hi: 'Yeh saare eligible completed orders ka unfiltered rate-wise VAT breakdown hai, Owner-only orders bhi included.' },
          { en: 'Tanzania doesn\'t have a GSTR-1/HSN-style format — this is a simple table: Product Code -> Rate% -> Qty -> Taxable Value -> VAT -> Total Value.', hi: 'Tanzania mein GSTR-1/HSN-style format nahi hai — yeh ek simple table hai: Product Code -> Rate% -> Qty -> Taxable Value -> VAT -> Total Value.' },
          { en: 'Steps: choose From/To date, then click "Generate".', hi: 'Steps: From/To date choose karo, phir "Generate" click karo.' },
          { en: 'CSV export is available.', hi: 'CSV export available hai.' },
          { en: 'A grand totals row appears at the bottom.', hi: 'Niche ek grand totals row aati hai.' },
        ],
      },
    ],
    example: {
      en: 'Choosing a From/To date range and clicking Generate produces a rate-wise VAT table ending in a grand totals row, which can also be exported as CSV.',
      hi: 'From/To date range choose karke Generate click karne se ek rate-wise VAT table banta hai jo grand totals row par khatam hota hai, jisko CSV mein bhi export kiya ja sakta hai.',
    },
  },
  {
    id: 'petty-cash-book',
    titleEn: 'Petty Cash Book',
    titleHi: 'Petty Cash Book',
    icon: 'wallet',
    summaryEn: 'A branch\'s small daily cash fund — top-ups and small expenses logged with a running balance that can never go negative.',
    summaryHi: 'Branch ka chota daily cash fund — top-ups aur small expenses log hote hain, running balance ke saath, jo kabhi negative nahi ja sakta.',
    sections: [
      {
        headingEn: 'Steps (PETTY_CASH)',
        headingHi: 'Steps (PETTY_CASH)',
        items: [
          { en: 'Choose "Month".', hi: '"Month" choose karo.' },
          { en: 'Choose "Type": OUT (expense) or IN (top-up/refund).', hi: '"Type" choose karo: OUT (expense) ya IN (top-up/refund).' },
          { en: 'Fill "Amount" and "Description".', hi: '"Amount" aur "Description" fill karo.' },
          { en: 'Click "Log entry" to save.', hi: 'Save karne ke liye "Log entry" click karo.' },
        ],
      },
      {
        headingEn: 'Balance Rule',
        headingHi: 'Balance Rule',
        items: [
          { en: 'Balance is ALWAYS recalculated from ALL rows (sum of IN minus sum of OUT) — never depends on the "last row\'s balance", so row-order can never corrupt the balance.', hi: 'Balance HAMESHA saari rows se recalculate hota hai (IN ka sum minus OUT ka sum) — "last row ke balance" par depend nahi karta, isliye row-order kabhi balance ko corrupt nahi kar sakta.' },
          { en: 'Negative balance is never allowed — if an OUT entry would make the balance negative, the whole entry is rejected.', hi: 'Negative balance kabhi allowed nahi — agar koi OUT entry balance ko negative kar degi, to puri entry reject ho jaati hai.' },
        ],
      },
      {
        headingEn: 'Double-Entry',
        headingHi: 'Double-Entry',
        items: [
          { en: 'IN -> Debit Cash (1000), Credit Owner\'s Equity (3000).', hi: 'IN -> Debit Cash (1000), Credit Owner\'s Equity (3000).' },
          { en: 'OUT -> Debit Other Expense (5400), Credit Cash (1000).', hi: 'OUT -> Debit Other Expense (5400), Credit Cash (1000).' },
          { en: 'Petty cash has no category field, so every OUT goes into "Other Expense" — RENT/UTILITIES-style category mapping doesn\'t apply here.', hi: 'Petty cash mein category field nahi hoti, isliye har OUT "Other Expense" mein jaata hai — RENT/UTILITIES jaisi category mapping yahan apply nahi hoti.' },
        ],
      },
    ],
    example: {
      en: 'Branch current balance is TSh50,000. OUT entry "Cleaning supplies" TSh12,000 logged -> new balance = 38,000. If an OUT entry of TSh60,000 is attempted (more than balance), it\'s rejected ("Petty cash balance cannot go negative").',
      hi: 'Branch ka current balance TSh50,000 hai. OUT entry "Cleaning supplies" TSh12,000 log hoti hai -> new balance = 38,000. Agar TSh60,000 ki OUT entry try ki jaaye (balance se zyada), to reject ho jaati hai ("Petty cash balance cannot go negative").',
    },
  },
  {
    id: 'aggregator-recon',
    titleEn: 'Aggregator (Swiggy/Zomato) Recon',
    titleHi: 'Aggregator (Swiggy/Zomato) Recon',
    icon: 'truck',
    summaryEn: 'Manually log a delivery aggregator\'s settlement so the actual net bank payout is computed automatically, never client-trusted.',
    summaryHi: 'Delivery aggregator ka settlement manually log karo taaki actual net bank payout automatically compute ho, kabhi client-trusted nahi.',
    sections: [
      {
        headingEn: 'Steps (AGGREGATOR_RECON)',
        headingHi: 'Steps (AGGREGATOR_RECON)',
        items: [
          { en: 'Choose "Month" and "Order date".', hi: '"Month" aur "Order date" choose karo.' },
          { en: 'Choose "Channel": SWIGGY or ZOMATO.', hi: '"Channel" choose karo: SWIGGY ya ZOMATO.' },
          { en: 'Fill "Order value" (required, positive); "Commission", "Ads", and "Refund/penalty" are all optional, defaulting to 0.00.', hi: '"Order value" fill karo (required, positive); "Commission", "Ads", aur "Refund/penalty" sab optional hain, default 0.00.' },
          { en: 'Click "Log settlement" to save.', hi: 'Save karne ke liye "Log settlement" click karo.' },
        ],
      },
      {
        headingEn: 'Net Payout Formula (Server-Computed)',
        headingHi: 'Net Payout Formula (Server-Computed)',
        items: [
          { en: 'Net Payout = Order Value - Commission - Ads - Refund/Penalty, computed server-side, never client-trusted.', hi: 'Net Payout = Order Value - Commission - Ads - Refund/Penalty, server-side compute hota hai, kabhi client-trusted nahi.' },
          { en: 'The client cannot even send a "netPayout" field — it\'s not in the allowed-fields list; the server always calculates it fresh.', hi: 'Client "netPayout" field bhej hi nahi sakta — yeh allowed-fields list mein hi nahi hai; server hamesha fresh calculate karta hai.' },
        ],
      },
      {
        headingEn: 'Double-Entry (2 Legs)',
        headingHi: 'Double-Entry (2 Legs)',
        items: [
          { en: 'Leg 0: Debit Bank (1020) [net payout], Credit Sales Revenue (4000) [net payout amount].', hi: 'Leg 0: Debit Bank (1020) [net payout], Credit Sales Revenue (4000) [net payout amount].' },
          { en: 'Leg 1: Debit Other Expense (5400) [commission+ads+refund total], Credit Sales Revenue (4000) [same total].', hi: 'Leg 1: Debit Other Expense (5400) [commission+ads+refund total], Credit Sales Revenue (4000) [same total].' },
          { en: 'Combined, Debit Bank + Debit Other Expense = Credit Sales Revenue = Order Value — the full gross order value goes into revenue, fees become a separate expense, while bank only receives the net.', hi: 'Combined, Debit Bank + Debit Other Expense = Credit Sales Revenue = Order Value — full gross order value revenue mein jaati hai, fees alag expense ban jaata hai, bank ko sirf net milta hai.' },
        ],
      },
    ],
    example: {
      en: 'SWIGGY order value TSh100,000, Commission TSh18,000, Ads TSh5,000, Refund-penalty TSh2,000. Net Payout = 100,000-18,000-5,000-2,000 = TSh75,000. Journal: Leg0 - Debit Bank 75,000/Credit Sales Revenue 75,000. Leg1 - Debit Other Expense 25,000 (18,000+5,000+2,000)/Credit Sales Revenue 25,000. Total Credit Sales Revenue = 100,000 = Order Value.',
      hi: 'SWIGGY order value TSh100,000, Commission TSh18,000, Ads TSh5,000, Refund-penalty TSh2,000. Net Payout = 100,000-18,000-5,000-2,000 = TSh75,000. Journal: Leg0 - Debit Bank 75,000/Credit Sales Revenue 75,000. Leg1 - Debit Other Expense 25,000 (18,000+5,000+2,000)/Credit Sales Revenue 25,000. Total Credit Sales Revenue = 100,000 = Order Value.',
    },
  },
  {
    id: 'balance-sheet',
    titleEn: 'Balance Sheet',
    titleHi: 'Balance Sheet',
    icon: 'scale',
    summaryEn: 'A real-time chart of accounts aggregated into Assets/Liabilities/Equity, never hardcoded, with a live balance check.',
    summaryHi: 'Chart of accounts real-time Assets/Liabilities/Equity mein aggregate hota hai, kabhi hardcode nahi, live balance check ke saath.',
    sections: [
      {
        headingEn: 'Setup & Structure',
        headingHi: 'Setup & Structure',
        items: [
          { en: 'The chart of accounts has 13 standard HQ-level accounts: Cash, Petty Cash (legacy/unused), Bank, Accounts Payable, VAT Payable, Owner\'s Equity, Sales Revenue, Purchases/COGS, and Rent/Utilities/Marketing/Other/Salary Expense — seeded by the Owner, viewable by Petty Cash/Aggregator grant.', hi: 'Chart of accounts mein 13 standard HQ-level accounts hain: Cash, Petty Cash (legacy/unused), Bank, Accounts Payable, VAT Payable, Owner\'s Equity, Sales Revenue, Purchases/COGS, aur Rent/Utilities/Marketing/Other/Salary Expense — Owner seed karta hai, Petty Cash/Aggregator grant wale dekh sakte hain.' },
          { en: 'All journal entries are aggregated into real-time Assets/Liabilities/Equity — never a hardcoded figure.', hi: 'Saare journal entries real-time Assets/Liabilities/Equity mein aggregate hote hain — kabhi hardcoded figure nahi.' },
          { en: 'First-time setup: if no ledger account exists yet, the UI shows "real zeros, not fabricated" and the Owner sees a "Seed standard chart of accounts" button.', hi: 'First-time setup: agar koi ledger account abhi exist nahi karta, to UI "real zeros, not fabricated" dikhati hai aur Owner ko "Seed standard chart of accounts" button dikhta hai.' },
          { en: 'Clicking that button inserts the 13 accounts once — it is idempotent, so re-seeding doesn\'t duplicate anything new.', hi: 'Us button ko click karne se 13 accounts ek baar insert hote hain — yeh idempotent hai, dobara seed karne se kuch duplicate nahi hota.' },
        ],
      },
      {
        headingEn: 'Calculation Logic',
        headingHi: 'Calculation Logic',
        items: [
          { en: 'Each account\'s net = (all debit entries) minus (all credit entries), raw.', hi: 'Har account ka net = (saari debit entries) minus (saari credit entries), raw.' },
          { en: 'ASSET/EXPENSE accounts have a normal Debit balance -> raw value displays as-is.', hi: 'ASSET/EXPENSE accounts ka normal Debit balance hota hai -> raw value as-is display hoti hai.' },
          { en: 'LIABILITY/EQUITY/INCOME accounts have a normal Credit balance -> the sign flips (negative raw) for display.', hi: 'LIABILITY/EQUITY/INCOME accounts ka normal Credit balance hota hai -> display ke liye sign flip hota hai (negative raw).' },
          { en: 'INCOME and EXPENSE totals together form a synthetic "Retained Earnings (Net Income)" Equity line = Total Income - Total Expense — this is a standard accounting closing step, freshly computed on every read, never persisted.', hi: 'INCOME aur EXPENSE totals mil kar ek synthetic "Retained Earnings (Net Income)" Equity line banate hain = Total Income - Total Expense — yeh standard accounting closing step hai, har read par fresh compute hota hai, kabhi persist nahi hota.' },
          { en: 'Balanced check: Assets must equal Liabilities + Equity — if it doesn\'t match, the UI shows red "NOT balanced" text to help catch bugs.', hi: 'Balanced check: Assets ko Liabilities + Equity ke equal hona chahiye — agar match nahi hota, to UI red "NOT balanced" text dikhati hai, taaki bugs pakde ja sakein.' },
        ],
      },
    ],
    example: {
      en: 'Branch in Nov did: Rent expense TSh2,000,000 posted (Dr Rent Expense/Cr A/P), Petty cash IN TSh500,000 (Dr Cash/Cr Owner\'s Equity), and 1 Aggregator order with net payout TSh75,000 + fees TSh25,000. Assets side: Cash +500,000, Bank +75,000 = 575,000. Liabilities: A/P +2,000,000. Equity: Owner\'s Equity +500,000, Retained Earnings (Net Income) = Income(100,000 Sales Revenue) - Expense(2,000,000 Rent + 25,000 Other) = 100,000-2,025,000 = -1,925,000. Equity total = 500,000+(-1,925,000) = -1,425,000. Check: Liabilities+Equity = 2,000,000+(-1,425,000) = 575,000 = Assets - Balanced.',
      hi: 'Branch ne Nov mein: Rent expense TSh2,000,000 post kiya (Dr Rent Expense/Cr A/P), Petty cash IN TSh500,000 (Dr Cash/Cr Owner\'s Equity), aur 1 Aggregator order net payout TSh75,000 + fees TSh25,000 ke saath. Assets side: Cash +500,000, Bank +75,000 = 575,000. Liabilities: A/P +2,000,000. Equity: Owner\'s Equity +500,000, Retained Earnings (Net Income) = Income(100,000 Sales Revenue) - Expense(2,000,000 Rent + 25,000 Other) = 100,000-2,025,000 = -1,925,000. Equity total = 500,000+(-1,925,000) = -1,425,000. Check: Liabilities+Equity = 2,000,000+(-1,425,000) = 575,000 = Assets - Balanced.',
    },
  },
  {
    id: 'vendor-refunds-tab',
    titleEn: 'Vendor Refunds / Claims-Settlement Tab',
    titleHi: 'Vendor Refunds / Claims-Settlement Tab',
    icon: 'rotate-ccw',
    summaryEn: 'A shared panel inside Accounts showing expected refund or credit claims from vendors that haven\'t been received yet.',
    summaryHi: 'Accounts ke andar ek shared panel jo vendors se expected refund ya credit claims dikhata hai jo abhi receive nahi hui.',
    sections: [
      {
        headingEn: 'Overview (VENDOR_REFUNDS)',
        headingHi: 'Overview (VENDOR_REFUNDS)',
        items: [
          { en: 'This tab is a shared VendorReturnsPanel component view inside Accounts.', hi: 'Yeh tab Accounts ke andar ek shared VendorReturnsPanel component view hai.' },
          { en: 'It shows "expected refund/credit claims" — money not yet received from vendors.', hi: 'Yeh "expected refund/credit claims" dikhata hai — vendors se abhi tak na mila paisa.' },
          { en: 'It is gated behind the VENDOR_REFUNDS permission.', hi: 'Yeh VENDOR_REFUNDS permission ke peeche gated hai.' },
        ],
      },
    ],
    example: {
      en: 'Any staff member holding the VENDOR_REFUNDS permission can open this tab to see all vendor refund/credit claims still awaiting receipt.',
      hi: 'VENDOR_REFUNDS permission rakhne wala koi bhi staff member yeh tab khol kar saare vendor refund/credit claims dekh sakta hai jo abhi receive hone wale hain.',
    },
  },
  {
    id: 'permissions',
    titleEn: 'Permission Cross-Reference',
    titleHi: 'Permission Cross-Reference',
    icon: 'key',
    summaryEn: 'Quick reference showing exactly which permission grant unlocks which Workforce or Accounts tab.',
    summaryHi: 'Quick reference jo batata hai kaunsi permission grant kaunsa Workforce ya Accounts tab unlock karti hai.',
    sections: [
      {
        headingEn: 'Permission -> Tab/Capability',
        headingHi: 'Permission -> Tab/Capability',
        items: [
          { en: 'PAYROLL -> unlocks Workforce Employees + Payroll tabs, Accounts P&L (labor line), submit leave for others, and review context.', hi: 'PAYROLL -> Workforce Employees + Payroll tabs, Accounts P&L (labor line), doosron ke liye leave submit karna, aur review context unlock karta hai.' },
          { en: 'ATTENDANCE -> unlocks the Workforce Daily attendance tab.', hi: 'ATTENDANCE -> Workforce Daily attendance tab unlock karta hai.' },
          { en: 'LEAVE_SELF -> unlocks applying for one\'s own leave in Workforce.', hi: 'LEAVE_SELF -> Workforce mein apni khud ki leave apply karna unlock karta hai.' },
          { en: 'LEAVE_APPROVAL -> unlocks applying for and reviewing others\' leave in Workforce.', hi: 'LEAVE_APPROVAL -> Workforce mein doosron ki leave apply karna aur review karna unlock karta hai.' },
          { en: 'ACCOUNTS_EXPENSES -> unlocks the Accounts Expenses tab plus the P&L view.', hi: 'ACCOUNTS_EXPENSES -> Accounts Expenses tab aur P&L view unlock karta hai.' },
          { en: 'PETTY_CASH -> unlocks the Accounts Petty Cash Book (in the "demo-tabs" group).', hi: 'PETTY_CASH -> Accounts Petty Cash Book unlock karta hai ("demo-tabs" group mein).' },
          { en: 'AGGREGATOR_RECON -> unlocks the Accounts Aggregator Recon tab (in the "demo-tabs" group).', hi: 'AGGREGATOR_RECON -> Accounts Aggregator Recon tab unlock karta hai ("demo-tabs" group mein).' },
          { en: 'OFFICIAL_SALES_REPORTS -> unlocks the Accounts VAT Summary tab.', hi: 'OFFICIAL_SALES_REPORTS -> Accounts VAT Summary tab unlock karta hai.' },
          { en: 'VENDOR_REFUNDS -> unlocks the Accounts Vendor refunds tab.', hi: 'VENDOR_REFUNDS -> Accounts Vendor refunds tab unlock karta hai.' },
          { en: 'The Balance Sheet shows when either PETTY_CASH or AGGREGATOR_RECON is held (part of the demo-tabs group).', hi: 'Balance Sheet tab tab dikhta hai jab PETTY_CASH ya AGGREGATOR_RECON mein se koi ek ho (demo-tabs group ka hissa).' },
          { en: 'In Workforce, Owner must first pick a specific Branch from a dropdown before any tab\'s data loads; a normal branch user\'s branchId is already fixed.', hi: 'Workforce mein, Owner ko pehle dropdown se ek specific Branch pick karna padta hai, tabhi kisi tab ka data load hota hai; normal branch user ka branchId already fixed hota hai.' },
          { en: 'Business date everywhere uses Africa/Dar_es_Salaam (EAT, fixed UTC+3), and all amounts are in TSh.', hi: 'Business date har jagah Africa/Dar_es_Salaam (EAT, fixed UTC+3) use karta hai, aur saare amounts TSh mein hote hain.' },
        ],
      },
    ],
    example: {
      en: 'A branch manager holding PAYROLL + ATTENDANCE + LEAVE_APPROVAL sees Employees, Daily attendance, Leave requests, and Payroll tabs in Workforce, plus the P&L view in Accounts — but needs separate grants like PETTY_CASH or VENDOR_REFUNDS to see those Accounts tabs.',
      hi: 'PAYROLL + ATTENDANCE + LEAVE_APPROVAL rakhne wala branch manager Workforce mein Employees, Daily attendance, Leave requests, aur Payroll tabs dekhta hai, saath mein Accounts mein P&L view bhi — par Accounts ke PETTY_CASH ya VENDOR_REFUNDS jaise tabs dekhne ke liye alag grants chahiye.',
    },
  },
];

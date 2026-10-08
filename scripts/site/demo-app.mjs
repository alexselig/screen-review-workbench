// Tidewater: a made-up ferry booking app used only for the project site's
// screenshots. Each screen is a static HTML mock rendered to a PNG capture.

const css = `
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.5 "Helvetica Neue", Arial, sans-serif; color: #10233a; background: #f3f6f9; }
.top { display: flex; align-items: center; gap: 32px; height: 64px; padding: 0 48px; background: #0d3b5e; color: #fff; }
.logo { font-weight: 800; font-size: 20px; letter-spacing: -0.02em; }
.logo span { color: #6fd0c5; }
.top nav { display: flex; gap: 24px; font-size: 14px; opacity: .85; }
.top .who { margin-left: auto; font-size: 14px; display: flex; gap: 10px; align-items: center; }
.avatar { width: 32px; height: 32px; border-radius: 50%; background: #6fd0c5; color: #0d3b5e; display: grid; place-items: center; font-weight: 700; }
main { max-width: 1120px; margin: 0 auto; padding: 40px 48px; }
h1 { font-size: 32px; margin: 0 0 8px; letter-spacing: -0.02em; }
h2 { font-size: 18px; margin: 0 0 12px; }
.sub { color: #52667a; margin: 0 0 28px; }
.card { background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 1px 2px rgba(16,35,58,.08), 0 4px 16px rgba(16,35,58,.05); }
.grid { display: grid; gap: 20px; }
.g2 { grid-template-columns: 1fr 1fr; } .side { grid-template-columns: 2fr 1fr; }
.btn { display: inline-block; padding: 12px 22px; border-radius: 8px; background: #0f7c8c; color: #fff; font-weight: 700; border: 0; }
.btn.ghost { background: #fff; color: #0d3b5e; border: 1px solid #c6d3df; }
.field { display: grid; gap: 6px; margin-bottom: 16px; font-size: 13px; color: #52667a; }
.input { height: 44px; border: 1px solid #c6d3df; border-radius: 8px; background: #fff; padding: 0 14px; display: flex; align-items: center; color: #10233a; font-size: 15px; }
.steps { display: flex; gap: 8px; margin-bottom: 28px; }
.step { flex: 1; padding: 10px 14px; border-radius: 8px; background: #e3eaf1; color: #52667a; font-size: 13px; font-weight: 600; }
.step.done { background: #d4efec; color: #0b5d68; } .step.now { background: #0d3b5e; color: #fff; }
.row { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; border-bottom: 1px solid #e3eaf1; }
.row:last-child { border-bottom: 0; }
.muted { color: #52667a; font-size: 13px; }
.pill { display: inline-block; padding: 3px 10px; border-radius: 999px; background: #d4efec; color: #0b5d68; font-size: 12px; font-weight: 700; }
.pill.warn { background: #fdecd3; color: #8a4b00; }
.sail { display: grid; grid-template-columns: 110px 1fr 120px 110px; align-items: center; gap: 16px; padding: 16px; border: 1px solid #e3eaf1; border-radius: 10px; margin-bottom: 10px; background: #fff; }
.sail.sel { border: 2px solid #0f7c8c; background: #f1fbfa; }
.time { font-size: 22px; font-weight: 800; }
.price { font-weight: 800; font-size: 18px; text-align: right; }
.hero { height: 260px; border-radius: 14px; background: linear-gradient(120deg, #0d3b5e, #0f7c8c 60%, #6fd0c5); color: #fff; padding: 40px; display: flex; flex-direction: column; justify-content: flex-end; margin-bottom: 28px; }
.hero h1 { font-size: 40px; }
.map { height: 220px; border-radius: 10px; background: repeating-linear-gradient(135deg, #dfe9f1 0 14px, #e8f0f6 14px 28px); position: relative; }
.map i { position: absolute; width: 14px; height: 14px; border-radius: 50%; background: #0f7c8c; border: 3px solid #fff; }
.toggle { width: 44px; height: 26px; border-radius: 999px; background: #0f7c8c; position: relative; }
.toggle::after { content: ""; position: absolute; right: 3px; top: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; }
.toggle.off { background: #c6d3df; } .toggle.off::after { left: 3px; right: auto; }
footer.site { background: #0d3b5e; color: #c9d8e4; padding: 40px 48px; font-size: 13px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
footer.site b { color: #fff; display: block; margin-bottom: 8px; }
.notice { border-radius: 10px; padding: 14px 18px; background: #fdecd3; color: #8a4b00; font-size: 14px; margin-bottom: 20px; }
`;

const shell = (
  body,
  { nav = true, footer = false } = {},
) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<header class="top"><div class="logo">tide<span>water</span></div>${
  nav
    ? `<nav><span>Book</span><span>My trips</span><span>Timetables</span><span>Help</span></nav><div class="who">Maya Okafor <div class="avatar">MO</div></div>`
    : ""
}</header>
<main>${body}</main>${
  footer
    ? `<footer class="site"><div><b>Tidewater Ferries</b>Pier 4, Harbour Road</div><div><b>Travel</b>Routes<br>Timetables<br>Accessibility</div><div><b>Account</b>My trips<br>Passes<br>Settings</div><div><b>Help</b>Contact us<br>Refunds<br>Travel alerts</div></footer>`
    : ""
}</body></html>`;

const steps = (now) =>
  `<div class="steps" data-source="src/booking/Steps.tsx:12">${[
    "Route",
    "Sailing",
    "Vehicle & passengers",
    "Review & pay",
  ]
    .map(
      (label, index) =>
        `<div class="step ${index < now ? "done" : index === now ? "now" : ""}">${index + 1}. ${label}</div>`,
    )
    .join("")}</div>`;

const sailing = (time, arrive, boat, price, selected = false, note = "") =>
  `<div class="sail ${selected ? "sel" : ""}" data-testid="sailing-${time}" data-source="src/booking/SailingRow.tsx:18"><div class="time">${time}</div><div><b>Arrives ${arrive}</b><div class="muted">${boat}${note ? ` · ${note}` : ""}</div></div><div class="muted">${selected ? "Selected" : "Seats left"}</div><div class="price">${price}</div></div>`;

export const SCREENS = [
  {
    id: "sign-in",
    title: "Sign in",
    group: "Access",
    description: "Signed out, returning traveller",
    html: shell(
      `<div class="grid g2" style="align-items:center;min-height:760px">
        <div><h1 style="font-size:44px">Cross the water,<br>skip the queue.</h1><p class="sub">Book sailings, add a vehicle, and keep every ticket on your phone.</p></div>
        <div class="card"><h2>Sign in</h2>
          <div class="field">Email<div class="input">maya.okafor@example.com</div></div>
          <div class="field">Password<div class="input">••••••••••</div></div>
          <div style="display:flex;gap:12px;align-items:center"><span class="btn">Sign in</span><span class="muted">Forgot password?</span></div>
        </div></div>`,
      { nav: false },
    ),
  },
  {
    id: "home",
    title: "Home",
    group: "Access",
    description: "Signed in, one upcoming trip",
    html: shell(
      `<div class="hero" data-source="src/home/Greeting.tsx:15"><h1>Good morning, Maya</h1><div>Your next sailing leaves in 3 days.</div></div>
      <div class="grid side"><div class="card" data-testid="upcoming" data-source="src/home/UpcomingTrips.tsx:22"><h2>Upcoming</h2>
        <div class="row"><div><b>Harbour → Gull Island</b><div class="muted">Fri 14 Nov · 08:40 · Car + 2 adults</div></div><span class="pill">Confirmed</span></div>
        <div class="row"><div><b>Gull Island → Harbour</b><div class="muted">Sun 16 Nov · 17:10 · Car + 2 adults</div></div><span class="pill warn">Waitlist</span></div></div>
        <div class="card" data-testid="quick-book" data-source="src/home/QuickBook.tsx:21"><h2>Quick book</h2><div class="field">From<div class="input">Harbour</div></div><div class="field">To<div class="input">Gull Island</div></div><span class="btn">Find sailings</span></div></div>`,
    ),
  },
  {
    id: "route",
    title: "Choose route",
    group: "Booking",
    description: "Step 1 of 4, return trip selected",
    html: shell(
      `${steps(0)}<h1>Where are you going?</h1><p class="sub">Pick a route and dates. Return trips save 10%.</p>
      <div class="grid side"><div class="card">
        <div class="grid g2"><div class="field">From<div class="input">Harbour</div></div><div class="field">To<div class="input">Gull Island</div></div>
        <div class="field">Out<div class="input">Fri 14 Nov</div></div><div class="field">Back<div class="input">Sun 16 Nov</div></div></div>
        <div style="display:flex;gap:10px" data-source="src/booking/TripTypeToggle.tsx:24"><span class="btn ghost" role="button">One way</span><span class="btn" role="button">Return</span></div></div>
        <div class="card"><h2>Route map</h2><div class="map"><i style="left:18%;top:62%"></i><i style="left:72%;top:28%"></i></div><p class="muted">Crossing time about 55 minutes.</p></div></div>`,
    ),
  },
  {
    id: "sailing",
    title: "Pick a sailing",
    group: "Booking",
    description: "Step 2 of 4, outbound 08:40 selected",
    html: shell(
      `${steps(1)}<h1>Outbound · Fri 14 Nov</h1><p class="sub">Harbour → Gull Island. Prices are per vehicle with up to 2 adults.</p>
      ${sailing("06:15", "07:10", "MV Petrel", "£48")}
      ${sailing("08:40", "09:35", "MV Cormorant", "£62", true, "Fastest")}
      ${sailing("11:05", "12:00", "MV Petrel", "£62")}
      ${sailing("13:30", "14:25", "MV Cormorant", "£55", false, "Few seats left")}
      ${sailing("17:10", "18:05", "MV Petrel", "£70")}
      <div style="margin-top:20px;display:flex;justify-content:space-between" data-source="src/booking/Footer.tsx:36"><span class="btn ghost" role="button">Back</span><span class="btn" role="button" data-source="src/booking/Footer.tsx:42">Continue to vehicle</span></div>`,
    ),
  },
  {
    id: "vehicle",
    title: "Vehicle and passengers",
    group: "Booking",
    description: "Step 3 of 4, manual entry path (no saved vehicle)",
    html: shell(
      `${steps(2)}<h1>Who's travelling?</h1><p class="sub">Enter your vehicle details. We use the length to reserve deck space.</p>
      <div class="grid side"><div class="card" data-source="src/booking/VehicleForm.tsx:31"><h2>Vehicle</h2>
        <div class="grid g2"><div class="field">Registration<div class="input">KX21 RTA</div></div><div class="field">Type<div class="input">Car</div></div>
        <div class="field">Length (m)<div class="input">4.6</div></div><div class="field">Height (m)<div class="input">1.5</div></div></div>
        <h2 style="margin-top:12px">Passengers</h2>
        <div class="row"><span>Adults</span><b>2</b></div><div class="row"><span>Children (5-15)</span><b>0</b></div><div class="row"><span>Dogs</span><b>1</b></div></div>
        <div class="card" data-testid="price-summary" data-source="src/booking/PriceSummary.tsx:40"><h2>Summary</h2><div class="row"><span>Outbound 08:40</span><b>£62</b></div><div class="row"><span>Return 17:10</span><b>£70</b></div><div class="row"><span>Dog</span><b>£6</b></div><div class="row"><span>Return discount</span><b>−£13</b></div><div class="row"><b>Total</b><b>£125</b></div><span class="btn" role="button" style="margin-top:12px">Continue</span></div></div>`,
    ),
  },
  {
    id: "review-pay",
    title: "Review and pay",
    group: "Booking",
    description: "Step 4 of 4, full page with saved card",
    html: shell(
      `${steps(3)}<h1>Review and pay</h1><p class="sub">Check everything before you pay. Changes are free until 24 hours before sailing.</p>
      <div class="notice" role="status" data-source="src/booking/WaitlistNotice.tsx:9">Your return sailing is waitlisted. We'll move you to a confirmed seat or refund that leg in full.</div>
      <div class="grid side"><div class="grid">
        <div class="card"><h2>Trips</h2><div class="row"><div><b>Outbound · Fri 14 Nov 08:40</b><div class="muted">MV Cormorant · Harbour → Gull Island</div></div><span class="pill">Confirmed</span></div><div class="row"><div><b>Return · Sun 16 Nov 17:10</b><div class="muted">MV Petrel · Gull Island → Harbour</div></div><span class="pill warn">Waitlist</span></div></div>
        <div class="card"><h2>Travellers</h2><div class="row"><span>Maya Okafor</span><span class="muted">Lead</span></div><div class="row"><span>Tom Okafor</span><span class="muted">Adult</span></div><div class="row"><span>Biscuit</span><span class="muted">Dog</span></div></div>
        <div class="card"><h2>Vehicle</h2><div class="row"><span>KX21 RTA · Car</span><span class="muted">4.6 m × 1.5 m</span></div></div>
        <div class="card"><h2>Payment</h2><div class="row"><span>Visa ending 4421</span><span class="muted">Expires 08/28</span></div><div class="row"><span>Billing postcode</span><span class="muted">TR19 7AA</span></div></div>
        <div class="card"><h2>Terms</h2><p class="muted">By paying you agree to the conditions of carriage. Vehicles must check in 30 minutes before departure. Dogs travel on the car deck or in the pet lounge.</p></div>
      </div>
      <div class="card" style="align-self:start"><h2>Total</h2><div class="row"><span>Fares</span><b>£132</b></div><div class="row"><span>Extras</span><b>£6</b></div><div class="row"><span>Discount</span><b>−£13</b></div><div class="row"><b>Pay now</b><b>£125</b></div><span class="btn" role="button" data-source="src/booking/PayButton.tsx:27" style="margin-top:12px;display:block;text-align:center">Pay £125</span></div></div>`,
      { footer: true },
    ),
  },
  {
    id: "confirmation",
    title: "Booking confirmed",
    group: "Booking",
    description: "Paid, return leg still waitlisted",
    html: shell(
      `<div class="card" data-source="src/booking/Confirmation.tsx:33" style="max-width:640px;margin:40px auto;text-align:center;padding:48px">
        <div style="width:64px;height:64px;border-radius:50%;background:#d4efec;margin:0 auto 20px;display:grid;place-items:center;font-size:30px;color:#0b5d68">✓</div>
        <h1>You're booked</h1><p class="sub">Reference TW-48213. Tickets are in My trips and on their way to your email.</p>
        <div class="row"><span>Outbound · Fri 08:40</span><span class="pill">Confirmed</span></div><div class="row"><span>Return · Sun 17:10</span><span class="pill warn">Waitlist</span></div>
        <div style="margin-top:24px;display:flex;gap:12px;justify-content:center"><span class="btn">View tickets</span><span class="btn ghost">Add to calendar</span></div></div>`,
    ),
  },
  {
    id: "trips",
    title: "My trips",
    group: "Account",
    description: "Two upcoming, three past trips",
    html: shell(
      `<h1>My trips</h1><p class="sub">Show the QR code at check-in. Past trips stay here for 12 months.</p>
      <div class="card"><h2>Upcoming</h2><div class="row"><div><b>Harbour → Gull Island</b><div class="muted">Fri 14 Nov · 08:40 · TW-48213</div></div><span class="btn ghost" role="button" data-source="src/trips/TripRow.tsx:19">Show ticket</span></div><div class="row"><div><b>Gull Island → Harbour</b><div class="muted">Sun 16 Nov · 17:10 · TW-48213</div></div><span class="pill warn">Waitlist</span></div></div>
      <div class="card" style="margin-top:20px"><h2>Past</h2><div class="row"><span>Harbour → Gull Island · 2 Aug</span><span class="muted">Receipt</span></div><div class="row"><span>Gull Island → Harbour · 4 Aug</span><span class="muted">Receipt</span></div><div class="row"><span>Harbour → Puffin Rock · 19 May</span><span class="muted">Receipt</span></div></div>`,
    ),
  },
  {
    id: "settings",
    title: "Settings",
    group: "Account",
    description: "Notifications tab, SMS alerts off",
    html: shell(
      `<h1>Settings</h1><p class="sub">Choose how we reach you about delays and changes.</p>
      <div class="card" style="max-width:720px"><h2>Notifications</h2>
        <div class="row"><div><b>Email confirmations</b><div class="muted">Tickets and receipts</div></div><div class="toggle"></div></div>
        <div class="row"><div><b>Delay alerts by SMS</b><div class="muted">Texts if your sailing is late or cancelled</div></div><div class="toggle off"></div></div>
        <div class="row"><div><b>Offers</b><div class="muted">At most one email a month</div></div><div class="toggle off"></div></div>
        <span class="btn" style="margin-top:16px">Save changes</span></div>`,
    ),
  },
];

// Comments seeded onto the demo, as a design reviewer would leave them.
export const COMMENTS = [
  {
    screen: "home",
    x: 0.56,
    y: 0.2,
    note: "Greeting is nice but the next trip is the real headline. Lead with the 08:40 sailing.",
    tags: ["P1", "Hierarchy"],
    status: "IN_PROGRESS",
  },
  {
    screen: "home",
    x: 0.5,
    y: 0.565,
    note: "Waitlist pill reads as a warning colour with no explanation. Say what happens next.",
    tags: ["P1", "Copy"],
    status: "OPEN",
  },
  {
    screen: "home",
    x: 0.78,
    y: 0.72,
    note: "Quick book duplicates the Book tab. Drop it or prefill from the last trip.",
    tags: ["P2"],
    status: "WONT_FIX",
    reply:
      "Keeping it: most repeat bookings start here. Prefilling from the last trip instead.",
  },
  {
    screen: "route",
    x: 0.275,
    y: 0.517,
    note: "Return toggle is easy to miss; the 10% saving should sit next to it.",
    tags: ["P1", "Conversion"],
    status: "RESOLVED",
    reply:
      "Moved the saving into the Return button label and made Return the default.",
    // Later messages, in order: reviewer follow-ups and agent answers.
    thread: [
      {
        role: "reviewer",
        note: "Better. The saving still reads as body text; give it the teal accent.",
      },
      {
        role: "agent",
        note: "Saving is now a teal tag inside the Return button.",
      },
    ],
  },
  {
    screen: "route",
    x: 0.62,
    y: 0.125,
    note: "Step labels truncate at 1280px.",
    tags: ["P2", "Layout"],
    status: "OPEN",
  },
  {
    screen: "sailing",
    x: 0.42,
    y: 0.43,
    note: "Selected sailing needs more than a border. Add a check and repeat it in the footer button.",
    tags: ["P0", "Accessibility"],
    status: "OPEN",
  },
  {
    screen: "sailing",
    x: 0.78,
    y: 0.56,
    note: '"Few seats left" should be its own badge, not tucked in the boat name.',
    tags: ["P1"],
    status: "OPEN",
  },
  {
    screen: "sailing",
    x: 0.84,
    y: 0.27,
    note: "Price per what? Say per vehicle in the column header.",
    tags: ["P2", "Copy"],
    status: "RESOLVED",
    reply: 'Header now reads "Per vehicle, 2 adults".',
    verified: true,
  },
  {
    screen: "vehicle",
    x: 0.28,
    y: 0.4,
    note: "Manual path asks for length before we explain why. Lead with a car/van picker that fills it in.",
    tags: ["P0", "Flow"],
    status: "IN_PROGRESS",
  },
  {
    screen: "vehicle",
    x: 0.82,
    y: 0.6,
    note: "Dog fee appears without warning. Mention pets on the sailing step.",
    tags: ["P1"],
    status: "OPEN",
  },
  {
    screen: "review-pay",
    x: 0.78,
    y: 0.19,
    note: "Waitlist notice is the most important thing here; give it the top of the page.",
    tags: ["P0"],
    status: "OPEN",
  },
  {
    screen: "review-pay",
    x: 0.8,
    y: 0.3,
    note: 'Pay button should say what you pay for: "Pay £125 for 2 sailings".',
    tags: ["P1", "Copy"],
    status: "RESOLVED",
    reply:
      "Label updated; the amount and sailing count both come from the basket.",
  },
  {
    screen: "confirmation",
    x: 0.5,
    y: 0.3,
    note: "Add the check-in time here too.",
    tags: ["P2"],
    status: "OPEN",
  },
  {
    screen: "trips",
    x: 0.75,
    y: 0.36,
    note: "Show ticket should be the primary button on the next trip.",
    tags: ["P1"],
    status: "OPEN",
  },
];

export const APPROVED = ["sign-in", "confirmation", "settings"];

"use strict";

/* ========================================================================
   Service catalog: questionnaires, pricing models, photo slots.
   Source: home_improvement_questionnaire.txt.
   PRICING VALUES ARE PLACEHOLDERS — admin-editable in the portal price book;
   replace with licensed data (e.g. RSMeans / Cost vs Value) before launch.
   ======================================================================== */

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const UNSURE_RE = /unsure|unknown|not sure/i;
const EXCLUSIVE_RE = /^(none|no|no repairs)$|unsure|unknown|not sure/i;

// q(id, type, text, options|null, extra)
const q = (id, type, t, o = null, extra = {}) => ({ id, type, t, o: o ? o.split("|") : null, ...extra });

const UNIVERSAL = [
  q("G2", "single", "What type of property is this?", "Single-family|Townhouse|Duplex|Condo|Commercial|Other"),
  q("G3", "single", "Do you own the property?", "Yes|No|Under contract|Property manager"),
  q("G4", "single", "When would you like the project completed?", "ASAP|Within 30 days|1–3 months|3–6 months|Researching"),
  q("G5", "single", "What is your primary objective?", "Repair|Appearance|Performance|New installation"),
  q("G6", "single", "What matters most?", "Lowest price|Value|Premium quality|Speed"),
  q("G7", "multi", "Are there known access or property restrictions?", "HOA|Gated|Historic|Difficult access|None|Unsure"),
];
const DELIVERY_Q = q("G9", "single", "How should we send your estimate?", "Email|Text|Both");

const UNIVERSAL_MULT = {
  G2: { Commercial: 1.15 },
  G4: { ASAP: 1.05 },
  G6: { "Lowest price": 0.92, "Premium quality": 1.2, Speed: 1.08 },
  G7: { Historic: 1.1, "Difficult access": 1.08, Gated: 1.02 },
};

const NOTES_Q = q("q11", "text", "Anything else we should know about your project?", null, { optional: true });

const SERVICES = [
  {
    id: "gutters", name: "Gutters", icon: "🌧️",
    questions: [
      q("q1", "single", "What work is needed?", "New installation|Replacement|Repair|Gutter guards only"),
      q("q2", "single", "Which parts of the home?", "Entire home|Selected elevations|Detached structure"),
      q("q3", "single", "How many stories are served?", "1|2|3+|Varies"),
      q("q4", "measure", "Approximate gutter length?", null, { unit: "lf", trace: "perimeter" }),
      q("q5", "single", "Preferred gutter type and size?", "5-inch seamless|6-inch seamless|Half-round|Unsure"),
      q("q6", "single", "Preferred material?", "Aluminum|Steel|Copper|Other"),
      q("q7", "number", "How many downspouts are needed?", null, { unit: "downspouts" }),
      q("q8", "single", "Are gutter guards desired?", "No|Basic screen|Premium protection|Unsure"),
      q("q9", "single", "What is the current fascia condition?", "Good|Damaged or rotted|Unsure|No existing fascia"),
      q("q10", "multi", "Any unusual drainage or access requirements?", "Underground drains|Steep roof|High elevations|Drainage issues|None"),
    ],
    pricing: {
      unit: "lf", qty: "q4", def: 150, low: 6, high: 12, min: 450,
      mult: {
        q1: { Repair: 0.3, "Gutter guards only": 0.55 },
        q3: { 2: 1.2, "3+": 1.45, Varies: 1.25 },
        q5: { "6-inch seamless": 1.15, "Half-round": 1.8 },
        q6: { Steel: 1.3, Copper: 3.5 },
        q8: { "Basic screen": 1.25, "Premium protection": 1.7 },
      },
      add: {
        q9: { "Damaged or rotted": [300, 1500] },
        q10: { "Underground drains": [150, 600], "Steep roof": [100, 400], "High elevations": [200, 600], "Drainage issues": [100, 500] },
      },
      per: [{ q: "q7", low: 60, high: 160 }],
    },
    photos: ["Front of home showing gutters", "Rear of home showing gutters", "Close-up of damage or problem areas", "Downspouts / drainage"],
    related: ["roofing", "exterior-cleaning", "siding"],
  },
  {
    id: "doors", name: "Exterior Doors", icon: "🚪",
    questions: [
      q("q1", "multi", "Which door locations?", "Front|Rear|Side|Patio|Garage entry"),
      q("q2", "number", "How many doors?", null, { unit: "doors" }),
      q("q3", "single", "What is the existing opening size?", "Standard size|Wider or taller than standard|Unsure"),
      q("q4", "single", "What door configuration?", "Single|Double|Door with sidelights|Sliding|French"),
      q("q5", "single", "Preferred door material?", "Fiberglass|Steel|Wood|Aluminum|Unsure"),
      q("q6", "single", "How much glass?", "Solid|Half-lite|Full-lite|Decorative"),
      q("q7", "single", "Frame replacement scope?", "Slab only|Prehung frame|Unsure"),
      q("q8", "single", "What hardware and security features?", "Standard lock|Smart lock|Upgraded security|Reuse existing"),
      q("q9", "single", "What finish is desired?", "Factory painted|Stained|Unfinished|Match existing"),
      q("q10", "multi", "Are threshold, trim, or opening repairs needed?", "No repairs|Threshold|Trim|Rot|Unsure"),
    ],
    pricing: {
      unit: "each", qty: "q2", def: 1, low: 900, high: 2800, min: 500,
      mult: {
        q3: { "Wider or taller than standard": 1.25 },
        q4: { Double: 1.8, "Door with sidelights": 1.7, Sliding: 1.4, French: 1.9 },
        q5: { Fiberglass: 1.15, Wood: 1.6, Aluminum: 1.3 },
        q6: { "Full-lite": 1.2, Decorative: 1.3 },
        q7: { "Slab only": 0.6 },
        q8: { "Smart lock": 1.08, "Upgraded security": 1.1 },
        q9: { Stained: 1.1 },
      },
      add: { q10: { Threshold: [150, 400], Trim: [200, 600], Rot: [400, 1500] } },
    },
    photos: ["Door from outside", "Door from inside", "Threshold / frame close-up", "Hardware"],
    related: ["windows", "garage-doors", "painting"],
  },
  {
    id: "windows", name: "Windows", icon: "🪟",
    questions: [
      q("q1", "number", "How many windows?", null, { unit: "windows" }),
      q("q2", "single", "What installation scope?", "Replace existing|New openings|Mixed"),
      q("q3", "text", "What are the approximate sizes? (width × height per window, or 'standard')", null, { optional: true }),
      q("q4", "multi", "Which window styles?", "Single-hung|Double-hung|Casement|Slider|Picture|Other"),
      q("q5", "single", "Preferred frame material?", "Vinyl|Fiberglass|Wood|Aluminum|Unsure"),
      q("q6", "single", "What glass performance?", "Standard insulated|Low-E|Impact-rated|Sound-reducing|Unsure"),
      q("q7", "text", "What colors or finishes? (interior and exterior)", null, { optional: true }),
      q("q8", "single", "What installation method?", "Insert|Full-frame|Unsure"),
      q("q9", "number", "How many windows are on upper floors?", null, { unit: "windows" }),
      q("q10", "multi", "Any damaged sills, trim, or structural concerns?", "None|Rot|Leaks|Other|Unsure"),
    ],
    pricing: {
      unit: "each", qty: "q1", def: 10, low: 550, high: 1300, min: 700,
      mult: {
        q2: { "New openings": 1.8, Mixed: 1.3 },
        q4: { Casement: 1.15, Picture: 1.05 },
        q5: { Fiberglass: 1.35, Wood: 1.6, Aluminum: 0.95 },
        q6: { "Low-E": 1.08, "Impact-rated": 1.9, "Sound-reducing": 1.4 },
        q8: { "Full-frame": 1.3 },
      },
      add: { q10: { Rot: [300, 1500], Leaks: [300, 1500], Other: [100, 800] } },
      per: [{ q: "q9", low: 40, high: 120 }],
    },
    photos: ["A typical window from inside", "The same window from outside", "Damaged sills or frames", "Additional windows"],
    related: ["doors", "siding", "insulation"],
  },
  {
    id: "siding", name: "Siding", icon: "🏠",
    questions: [
      q("q1", "single", "What is the project scope?", "Whole house|Selected walls|Repair"),
      q("q2", "measure", "What is the approximate wall area?", null, { unit: "sqft", trace: "wall" }),
      q("q3", "single", "How many stories?", "1|2|3+"),
      q("q4", "single", "What siding exists now?", "Vinyl|Fiber cement|Wood|Stucco|Brick|Other"),
      q("q5", "single", "What material is desired?", "Vinyl|Fiber cement|Engineered wood|Metal|Unsure"),
      q("q6", "single", "What profile or style?", "Horizontal lap|Board-and-batten|Shake|Mixed"),
      q("q7", "single", "What finish and color?", "Standard|Premium color|Custom"),
      q("q8", "single", "Should existing siding be removed?", "Yes|Install over existing if permitted|Unsure"),
      q("q9", "single", "Is insulation or housewrap work desired?", "Housewrap|Rigid insulation|Both|Neither|Unsure"),
      q("q10", "multi", "Are trim, soffit, fascia, or wall repairs needed?", "Trim|Soffit|Fascia|Wall repairs|None|Unsure"),
    ],
    pricing: {
      unit: "sqft", qty: "q2", def: 1800, low: 4.5, high: 10, min: 1200,
      mult: {
        q1: { Repair: 0.8 },
        q3: { 2: 1.12, "3+": 1.3 },
        q4: { Stucco: 1.1, Brick: 1.15 },
        q5: { "Fiber cement": 1.45, "Engineered wood": 1.3, Metal: 1.6 },
        q6: { "Board-and-batten": 1.1, Shake: 1.3, Mixed: 1.15 },
        q7: { "Premium color": 1.08, Custom: 1.2 },
        q8: { Yes: 1.12 },
        q9: { Housewrap: 1.05, "Rigid insulation": 1.15, Both: 1.2 },
      },
      add: { q10: { Trim: [400, 1500], Soffit: [500, 2000], Fascia: [400, 1500], "Wall repairs": [500, 3000] } },
    },
    photos: ["Front elevation", "Rear elevation", "Damaged areas", "Side elevations"],
    related: ["windows", "painting", "gutters"],
  },
  {
    id: "roofing", name: "Roofing", icon: "🏚️",
    questions: [
      q("q1", "single", "What is the project scope?", "Full replacement|Partial replacement|Repair|New roof"),
      q("q2", "single", "What roofing material exists?", "Asphalt shingle|Metal|Tile|Flat membrane|Other"),
      q("q3", "single", "What roofing material is desired?", "Architectural shingle|Metal|Tile|Membrane|Unsure"),
      q("q4", "measure", "What is the approximate roof size?", null, { unit: "sqft", trace: "roof" }),
      q("q5", "single", "How complex is the roof?", "Simple (1–2 planes)|Moderate|Complex (valleys, dormers)"),
      q("q6", "single", "What is the roof pitch?", "Low|Moderate|Steep|Unknown"),
      q("q7", "single", "How many existing roofing layers?", "1|2+|Unknown"),
      q("q8", "multi", "Are there leaks or decking damage?", "No|Leaks|Visible damage|Unknown"),
      q("q9", "multi", "Which penetrations or accessories are present?", "Skylights|Chimneys|Vents|Solar|None"),
      q("q10", "multi", "What upgrades are desired?", "Underlayment|Ventilation|Flashing|Gutters|None"),
    ],
    pricing: {
      unit: "sqft", qty: "q4", def: 2000, low: 4.25, high: 8.5, min: 900,
      mult: {
        q1: { Repair: 0.12, "Partial replacement": 0.5, "New roof": 1.1 },
        q3: { Metal: 2.0, Tile: 2.4, Membrane: 1.2 },
        q5: { Moderate: 1.1, "Complex (valleys, dormers)": 1.28 },
        q6: { Moderate: 1.05, Steep: 1.25 },
        q7: { "2+": 1.1 },
      },
      add: {
        q8: { Leaks: [300, 1500], "Visible damage": [500, 3000] },
        q9: { Skylights: [300, 900], Chimneys: [300, 900], Solar: [1500, 4500] },
        q10: { Underlayment: [300, 1000], Ventilation: [300, 1200], Flashing: [200, 900], Gutters: [1000, 2800] },
      },
    },
    photos: ["Front roof slope", "Rear roof slope", "Damage, leaks, or interior stains", "Chimneys, skylights, or attic"],
    related: ["gutters", "solar", "insulation"],
  },
  {
    id: "flooring", name: "Flooring", icon: "🪵",
    questions: [
      q("q1", "text", "Which rooms are included? (e.g. living room, 2 bedrooms, or whole home)"),
      q("q2", "number", "What is the approximate area?", null, { unit: "sqft" }),
      q("q3", "single", "What flooring exists now?", "Carpet|Tile|Hardwood|Vinyl|Laminate|Concrete"),
      q("q4", "single", "What new flooring is desired?", "LVP|Hardwood|Engineered wood|Laminate|Tile|Carpet"),
      q("q5", "single", "What material quality or price tier?", "Economy|Midrange|Premium|Unsure"),
      q("q6", "single", "Should old flooring be removed and hauled away?", "Yes|No|Partial"),
      q("q7", "single", "What is the subfloor type and condition?", "Concrete, good|Concrete, uneven|Wood, good|Wood, uneven|Damaged|Unsure"),
      q("q8", "single", "Will furniture or appliances need moving?", "None|Light|Extensive"),
      q("q9", "multi", "Are stairs, transitions, or baseboards included?", "Stairs|Transitions|Baseboards|None"),
      q("q10", "single", "What layout or installation pattern?", "Standard|Diagonal|Herringbone|Other"),
    ],
    pricing: {
      unit: "sqft", qty: "q2", def: 500, low: 3.5, high: 8, min: 800,
      mult: {
        q3: { Tile: 1.1 },
        q4: { Hardwood: 1.9, "Engineered wood": 1.5, Tile: 1.55, Laminate: 0.8, Carpet: 0.7 },
        q5: { Economy: 0.75, Premium: 1.4 },
        q6: { Yes: 1.1, Partial: 1.05 },
        q7: { "Concrete, uneven": 1.1, "Wood, uneven": 1.1, Damaged: 1.25 },
        q8: { Light: 1.02, Extensive: 1.06 },
        q10: { Diagonal: 1.12, Herringbone: 1.3 },
      },
      add: { q9: { Stairs: [600, 2500], Transitions: [100, 400], Baseboards: [400, 1500] } },
    },
    photos: ["Wide shot of each room", "Existing floor close-up", "Transitions or stairs", "Subfloor issues"],
    related: ["painting", "kitchen", "bathroom"],
  },
  {
    id: "bathroom", name: "Bathroom Remodeling", icon: "🛁",
    questions: [
      q("q1", "single", "What type of remodel?", "Cosmetic refresh|Tub-shower conversion|Full remodel"),
      q("q2", "number", "What is the bathroom size?", null, { unit: "sqft" }),
      q("q3", "single", "What bathing configuration is desired?", "Keep tub|Walk-in shower|Tub-shower combo|Freestanding tub"),
      q("q4", "single", "Will fixtures stay in their current locations?", "All stay|Move one|Major layout changes"),
      q("q5", "single", "What shower or tub surround material?", "Acrylic|Fiberglass|Tile|Solid surface|Unsure"),
      q("q6", "single", "What vanity and countertop scope?", "Keep vanity|Replace vanity"),
      q("q7", "single", "What toilet, faucets, and fixtures?", "Keep|Standard replacements|Premium"),
      q("q8", "multi", "What flooring and wall finishes?", "LVP floor|Tile floor|Paint walls|Tile walls|Other"),
      q("q9", "multi", "Are electrical, lighting, or ventilation upgrades needed?", "Lighting|Fan|Outlets|None"),
      q("q10", "multi", "Are accessibility or water-damage repairs required?", "Grab bars|Curbless shower|Rot|Mold|None|Unsure"),
    ],
    pricing: {
      unit: "job", low: 9000, high: 20000, min: 3500,
      scale: { q: "q2", ref: 50, exp: 0.5 },
      mult: {
        q1: { "Cosmetic refresh": 0.45, "Full remodel": 1.5 },
        q3: { "Walk-in shower": 1.05, "Freestanding tub": 1.15 },
        q4: { "Move one": 1.15, "Major layout changes": 1.4 },
        q5: { Tile: 1.15, "Solid surface": 1.1 },
        q6: { "Replace vanity": 1.08 },
        q7: { Keep: 0.92, Premium: 1.2 },
      },
      add: {
        q9: { Lighting: [300, 1200], Fan: [250, 700], Outlets: [200, 600] },
        q10: { "Grab bars": [200, 600], "Curbless shower": [1500, 5000], Rot: [500, 3000], Mold: [500, 3000] },
      },
    },
    photos: ["Wide shot from the doorway", "Shower or tub", "Vanity and toilet", "Water damage or mold"],
    related: ["flooring", "plumbing", "electrical"],
  },
  {
    id: "kitchen", name: "Kitchen Remodeling", icon: "🍳",
    questions: [
      q("q1", "single", "What level of remodel?", "Refresh|Partial|Full"),
      q("q2", "number", "What is the approximate kitchen size?", null, { unit: "sqft" }),
      q("q3", "single", "What cabinet work is planned?", "Paint|Reface|Replace|Add"),
      q("q4", "single", "What countertop material?", "Laminate|Quartz|Granite|Solid surface|Other"),
      q("q5", "single", "Will the kitchen layout change?", "No|Minor|Walls or plumbing move"),
      q("q6", "single", "What backsplash work is desired?", "None|Tile|Slab|Other"),
      q("q7", "single", "Will appliances be replaced or relocated?", "Keep|Replace|Relocate"),
      q("q8", "single", "What flooring work is included?", "None|Replace"),
      q("q9", "multi", "Are plumbing or electrical upgrades required?", "Sink|Disposal|Lighting|Outlets|Circuits|None"),
      q("q10", "multi", "What demolition and finishing are included?", "Drywall|Painting|Trim|Removal|None"),
    ],
    pricing: {
      unit: "job", low: 18000, high: 45000, min: 5000,
      scale: { q: "q2", ref: 150, exp: 0.6 },
      mult: {
        q1: { Refresh: 0.35, Full: 1.6 },
        q3: { Paint: 0.6, Reface: 0.75, Add: 1.15 },
        q4: { Laminate: 0.85, Quartz: 1.08, Granite: 1.06 },
        q5: { Minor: 1.1, "Walls or plumbing move": 1.4 },
        q7: { Relocate: 1.12 },
      },
      add: {
        q6: { Tile: [1000, 3000], Slab: [2500, 6000] },
        q8: { Replace: [2000, 6000] },
        q9: { Sink: [400, 1200], Disposal: [200, 500], Lighting: [600, 2500], Outlets: [200, 800], Circuits: [400, 1500] },
        q10: { Drywall: [800, 3000], Painting: [600, 2000], Trim: [400, 1500], Removal: [500, 2000] },
      },
    },
    photos: ["Wide shot from the entry", "Cabinets and counters", "Appliance wall", "Plumbing under the sink"],
    related: ["flooring", "electrical", "plumbing"],
  },
  {
    id: "decks", name: "Decks & Porches", icon: "🪜",
    questions: [
      q("q1", "single", "What is the project type?", "New deck|Replacement|Resurfacing|Repair|Porch"),
      q("q2", "measure", "What are the approximate dimensions?", null, { unit: "sqft", trace: "area" }),
      q("q3", "single", "What is the deck height?", "Ground-level|Elevated|Multi-level"),
      q("q4", "single", "Preferred decking material?", "Pressure-treated|Composite|PVC|Hardwood"),
      q("q5", "single", "What structure or framing is required?", "Reuse|New|Unsure"),
      q("q6", "single", "What railing type?", "None|Wood|Metal|Composite|Glass"),
      q("q7", "number", "How many stairs or landings?", null, { unit: "stairs" }),
      q("q8", "single", "What foundation or footing conditions?", "Concrete|Soil|Existing posts|Unsure"),
      q("q9", "multi", "What additional features?", "Pergola|Lighting|Privacy|Built-in seating|None"),
      q("q10", "multi", "Are demolition or permits anticipated?", "Existing removal|Permit|HOA|Unsure"),
    ],
    pricing: {
      unit: "sqft", qty: "q2", def: 300, low: 30, high: 60, min: 2000,
      mult: {
        q1: { Resurfacing: 0.5, Repair: 0.2, Porch: 1.2 },
        q3: { Elevated: 1.2, "Multi-level": 1.4 },
        q4: { Composite: 1.45, PVC: 1.65, Hardwood: 1.8 },
        q5: { Reuse: 0.75 },
        q6: { None: 0.9, Metal: 1.06, Composite: 1.08, Glass: 1.2 },
      },
      add: {
        q9: { Pergola: [3000, 9000], Lighting: [500, 2000], Privacy: [800, 3000], "Built-in seating": [800, 3000] },
        q10: { "Existing removal": [500, 2500], Permit: [200, 800] },
      },
      per: [{ q: "q7", low: 150, high: 450 }],
    },
    photos: ["Full deck or porch area", "Under-deck framing / footings", "Railings and stairs", "Damaged areas"],
    related: ["fences", "exterior-cleaning", "concrete"],
  },
  {
    id: "fences", name: "Fences", icon: "🚧",
    questions: [
      q("q1", "single", "What is the project scope?", "New|Replacement|Repair"),
      q("q2", "measure", "What approximate fence length?", null, { unit: "lf", trace: "line" }),
      q("q3", "single", "What height is desired?", "4 ft|5 ft|6 ft|8 ft|Other"),
      q("q4", "single", "What material?", "Wood|Vinyl|Aluminum|Chain-link|Composite"),
      q("q5", "single", "What fence style?", "Privacy|Semi-privacy|Picket|Decorative|Security"),
      q("q6", "number", "How many gates?", null, { unit: "gates" }),
      q("q7", "single", "What is the terrain?", "Flat|Sloped|Mixed"),
      q("q8", "single", "What is the ground condition?", "Soil|Rock|Concrete|Unsure"),
      q("q9", "single", "Should existing fencing be removed?", "Yes|No|Partial"),
      q("q10", "multi", "Any boundary, HOA, or pool-code requirements?", "Survey|HOA|Pool enclosure|None|Unsure"),
    ],
    pricing: {
      unit: "lf", qty: "q2", def: 150, low: 22, high: 45, min: 900,
      mult: {
        q1: { Repair: 0.3 },
        q3: { "4 ft": 0.8, "5 ft": 0.9, "8 ft": 1.3 },
        q4: { Vinyl: 1.3, Aluminum: 1.45, "Chain-link": 0.55, Composite: 1.8 },
        q5: { Picket: 0.85, Decorative: 1.15, Security: 1.25 },
        q7: { Sloped: 1.15, Mixed: 1.08 },
        q8: { Rock: 1.3, Concrete: 1.2 },
        q9: { Yes: 1.1, Partial: 1.05 },
      },
      add: { q10: { Survey: [400, 1000], "Pool enclosure": [300, 1200] } },
      per: [{ q: "q6", low: 300, high: 900 }],
    },
    photos: ["Wide shot of the fence line", "Gate locations", "Terrain or slope", "Damaged sections"],
    related: ["decks", "concrete"],
  },
  {
    id: "painting", name: "Painting", icon: "🎨",
    questions: [
      q("q1", "single", "What areas need painting?", "Interior|Exterior|Both"),
      q("q2", "multi", "Which rooms or exterior surfaces?", "Living areas|Bedrooms|Kitchen|Bathrooms|Exterior walls|Trim|Deck or fence|Other"),
      q("q3", "number", "What is the approximate paintable area?", null, { unit: "sqft" }),
      q("q4", "multi", "What surface materials?", "Drywall|Wood|Masonry|Siding|Metal"),
      q("q5", "multi", "What is the current surface condition?", "Good|Peeling|Cracks|Water stains|Repairs needed"),
      q("q6", "multi", "What prep work is needed?", "Patch|Sand|Scrape|Pressure wash|Prime|None"),
      q("q7", "single", "How many colors and coats?", "1–2 colors, standard|3+ colors|Major color change"),
      q("q8", "single", "What paint quality?", "Economy|Standard|Premium"),
      q("q9", "multi", "Are ceilings, trim, doors, or shutters included?", "Ceilings|Trim|Doors|Shutters|None"),
      q("q10", "multi", "Any high walls, scaffolding, or occupied-space constraints?", "High walls|Scaffolding|Occupied space|None"),
    ],
    pricing: {
      unit: "sqft", qty: "q3", def: 1800, low: 2, high: 4.5, min: 500,
      mult: {
        q1: { Exterior: 1.2, Both: 1.1 },
        q5: { Peeling: 1.15, Cracks: 1.05, "Water stains": 1.05, "Repairs needed": 1.15 },
        q6: { Sand: 1.04, Scrape: 1.08, Prime: 1.08 },
        q7: { "3+ colors": 1.08, "Major color change": 1.15 },
        q8: { Economy: 0.85, Premium: 1.15 },
        q10: { "High walls": 1.1, Scaffolding: 1.2 },
      },
      add: { q9: { Ceilings: [400, 2000], Trim: [300, 1500], Doors: [100, 600], Shutters: [150, 600] } },
    },
    photos: ["Wide shot of each area", "Surface condition close-up", "Trim and ceilings", "High walls or tricky access"],
    related: ["flooring", "siding", "exterior-cleaning"],
  },
  {
    id: "hvac", name: "HVAC", icon: "❄️",
    questions: [
      q("q1", "single", "What system needs work?", "Central AC|Heat pump|Furnace|Mini-split|Ductwork"),
      q("q2", "single", "What service is required?", "New|Replacement|Repair|Add zone"),
      q("q3", "number", "What is the approximate conditioned area?", null, { unit: "sqft" }),
      q("q4", "number", "How many systems or zones?", null, { unit: "systems" }),
      q("q5", "single", "What equipment and fuel exist now?", "Electric|Gas|Heat pump|None|Unsure"),
      q("q6", "single", "What efficiency level is desired?", "Standard|High efficiency|Premium|Unsure"),
      q("q7", "single", "Will existing ductwork be reused?", "Yes|Replace|Add|No ducts|Unsure"),
      q("q8", "single", "What equipment location and access?", "Attic|Crawlspace|Closet|Exterior|Other"),
      q("q9", "multi", "Any comfort or airflow problems?", "Hot spots|Humidity|Noise|None"),
      q("q10", "multi", "Any electrical, thermostat, or ventilation upgrades?", "Panel|Thermostat|Filtration|Fresh air|None"),
    ],
    pricing: {
      unit: "each", qty: "q4", def: 1, low: 5500, high: 11000, min: 250,
      scale: { q: "q3", ref: 2000, exp: 0.4 },
      mult: {
        q1: { "Heat pump": 1.15, Furnace: 0.75, "Mini-split": 0.65, Ductwork: 0.55 },
        q2: { New: 1.15, Repair: 0.06, "Add zone": 0.45 },
        q6: { "High efficiency": 1.25, Premium: 1.5 },
        q7: { Replace: 1.35, Add: 1.15 },
        q8: { Attic: 1.08, Crawlspace: 1.06 },
      },
      add: { q10: { Panel: [1500, 4000], Thermostat: [150, 500], Filtration: [300, 1500], "Fresh air": [800, 3000] } },
    },
    photos: ["Outdoor unit and data plate", "Indoor unit / furnace and data plate", "Thermostat", "Ductwork"],
    related: ["insulation", "electrical", "solar"],
  },
  {
    id: "plumbing", name: "Water Heaters & Plumbing", icon: "🚰",
    questions: [
      q("q1", "single", "What is the project type?", "Water heater|Fixture|Repiping|Leak|Other"),
      q("q2", "single", "Is this replacement or new installation?", "Replace|New|Repair"),
      q("q3", "text", "Which fixtures or lines are involved? (list and count)", null, { optional: true }),
      q("q4", "single", "What type of water heater, if applicable?", "Tank|Tankless|Heat pump|Not applicable"),
      q("q5", "single", "What fuel or power is available?", "Electric|Natural gas|Propane|Unsure"),
      q("q6", "single", "What capacity or household demand?", "Under 40 gal / 1 bath|40–50 gal / 2 baths|60+ gal / 3+ baths|Unsure"),
      q("q7", "single", "Where is the equipment or piping located?", "Garage|Closet|Attic|Crawlspace|Slab|Other"),
      q("q8", "single", "What pipe materials are present?", "PEX|Copper|PVC|Galvanized|Unknown"),
      q("q9", "single", "Are walls, floors, or concrete likely to be opened?", "Yes|No|Unsure"),
      q("q10", "multi", "Are leaks, corrosion, or code upgrades involved?", "Leaks|Corrosion|Code upgrades|None|Unsure"),
    ],
    pricing: {
      unit: "job", low: 1300, high: 3200, min: 250,
      mult: {
        q1: { Fixture: 0.35, Repiping: 4.5, Leak: 0.25, Other: 0.6 },
        q2: { New: 1.2, Repair: 0.3 },
        q4: { Tankless: 1.9, "Heat pump": 2.1 },
        q6: { "Under 40 gal / 1 bath": 0.9, "60+ gal / 3+ baths": 1.25 },
        q7: { Attic: 1.15, Crawlspace: 1.1, Slab: 1.2 },
        q8: { Galvanized: 1.15 },
        q9: { Yes: 1.2 },
      },
      add: { q10: { Leaks: [200, 1000], Corrosion: [200, 800], "Code upgrades": [300, 1200] } },
    },
    photos: ["Water heater or fixture with label", "Pipes and connections", "Leak or damage", "Access area"],
    related: ["bathroom", "kitchen"],
  },
  {
    id: "electrical", name: "Electrical & Lighting", icon: "💡",
    questions: [
      q("q1", "single", "What is the project type?", "Lighting|Outlets|Panel|Wiring|EV charger|Other"),
      q("q2", "number", "How many devices or fixtures?", null, { unit: "devices" }),
      q("q3", "multi", "Where will work be performed?", "Interior rooms|Exterior|Garage"),
      q("q4", "single", "Is this new work or replacement?", "New|Replace|Relocate"),
      q("q5", "single", "What is the existing electrical service size?", "100A|150A|200A|Unknown"),
      q("q6", "single", "What wiring access is available?", "Open walls|Attic|Crawlspace|Finished walls|Unknown"),
      q("q7", "single", "What fixture or device quality?", "Standard|Decorative|Smart|Premium"),
      q("q8", "multi", "Are dedicated circuits required?", "EV|Appliance|HVAC|Other|None"),
      q("q9", "multi", "Are switches, dimmers, or automation desired?", "Switches|Dimmers|Automation|None"),
      q("q10", "single", "Any known panel, grounding, or code issues?", "Yes|No|Unsure"),
    ],
    pricing: {
      unit: "each", qty: "q2", def: 4, low: 175, high: 450, min: 250,
      mult: {
        q1: { Panel: 9, "EV charger": 5, Wiring: 2.2 },
        q4: { New: 1.35, Relocate: 1.25 },
        q5: { "100A": 1.08 },
        q6: { "Finished walls": 1.3 },
        q7: { Decorative: 1.2, Smart: 1.25, Premium: 1.4 },
        q10: { Yes: 1.2 },
      },
      add: {
        q8: { EV: [600, 1800], Appliance: [300, 900], HVAC: [300, 900], Other: [300, 900] },
        q9: { Dimmers: [100, 400], Automation: [500, 2500] },
      },
    },
    photos: ["Electrical panel (door open)", "Panel label / rating", "Work area", "Existing fixtures"],
    related: ["solar", "hvac"],
  },
  {
    id: "concrete", name: "Concrete, Driveways & Patios", icon: "🧱",
    questions: [
      q("q1", "single", "What surface is being improved?", "Driveway|Patio|Walkway|Slab|Other"),
      q("q2", "single", "What is the project scope?", "New|Replace|Resurface|Repair"),
      q("q3", "measure", "What is the approximate area?", null, { unit: "sqft", trace: "area" }),
      q("q4", "single", "What material or finish?", "Broom concrete|Stamped|Pavers|Exposed aggregate|Asphalt"),
      q("q5", "single", "What thickness or load use?", "Pedestrian|Passenger vehicles|Heavy vehicles|Unsure"),
      q("q6", "single", "What is the site slope and drainage?", "Flat|Sloped|Drainage issues|Unsure"),
      q("q7", "single", "Is demolition or excavation required?", "Yes|No|Unsure"),
      q("q8", "single", "What base or soil conditions exist?", "Stable|Soft|Tree roots|Unknown"),
      q("q9", "single", "Are reinforcement or expansion joints specified?", "Standard|Upgraded|Unsure"),
      q("q10", "multi", "Any borders, steps, retaining edges, or decorative features?", "Borders|Steps|Retaining edges|Decorative features|None"),
    ],
    pricing: {
      unit: "sqft", qty: "q3", def: 400, low: 7, high: 15, min: 1200,
      mult: {
        q2: { Resurface: 0.4, Repair: 0.25 },
        q4: { Stamped: 1.6, Pavers: 1.85, "Exposed aggregate": 1.35, Asphalt: 0.55 },
        q5: { "Heavy vehicles": 1.3 },
        q6: { Sloped: 1.1, "Drainage issues": 1.2 },
        q7: { Yes: 1.15 },
        q8: { Soft: 1.15, "Tree roots": 1.2 },
        q9: { Upgraded: 1.08 },
      },
      add: { q10: { Borders: [400, 1500], Steps: [500, 2500], "Retaining edges": [800, 4000], "Decorative features": [500, 3000] } },
    },
    photos: ["Wide shot of the surface", "Cracks or damage", "Slope and drainage", "Equipment access"],
    related: ["decks", "fences"],
  },
  {
    id: "insulation", name: "Insulation", icon: "🧶",
    questions: [
      q("q1", "multi", "Which areas need insulation?", "Attic|Walls|Crawlspace|Garage|Other"),
      q("q2", "single", "Is this new insulation or an upgrade?", "New|Add to existing|Remove and replace"),
      q("q3", "number", "What is the approximate area?", null, { unit: "sqft" }),
      q("q4", "single", "What insulation type is preferred?", "Blown fiberglass|Cellulose|Batt|Spray foam|Unsure"),
      q("q5", "single", "What existing insulation is present?", "None|Batt|Blown|Spray foam|Unknown"),
      q("q6", "single", "What target performance?", "Code minimum|Higher efficiency|Unsure"),
      q("q7", "single", "How accessible is the work area?", "Open|Restricted|Finished|Unsure"),
      q("q8", "single", "Are air sealing or vapor barriers needed?", "Yes|No|Unsure"),
      q("q9", "single", "Any moisture, pest, or mold issues?", "Yes|No|Unsure"),
      q("q10", "multi", "Any ventilation, recessed light, or combustion-safety concerns?", "Ventilation|Recessed lights|Combustion safety|None|Unsure"),
    ],
    pricing: {
      unit: "sqft", qty: "q3", def: 1000, low: 1.5, high: 3.5, min: 600,
      mult: {
        q2: { "Add to existing": 0.9, "Remove and replace": 1.6 },
        q4: { Cellulose: 1.05, Batt: 0.95, "Spray foam": 2.6 },
        q6: { "Higher efficiency": 1.25 },
        q7: { Restricted: 1.2, Finished: 1.6 },
        q8: { Yes: 1.15 },
      },
      add: {
        q9: { Yes: [500, 3000] },
        q10: { Ventilation: [300, 1200], "Recessed lights": [200, 800], "Combustion safety": [200, 800] },
      },
    },
    photos: ["Attic or crawlspace wide shot", "Existing insulation depth (ruler if possible)", "Moisture or pest signs", "Access hatch"],
    related: ["hvac", "roofing", "windows"],
  },
  {
    id: "garage-doors", name: "Garage Doors", icon: "🚗",
    questions: [
      q("q1", "number", "How many garage doors?", null, { unit: "doors" }),
      q("q2", "single", "What are the opening dimensions?", "Single (8–9 ft wide)|Double (16 ft wide)|Mixed|Unknown"),
      q("q3", "single", "What is the work scope?", "Door replacement|Opener|Both|Repair"),
      q("q4", "single", "What door material?", "Steel|Aluminum|Wood|Composite|Unsure"),
      q("q5", "single", "What style?", "Traditional|Carriage|Contemporary|Full-view"),
      q("q6", "single", "What insulation level?", "None|Insulated|High insulation"),
      q("q7", "single", "What window and color options?", "No windows, standard color|Windows|Custom finish|Windows + custom finish"),
      q("q8", "single", "What opener type?", "Reuse|Chain|Belt|Wall-mount|Smart"),
      q("q9", "single", "What is the track and headroom condition?", "Standard|Low clearance|Unsure"),
      q("q10", "multi", "Are removal, framing, or spring upgrades required?", "Removal|Framing|Spring upgrades|None|Unsure"),
    ],
    pricing: {
      unit: "each", qty: "q1", def: 1, low: 1100, high: 2600, min: 200,
      mult: {
        q2: { "Double (16 ft wide)": 1.6, Mixed: 1.3 },
        q3: { Opener: 0.35, Both: 1.3, Repair: 0.18 },
        q4: { Aluminum: 1.3, Wood: 2, Composite: 1.4 },
        q5: { Carriage: 1.25, Contemporary: 1.2, "Full-view": 1.6 },
        q6: { Insulated: 1.15, "High insulation": 1.3 },
        q7: { Windows: 1.1, "Custom finish": 1.12, "Windows + custom finish": 1.22 },
        q8: { Belt: 1.08, "Wall-mount": 1.25, Smart: 1.12 },
        q9: { "Low clearance": 1.1 },
      },
      add: { q10: { Removal: [100, 300], Framing: [300, 1200], "Spring upgrades": [150, 450] } },
    },
    photos: ["Door from outside", "Door from inside (tracks and springs)", "Opener", "Headroom above the door"],
    related: ["doors", "concrete"],
  },
  {
    id: "solar", name: "Solar & Battery", icon: "☀️",
    questions: [
      q("q1", "single", "What system is desired?", "Solar|Battery|Both"),
      q("q2", "single", "What is the installation location?", "Roof|Ground|Carport"),
      q("q3", "number", "What is your average monthly electricity use?", null, { unit: "kWh" }),
      q("q4", "single", "What roof material?", "Asphalt shingle|Metal|Tile|Flat|Other|Unknown"),
      q("q5", "single", "What roof shading?", "Minimal|Partial|Heavy|Unsure"),
      q("q6", "single", "What system objective?", "Lower bills|Backup power|Maximize offset"),
      q("q7", "single", "What backup loads?", "Essentials|Whole home|Not applicable"),
      q("q8", "single", "What is the existing electrical service?", "100A|150A|200A|Unknown"),
      q("q9", "single", "What purchase preference?", "Cash|Financing|Undecided"),
      q("q10", "multi", "Any HOA, utility, or roof replacement constraints?", "HOA|Utility|Roof replacement needed|None|Unsure"),
    ],
    pricing: {
      unit: "job", low: 14000, high: 28000, min: 8000,
      scale: { q: "q3", ref: 1000, exp: 0.85 },
      mult: {
        q1: { Battery: 0.6, Both: 1.55 },
        q2: { Ground: 1.15, Carport: 1.3 },
        q4: { Metal: 0.95, Tile: 1.15 },
        q5: { Partial: 1.05, Heavy: 1.1 },
        q6: { "Maximize offset": 1.2 },
        q7: { "Whole home": 1.3 },
        q8: { "100A": 1.1 },
      },
      add: { q10: { "Roof replacement needed": [8000, 18000] } },
    },
    photos: ["Roof (all sides)", "Electrical panel", "Utility meter", "Shading obstructions"],
    related: ["roofing", "electrical"],
  },
  {
    id: "exterior-cleaning", name: "Exterior Cleaning & Pressure Washing", icon: "💦",
    questions: [
      q("q1", "multi", "What surfaces need cleaning?", "Siding|Roof|Driveway|Deck|Fence|Gutters"),
      q("q2", "number", "What is the approximate area?", null, { unit: "sqft" }),
      q("q3", "single", "How many stories or access levels?", "1|2|3+"),
      q("q4", "multi", "What surface materials?", "Vinyl|Brick|Wood|Concrete|Shingles|Other"),
      q("q5", "multi", "What is the main problem?", "Dirt|Algae|Mildew|Oil|Rust|Other"),
      q("q6", "single", "How severe is the buildup?", "Light|Moderate|Heavy"),
      q("q7", "single", "When was it last cleaned?", "Within a year|1–3 years|Longer|Unknown"),
      q("q8", "single", "Are delicate surfaces or landscaping nearby?", "Yes|No|Unsure"),
      q("q9", "multi", "Is sealing, staining, or gutter brightening desired?", "Sealing|Staining|Gutter brightening|None"),
      q("q10", "single", "Are water access or drainage restrictions present?", "Yes|No|Unsure"),
    ],
    pricing: {
      unit: "sqft", qty: "q2", def: 2000, low: 0.15, high: 0.4, min: 200,
      mult: {
        q1: { Roof: 1.3 },
        q3: { 2: 1.2, "3+": 1.45 },
        q4: { Shingles: 1.2 },
        q5: { Oil: 1.15, Rust: 1.15 },
        q6: { Moderate: 1.1, Heavy: 1.3 },
        q7: { Longer: 1.1 },
        q8: { Yes: 1.1 },
      },
      add: { q9: { Sealing: [300, 1500], Staining: [500, 2500], "Gutter brightening": [150, 450] } },
    },
    photos: ["Wide shot of each surface", "Buildup close-up", "Nearby landscaping", "Outdoor water spigot"],
    related: ["gutters", "painting", "decks"],
  },
];

SERVICES.forEach((s) => s.questions.push(NOTES_Q));
const SERVICES_BY_ID = Object.fromEntries(SERVICES.map((s) => [s.id, s]));

// Placeholder regional construction-cost multipliers (1.00 = national average)
const STATE_MULT = {
  AL: 0.88, AK: 1.3, AZ: 0.98, AR: 0.87, CA: 1.25, CO: 1.05, CT: 1.15, DE: 1.03, DC: 1.25, FL: 0.97,
  GA: 0.93, HI: 1.35, ID: 0.95, IL: 1.1, IN: 0.93, IA: 0.93, KS: 0.9, KY: 0.9, LA: 0.9, ME: 1.0,
  MD: 1.08, MA: 1.25, MI: 1.0, MN: 1.05, MS: 0.86, MO: 0.93, MT: 0.97, NE: 0.92, NV: 1.05, NH: 1.05,
  NJ: 1.2, NM: 0.92, NY: 1.3, NC: 0.93, ND: 0.95, OH: 0.95, OK: 0.88, OR: 1.1, PA: 1.03, RI: 1.12,
  SC: 0.92, SD: 0.9, TN: 0.92, TX: 0.93, UT: 0.98, VT: 1.05, VA: 1.0, WA: 1.15, WV: 0.9, WI: 1.0, WY: 0.95,
};

const UNIT_LABEL = { lf: "linear ft", sqft: "sq ft", each: "", job: "" };

/* ---------- options helpers ---------- */
function optionsFor(question) {
  if (!question.o) return null;
  const opts = question.o.slice();
  if (!opts.some((o) => UNSURE_RE.test(o))) opts.push("Not sure");
  return opts;
}

const isUnsure = (v) => typeof v === "string" && UNSURE_RE.test(v);

/* ---------- estimate engine ---------- */
const round50 = (n) => Math.round(n / 50) * 50;
const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

function lookup(map, value) {
  if (!map) return undefined;
  const key = slug(value);
  for (const k of Object.keys(map)) if (slug(k) === key) return map[k];
  return undefined;
}

function universalMultiplier(u) {
  let m = 1;
  for (const [g, map] of Object.entries(UNIVERSAL_MULT)) {
    asList(u[g]).forEach((v) => { const f = lookup(map, v); if (f) m *= f; });
  }
  return m;
}

function estimateProject(svcId, answers, ctx) {
  const svc = SERVICES_BY_ID[svcId];
  const p = { ...svc.pricing, ...((ctx.priceBook || {})[svcId] || {}) };
  const region = STATE_MULT_OVERRIDE(ctx) ?? 1;

  let qty = 1, qtyAssumed = false;
  if (p.qty) {
    const v = answers[p.qty];
    if (typeof v === "number" && v > 0) qty = v;
    else { qty = p.def; qtyAssumed = true; }
  }
  let low = p.unit === "job" ? p.low : qty * p.low;
  let high = p.unit === "job" ? p.high : qty * p.high;

  if (p.scale) {
    const v = answers[p.scale.q];
    if (typeof v === "number" && v > 0) {
      const f = Math.pow(v / p.scale.ref, p.scale.exp);
      low *= f; high *= f;
    } else qtyAssumed = true;
  }

  let mult = 1;
  for (const [qid, map] of Object.entries(p.mult || {})) {
    asList(answers[qid]).forEach((v) => { const f = lookup(map, v); if (f) mult *= f; });
  }
  low *= mult; high *= mult;

  for (const [qid, map] of Object.entries(p.add || {})) {
    asList(answers[qid]).forEach((v) => { const a = lookup(map, v); if (a) { low += a[0]; high += a[1]; } });
  }
  for (const pc of p.per || []) {
    const v = answers[pc.q];
    if (typeof v === "number" && v > 0) { low += v * pc.low; high += v * pc.high; }
  }

  const factor = universalMultiplier(ctx.universal || {}) * region;
  low *= factor; high *= factor;

  // "Not sure" answers widen the top of the range rather than guessing
  const unsureCount = Object.values(answers).flat().filter(isUnsure).length;
  high *= Math.min(1 + 0.04 * unsureCount, 1.3);
  if (qtyAssumed) { low *= 0.85; high *= 1.2; }

  low = Math.max(low, p.min * region);
  high = Math.max(high, low * 1.25);

  return {
    low: round50(low), high: round50(high),
    qty: p.qty ? Math.round(qty) : null, unit: p.unit, qtyAssumed, unsureCount,
    regionFactor: region,
  };
}

function STATE_MULT_OVERRIDE(ctx) {
  const st = (ctx.state || "").toUpperCase();
  const table = ctx.stateMult || STATE_MULT;
  return table[st];
}
